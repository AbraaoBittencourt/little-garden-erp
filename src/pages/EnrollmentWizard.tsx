import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Upload, X } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import Picker from '@/components/Picker'
import Badge from '@/components/Badge'
import { FormGrid, toDb, validateField } from '@/components/Fields'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { ENROLL_STATUS, SHIFT_LABEL, errMsg, todayISO, uploadPrivate, type Row } from '@/lib/db'
import { formatBRL } from '@/lib/format'
import { generateDocument, type DocKind } from '@/lib/docgen'
import { studentFields } from './Students'
import { guardianFields } from './Guardians'

const STEPS = ['Aluno', 'Responsáveis', 'Etapa', 'Turma e turno', 'Ano letivo', 'Plano', 'Documentos', 'Revisão', 'Confirmação', 'Contrato']
const REQUIRED_DOCS = ['Certidão de nascimento do aluno', 'Documento de identificação do responsável', 'Comprovante de residência', 'Carteira de vacinação']
const REL = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tio(a)', 'Responsável legal', 'Outro']
const newStudentFields = studentFields.filter((f) => ['full_name', 'birth_date', 'cpf', 'document_id', 'address', 'city', 'zip_code'].includes(f.name))
const newGuardianFields = guardianFields.filter((f) => ['full_name', 'cpf', 'phone', 'whatsapp', 'email'].includes(f.name))

interface PG { key: string; id?: string; label?: string; data?: Row; relationship: string; is_financial: boolean; is_legal: boolean; can_pickup: boolean; is_emergency_contact: boolean }

