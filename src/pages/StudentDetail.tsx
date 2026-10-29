import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, FileDown, Upload } from 'lucide-react'
import Tabs from '@/components/Tabs'
import Badge, { invoiceTone } from '@/components/Badge'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import Picker from '@/components/Picker'
import { FormGrid, toDb, fromDb, validateField, type FieldDef } from '@/components/Fields'
import { ErrorBox } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { ATT_LABEL, ENROLL_STATUS, INVOICE_LABEL, SHIFT_LABEL, STUDENT_STATUS, derivedInvoiceStatus, errMsg, openPrivate, todayISO, uploadPrivate, type Row } from '@/lib/db'
import { formatBRL, formatDate } from '@/lib/format'
import { downloadFile } from '@/lib/csv'
import { DS, DSF, PED } from '@/lib/roles'
import { generateDocument, DOC_KIND_LABEL, type DocKind } from '@/lib/docgen'
import { studentFields } from './Students'
import { guardianFields } from './Guardians'

const REL = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tio(a)', 'Responsável legal', 'Outro'].map((v) => ({ value: v, label: v }))

export default function StudentDetail() {
  const { id } = useParams(); const { hasRole } = useAuth()
  const { data: st, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('students').select('*, class:classes(name), stage:education_stages(name)').eq('id', id!).maybeSingle()
    if (error) throw new Error(errMsg(error)); if (!data) throw new Error('Aluno não encontrado ou sem permissão de acesso.')
    return data as Row
  }, [id])
  if (loading && !st) return <Loading />
  if (error || !st) return <ErrorBox message={error || 'Aluno não encontrado.'} />
  const sid = st.id as string
  const ds = hasRole(...DS)
  return (
    <>
      <Link to="/alunos" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-olive hover:underline"><ArrowLeft className="h-4 w-4" /> Alunos</Link>
      <div className="card mb-6 flex flex-wrap items-center gap-4 p-5">
        <Photo student={st} canEdit={ds} onDone={reload} />
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold">{st.full_name}</h1>
          <p className="text-sm text-muted">{st.stage?.name ?? 'Sem etapa'} · {st.class?.name ?? 'Sem turma'} · {st.shift ? SHIFT_LABEL[st.shift] : 'Sem turno'}</p></div>
        <Badge tone={st.status === 'ativo' ? 'good' : 'warn'}>{STUDENT_STATUS[st.status]}</Badge>
      </div>
      <Tabs tabs={[
        { id: 'dados', label: 'Dados pessoais', content: <PersonalData st={st} canEdit={ds} onSaved={reload} /> },
        { id: 'resp', label: 'Responsáveis', hidden: !hasRole(...DSF, 'coordenacao'), content: <GuardiansTab sid={sid} canEdit={ds} /> },
        { id: 'mat', label: 'Matrícula', hidden: !hasRole(...DS, 'coordenacao', 'financeiro'), content: <EnrollmentTab sid={sid} canEdit={ds} /> },
        { id: 'fin', label: 'Financeiro', hidden: !hasRole(...DSF), content: <FinanceTab sid={sid} /> },
        { id: 'freq', label: 'Frequência', hidden: !hasRole(...DS, 'coordenacao', 'professor'), content: <AttendanceTab sid={sid} /> },
        { id: 'docs', label: 'Documentos', hidden: !ds, content: <DocsTab sid={sid} /> },
        { id: 'ped', label: 'Informações pedagógicas', hidden: !hasRole(...PED), content: <PedTab sid={sid} /> },
        { id: 'obs', label: 'Observações administrativas', hidden: !ds, content: <NotesTab sid={sid} /> },
        { id: 'lgpd', label: 'Privacidade (LGPD)', hidden: !ds, content: <PrivacyTab sid={sid} name={st.full_name} /> },
      ]} />
    </>
  )
}

