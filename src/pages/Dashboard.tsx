import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Cake, CalendarDays, FileWarning, GraduationCap, Briefcase, ClipboardCheck, TrendingUp, TrendingDown, Wallet, Percent, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { DashboardData } from '@/lib/types'
import { formatBRL, formatDateTime, MONTHS, MONTHS_SHORT } from '@/lib/format'
import { ErrorBox, PageHeader, StatCard } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'

const COLORS = ['#687653', '#B69A62', '#354735', '#E8D8C8', '#73776F']
interface Opt { id: string; name: string }

export default function Dashboard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear()); const [month, setMonth] = useState(now.getMonth() + 1)
  const [stage, setStage] = useState(''); const [klass, setKlass] = useState('')
  const [years, setYears] = useState<number[]>([]); const [stages, setStages] = useState<Opt[]>([]); const [classes, setClasses] = useState<Opt[]>([])
  const [data, setData] = useState<DashboardData | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const [y, s, c] = await Promise.all([
        supabase.from('school_years').select('year').order('year'),
        supabase.from('education_stages').select('id, name').eq('is_active', true).order('name'),
        supabase.from('classes').select('id, name').is('archived_at', null).order('name'),
      ])
      const ys = (y.data ?? []).map((r: { year: number }) => r.year)
      setYears(Array.from(new Set([...ys, now.getFullYear()])).sort())
      setStages((s.data ?? []) as Opt[]); setClasses((c.data ?? []) as Opt[])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('dashboard_summary', { p_year: year, p_month: month, p_stage: stage || null, p_class: klass || null })
    if (error) setError(error.message.includes('fetch') ? 'Falha de conexão. Verifique sua internet.' : error.message)
    else setData(data as DashboardData)
    setLoading(false)
  }, [year, month, stage, klass])
  useEffect(() => { void load() }, [load])

  const d = data
  const result = d ? d.revenue_received - d.expenses_month : 0
  const empty = d && d.active_students === 0 && d.revenue_expected === 0 && d.revenue_received === 0 && d.expenses_month === 0
  const alerts: string[] = []
  if (d) {
    if (d.overdue_count > 0) alerts.push(`${d.overdue_count} mensalidade(s) em atraso, somando ${formatBRL(d.overdue_amount)}.`)
    if (d.pending_documents > 0) alerts.push(`${d.pending_documents} pendência(s) de documentação.`)
    d.class_vacancies.filter((c) => c.available === 0).forEach((c) => alerts.push(`A turma ${c.name} está sem vagas.`))
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Indicadores calculados com os dados cadastrados no sistema." />
      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Sel label="Mês" value={month} onChange={(v) => setMonth(Number(v))} options={MONTHS.map((m, i) => ({ id: String(i + 1), name: m }))} />
        <Sel label="Ano" value={year} onChange={(v) => setYear(Number(v))} options={years.map((y) => ({ id: String(y), name: String(y) }))} />
        <Sel label="Etapa de ensino" value={stage} onChange={setStage} options={[{ id: '', name: 'Todas' }, ...stages]} />
        <Sel label="Turma" value={klass} onChange={setKlass} options={[{ id: '', name: 'Todas' }, ...classes]} />
      </div>

      {loading && !d ? <Loading /> : error ? <ErrorBox message={error} onRetry={() => void load()} /> : d && (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          {empty && <p className="card mb-6 p-4 text-sm text-muted">Ainda não há dados cadastrados para este filtro. Os indicadores aparecerão automaticamente conforme alunos, matrículas e lançamentos financeiros forem registrados.</p>}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Alunos ativos" value={d.active_students} icon={GraduationCap} />
            <StatCard label="Matrículas confirmadas" value={d.confirmed_enrollments} hint={`Ano letivo ${year}`} icon={ClipboardCheck} />
            <StatCard label="Professores" value={d.teachers_active} icon={Briefcase} />
            <StatCard label="Funcionários" value={d.employees_active} icon={Briefcase} />
            <StatCard label="Receita recebida" value={formatBRL(d.revenue_received)} icon={TrendingUp} tone="good" />
            <StatCard label="Receita prevista" value={formatBRL(d.revenue_expected)} icon={Wallet} />
            <StatCard label="Despesas do mês" value={formatBRL(d.expenses_month)} icon={TrendingDown} />
            <StatCard label="Resultado do período" value={formatBRL(result)} hint="Recebido menos despesas" icon={Receipt} tone={result < 0 ? 'bad' : 'good'} />
            <StatCard label="Mensalidades em atraso" value={d.overdue_count} hint={formatBRL(d.overdue_amount)} icon={AlertTriangle} tone={d.overdue_count ? 'bad' : 'default'} />
            <StatCard label="Taxa de inadimplência" value={d.delinquency_rate == null ? '—' : `${d.delinquency_rate.toString().replace('.', ',')}%`} hint={d.delinquency_rate == null ? 'Sem cobranças vencidas no mês' : 'Sobre cobranças vencidas no mês'} icon={Percent} />
            <StatCard label="Pendências de documentação" value={d.pending_documents} icon={FileWarning} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Receitas versus despesas" empty={!d.series_revenue_expenses.some((r) => r.receitas || r.despesas)}>
              <BarChart data={d.series_revenue_expenses.map((r) => ({ ...r, mes: MONTHS_SHORT[r.month - 1] }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8D8C8" /><XAxis dataKey="mes" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} width={60} />
                <Tooltip formatter={(v: number) => formatBRL(v)} /><Legend />
                <Bar dataKey="receitas" name="Receitas" fill="#687653" radius={[6, 6, 0, 0]} /><Bar dataKey="despesas" name="Despesas" fill="#B69A62" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title="Evolução do número de alunos" empty={!d.series_students.some((r) => r.alunos)}>
              <LineChart data={d.series_students.map((r) => ({ ...r, mes: MONTHS_SHORT[r.month - 1] }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8D8C8" /><XAxis dataKey="mes" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={40} />
                <Tooltip /><Line type="monotone" dataKey="alunos" name="Alunos" stroke="#354735" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ChartCard>
            <ChartCard title="Matrículas por turma" empty={d.series_enrollments_by_class.length === 0}>
              <BarChart data={d.series_enrollments_by_class} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E8D8C8" /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} /><YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip /><Bar dataKey="total" name="Matrículas" fill="#687653" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title="Inadimplência ao longo dos meses (%)" empty={!d.series_delinquency.some((r) => r.taxa != null)}>
              <LineChart data={d.series_delinquency.map((r) => ({ ...r, mes: MONTHS_SHORT[r.month - 1] }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8D8C8" /><XAxis dataKey="mes" tick={{ fontSize: 12 }} /><YAxis unit="%" tick={{ fontSize: 12 }} width={44} />
                <Tooltip formatter={(v: number) => `${v}%`} /><Line type="monotone" dataKey="taxa" name="Inadimplência" stroke="#B69A62" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ChartCard>
            <ChartCard title="Alunos por etapa de ensino" empty={d.students_by_stage.length === 0}>
              <PieChart>
                <Pie data={d.students_by_stage} dataKey="total" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {d.students_by_stage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Tooltip /><Legend />
              </PieChart>
            </ChartCard>

            <div className="card p-5">
              <h2 className="mb-3 text-base font-semibold">Vagas disponíveis por turma</h2>
              {d.class_vacancies.length === 0 ? <Empty text="Nenhuma turma ativa cadastrada." /> : (
                <ul className="divide-y divide-nude/70 text-sm">
                  {d.class_vacancies.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2"><span>{c.name}</span>
                      <span className={c.available === 0 ? 'font-semibold text-red-700' : 'text-muted'}>{c.available} de {c.capacity} vagas</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="card p-5"><h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Cake className="h-4 w-4 text-gold" /> Aniversariantes de {MONTHS[month - 1]}</h2>
              {d.birthdays.length === 0 ? <Empty text="Nenhum aniversariante no mês." /> : <ul className="space-y-1.5 text-sm">{d.birthdays.map((b, i) => <li key={i}><span className="mr-2 inline-block w-6 font-semibold text-olive">{String(b.day).padStart(2, '0')}</span>{b.name}</li>)}</ul>}</div>
            <div className="card p-5"><h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><CalendarDays className="h-4 w-4 text-gold" /> Próximos eventos</h2>
              {d.upcoming_events.length === 0 ? <Empty text="Nenhum evento agendado." /> : <ul className="space-y-2 text-sm">{d.upcoming_events.map((e) => <li key={e.id}><p className="font-semibold">{e.title}</p><p className="text-muted">{formatDateTime(e.starts_at)}</p></li>)}</ul>}</div>
            <div className="card p-5"><h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><AlertTriangle className="h-4 w-4 text-gold" /> Alertas administrativos</h2>
              {alerts.length === 0 ? <Empty text="Nenhum alerta no momento." /> : <ul className="list-disc space-y-1.5 pl-5 text-sm">{alerts.map((a, i) => <li key={i}>{a}</li>)}</ul>}</div>
          </div>
        </div>
      )}
    </>
  )
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-muted">{text}</p>

function Sel({ label, value, onChange, options }: { label: string; value: string | number; onChange: (v: string) => void; options: Opt[] }) {
  const id = `f-${label}`
  return (
    <div><label htmlFor={id} className="label">{label}</label>
      <select id={id} className="input" value={String(value)} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
  )
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: React.ReactElement }) {
  return (
    <div className="card p-5"><h2 className="mb-3 text-base font-semibold">{title}</h2>
      {empty ? <p className="flex h-60 items-center justify-center text-sm text-muted">Sem dados para exibir.</p> : <div className="h-60"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>}</div>
  )
}
