import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileDown, FileText } from 'lucide-react'
import Tabs from '@/components/Tabs'
import Badge from '@/components/Badge'
import { PageHeader } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { ATT_LABEL, errMsg, todayISO, type Row } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { downloadFile, toCSV } from '@/lib/csv'
import { tablePDF } from '@/lib/pdf'

const useClasses = () => useAsync(async () => {
  const { data } = await supabase.from('classes').select('id, name, shift, status, year:school_years(year)').is('archived_at', null).in('status', ['ativa', 'planejada']).order('name')
  return (data ?? []) as Row[]
}, [])

function ClassSelect({ classes, value, onChange }: { classes: Row[]; value: string; onChange: (v: string) => void }) {
  return <select aria-label="Turma" className="input !w-auto min-w-[14rem]" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Selecione a turma…</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.year?.year}</option>)}</select>
}

function Register({ classes }: { classes: Row[] }) {
  const toast = useToast()
  const [cid, setCid] = useState(''); const [date, setDate] = useState(todayISO()); const [marks, setMarks] = useState<Record<string, { status: string; notes: string }>>({}); const [busy, setBusy] = useState(false)
  const { data: students, loading } = useAsync(async () => {
    if (!cid) return [] as Row[]
    const [e, a] = await Promise.all([
      supabase.from('enrollments').select('student:students(id, full_name)').eq('class_id', cid).eq('status', 'confirmada').is('archived_at', null),
      supabase.from('attendance_records').select('student_id, status, notes').eq('class_id', cid).eq('date', date),
    ])
    const prev: Record<string, { status: string; notes: string }> = {}; (a.data ?? []).forEach((r: Row) => { prev[r.student_id] = { status: r.status, notes: r.notes ?? '' } })
    setMarks(prev)
    return ((e.data ?? []) as Row[]).map((x) => x.student).filter(Boolean).sort((x: Row, y: Row) => x.full_name.localeCompare(y.full_name)) as Row[]
  }, [cid, date])
  useEffect(() => { setMarks({}) }, [cid, date])
  const set = (id: string, k: 'status' | 'notes', v: string) => setMarks((m) => ({ ...m, [id]: { status: m[id]?.status ?? '', notes: m[id]?.notes ?? '', [k]: v } }))
  async function save() {
    const recs = (students ?? []).filter((s) => marks[s.id]?.status).map((s) => ({ class_id: cid, student_id: s.id, date, status: marks[s.id].status, notes: marks[s.id].notes || null }))
    if (recs.length === 0) return toast.error('Marque ao menos um aluno.')
    setBusy(true); const { error } = await supabase.from('attendance_records').upsert(recs, { onConflict: 'class_id,student_id,date' }); setBusy(false)
    error ? toast.error(errMsg(error)) : toast.success(`Frequência de ${formatDate(date)} salva (${recs.length} aluno(s)).`)
  }
  const unmarked = (students ?? []).filter((s) => !marks[s.id]?.status).length
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3"><ClassSelect classes={classes} value={cid} onChange={setCid} /><input aria-label="Data" type="date" className="input !w-auto" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        {cid && <button className="btn-secondary" onClick={() => setMarks(Object.fromEntries((students ?? []).map((s) => [s.id, { status: 'presente', notes: marks[s.id]?.notes ?? '' }])))}>Marcar todos presentes</button>}</div>
      {!cid ? <p className="card p-8 text-center text-sm text-muted">Selecione uma turma para registrar a presença. Você vê apenas as turmas às quais tem acesso.</p> : loading ? <Loading /> : (students ?? []).length === 0 ? <p className="card p-8 text-center text-sm text-muted">Nenhum aluno com matrícula confirmada nesta turma.</p> : (
        <div className="card divide-y divide-nude/60">
          {students!.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-3.5">
              <p className="min-w-[12rem] flex-1 font-semibold">{s.full_name}</p>
              <div className="flex gap-1" role="radiogroup" aria-label={`Presença de ${s.full_name}`}>{(['presente', 'ausente', 'falta_justificada'] as const).map((st) => (
                <button key={st} role="radio" aria-checked={marks[s.id]?.status === st} onClick={() => set(s.id, 'status', st)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${marks[s.id]?.status === st ? (st === 'presente' ? 'border-olive bg-olive text-white' : st === 'ausente' ? 'border-red-700 bg-red-700 text-white' : 'border-gold bg-gold text-white') : 'border-nude bg-white hover:bg-cream'}`}>{ATT_LABEL[st]}</button>))}</div>
              <input aria-label={`Observação de ${s.full_name}`} className="input !w-56" placeholder="Observação" value={marks[s.id]?.notes ?? ''} onChange={(e) => set(s.id, 'notes', e.target.value)} />
            </div>))}
          <div className="flex items-center justify-between p-3.5"><span className="text-sm text-muted">{unmarked > 0 ? `${unmarked} aluno(s) sem marcação` : 'Todos marcados'}</span><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar frequência'}</button></div>
        </div>)}
    </div>
  )
}

function Report({ classes }: { classes: Row[] }) {
  const [cid, setCid] = useState(''); const now = new Date()
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`); const [to, setTo] = useState(todayISO())
  const { data, loading, error } = useAsync(async () => {
    if (!cid) return [] as Row[]
    const { data, error } = await supabase.rpc('attendance_summary', { p_class: cid, p_from: from, p_to: to }); if (error) throw new Error(errMsg(error)); return (data ?? []) as Row[]
  }, [cid, from, to])
  const rows = data ?? []; const low = rows.filter((r) => r.percent != null && Number(r.percent) < Number(r.min_percent))
  const cols = [{ key: 'student_name', label: 'Aluno' }, { key: 'total', label: 'Dias' }, { key: 'presentes', label: 'Presenças' }, { key: 'ausentes', label: 'Faltas' }, { key: 'justificadas', label: 'Justificadas' }, { key: 'pct', label: 'Frequência' }, { key: 'min', label: 'Mínimo exigido' }]
  const out = rows.map((r) => ({ ...r, pct: `${String(r.percent ?? 0).replace('.', ',')}%`, min: `${String(r.min_percent).replace('.', ',')}%` }))
  const name = classes.find((c) => c.id === cid)?.name ?? ''
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3"><ClassSelect classes={classes} value={cid} onChange={setCid} />
        <label className="flex items-center gap-2 text-sm">De <input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm">até <input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {rows.length > 0 && <div className="ml-auto flex gap-2"><button className="btn-secondary" onClick={() => downloadFile(`frequencia_${name}.csv`, toCSV(cols, out))}><FileDown className="h-4 w-4" /> CSV</button>
          <button className="btn-secondary" onClick={() => void tablePDF({ title: `Relatório de frequência — ${name}`, filters: `${formatDate(from)} a ${formatDate(to)}`, columns: cols, rows: out, filename: `frequencia_${name}.pdf` })}><FileText className="h-4 w-4" /> PDF</button></div>}</div>
      {low.length > 0 && <div className="mb-4 flex items-start gap-3 rounded-xl border border-gold/60 bg-white p-4 text-sm" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" /><div><p className="font-semibold">{low.length} aluno(s) abaixo da frequência mínima</p><p className="text-muted">{low.map((r) => `${r.student_name} (${String(r.percent).replace('.', ',')}%)`).join(' · ')}</p></div></div>}
      {error ? <p className="card p-4 text-sm text-red-800" role="alert">{error}</p> : !cid ? <p className="card p-8 text-center text-sm text-muted">Selecione a turma e o período.</p> : loading ? <Loading /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-nude text-muted"><tr>{cols.map((c) => <th key={c.key} className="p-3.5 font-semibold">{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r) => { const bad = Number(r.percent) < Number(r.min_percent); return (
            <tr key={r.student_id} className="border-b border-nude/60 last:border-0"><td className="p-3.5 font-semibold"><Link className="text-olive hover:underline" to={`/alunos/${r.student_id}`}>{r.student_name}</Link></td><td className="p-3.5">{r.total}</td><td className="p-3.5">{r.presentes}</td><td className="p-3.5">{r.ausentes}</td><td className="p-3.5">{r.justificadas}</td>
              <td className="p-3.5"><Badge tone={bad ? 'bad' : 'good'}>{String(r.percent).replace('.', ',')}%</Badge></td><td className="p-3.5 text-muted">{String(r.min_percent).replace('.', ',')}%</td></tr>) })}
            {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted">Sem registros no período.</td></tr>}</tbody></table></div>)}
      <p className="mt-3 text-xs text-muted">Frequência = presenças ÷ dias registrados (falta justificada não conta como presença). Limites: Educação Infantil 60% e Ensino Fundamental 75% (LDB), ajustáveis em Configurações.</p>
    </div>
  )
}

export default function AttendancePage() {
  const { data, loading } = useClasses()
  return (
    <>
      <PageHeader title="Frequência" subtitle="Registro diário de presença e relatórios com alerta de frequência mínima." />
      {loading ? <Loading /> : <Tabs tabs={[{ id: 'reg', label: 'Registrar presença', content: <Register classes={data ?? []} /> }, { id: 'rel', label: 'Histórico e relatórios', content: <Report classes={data ?? []} /> }]} />}
    </>
  )
}