function Photo({ student, canEdit, onDone }: { student: Row; canEdit: boolean; onDone: () => void }) {
  const toast = useToast()
  const { data: url, reload } = useAsync(async () => {
    if (!student.photo_path) return null
    const { data } = await supabase.storage.from('documents').createSignedUrl(student.photo_path, 3600); return data?.signedUrl ?? null
  }, [student.photo_path])
  async function up(f?: File) {
    if (!f) return
    if (!/^image\//.test(f.type)) return toast.error('Envie uma imagem (JPG ou PNG).')
    try {
      const path = await uploadPrivate(`students/${student.id}/foto`, f)
      const { error } = await supabase.from('students').update({ photo_path: path }).eq('id', student.id)
      if (error) throw new Error(errMsg(error)); toast.success('Foto atualizada.'); onDone(); void reload()
    } catch (e) { toast.error((e as Error).message) }
  }
  return (
    <div className="relative">
      {url ? <img src={url} alt="" className="h-20 w-20 rounded-2xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-nude font-heading text-2xl font-semibold text-forest">{student.full_name?.[0]}</div>}
      {canEdit && <label className="absolute -bottom-2 left-1/2 -translate-x-1/2 cursor-pointer rounded-full border border-nude bg-white px-2 py-0.5 text-[11px] font-semibold shadow-card">Foto<input type="file" accept="image/*" className="sr-only" onChange={(e) => void up(e.target.files?.[0])} /></label>}
    </div>
  )
}

function PersonalData({ st, canEdit, onSaved }: { st: Row; canEdit: boolean; onSaved: () => void }) {
  const toast = useToast()
  const init = () => Object.fromEntries(studentFields.map((f) => [f.name, fromDb(f, st[f.name])]))
  const [form, setForm] = useState<Row>(init); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  async function save() {
    setErr('')
    for (const f of studentFields) { const m = validateField(f, form[f.name], form); if (m) return setErr(m) }
    setBusy(true)
    const { error } = await supabase.from('students').update(Object.fromEntries(studentFields.map((f) => [f.name, toDb(f, form[f.name])]))).eq('id', st.id)
    setBusy(false); if (error) return setErr(errMsg(error)); toast.success('Dados atualizados.'); onSaved()
  }
  return (
    <div className="card p-6"><FormGrid fields={studentFields} form={form} setForm={setForm} disabled={!canEdit} />
      {err && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{err}</p>}
      {canEdit && <div className="mt-5 flex justify-end"><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar alterações'}</button></div>}
    </div>
  )
}

function GuardiansTab({ sid, canEdit }: { sid: string; canEdit: boolean }) {
  const toast = useToast()
  const { data, loading, reload } = useAsync(async () => {
    const { data } = await supabase.from('student_guardians').select('*, guardian:guardians(full_name, cpf, phone, whatsapp, email)').eq('student_id', sid).order('created_at')
    return (data ?? []) as Row[]
  }, [sid])
  const [add, setAdd] = useState(false); const [del, setDel] = useState<Row | null>(null)
  async function toggle(l: Row, k: string) {
    const { error } = await supabase.from('student_guardians').update({ [k]: !l[k] }).eq('id', l.id); error ? toast.error(errMsg(error)) : void reload()
  }
  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Responsáveis vinculados</h2>{canEdit && <button className="btn-primary" onClick={() => setAdd(true)}>Vincular responsável</button>}</div>
      {loading ? <Loading /> : (data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum responsável vinculado.</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-muted"><tr><th className="p-2.5">Nome</th><th className="p-2.5">Parentesco</th><th className="p-2.5">Contato</th><th className="p-2.5">Financeiro</th><th className="p-2.5">Legal</th><th className="p-2.5">Retirada</th><th className="p-2.5">Emergência</th><th /></tr></thead>
          <tbody>{data!.map((l) => (
            <tr key={l.id} className="border-t border-nude/60"><td className="p-2.5 font-semibold">{l.guardian?.full_name}</td><td className="p-2.5">{l.relationship}</td><td className="p-2.5">{l.guardian?.whatsapp || l.guardian?.phone || '—'}</td>
              {(['is_financial', 'is_legal', 'can_pickup', 'is_emergency_contact'] as const).map((k) => <td key={k} className="p-2.5"><input type="checkbox" aria-label={k} checked={l[k]} disabled={!canEdit} onChange={() => void toggle(l, k)} /></td>)}
              <td className="p-2.5 text-right">{canEdit && <button className="text-xs font-semibold text-red-700 hover:underline" onClick={() => setDel(l)}>Desvincular</button>}</td></tr>))}</tbody></table></div>)}
      <p className="mt-3 text-xs text-muted">A retirada do aluno só deve ser autorizada para quem estiver marcado em “Retirada”.</p>
      {add && <LinkGuardian sid={sid} onClose={() => setAdd(false)} onDone={() => { setAdd(false); void reload() }} />}
      <ConfirmDialog open={!!del} danger title="Desvincular responsável?" confirmLabel="Desvincular" onCancel={() => setDel(null)}
        onConfirm={async () => { const { error } = await supabase.from('student_guardians').delete().eq('id', del!.id); setDel(null); error ? toast.error(errMsg(error)) : (toast.success('Vínculo removido.'), void reload()) }}>
        O cadastro do responsável é mantido; apenas o vínculo com este aluno é removido.</ConfirmDialog>
    </div>
  )
}

export function LinkGuardian({ sid, onClose, onDone }: { sid: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast(); const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [gid, setGid] = useState<string | null>(null); const [rel, setRel] = useState('Mãe')
  const [flags, setFlags] = useState({ is_financial: false, is_legal: false, can_pickup: false, is_emergency_contact: false })
  const [g, setG] = useState<Row>({ full_name: '', cpf: '', phone: '', whatsapp: '', email: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const gf = guardianFields.filter((f) => ['full_name', 'cpf', 'phone', 'whatsapp', 'email'].includes(f.name))
  async function save() {
    setErr(''); let guardian = gid
    if (mode === 'new') {
      for (const f of gf) { const m = validateField(f, g[f.name], g); if (m) return setErr(m) }
      setBusy(true)
      const { data, error } = await supabase.from('guardians').insert(Object.fromEntries(gf.map((f) => [f.name, toDb(f, g[f.name])]))).select('id').maybeSingle()
      if (error || !data) { setBusy(false); return setErr(errMsg(error)) } guardian = data.id
    } else if (!guardian) return setErr('Selecione o responsável.')
    setBusy(true)
    const { error } = await supabase.from('student_guardians').insert({ student_id: sid, guardian_id: guardian, relationship: rel, ...flags })
    setBusy(false); if (error) return setErr(errMsg(error)); toast.success('Responsável vinculado.'); onDone()
  }
  return (
    <Modal title="Vincular responsável" onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Vincular'}</button></>}>
      <div className="mb-4 flex gap-2">{(['existing', 'new'] as const).map((m) => <button key={m} className={mode === m ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode(m)}>{m === 'existing' ? 'Já cadastrado' : 'Novo responsável'}</button>)}</div>
      {mode === 'existing' ? <div><label className="label">Responsável</label><Picker table="guardians" value={gid} onChange={setGid} filter={(q) => q.is('archived_at', null)} /></div> : <FormGrid fields={gf} form={g} setForm={setG} />}
      <div className="mt-4"><label className="label" htmlFor="rel">Grau de parentesco</label><select id="rel" className="input" value={rel} onChange={(e) => setRel(e.target.value)}>{REL.map((r) => <option key={r.value}>{r.label}</option>)}</select></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">{([['is_financial', 'Responsável financeiro'], ['is_legal', 'Responsável legal'], ['can_pickup', 'Autorizado a retirar o aluno'], ['is_emergency_contact', 'Contato de emergência']] as const).map(([k, l]) => (
        <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} /> {l}</label>))}</div>
      {err && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{err}</p>}
    </Modal>
  )
}

