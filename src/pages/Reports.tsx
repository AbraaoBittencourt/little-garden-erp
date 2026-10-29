import { useMemo, useState } from 'react'
import { FileDown, FileText, Play } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import Picker from '@/components/Picker'
import { Loading } from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { ATT_LABEL, ENROLL_STATUS, INVOICE_LABEL, METHOD_LABEL, SHIFT_LABEL, STUDENT_STATUS, derivedInvoiceStatus, fetchAll, opts, todayISO, type Row } from '@/lib/db'
import { classOptions, stageOptions } from '@/lib/options'
import { formatBRL, formatDate, MONTHS } from '@/lib/format'
import { downloadFile, toCSV, type ExportCol } from '@/lib/csv'
import { tablePDF } from '@/lib/pdf'
import { DSF, DSC, STAFF } from '@/lib/roles'
import type { Role } from '@/lib/types'

interface F { from: string; to: string; classId: string; stageId: string; status: string; studentId: string }
interface Out { cols: ExportCol[]; rows: Row[] }
interface Def { id: string; title: string; group: string; roles: Role[]; filters: ('period' | 'class' | 'stage' | 'status' | 'student')[]; statuses?: Record<string, string>; run: (f: F) => Promise<Out> }

const num = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',')
const brl = (v: number) => formatBRL(v)
const paidOf = (i: Row) => (i.payments ?? []).reduce((s: number, p: Row) => s + Number(p.amount), 0)
const ym = (d: string) => d.slice(0, 7)
const period = (q: any, col: string, f: F) => { if (f.from) q = q.gte(col, f.from); if (f.to) q = q.lte(col, f.to); return q }

const invoiceRows = (f: F, onlyOverdue = false) => fetchAll<Row>((a, b) => {
  let q: any = supabase.from('invoices').select('*, payments(amount), students!inner(full_name, current_class_id, classes(name))').neq('status', 'cancelado').order('due_date')
  q = period(q, 'due_date', f); if (f.classId) q = q.eq('students.current_class_id', f.classId)
  if (onlyOverdue) q = q.in('status', ['pendente', 'parcialmente_pago']).lt('due_date', todayISO())
  return q.range(a, b)
})