export default function EnrollmentWizard() {
  const toast = useToast(); const [sp] = useSearchParams()
  const [step, setStep] = useState(0); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'existing' | 'new'>(sp.get('aluno') ? 'existing' : 'existing')
  const [studentId, setStudentId] = useState<string | null>(sp.get('aluno')); const [ns, setNs] = useState<Row>({ full_name: '', birth_date: '', cpf: '', document_id: '', address: '', city: 'Lauro de Freitas', zip_code: '' })
  const [guardians, setGuardians] = useState<PG[]>([]); const [gMode, setGMode] = useState<'existing' | 'new' | null>(null)
  const [gPick, setGPick] = useState<string | null>(null); const [gPickLabel, setGPickLabel] = useState(''); const [gNew, setGNew] = useState<Row>({ full_name: '', cpf: '', phone: '', whatsapp: '', email: '' })
  const [stageId, setStageId] = useState(''); const [yearId, setYearId] = useState(''); const [classId, setClassId] = useState('')
  const [planId, setPlanId] = useState(''); const [schId, setSchId] = useState(''); const [first, setFirst] = useState(todayISO().slice(0, 7))
  const [files, setFiles] = useState<Record<string, File | undefined>>({}); const [chosen, setChosen] = useState<string>('')
  const created = useRef<{ student?: string; guardians: Record<string, string> }>({ guardians: {} })
  const [result, setResult] = useState<{ enrollmentId: string; studentId: string; invoices: number | null; status: string } | null>(null)

  const ref = useAsync(async () => {
    const [st, yr, pl, sc, ex] = await Promise.all([
      supabase.from('education_stages').select('id, name').eq('is_active', true).order('name'),
      supabase.from('school_years').select('id, year, is_current').order('year', { ascending: false }),
      supabase.from('payment_plans').select('id, name, monthly_amount, installments, due_day').eq('is_active', true).order('name'),
      supabase.from('scholarships').select('id, name, discount_percent').eq('is_active', true).order('name'),
      studentId ? supabase.from('student_guardians').select('id, relationship, is_financial, guardian:guardians(full_name)').eq('student_id', studentId) : Promise.resolve({ data: [] as Row[] }),
    ])
    return { stages: (st.data ?? []) as Row[], years: (yr.data ?? []) as Row[], plans: (pl.data ?? []) as Row[], schs: (sc.data ?? []) as Row[], existingLinks: (ex.data ?? []) as Row[] }
  }, [studentId])
  useEffect(() => { if (!yearId && ref.data) setYearId((ref.data.years.find((y) => y.is_current) ?? ref.data.years[0])?.id ?? '') }, [ref.data, yearId])

  const classes = useAsync(async () => {
    if (!stageId || !yearId) return [] as Row[]
    type CR = Row
    const { data: cl } = await supabase.from('classes').select('id, name, shift, capacity, status').eq('stage_id', stageId).eq('school_year_id', yearId).is('archived_at', null).neq('status', 'encerrada').order('name')
    const { data: en } = await supabase.from('enrollments').select('class_id').eq('status', 'confirmada').is('archived_at', null).in('class_id', (cl ?? []).map((c: Row) => c.id))
    const used: Record<string, number> = {}; (en ?? []).forEach((e: Row) => { used[e.class_id] = (used[e.class_id] ?? 0) + 1 })
    return ((cl ?? []) as Row[]).map((c): Row => ({ ...c, free: c.capacity - (used[c.id] ?? 0) }))
  }, [stageId, yearId])

  const R = ref.data; const cls = (classes.data ?? []).find((c) => c.id === classId)
  const plan = R?.plans.find((p) => p.id === planId); const sch = R?.schs.find((s) => s.id === schId)
  const allDocs = REQUIRED_DOCS.every((d) => files[d]); const full = cls && cls.free <= 0
  const existingCount = R?.existingLinks.length ?? 0

  function next() {
    setErr('')
    if (step === 0) {
      if (mode === 'existing' && !studentId) return setErr('Selecione o aluno ou escolha “Novo aluno”.')
      if (mode === 'new') for (const f of newStudentFields) { const m = validateField(f, ns[f.name], ns); if (m) return setErr(m) }
    }
    if (step === 1 && existingCount + guardians.length === 0) return setErr('Vincule ao menos um responsável.')
    if (step === 1 && !guardians.some((g) => g.is_financial) && !R?.existingLinks.some((l) => l.is_financial)) return setErr('Marque ao menos um responsável financeiro.')
    if (step === 2 && !stageId) return setErr('Selecione a etapa de ensino.')
    if (step === 3 && !classId) return setErr('Selecione a turma.')
    if (step === 4 && !yearId) return setErr('Selecione o ano letivo.')
    if (step === 5 && !planId) return setErr('Selecione o plano de pagamento.')
    if (step === 7) setChosen(full ? 'lista_espera' : allDocs ? 'confirmada' : 'documentacao_pendente')
    setStep(step + 1)
  }

  function addGuardian() {
    setErr('')
    if (gMode === 'existing') { if (!gPick) return setErr('Selecione o responsável.'); if (guardians.some((g) => g.id === gPick)) return setErr('Responsável já adicionado.')
      setGuardians([...guardians, { key: gPick, id: gPick, label: gPickLabel, relationship: 'Mãe', is_financial: guardians.length === 0, is_legal: guardians.length === 0, can_pickup: true, is_emergency_contact: false }]); setGPick(null) }
    else if (gMode === 'new') {
      for (const f of newGuardianFields) { const m = validateField({ ...f, required: f.name === 'full_name' || f.name === 'cpf' }, gNew[f.name], gNew); if (m) return setErr(m) }
      setGuardians([...guardians, { key: crypto.randomUUID(), data: { ...gNew }, label: gNew.full_name, relationship: 'Mãe', is_financial: guardians.length === 0, is_legal: guardians.length === 0, can_pickup: true, is_emergency_contact: false }])
      setGNew({ full_name: '', cpf: '', phone: '', whatsapp: '', email: '' })
    }
    setGMode(null)
  }

  async function finish() {
    setBusy(true); setErr('')
    try {
      let sid = studentId ?? created.current.student ?? null
      if (mode === 'new' && !sid) {
        const payload = Object.fromEntries(newStudentFields.map((f) => [f.name, toDb(f, ns[f.name])]))
        const { data, error } = await supabase.from('students').insert({ ...payload, status: 'pre_matricula', stage_id: stageId }).select('id').maybeSingle()
        if (error || !data) throw new Error(errMsg(error)); sid = data.id as string; created.current.student = sid as string
      }
      if (!sid) throw new Error('Aluno não definido.')
      for (const g of guardians) {
        let gid = g.id ?? created.current.guardians[g.key]
        if (!gid) {
          const payload = Object.fromEntries(newGuardianFields.map((f) => [f.name, toDb(f, g.data![f.name])]))
          const { data, error } = await supabase.from('guardians').insert(payload).select('id').maybeSingle()
          if (error || !data) throw new Error(errMsg(error)); gid = data.id; created.current.guardians[g.key] = gid
        }
        const { error } = await supabase.from('student_guardians').insert({ student_id: sid, guardian_id: gid, relationship: g.relationship, is_financial: g.is_financial, is_legal: g.is_legal, can_pickup: g.can_pickup, is_emergency_contact: g.is_emergency_contact })
        if (error && error.code !== '23505') throw new Error(errMsg(error))
      }
      const { data: enr, error: ee } = await supabase.from('enrollments').insert({ student_id: sid, class_id: classId, school_year_id: yearId, plan_id: planId, scholarship_id: schId || null, status: chosen, enrolled_on: chosen === 'confirmada' ? todayISO() : null }).select('id').maybeSingle()
      if (ee || !enr) throw new Error(ee?.code === '23505' ? 'Já existe uma matrícula ativa deste aluno nesta turma e ano letivo.' : errMsg(ee))
      for (const [cat, f] of Object.entries(files)) {
        if (!f) continue
        const path = await uploadPrivate(`students/${sid}`, f)
        await supabase.from('documents').insert({ student_id: sid, category: cat, name: f.name, storage_path: path })
      }
      let inv: number | null = null
      if (chosen === 'confirmada') {
        const { data, error } = await supabase.rpc('generate_invoices', { p_enrollment: enr.id, p_first: `${first}-01` })
        if (error) toast.error(`Matrícula confirmada, mas as cobranças não foram geradas: ${errMsg(error)}`); else inv = data as number
      }
      setResult({ enrollmentId: enr.id, studentId: sid, invoices: inv, status: chosen }); setStep(9)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  async function doc(kind: DocKind) { try { await generateDocument(kind, result!.studentId, result!.enrollmentId) } catch (e) { toast.error((e as Error).message) } }

  const sName = mode === 'new' ? ns.full_name : ref.data ? undefined : undefined
  void sName
  return (
    <>
      <PageHeader title="Nova matrícula" subtitle="Siga as etapas. Nada é gravado até a confirmação (etapa 9)." />
      <ol className="mb-6 flex gap-1 overflow-x-auto pb-2" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${i === step ? 'bg-forest text-white' : i < step ? 'bg-olive/15 text-olive' : 'bg-white text-muted'}`}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px]">{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>{s}</li>))}
      </ol>

      <div className="card p-6">
        {step === 0 && (<div className="space-y-4">
          <div className="flex gap-2">{(['existing', 'new'] as const).map((m) => <button key={m} className={mode === m ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode(m)}>{m === 'existing' ? 'Aluno já cadastrado' : 'Novo aluno'}</button>)}</div>
          {mode === 'existing' ? <div><label className="label">Aluno</label><Picker table="students" value={studentId} onChange={setStudentId} filter={(q) => q.is('archived_at', null)} /></div> : <FormGrid fields={newStudentFields.map((f) => ({ ...f, required: ['full_name', 'birth_date'].includes(f.name) }))} form={ns} setForm={setNs} />}</div>)}

        {step === 1 && (<div className="space-y-4">
          {R?.existingLinks.length ? <div><h3 className="mb-2 text-sm font-semibold">Já vinculados ao aluno</h3><div className="flex flex-wrap gap-2">{R.existingLinks.map((l) => <Badge key={l.id} tone={l.is_financial ? 'good' : 'neutral'}>{l.guardian?.full_name} · {l.relationship}</Badge>)}</div></div> : null}
          {guardians.map((g) => (
            <div key={g.key} className="rounded-xl border border-nude p-4"><div className="flex items-center justify-between"><p className="font-semibold">{g.label}{g.data && <span className="ml-2 text-xs font-normal text-muted">(novo cadastro)</span>}</p><button aria-label="Remover" onClick={() => setGuardians(guardians.filter((x) => x.key !== g.key))}><X className="h-4 w-4 text-muted" /></button></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr]"><select aria-label="Parentesco" className="input" value={g.relationship} onChange={(e) => setGuardians(guardians.map((x) => x.key === g.key ? { ...x, relationship: e.target.value } : x))}>{REL.map((r) => <option key={r}>{r}</option>)}</select>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">{([['is_financial', 'Financeiro'], ['is_legal', 'Legal'], ['can_pickup', 'Retirada'], ['is_emergency_contact', 'Emergência']] as const).map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={g[k]} onChange={(e) => setGuardians(guardians.map((x) => x.key === g.key ? { ...x, [k]: e.target.checked } : x))} /> {l}</label>)}</div></div></div>))}
          {gMode === null ? <div className="flex gap-2"><button className="btn-secondary" onClick={() => setGMode('existing')}>Adicionar responsável cadastrado</button><button className="btn-secondary" onClick={() => setGMode('new')}>Cadastrar novo responsável</button></div> : (
            <div className="rounded-xl bg-cream p-4">{gMode === 'existing' ? <Picker table="guardians" value={gPick} onChange={(id, l) => { setGPick(id); setGPickLabel(l ?? '') }} filter={(q) => q.is('archived_at', null)} /> : <FormGrid fields={newGuardianFields.map((f) => ({ ...f, required: ['full_name', 'cpf'].includes(f.name) }))} form={gNew} setForm={setGNew} />}
              <div className="mt-3 flex gap-2"><button className="btn-primary" onClick={addGuardian}>Adicionar</button><button className="btn-secondary" onClick={() => setGMode(null)}>Cancelar</button></div></div>)}</div>)}

        {step === 2 && (<div><label className="label" htmlFor="stg">Etapa de ensino</label><select id="stg" className="input max-w-sm" value={stageId} onChange={(e) => { setStageId(e.target.value); setClassId('') }}><option value="">Selecione…</option>{R?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>)}

        {step === 3 && (<div><p className="mb-3 text-sm text-muted">Turmas da etapa escolhida no ano letivo {R?.years.find((y) => y.id === yearId)?.year ?? '—'}. O turno é definido pela turma.</p>
          {classes.loading ? <p className="text-sm text-muted">Carregando turmas…</p> : (classes.data ?? []).length === 0 ? <p className="rounded-xl bg-cream p-4 text-sm">Nenhuma turma disponível. Cadastre a turma no módulo Turmas ou altere o ano letivo na etapa 5.</p> : (
            <div className="grid gap-3 sm:grid-cols-2">{classes.data!.map((c) => (
              <button key={c.id} onClick={() => setClassId(c.id)} className={`rounded-xl border p-4 text-left transition-colors ${classId === c.id ? 'border-olive bg-olive/10' : 'border-nude hover:bg-cream'}`}>
                <p className="font-semibold">{c.name}</p><p className="text-sm text-muted">{SHIFT_LABEL[c.shift]} · {c.free > 0 ? `${c.free} vaga(s)` : 'Sem vagas — lista de espera'}</p></button>))}</div>)}</div>)}

        {step === 4 && (<div><label className="label" htmlFor="yr">Ano letivo</label><select id="yr" className="input max-w-sm" value={yearId} onChange={(e) => { setYearId(e.target.value); setClassId('') }}>{R?.years.map((y) => <option key={y.id} value={y.id}>{y.year}{y.is_current ? ' (vigente)' : ''}</option>)}</select>
          {classId === '' && step === 4 && <p className="mt-2 text-xs text-muted">Se você alterar o ano, escolha a turma novamente na etapa 4.</p>}</div>)}

        {step === 5 && (<div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="pl">Plano de pagamento</label><select id="pl" className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Selecione…</option>{R?.plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.monthly_amount)} × {p.installments}</option>)}</select>
            {R && R.plans.length === 0 && <p className="mt-1 text-xs text-red-700">Nenhum plano cadastrado. Cadastre em Financeiro › Cadastros.</p>}</div>
          <div><label className="label" htmlFor="sc">Bolsa / desconto</label><select id="sc" className="input" value={schId} onChange={(e) => setSchId(e.target.value)}><option value="">Sem bolsa</option>{R?.schs.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.discount_percent}%)</option>)}</select></div>
          <div><label className="label" htmlFor="fm">Mês da primeira mensalidade</label><input id="fm" type="month" className="input" value={first} onChange={(e) => setFirst(e.target.value)} /></div></div>)}

        {step === 6 && (<div><p className="mb-3 text-sm text-muted">Documentos obrigatórios sugeridos. Sem todos eles, a matrícula fica como “documentação pendente”. Você pode anexar depois na ficha do aluno.</p>
          <ul className="space-y-2">{REQUIRED_DOCS.map((d) => (<li key={d} className="flex items-center justify-between gap-3 rounded-xl border border-nude p-3 text-sm"><span className="flex items-center gap-2">{files[d] ? <Check className="h-4 w-4 text-olive" /> : <span className="h-4 w-4 rounded-full border border-nude" />}{d}{files[d] && <span className="text-xs text-muted">— {files[d]!.name}</span>}</span>
            <label className="btn-secondary cursor-pointer !py-1.5"><Upload className="h-4 w-4" /> {files[d] ? 'Trocar' : 'Anexar'}<input type="file" className="sr-only" onChange={(e) => setFiles({ ...files, [d]: e.target.files?.[0] })} /></label></li>))}</ul></div>)}

        {step === 7 && (<dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Item k="Aluno" v={mode === 'new' ? `${ns.full_name} (novo)` : <StudentName id={studentId} />} /><Item k="Etapa" v={R?.stages.find((s) => s.id === stageId)?.name} />
          <Item k="Turma" v={cls ? `${cls.name} — ${SHIFT_LABEL[cls.shift]}` : '—'} /><Item k="Ano letivo" v={R?.years.find((y) => y.id === yearId)?.year} />
          <Item k="Plano" v={plan ? `${plan.name} — ${formatBRL(plan.monthly_amount)} × ${plan.installments}, venc. dia ${plan.due_day}` : '—'} /><Item k="Bolsa" v={sch ? `${sch.name} (${sch.discount_percent}%)` : 'Nenhuma'} />
          <Item k="Primeira mensalidade" v={first.split('-').reverse().join('/')} /><Item k="Responsáveis" v={[...(R?.existingLinks.map((l) => l.guardian?.full_name) ?? []), ...guardians.map((g) => g.label)].join(', ')} />
          <Item k="Documentos anexados" v={`${Object.values(files).filter(Boolean).length} de ${REQUIRED_DOCS.length}`} /></dl>)}

        {step === 8 && (<div className="space-y-3"><p className="text-sm text-muted">Defina a situação da matrícula. {full && <strong className="text-red-700">A turma está sem vagas: use a lista de espera.</strong>}</p>
          {(['confirmada', 'documentacao_pendente', 'pre_matricula', 'lista_espera'] as const).map((s) => (
            <label key={s} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${chosen === s ? 'border-olive bg-olive/10' : 'border-nude'} ${s === 'confirmada' && full ? 'opacity-50' : ''}`}>
              <input type="radio" name="st" checked={chosen === s} disabled={s === 'confirmada' && !!full} onChange={() => setChosen(s)} /> <span className="font-semibold">{ENROLL_STATUS[s]}</span>
              {s === 'confirmada' && <span className="text-xs text-muted">gera as mensalidades e ativa o aluno</span>}</label>))}</div>)}

        {step === 9 && result && (<div className="space-y-4">
          <div className="rounded-xl bg-olive/10 p-4"><p className="font-semibold text-olive">Matrícula registrada: {ENROLL_STATUS[result.status]}</p>{result.invoices != null && <p className="text-sm">{result.invoices} mensalidade(s) gerada(s).</p>}</div>
          <p className="text-sm text-muted">Gere os documentos a partir dos modelos (requer dados oficiais da escola em Configurações).</p>
          <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={() => void doc('contrato')}>Contrato (PDF)</button><button className="btn-secondary" onClick={() => void doc('comprovante_matricula')}>Comprovante (PDF)</button><Link className="btn-secondary" to={`/alunos/${result.studentId}`}>Abrir ficha do aluno</Link><Link className="btn-secondary" to="/matriculas">Ver matrículas</Link></div></div>)}

        {err && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{err}</p>}
        {step < 9 && (<div className="mt-6 flex justify-between">
          <button className="btn-secondary" disabled={step === 0 || busy} onClick={() => { setErr(''); setStep(step - 1) }}><ChevronLeft className="h-4 w-4" /> Voltar</button>
          {step < 8 ? <button className="btn-primary" onClick={next}>Avançar <ChevronRight className="h-4 w-4" /></button> : <button className="btn-primary" disabled={busy || !chosen} onClick={() => void finish()}>{busy ? 'Gravando…' : 'Confirmar matrícula'}</button>}</div>)}
      </div>
    </>
  )
}
const Item = ({ k, v }: { k: string; v: React.ReactNode }) => <div><dt className="text-muted">{k}</dt><dd className="font-semibold">{v ?? '—'}</dd></div>
function StudentName({ id }: { id: string | null }) {
  const { data } = useAsync(async () => id ? ((await supabase.from('students').select('full_name').eq('id', id).maybeSingle()).data?.full_name as string) : '', [id])
  return <>{data ?? '—'}</>
}