function EnrollmentTab({ sid, canEdit }: { sid: string; canEdit: boolean }) {
  const toast = useToast()
  const { data, loading } = useAsync(async () => {
    const [e, h] = await Promise.all([
      supabase.from('enrollments').select('id, status, enrolled_on, class:classes(name), year:school_years(year), plan:payment_plans(name)').eq('student_id', sid).order('created_at', { ascending: false }),
      supabase.from('student_class_history').select('id, started_on, ended_on, class:classes(name)').eq('student_id', sid).order('started_on', { ascending: false }),
    ])
    return { e: (e.data ?? []) as Row[], h: (h.data ?? []) as Row[] }
  }, [sid])
  async function doc(kind: DocKind, eid: string) { try { await generateDocument(kind, sid, eid) } catch (e) { toast.error((e as Error).message) } }
  return loading ? <Loading /> : (
    <div className="space-y-6">
      <div className="card p-6"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Histórico de matrículas</h2>{canEdit && <Link className="btn-primary" to={`/matriculas/nova?aluno=${sid}`}>Nova matrícula</Link>}</div>
        <table className="w-full text-left text-sm"><thead className="text-muted"><tr><th className="p-2.5">Ano</th><th className="p-2.5">Turma</th><th className="p-2.5">Plano</th><th className="p-2.5">Situação</th><th /></tr></thead>
          <tbody>{(data?.e ?? []).map((e) => (<tr key={e.id} className="border-t border-nude/60"><td className="p-2.5">{e.year?.year}</td><td className="p-2.5">{e.class?.name ?? '—'}</td><td className="p-2.5">{e.plan?.name ?? '—'}</td><td className="p-2.5"><Badge tone={e.status === 'confirmada' ? 'good' : e.status === 'cancelada' ? 'bad' : 'warn'}>{ENROLL_STATUS[e.status]}</Badge></td>
            <td className="p-2.5 text-right">{canEdit && e.status !== 'cancelada' && <button className="text-xs font-semibold text-olive hover:underline" onClick={() => void doc('declaracao_matricula', e.id)}>Declaração</button>}</td></tr>))}
            {(data?.e ?? []).length === 0 && <tr><td colSpan={5} className="p-4 text-muted">Sem matrículas.</td></tr>}</tbody></table></div>
      <div className="card p-6"><h2 className="mb-4 text-lg font-semibold">Histórico de turmas</h2>
        <ul className="divide-y divide-nude/60 text-sm">{(data?.h ?? []).map((h) => <li key={h.id} className="flex justify-between py-2"><span className="font-semibold">{h.class?.name}</span><span className="text-muted">{formatDate(h.started_on)} → {h.ended_on ? formatDate(h.ended_on) : 'atual'}</span></li>)}
          {(data?.h ?? []).length === 0 && <li className="py-2 text-muted">Sem histórico de turmas.</li>}</ul></div>
    </div>
  )
}