const DEFS: Def[] = [
  { id: 'alunos', group: 'Acadêmico', title: 'Lista de alunos', roles: DSC, filters: ['stage', 'class', 'status'], statuses: STUDENT_STATUS, run: async (f) => {
    const d = await fetchAll<Row>((a, b) => { let q: any = supabase.from('students').select('full_name, birth_date, cpf, shift, status, class:classes(name), stage:education_stages(name)').is('archived_at', null).order('full_name'); if (f.stageId) q = q.eq('stage_id', f.stageId); if (f.classId) q = q.eq('current_class_id', f.classId); if (f.status) q = q.eq('status', f.status); return q.range(a, b) })
    return { cols: [{ key: 'nome', label: 'Aluno' }, { key: 'nasc', label: 'Nascimento' }, { key: 'etapa', label: 'Etapa' }, { key: 'turma', label: 'Turma' }, { key: 'turno', label: 'Turno' }, { key: 'status', label: 'Status' }], rows: d.map((s) => ({ nome: s.full_name, nasc: formatDate(s.birth_date), etapa: s.stage?.name ?? '', turma: s.class?.name ?? '', turno: s.shift ? SHIFT_LABEL[s.shift] : '', status: STUDENT_STATUS[s.status] })) } } },
  { id: 'responsaveis', group: 'Acadêmico', title: 'Lista de responsáveis', roles: STAFF, filters: [], run: async () => {
    const d = await fetchAll<Row>((a, b) => supabase.from('guardians').select('full_name, cpf, phone, whatsapp, email, links:student_guardians(relationship, is_financial, student:students(full_name))').is('archived_at', null).order('full_name').range(a, b))
    return { cols: [{ key: 'nome', label: 'Responsável' }, { key: 'cpf', label: 'CPF' }, { key: 'tel', label: 'Telefone' }, { key: 'email', label: 'E-mail' }, { key: 'alunos', label: 'Alunos (parentesco)' }], rows: d.map((g) => ({ nome: g.full_name, cpf: g.cpf ?? '', tel: g.whatsapp || g.phone || '', email: g.email ?? '', alunos: (g.links ?? []).map((l: Row) => `${l.student?.full_name} (${l.relationship}${l.is_financial ? ', financeiro' : ''})`).join('; ') })) } } },
  { id: 'matriculas', group: 'Acadêmico', title: 'Matrículas', roles: DSC, filters: ['period', 'class', 'status'], statuses: ENROLL_STATUS, run: async (f) => {
    const d = await fetchAll<Row>((a, b) => { let q: any = supabase.from('enrollments').select('status, enrolled_on, created_at, student:students(full_name), class:classes(name), year:school_years(year), plan:payment_plans(name)').is('archived_at', null).order('created_at', { ascending: false }); q = period(q, 'created_at', f.to ? { ...f, to: f.to + 'T23:59:59' } : f); if (f.classId) q = q.eq('class_id', f.classId); if (f.status) q = q.eq('status', f.status); return q.range(a, b) })
    return { cols: [{ key: 'aluno', label: 'Aluno' }, { key: 'ano', label: 'Ano' }, { key: 'turma', label: 'Turma' }, { key: 'plano', label: 'Plano' }, { key: 'data', label: 'Data' }, { key: 'status', label: 'Situação' }], rows: d.map((e) => ({ aluno: e.student?.full_name, ano: e.year?.year, turma: e.class?.name ?? '', plano: e.plan?.name ?? '', data: formatDate(e.enrolled_on ?? e.created_at?.slice(0, 10)), status: ENROLL_STATUS[e.status] })) } } },
  { id: 'frequencia', group: 'Acadêmico', title: 'Frequência (registros)', roles: ['direcao', 'secretaria', 'coordenacao', 'professor'], filters: ['period', 'class', 'status'], statuses: ATT_LABEL, run: async (f) => {
    const d = await fetchAll<Row>((a, b) => { let q: any = supabase.from('attendance_records').select('date, status, notes, student:students(full_name), class:classes(name)').order('date', { ascending: false }); q = period(q, 'date', f); if (f.classId) q = q.eq('class_id', f.classId); if (f.status) q = q.eq('status', f.status); return q.range(a, b) })
    return { cols: [{ key: 'data', label: 'Data' }, { key: 'aluno', label: 'Aluno' }, { key: 'turma', label: 'Turma' }, { key: 'status', label: 'Situação' }, { key: 'obs', label: 'Observação' }], rows: d.map((r) => ({ data: formatDate(r.date), aluno: r.student?.full_name, turma: r.class?.name, status: ATT_LABEL[r.status], obs: r.notes ?? '' })) } } },
  { id: 'pedagogicos', group: 'Acadêmico', title: 'Relatórios pedagógicos', roles: ['direcao', 'coordenacao', 'professor'], filters: ['period', 'class'], run: async (f) => {
    const d = await fetchAll<Row>((a, b) => { let q: any = supabase.from('pedagogical_reports').select('period, content, is_sensitive, created_at, student:students(full_name), class:classes(name)').order('created_at', { ascending: false }); q = period(q, 'created_at', f.to ? { ...f, to: f.to + 'T23:59:59' } : f); if (f.classId) q = q.eq('class_id', f.classId); return q.range(a, b) })
    return { cols: [{ key: 'aluno', label: 'Aluno' }, { key: 'turma', label: 'Turma' }, { key: 'periodo', label: 'Período' }, { key: 'sensivel', label: 'Sigilo' }, { key: 'texto', label: 'Relatório' }], rows: d.map((r) => ({ aluno: r.student?.full_name, turma: r.class?.name ?? '', periodo: r.period ?? formatDate(r.created_at), sensivel: r.is_sensitive ? 'Sensível' : '', texto: r.content })) } } },
  { id: 'mensalidades', group: 'Financeiro', title: 'Mensalidades pagas e pendentes', roles: DSF, filters: ['period', 'class', 'status'], statuses: INVOICE_LABEL, run: async (f) => {
    const d = (await invoiceRows(f)).map((i) => ({ i, s: derivedInvoiceStatus(i.status, i.due_date) })).filter((x) => !f.status || x.s === f.status)
    return { cols: [{ key: 'aluno', label: 'Aluno' }, { key: 'turma', label: 'Turma' }, { key: 'venc', label: 'Vencimento' }, { key: 'valor', label: 'Valor' }, { key: 'pago', label: 'Pago' }, { key: 'status', label: 'Situação' }], rows: d.map(({ i, s }) => ({ aluno: i.students?.full_name, turma: i.students?.classes?.name ?? '', venc: formatDate(i.due_date), valor: brl(i.total), pago: brl(paidOf(i)), status: INVOICE_LABEL[s] })) } } },
  { id: 'inadimplencia', group: 'Financeiro', title: 'Inadimplência', roles: DSF, filters: ['period', 'class'], run: async (f) => {
    const d = await invoiceRows(f, true)
    return { cols: [{ key: 'aluno', label: 'Aluno' }, { key: 'turma', label: 'Turma' }, { key: 'venc', label: 'Vencimento' }, { key: 'dias', label: 'Dias de atraso' }, { key: 'saldo', label: 'Saldo devedor' }], rows: d.map((i) => ({ aluno: i.students?.full_name, turma: i.students?.classes?.name ?? '', venc: formatDate(i.due_date), dias: Math.floor((Date.now() - new Date(i.due_date).getTime()) / 86400000), saldo: brl(Number(i.total) - paidOf(i)) })) } } },
  { id: 'contas_pagar', group: 'Financeiro', title: 'Contas a pagar', roles: ['direcao', 'financeiro'], filters: ['period', 'status'], statuses: { pendente: 'Pendente', pago: 'Pago', cancelado: 'Cancelado' }, run: async (f) => {
    const d = await fetchAll<Row>((a, b) => { let q: any = supabase.from('expenses').select('description, amount, due_date, paid_on, status, supplier:suppliers(name), category:expense_categories(name)').order('due_date'); q = period(q, 'due_date', f); if (f.status) q = q.eq('status', f.status); return q.range(a, b) })
    return { cols: [{ key: 'venc', label: 'Vencimento' }, { key: 'desc', label: 'Descrição' }, { key: 'forn', label: 'Fornecedor' }, { key: 'cat', label: 'Categoria' }, { key: 'valor', label: 'Valor' }, { key: 'pago', label: 'Pago em' }, { key: 'status', label: 'Status' }], rows: d.map((e) => ({ venc: formatDate(e.due_date), desc: e.description, forn: e.supplier?.name ?? '', cat: e.category?.name ?? '', valor: brl(e.amount), pago: formatDate(e.paid_on), status: e.status })) } } },
  { id: 'fluxo', group: 'Financeiro', title: 'Fluxo de caixa mensal', roles: ['direcao', 'financeiro'], filters: ['period'], run: async (f) => {
    const [p, e] = await Promise.all([
      fetchAll<Row>((a, b) => period(supabase.from('payments').select('paid_on, amount'), 'paid_on', f).range(a, b)),
      fetchAll<Row>((a, b) => period(supabase.from('expenses').select('paid_on, amount').eq('status', 'pago'), 'paid_on', f).range(a, b)),
    ])
    const m: Record<string, { en: number; sa: number }> = {}; p.forEach((x) => { (m[ym(x.paid_on)] ??= { en: 0, sa: 0 }).en += Number(x.amount) }); e.forEach((x) => { (m[ym(x.paid_on)] ??= { en: 0, sa: 0 }).sa += Number(x.amount) })
    let acc = 0
    return { cols: [{ key: 'mes', label: 'Mês' }, { key: 'en', label: 'Entradas' }, { key: 'sa', label: 'Saídas' }, { key: 'sal', label: 'Saldo' }, { key: 'acu', label: 'Acumulado' }], rows: Object.keys(m).sort().map((k) => { const s = m[k].en - m[k].sa; acc += s; return { mes: `${MONTHS[Number(k.slice(5)) - 1]}/${k.slice(0, 4)}`, en: brl(m[k].en), sa: brl(m[k].sa), sal: brl(s), acu: brl(acc) } }) } } },
  { id: 'dre', group: 'Financeiro', title: 'Demonstrativo de receitas e despesas', roles: ['direcao', 'financeiro'], filters: ['period'], run: async (f) => {
    const [i, p, e] = await Promise.all([
      fetchAll<Row>((a, b) => period(supabase.from('invoices').select('due_date, total').neq('status', 'cancelado'), 'due_date', f).range(a, b)),
      fetchAll<Row>((a, b) => period(supabase.from('payments').select('paid_on, amount'), 'paid_on', f).range(a, b)),
      fetchAll<Row>((a, b) => period(supabase.from('expenses').select('due_date, amount').neq('status', 'cancelado'), 'due_date', f).range(a, b)),
    ])
    const m: Record<string, { pr: number; re: number; de: number }> = {}; const g = (k: string) => (m[k] ??= { pr: 0, re: 0, de: 0 })
    i.forEach((x) => (g(ym(x.due_date)).pr += Number(x.total))); p.forEach((x) => (g(ym(x.paid_on)).re += Number(x.amount))); e.forEach((x) => (g(ym(x.due_date)).de += Number(x.amount)))
    return { cols: [{ key: 'mes', label: 'Mês' }, { key: 'pr', label: 'Receita prevista' }, { key: 're', label: 'Receita recebida' }, { key: 'de', label: 'Despesas' }, { key: 'res', label: 'Resultado (recebido − despesas)' }], rows: Object.keys(m).sort().map((k) => ({ mes: `${MONTHS[Number(k.slice(5)) - 1]}/${k.slice(0, 4)}`, pr: brl(m[k].pr), re: brl(m[k].re), de: brl(m[k].de), res: brl(m[k].re - m[k].de) })) } } },
  { id: 'por_turma', group: 'Financeiro', title: 'Receitas por turma', roles: ['direcao', 'financeiro'], filters: ['period'], run: async (f) => {
    const d = await fetchAll<Row>((a, b) => period(supabase.from('payments').select('amount, paid_on, invoice:invoices(student:students(classes:classes(name)))'), 'paid_on', f).range(a, b))
    const m: Record<string, number> = {}; d.forEach((x) => { const k = x.invoice?.student?.classes?.name ?? 'Sem turma'; m[k] = (m[k] ?? 0) + Number(x.amount) })
    return { cols: [{ key: 'turma', label: 'Turma' }, { key: 'total', label: 'Recebido' }], rows: Object.entries(m).sort().map(([turma, t]) => ({ turma, total: brl(t) })) } } },
  { id: 'por_forma', group: 'Financeiro', title: 'Receitas por forma de pagamento', roles: ['direcao', 'financeiro'], filters: ['period'], run: async (f) => {
    const d = await fetchAll<Row>((a, b) => period(supabase.from('payments').select('amount, method, paid_on'), 'paid_on', f).range(a, b))
    const m: Record<string, number> = {}; d.forEach((x) => (m[x.method] = (m[x.method] ?? 0) + Number(x.amount)))
    return { cols: [{ key: 'forma', label: 'Forma de pagamento' }, { key: 'total', label: 'Recebido' }], rows: Object.entries(m).map(([k, t]) => ({ forma: METHOD_LABEL[k], total: brl(t) })) } } },
  { id: 'desp_cat', group: 'Financeiro', title: 'Despesas por categoria', roles: ['direcao', 'financeiro'], filters: ['period'], run: async (f) => {
    const d = await fetchAll<Row>((a, b) => period(supabase.from('expenses').select('amount, due_date, category:expense_categories(name)').neq('status', 'cancelado'), 'due_date', f).range(a, b))
    const m: Record<string, number> = {}; d.forEach((x) => { const k = x.category?.name ?? 'Sem categoria'; m[k] = (m[k] ?? 0) + Number(x.amount) })
    return { cols: [{ key: 'cat', label: 'Categoria' }, { key: 'total', label: 'Total' }], rows: Object.entries(m).sort().map(([cat, t]) => ({ cat, total: brl(t) })) } } },
  { id: 'hist_aluno', group: 'Financeiro', title: 'Histórico financeiro por aluno', roles: DSF, filters: ['student'], run: async (f) => {
    if (!f.studentId) throw new Error('Selecione o aluno.')
    const d = await fetchAll<Row>((a, b) => supabase.from('invoices').select('*, payments(amount, paid_on, method)').eq('student_id', f.studentId).order('competence').range(a, b))
    return { cols: [{ key: 'comp', label: 'Competência' }, { key: 'venc', label: 'Vencimento' }, { key: 'valor', label: 'Valor' }, { key: 'pago', label: 'Pago' }, { key: 'pgto', label: 'Pagamentos' }, { key: 'status', label: 'Situação' }], rows: d.map((i) => ({ comp: `${i.competence.slice(5, 7)}/${i.competence.slice(0, 4)}`, venc: formatDate(i.due_date), valor: brl(i.total), pago: brl(paidOf(i)), pgto: (i.payments ?? []).map((p: Row) => `${formatDate(p.paid_on)} ${METHOD_LABEL[p.method]}`).join('; '), status: INVOICE_LABEL[derivedInvoiceStatus(i.status, i.due_date)] })) } } },
  { id: 'comparativo', group: 'Financeiro', title: 'Comparativo entre meses e anos (receita recebida)', roles: ['direcao', 'financeiro'], filters: ['period'], run: async (f) => {
    const y = Number((f.to || todayISO()).slice(0, 4)); const d = await fetchAll<Row>((a, b) => supabase.from('payments').select('paid_on, amount').gte('paid_on', `${y - 1}-01-01`).lte('paid_on', `${y}-12-31`).range(a, b))
    const cur = Array(12).fill(0), prev = Array(12).fill(0); d.forEach((x) => { const yy = Number(x.paid_on.slice(0, 4)), mm = Number(x.paid_on.slice(5, 7)) - 1; (yy === y ? cur : prev)[mm] += Number(x.amount) })
    return { cols: [{ key: 'mes', label: 'Mês' }, { key: 'a', label: String(y - 1) }, { key: 'b', label: String(y) }, { key: 'v', label: 'Variação' }], rows: MONTHS.map((m, i) => ({ mes: m, a: brl(prev[i]), b: brl(cur[i]), v: prev[i] ? `${num(((cur[i] - prev[i]) / prev[i]) * 100)}%` : '—' })) } } },
]

