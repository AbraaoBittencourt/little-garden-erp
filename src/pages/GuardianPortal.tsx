import { Bell, CalendarDays, Check, GraduationCap } from 'lucide-react'
import Badge, { invoiceTone } from '@/components/Badge'
import { ErrorBox, PageHeader } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { INVOICE_LABEL, SHIFT_LABEL, derivedInvoiceStatus, errMsg, type Row } from '@/lib/db'
import { formatBRL, formatDate, formatDateTime } from '@/lib/format'

/** Área dos responsáveis: tudo é filtrado pelo banco (RLS) — cada responsável vê só os próprios filhos. */
export default function GuardianPortal() {
  const toast = useToast(); const { session } = useAuth()
  const { data, loading, error, reload } = useAsync(async () => {
    const st = await supabase.from('students').select('id, full_name, status, shift, class:classes(name)').order('full_name')
    if (st.error) throw new Error(errMsg(st.error))
    const ids = (st.data ?? []).map((s: Row) => s.id)
    const [att, inv, ann, ev, rd] = await Promise.all([
      ids.length ? supabase.from('attendance_records').select('student_id, status').in('student_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('invoices').select('id, student_id, competence, due_date, total, status, payments(amount)').in('student_id', ids).neq('status', 'cancelado').order('due_date') : Promise.resolve({ data: [] }),
      supabase.from('announcements').select('id, title, body, published_at').not('published_at', 'is', null).order('published_at', { ascending: false }).limit(20),
      supabase.from('school_events').select('id, title, starts_at, location, kind').gte('starts_at', new Date().toISOString()).order('starts_at').limit(8),
      supabase.from('announcement_reads').select('announcement_id').eq('user_id', session!.user.id),
    ])
    return { students: (st.data ?? []) as Row[], att: (att.data ?? []) as Row[], inv: (inv.data ?? []) as Row[], ann: (ann.data ?? []) as Row[], ev: (ev.data ?? []) as Row[], read: new Set(((rd.data ?? []) as Row[]).map((r) => r.announcement_id)) }
  }, [])
  async function markRead(id: string) { const { error } = await supabase.from('announcement_reads').insert({ announcement_id: id }); error && error.code !== '23505' ? toast.error(errMsg(error)) : void reload() }
  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox message={error} onRetry={() => void reload()} />
  const paid = (i: Row) => (i.payments ?? []).reduce((s: number, p: Row) => s + Number(p.amount), 0)
  return (
    <>
      <PageHeader title="Meus filhos" subtitle="Frequência, cobranças e comunicados da escola." />
      {data.students.length === 0 ? <p className="card p-8 text-center text-sm text-muted">Nenhum aluno vinculado ao seu acesso. Fale com a secretaria da escola.</p> : (
        <div className="grid gap-4 lg:grid-cols-2">{data.students.map((s) => {
          const a = data.att.filter((x) => x.student_id === s.id); const p = a.filter((x) => x.status === 'presente').length; const pct = a.length ? Math.round((1000 * p) / a.length) / 10 : null
          const invs = data.inv.filter((i) => i.student_id === s.id)
          return (<div key={s.id} className="card p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-cream p-2.5 text-olive"><GraduationCap className="h-5 w-5" /></span><div><h2 className="text-lg font-semibold">{s.full_name}</h2><p className="text-sm text-muted">{s.class?.name ?? 'Sem turma'}{s.shift ? ` · ${SHIFT_LABEL[s.shift]}` : ''}</p></div></div>
            <p className="mt-4 text-sm"><strong>Frequência:</strong> {pct == null ? 'sem registros' : `${String(pct).replace('.', ',')}% (${p} presenças em ${a.length} dias, ${a.filter((x) => x.status === 'ausente').length} faltas)`}</p>
            {invs.length > 0 && <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">Mensalidades</h3><ul className="divide-y divide-nude/60 text-sm">{invs.slice(-12).map((i) => { const st = derivedInvoiceStatus(i.status, i.due_date); return <li key={i.id} className="flex items-center justify-between py-2"><span>{i.competence.slice(5, 7)}/{i.competence.slice(0, 4)} · venc. {formatDate(i.due_date)} · {formatBRL(Number(i.total) - paid(i) > 0 && st !== 'pago' ? Number(i.total) - paid(i) : i.total)}</span><Badge tone={invoiceTone(st)}>{INVOICE_LABEL[st]}</Badge></li> })}</ul><p className="mt-2 text-xs text-muted">Para boletos ou segunda via, fale com a secretaria.</p></div>}</div>)
        })}</div>)}
      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card p-5"><h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Bell className="h-4 w-4 text-gold" /> Comunicados</h2>
          {data.ann.length === 0 ? <p className="text-sm text-muted">Nenhum comunicado.</p> : <ul className="space-y-4">{data.ann.map((c) => (<li key={c.id} className="text-sm"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{c.title}</p>{data.read.has(c.id) ? <Badge tone="good"><Check className="inline h-3 w-3" /> Lido</Badge> : <button className="text-xs font-semibold text-olive hover:underline" onClick={() => void markRead(c.id)}>Marcar como lido</button>}</div><p className="whitespace-pre-wrap text-muted">{c.body}</p><p className="mt-1 text-xs text-muted">{formatDateTime(c.published_at)}</p></li>))}</ul>}</div>
        <div className="card p-5"><h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><CalendarDays className="h-4 w-4 text-gold" /> Próximos eventos</h2>
          {data.ev.length === 0 ? <p className="text-sm text-muted">Nenhum evento agendado.</p> : <ul className="space-y-2 text-sm">{data.ev.map((e) => <li key={e.id}><p className="font-semibold">{e.title}</p><p className="text-muted">{formatDateTime(e.starts_at)}{e.location ? ` · ${e.location}` : ''}</p></li>)}</ul>}</div>
      </div>
    </>
  )
}