function FinanceTab({ sid }: { sid: string }) {
  const { data, loading } = useAsync(async () => {
    const { data } = await supabase.from('invoices').select('*, payments(amount, paid_on, method)').eq('student_id', sid).order('competence')
    return (data ?? []) as Row[]
  }, [sid])
  const paid = (i: Row) => (i.payments ?? []).reduce((s: number, p: Row) => s + Number(p.amount), 0)
  const tot = (data ?? []).filter((i) => i.status !== 'cancelado')
  return loading ? <Loading /> : (
    <div className="card overflow-x-auto p-6">
      <p className="mb-4 text-sm text-muted">Total cobrado: <strong>{formatBRL(tot.reduce((s, i) => s + Number(i.total), 0))}</strong> · Pago: <strong>{formatBRL(tot.reduce((s, i) => s + paid(i), 0))}</strong></p>
      <table className="w-full min-w-[640px] text-left text-sm"><thead className="text-muted"><tr><th className="p-2.5">Competência</th><th className="p-2.5">Vencimento</th><th className="p-2.5">Valor</th><th className="p-2.5">Pago</th><th className="p-2.5">Situação</th></tr></thead>
        <tbody>{(data ?? []).map((i) => { const s = derivedInvoiceStatus(i.status, i.due_date); return (
          <tr key={i.id} className="border-t border-nude/60"><td className="p-2.5">{i.competence.slice(5, 7)}/{i.competence.slice(0, 4)}</td><td className="p-2.5">{formatDate(i.due_date)}</td><td className="p-2.5">{formatBRL(i.total)}</td><td className="p-2.5">{formatBRL(paid(i))}</td><td className="p-2.5"><Badge tone={invoiceTone(s)}>{INVOICE_LABEL[s]}</Badge></td></tr>) })}
          {(data ?? []).length === 0 && <tr><td colSpan={5} className="p-4 text-muted">Nenhuma cobrança gerada.</td></tr>}</tbody></table>
    </div>
  )
}

function AttendanceTab({ sid }: { sid: string }) {
  const { data, loading } = useAsync(async () => {
    const { data } = await supabase.from('attendance_records').select('id, date, status, notes, class:classes(name)').eq('student_id', sid).order('date', { ascending: false }).limit(300)
    return (data ?? []) as Row[]
  }, [sid])
  const all = data ?? []; const n = (s: string) => all.filter((a) => a.status === s).length
  const pct = all.length ? Math.round((1000 * n('presente')) / all.length) / 10 : null
  return loading ? <Loading /> : (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap gap-6 text-sm"><span>Registros: <strong>{all.length}</strong></span><span>Presenças: <strong>{n('presente')}</strong></span><span>Faltas: <strong>{n('ausente')}</strong></span><span>Justificadas: <strong>{n('falta_justificada')}</strong></span><span>Frequência: <strong>{pct == null ? '—' : `${String(pct).replace('.', ',')}%`}</strong></span></div>
      <ul className="divide-y divide-nude/60 text-sm">{all.slice(0, 30).map((a) => <li key={a.id} className="flex justify-between py-2"><span>{formatDate(a.date)} · {a.class?.name}</span><span className="text-muted">{ATT_LABEL[a.status]}{a.notes ? ` — ${a.notes}` : ''}</span></li>)}
        {all.length === 0 && <li className="py-2 text-muted">Sem registros de frequência.</li>}</ul>
    </div>
  )
}