export default function ReportsPage() {
  const { hasRole } = useAuth(); const toast = useToast()
  const avail = useMemo(() => DEFS.filter((d) => hasRole(...d.roles)), [hasRole])
  const [id, setId] = useState(avail[0]?.id ?? ''); const def = avail.find((d) => d.id === id)
  const y = new Date().getFullYear()
  const [f, setF] = useState<F>({ from: `${y}-01-01`, to: todayISO(), classId: '', stageId: '', status: '', studentId: '' })
  const [out, setOut] = useState<Out | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const classes = useAsync(classOptions, []); const stages = useAsync(stageOptions, [])
  async function run() { if (!def) return; setBusy(true); setErr(''); setOut(null); try { setOut(await def.run(f)) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }
  const filterText = useMemo(() => {
    const p: string[] = []; if (def?.filters.includes('period')) p.push(`Período ${formatDate(f.from)} a ${formatDate(f.to)}`)
    if (f.classId) p.push(`Turma: ${classes.data?.find((c) => c.value === f.classId)?.label}`); if (f.stageId) p.push(`Etapa: ${stages.data?.find((c) => c.value === f.stageId)?.label}`)
    if (f.status && def?.statuses) p.push(`Situação: ${def.statuses[f.status]}`); return p.join(' | ') || 'Sem filtros'
  }, [def, f, classes.data, stages.data])
  const groups = Array.from(new Set(avail.map((d) => d.group)))
  return (
    <>
      <PageHeader title="Relatórios" subtitle="Escolha o relatório, aplique os filtros, visualize e exporte em CSV ou PDF (com nome da escola, data e filtros)." />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <nav className="card h-fit p-3" aria-label="Relatórios">{groups.map((g) => <div key={g} className="mb-2"><p className="px-3 py-1.5 text-xs font-semibold text-muted">{g}</p>{avail.filter((d) => d.group === g).map((d) => (
          <button key={d.id} onClick={() => { setId(d.id); setOut(null); setErr(''); setF({ ...f, status: '' }) }} className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${d.id === id ? 'bg-olive text-white' : 'hover:bg-cream'}`}>{d.title}</button>))}</div>)}</nav>
        <div className="min-w-0 space-y-4">
          {def && <div className="card p-5"><h2 className="mb-4 text-lg font-semibold">{def.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {def.filters.includes('period') && <><div><label className="label" htmlFor="rf">De</label><input id="rf" type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div><div><label className="label" htmlFor="rt">Até</label><input id="rt" type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div></>}
              {def.filters.includes('stage') && <div><label className="label" htmlFor="rs">Etapa</label><select id="rs" className="input" value={f.stageId} onChange={(e) => setF({ ...f, stageId: e.target.value })}><option value="">Todas</option>{stages.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>}
              {def.filters.includes('class') && <div><label className="label" htmlFor="rc">Turma</label><select id="rc" className="input" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}><option value="">Todas</option>{classes.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>}
              {def.filters.includes('status') && def.statuses && <div><label className="label" htmlFor="rst">Situação</label><select id="rst" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Todas</option>{opts(def.statuses).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>}
              {def.filters.includes('student') && <div className="sm:col-span-2"><label className="label">Aluno</label><Picker table="students" value={f.studentId || null} onChange={(v) => setF({ ...f, studentId: v ?? '' })} /></div>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><button className="btn-primary" disabled={busy} onClick={() => void run()}><Play className="h-4 w-4" /> {busy ? 'Gerando…' : 'Gerar relatório'}</button>
              {out && out.rows.length > 0 && <><button className="btn-secondary" onClick={() => downloadFile(`${def.id}_${todayISO()}.csv`, toCSV(out.cols, out.rows))}><FileDown className="h-4 w-4" /> CSV</button>
                <button className="btn-secondary" onClick={() => tablePDF({ title: def.title, filters: filterText, columns: out.cols, rows: out.rows, filename: `${def.id}_${todayISO()}.pdf` }).catch((e) => toast.error(e.message))}><FileText className="h-4 w-4" /> PDF</button></>}</div></div>}
          {err && <p className="card border border-red-200 p-4 text-sm text-red-800" role="alert">{err}</p>}
          {busy && <Loading />}
          {out && <div className="card overflow-x-auto"><p className="border-b border-nude px-4 py-3 text-xs text-muted">{out.rows.length} linha(s) · {filterText}</p>
            <table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-nude text-muted"><tr>{out.cols.map((c) => <th key={c.key} className="p-3 font-semibold">{c.label}</th>)}</tr></thead>
              <tbody>{out.rows.slice(0, 300).map((r, i) => <tr key={i} className="border-b border-nude/60 last:border-0">{out.cols.map((c) => <td key={c.key} className="p-3 align-top">{String(r[c.key] ?? '')}</td>)}</tr>)}
                {out.rows.length === 0 && <tr><td colSpan={out.cols.length} className="p-8 text-center text-muted">Nenhum dado para os filtros escolhidos.</td></tr>}</tbody></table>
            {out.rows.length > 300 && <p className="p-3 text-xs text-muted">Pré-visualização das 300 primeiras linhas. A exportação inclui todas.</p>}</div>}
        </div>
      </div>
    </>
  )
}
