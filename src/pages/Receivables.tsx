import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileDown, History, Plus, Wallet } from 'lucide-react'
import Badge, { invoiceTone } from '@/components/Badge'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import Picker from '@/components/Picker'
import { FormGrid } from '@/components/Fields'
import { PageHeader } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { DF } from '@/lib/roles'
import { INVOICE_LABEL, METHOD_LABEL, derivedInvoiceStatus, errMsg, fetchAll, opts, todayISO, type Row } from '@/lib/db'
import { formatBRL, formatDate, MONTHS } from '@/lib/format'
import { maskCurrency, parseCurrency } from '@/lib/masks'
import { downloadFile, toCSV } from '@/lib/csv'

const PAGE = 15
const sel = '*, student:students!inner(id, full_name), payments(id, amount, paid_on, method, reference, notes)'
const paidOf = (i: Row) => (i.payments ?? []).reduce((s: number, p: Row) => s + Number(p.amount), 0)

export default function ReceivablesPage() {
  const toast = useToast(); const { hasRole } = useAuth(); const canWrite = hasRole(...DF)
  const now = new Date()
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [year, setYear] = useState(String(now.getFullYear())); const [month, setMonth] = useState('')
  const [rows, setRows] = useState<Row[]>([]); const [count, setCount] = useState(0); const [page, setPage] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [payFor, setPayFor] = useState<Row | null>(null); const [hist, setHist] = useState<Row | null>(null); const [cancel, setCancel] = useState<Row | null>(null); const [newOpen, setNewOpen] = useState(false)
  const [dq, setDq] = useState(''); useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(0) }, 280); return () => clearTimeout(t) }, [q])

  const filtered = useCallback((query: any) => {
    const today = todayISO()
    if (year) { const ms = month ? `${year}-${month.padStart(2, '0')}-01` : `${year}-01-01`; const me = month ? new Date(Number(year), Number(month), 1).toISOString().slice(0, 10) : `${Number(year) + 1}-01-01`; query = query.gte('due_date', ms).lt('due_date', me) }
    if (status === 'vencido') query = query.in('status', ['pendente', 'parcialmente_pago']).lt('due_date', today)
    else if (status) query = query.eq('status', status)
    if (dq.trim()) query = query.ilike('students.full_name', `%${dq.trim().replace(/[,()%*]/g, ' ')}%`)
    return query
  }, [year, month, status, dq])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data, count: c, error: e } = await filtered(supabase.from('invoices').select(sel, { count: 'exact' })).order('due_date', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (e) setError(errMsg(e)); else { setRows((data ?? []) as Row[]); setCount(c ?? 0) }
    setLoading(false)
  }, [filtered, page])
  useEffect(() => { void load() }, [load])

  async function exportCSV() {
    try {
      const all = await fetchAll<Row>((f, t) => filtered(supabase.from('invoices').select(sel)).order('due_date', { ascending: false }).range(f, t))
      const out = all.map((i) => { const s = derivedInvoiceStatus(i.status, i.due_date); return { aluno: i.student?.full_name, competencia: `${i.competence.slice(5, 7)}/${i.competence.slice(0, 4)}`, vencimento: formatDate(i.due_date), valor: String(i.total).replace('.', ','), pago: String(paidOf(i)).replace('.', ','), situacao: INVOICE_LABEL[s] } })
      downloadFile('contas_a_receber.csv', toCSV([{ key: 'aluno', label: 'Aluno' }, { key: 'competencia', label: 'Competência' }, { key: 'vencimento', label: 'Vencimento' }, { key: 'valor', label: 'Valor' }, { key: 'pago', label: 'Pago' }, { key: 'situacao', label: 'Situação' }], out))
    } catch (e) { toast.error((e as Error).message) }
  }
  async function charges(i: Row) { const { error } = await supabase.rpc('apply_late_charges', { p_invoice: i.id }); error ? toast.error(errMsg(error)) : (toast.success('Multa e juros aplicados conforme as configurações.'), void load()) }
  async function doCancel() {
    const { error } = await supabase.from('invoices').update({ status: 'cancelado' }).eq('id', cancel!.id); setCancel(null)
    error ? toast.error(errMsg(error)) : (toast.success('Cobrança cancelada.'), void load())
  }
  const pages = Math.max(1, Math.ceil(count / PAGE))
  return (
    <>
      <PageHeader title="Contas a receber" subtitle="Mensalidades por aluno, pagamentos manuais (inclusive parciais) e histórico de lançamentos."
        actions={<div className="flex gap-2"><button className="btn-secondary" onClick={() => void exportCSV()}><FileDown className="h-4 w-4" /> CSV</button>{canWrite && <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Cobrança avulsa</button>}</div>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <input aria-label="Buscar aluno" className="input !w-auto min-w-[14rem] flex-1" placeholder="Buscar por aluno…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Situação" className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}><option value="">Situação: todas</option>{Object.entries(INVOICE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Mês" className="input !w-auto" value={month} onChange={(e) => { setMonth(e.target.value); setPage(0) }}><option value="">Todos os meses</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <input aria-label="Ano" className="input !w-24" inputMode="numeric" value={year} onChange={(e) => { setYear(e.target.value.replace(/\D/g, '').slice(0, 4)); setPage(0) }} /></div>
      {error ? <p className="card p-4 text-sm text-red-800" role="alert">{error}</p> : (
        <div className="card overflow-x-auto">{loading && rows.length === 0 ? <Loading /> : (
          <table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-nude text-muted"><tr><th className="p-3.5">Aluno</th><th className="p-3.5">Competência</th><th className="p-3.5">Vencimento</th><th className="p-3.5">Valor</th><th className="p-3.5">Pago</th><th className="p-3.5">Saldo</th><th className="p-3.5">Situação</th><th /></tr></thead>
            <tbody className={loading ? 'opacity-50' : ''}>{rows.map((i) => { const s = derivedInvoiceStatus(i.status, i.due_date); const paid = paidOf(i); const bal = Math.max(Number(i.total) - paid, 0); return (
              <tr key={i.id} className="border-b border-nude/60 last:border-0"><td className="p-3.5"><Link className="font-semibold text-olive hover:underline" to={`/alunos/${i.student?.id}`}>{i.student?.full_name}</Link></td>
                <td className="p-3.5">{i.competence.slice(5, 7)}/{i.competence.slice(0, 4)}</td><td className="p-3.5">{formatDate(i.due_date)}</td><td className="p-3.5">{formatBRL(i.total)}{(Number(i.fine) + Number(i.interest)) > 0 && <span className="block text-xs text-muted">inclui multa/juros</span>}</td><td className="p-3.5">{formatBRL(paid)}</td><td className="p-3.5 font-semibold">{formatBRL(bal)}</td>
                <td className="p-3.5"><Badge tone={invoiceTone(s)}>{INVOICE_LABEL[s]}</Badge></td>
                <td className="p-3.5"><div className="flex items-center justify-end gap-1">
                  <button className="rounded-lg p-2 hover:bg-cream" title="Histórico de pagamentos" aria-label="Histórico" onClick={() => setHist(i)}><History className="h-4 w-4" /></button>
                  {canWrite && (s === 'pendente' || s === 'parcialmente_pago' || s === 'vencido') && <button className="rounded-lg p-2 text-olive hover:bg-cream" title="Registrar pagamento" aria-label="Registrar pagamento" onClick={() => setPayFor(i)}><Wallet className="h-4 w-4" /></button>}
                  {canWrite && s === 'vencido' && <button className="rounded-lg px-2 py-1.5 text-xs font-semibold text-olive hover:bg-cream" onClick={() => void charges(i)}>Multa/juros</button>}
                  {canWrite && i.status !== 'cancelado' && paid === 0 && <button className="rounded-lg px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => setCancel(i)}>Cancelar</button>}</div></td></tr>) })}
              {rows.length === 0 && !loading && <tr><td colSpan={8} className="p-8 text-center text-muted">Nenhuma cobrança encontrada.</td></tr>}</tbody></table>)}</div>)}
      {count > PAGE && <div className="mt-3 flex items-center justify-between text-sm text-muted"><span>{count} cobrança(s) — página {page + 1} de {pages}</span><div className="flex gap-2"><button className="btn-secondary !px-3" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></button><button className="btn-secondary !px-3" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima"><ChevronRight className="h-4 w-4" /></button></div></div>}
      {payFor && <PayModal inv={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); void load() }} />}
      {hist && <Modal title={`Histórico — ${hist.student?.full_name} (${hist.competence.slice(5, 7)}/${hist.competence.slice(0, 4)})`} onClose={() => setHist(null)}>
        <ul className="divide-y divide-nude/60 text-sm">{(hist.payments ?? []).map((p: Row) => <li key={p.id} className="py-2.5"><p className="font-semibold">{formatBRL(p.amount)} — {METHOD_LABEL[p.method]}</p><p className="text-xs text-muted">{formatDate(p.paid_on)}{p.reference ? ` · ref. ${p.reference}` : ''}{p.notes ? ` · ${p.notes}` : ''}</p></li>)}{(hist.payments ?? []).length === 0 && <li className="py-2 text-muted">Nenhum pagamento lançado.</li>}</ul>
        <p className="mt-3 text-xs text-muted">Alterações de cobranças e pagamentos são registradas na Auditoria (usuário e data).</p></Modal>}
      <ConfirmDialog open={!!cancel} danger title="Cancelar cobrança?" confirmLabel="Cancelar cobrança" onCancel={() => setCancel(null)} onConfirm={() => void doCancel()}>A cobrança deixa de contar nos valores a receber. Só é possível cancelar cobranças sem pagamentos.</ConfirmDialog>
      {newOpen && <NewInvoice onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); void load() }} />}
    </>
  )
}

function PayModal({ inv, onClose, onDone }: { inv: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast(); const balance = Math.max(Number(inv.total) - paidOf(inv), 0)
  const [date, setDate] = useState(todayISO()); const [amount, setAmount] = useState(maskCurrency(String(Math.round(balance * 100)))); const [method, setMethod] = useState('pix'); const [ref, setRef] = useState(''); const [notes, setNotes] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [dup, setDup] = useState(false)
  async function save(force = false) {
    setErr(''); const v = parseCurrency(amount)
    if (v <= 0) return setErr('Informe um valor maior que zero.'); if (v > balance + 0.001) return setErr(`O valor excede o saldo da cobrança (${formatBRL(balance)}).`)
    if (date > todayISO()) return setErr('A data do pagamento não pode ser futura.')
    if (!force && (inv.payments ?? []).some((p: Row) => p.paid_on === date && Math.abs(Number(p.amount) - v) < 0.001 && p.method === method)) return setDup(true)
    setBusy(true)
    const { error } = await supabase.from('payments').insert({ invoice_id: inv.id, paid_on: date, amount: v, method, reference: ref || null, notes: notes || null })
    setBusy(false); if (error) return setErr(errMsg(error)); toast.success(v < balance - 0.001 ? 'Pagamento parcial registrado.' : 'Pagamento registrado.'); onDone()
  }
  return (<>
    <Modal title={`Registrar pagamento — ${inv.student?.full_name}`} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Registrar'}</button></>}>
      <p className="mb-4 text-sm text-muted">Saldo da cobrança: <strong>{formatBRL(balance)}</strong>. O status só muda para “pago” com o lançamento manual do valor total.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="pdt">Data do pagamento</label><input id="pdt" type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="label" htmlFor="pv">Valor recebido</label><input id="pv" inputMode="numeric" className="input" value={amount} onChange={(e) => setAmount(maskCurrency(e.target.value))} /></div>
        <div><label className="label" htmlFor="pm">Forma de pagamento</label><select id="pm" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{opts(METHOD_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div><label className="label" htmlFor="pr">Nº de referência</label><input id="pr" className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="pn">Observações</label><textarea id="pn" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div></div>
      {err && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{err}</p>}</Modal>
    <ConfirmDialog open={dup} title="Possível lançamento duplicado" confirmLabel="Lançar mesmo assim" onCancel={() => setDup(false)} onConfirm={() => { setDup(false); void save(true) }}>Já existe um pagamento com a mesma data, valor e forma nesta cobrança. Deseja lançar novamente?</ConfirmDialog></>)
}

function NewInvoice({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast(); const [sid, setSid] = useState<string | null>(null); const [enr, setEnr] = useState<Row[]>([])
  const [f, setF] = useState<Row>({ enrollment_id: '', competence: todayISO().slice(0, 7), due_date: todayISO(), amount: '', notes: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { if (!sid) { setEnr([]); return } void supabase.from('enrollments').select('id, class:classes(name), year:school_years(year)').eq('student_id', sid).neq('status', 'cancelada').then(({ data }) => { setEnr((data ?? []) as Row[]); if (data?.length === 1) setF((x) => ({ ...x, enrollment_id: data[0].id })) }) }, [sid])
  async function save() {
    setErr(''); if (!sid || !f.enrollment_id) return setErr('Selecione o aluno e a matrícula.'); const v = parseCurrency(String(f.amount)); if (v <= 0) return setErr('Informe o valor.')
    setBusy(true); const { error } = await supabase.from('invoices').insert({ student_id: sid, enrollment_id: f.enrollment_id, competence: `${f.competence}-01`, due_date: f.due_date, amount: v, notes: f.notes || null }); setBusy(false)
    if (error) return setErr(error.code === '23505' ? 'Já existe cobrança para esta matrícula nessa competência.' : errMsg(error)); toast.success('Cobrança criada.'); onDone()
  }
  return (<Modal title="Cobrança avulsa" onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={() => void save()}>Criar</button></>}>
    <div className="space-y-4"><div><label className="label">Aluno</label><Picker table="students" value={sid} onChange={setSid} /></div>
      <FormGrid key={enr.length} form={f} setForm={setF} fields={[{ name: 'enrollment_id', label: 'Matrícula', type: 'select', required: true, options: enr.map((e) => ({ value: e.id, label: `${e.year?.year} — ${e.class?.name ?? 'sem turma'}` })) }, { name: 'amount', label: 'Valor', type: 'currency', required: true },
        { name: 'due_date', label: 'Vencimento', type: 'date', required: true }, { name: 'notes', label: 'Observações', type: 'textarea' }]} />
      <div><label className="label" htmlFor="cmp">Competência</label><input id="cmp" type="month" className="input max-w-[14rem]" value={f.competence} onChange={(e) => setF({ ...f, competence: e.target.value })} /></div></div>
    {err && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{err}</p>}</Modal>)
}