const DOC_CATS = ['Certidão de nascimento', 'Documento do responsável', 'Comprovante de residência', 'Carteira de vacinação', 'Laudo / relatório médico', 'Contrato assinado', 'Outro']
function DocsTab({ sid }: { sid: string }) {
  const toast = useToast()
  const { data, loading, reload } = useAsync(async () => { const { data } = await supabase.from('documents').select('*').eq('student_id', sid).order('created_at', { ascending: false }); return (data ?? []) as Row[] }, [sid])
  const [cat, setCat] = useState(DOC_CATS[0]); const [exp, setExp] = useState(''); const [busy, setBusy] = useState(false)
  async function up(f?: File) {
    if (!f) return; setBusy(true)
    try { const path = await uploadPrivate(`students/${sid}`, f)
      const { error } = await supabase.from('documents').insert({ student_id: sid, category: cat, name: f.name, storage_path: path, expires_on: exp || null }); if (error) throw new Error(errMsg(error))
      toast.success('Documento anexado.'); setExp(''); void reload() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="card p-6">
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_12rem_auto]"><select aria-label="Categoria" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>{DOC_CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <input aria-label="Validade" type="date" className="input" value={exp} onChange={(e) => setExp(e.target.value)} title="Validade (opcional)" />
        <label className={`btn-primary cursor-pointer ${busy ? 'opacity-60' : ''}`}><Upload className="h-4 w-4" /> Anexar<input type="file" className="sr-only" disabled={busy} onChange={(e) => void up(e.target.files?.[0])} /></label></div>
      {loading ? <Loading /> : <ul className="divide-y divide-nude/60 text-sm">{(data ?? []).map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate font-semibold">{d.name}</p><p className="text-xs text-muted">{d.category}{d.expires_on ? ` · validade ${formatDate(d.expires_on)}` : ''}</p></div>
          <div className="flex items-center gap-2">{d.expires_on && d.expires_on < todayISO() && <Badge tone="bad">Vencido</Badge>}<button className="rounded-lg p-2 hover:bg-cream" aria-label="Baixar" onClick={() => openPrivate(d.storage_path).catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /></button></div></li>))}
        {(data ?? []).length === 0 && <li className="py-2 text-muted">Nenhum documento anexado.</li>}</ul>}
    </div>
  )
}

function PedTab({ sid }: { sid: string }) {
  const { data, loading } = useAsync(async () => {
    const [a, r] = await Promise.all([
      supabase.from('assessments').select('id, title, score, descriptive_text, assessed_on, subject:subjects(name)').eq('student_id', sid).order('assessed_on', { ascending: false }),
      supabase.from('pedagogical_reports').select('id, period, content, is_sensitive, created_at').eq('student_id', sid).order('created_at', { ascending: false }),
    ])
    return { a: (a.data ?? []) as Row[], r: (r.data ?? []) as Row[] }
  }, [sid])
  return loading ? <Loading /> : (
    <div className="space-y-6">
      <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Avaliações</h2><ul className="divide-y divide-nude/60 text-sm">{(data?.a ?? []).map((a) => <li key={a.id} className="py-2.5"><p className="font-semibold">{a.title}{a.score != null ? ` — nota ${String(a.score).replace('.', ',')}` : ''}<span className="ml-2 text-xs font-normal text-muted">{formatDate(a.assessed_on)} {a.subject?.name ? `· ${a.subject.name}` : ''}</span></p>{a.descriptive_text && <p className="text-muted">{a.descriptive_text}</p>}</li>)}{(data?.a ?? []).length === 0 && <li className="py-2 text-muted">Sem avaliações.</li>}</ul></div>
      <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Relatórios e observações</h2><ul className="divide-y divide-nude/60 text-sm">{(data?.r ?? []).map((r) => <li key={r.id} className="py-2.5"><p className="font-semibold">{r.period || formatDate(r.created_at)} {r.is_sensitive && <Badge tone="warn">Sensível</Badge>}</p><p className="whitespace-pre-wrap text-muted">{r.content}</p></li>)}{(data?.r ?? []).length === 0 && <li className="py-2 text-muted">Sem relatórios.</li>}</ul></div>
      <p className="text-xs text-muted">Para registrar avaliações e relatórios, use o módulo Pedagógico.</p>
    </div>
  )
}

function NotesTab({ sid }: { sid: string }) {
  const toast = useToast()
  const { data, loading } = useAsync(async () => { const { data } = await supabase.from('student_admin_notes').select('notes').eq('student_id', sid).maybeSingle(); return (data?.notes as string) ?? '' }, [sid])
  const [txt, setTxt] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true); const { error } = await supabase.from('student_admin_notes').upsert({ student_id: sid, notes: txt ?? data ?? '' }); setBusy(false)
    error ? toast.error(errMsg(error)) : toast.success('Observações salvas.')
  }
  return loading ? <Loading /> : (
    <div className="card p-6"><p className="mb-3 text-sm text-muted">Acesso restrito à Direção e à Secretaria. Registre apenas o necessário.</p>
      <textarea aria-label="Observações administrativas" className="input min-h-[160px]" value={txt ?? data ?? ''} onChange={(e) => setTxt(e.target.value)} />
      <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar'}</button></div></div>
  )
}

function PrivacyTab({ sid, name }: { sid: string; name: string }) {
  const toast = useToast()
  const { data, loading, reload } = useAsync(async () => { const { data } = await supabase.from('consents').select('*, guardian:guardians(full_name)').eq('student_id', sid).order('granted_at', { ascending: false }); return (data ?? []) as Row[] }, [sid])
  const [open, setOpen] = useState(false); const [f, setF] = useState<Row>({ purpose: '', granted_at: todayISO(), granted: true, notes: '', guardian_id: '' })
  const [fields] = useState<FieldDef[]>([
    { name: 'purpose', label: 'Finalidade', required: true, full: true, placeholder: 'Ex.: Uso de imagem em redes sociais da escola' },
    { name: 'guardian_id', label: 'Responsável que decidiu', type: 'picker', pickerTable: 'guardians', full: true },
    { name: 'granted_at', label: 'Data', type: 'date', required: true }, { name: 'granted', label: 'Decisão', type: 'checkbox', placeholder: 'Consentimento concedido' },
    { name: 'notes', label: 'Observações', type: 'textarea' }])
  async function exportData() {
    const { data, error } = await supabase.rpc('export_student_data', { p_student: sid })
    if (error || !data) return toast.error('Não foi possível exportar os dados.')
    downloadFile(`dados_${name.replace(/\W+/g, '_')}.json`, JSON.stringify(data, null, 2), 'application/json')
  }
  async function save() {
    for (const x of fields) { const m = validateField(x, f[x.name], f); if (m) return toast.error(m) }
    const { error } = await supabase.from('consents').insert({ student_id: sid, purpose: f.purpose.trim(), guardian_id: f.guardian_id || null, granted_at: f.granted_at, granted: !!f.granted, notes: f.notes || null })
    if (error) return toast.error(errMsg(error)); toast.success('Consentimento registrado.'); setOpen(false); void reload()
  }
  return (
    <div className="space-y-6">
      <div className="card p-6"><h2 className="text-lg font-semibold">Direitos do titular</h2><p className="mt-1 text-sm text-muted">Exporta todos os dados pessoais deste aluno (cadastro, responsáveis, matrículas, cobranças, frequência, avaliações, documentos e consentimentos) em JSON. Correções são feitas nas demais abas e ficam registradas na auditoria.</p>
        <button className="btn-secondary mt-4" onClick={() => void exportData()}><FileDown className="h-4 w-4" /> Exportar dados do aluno</button></div>
      <div className="card p-6"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Consentimentos</h2><button className="btn-primary" onClick={() => setOpen(true)}>Registrar</button></div>
        {loading ? <Loading /> : <ul className="divide-y divide-nude/60 text-sm">{(data ?? []).map((c) => <li key={c.id} className="flex items-start justify-between gap-3 py-2.5"><div><p className="font-semibold">{c.purpose}</p><p className="text-xs text-muted">{formatDate(c.granted_at)}{c.guardian?.full_name ? ` · ${c.guardian.full_name}` : ''}{c.notes ? ` · ${c.notes}` : ''}</p></div><Badge tone={c.granted ? 'good' : 'bad'}>{c.granted ? 'Concedido' : 'Negado/revogado'}</Badge></li>)}{(data ?? []).length === 0 && <li className="py-2 text-muted">Nenhum consentimento registrado.</li>}</ul>}</div>
      {open && <Modal title="Registrar consentimento" onClose={() => setOpen(false)} footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" onClick={() => void save()}>Salvar</button></>}><FormGrid fields={fields} form={f} setForm={setF} /></Modal>}
    </div>
  )
}
