import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Download, FileText, Upload } from 'lucide-react'
import CrudPage from '@/components/CrudPage'
import Tabs from '@/components/Tabs'
import Badge from '@/components/Badge'
import Modal from '@/components/Modal'
import Picker from '@/components/Picker'
import { FormGrid } from '@/components/Fields'
import { PageHeader } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { DS } from '@/lib/roles'
import { errMsg, openPrivate, todayISO, uploadPrivate, type Row } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { DEFAULT_TEMPLATES, DOC_KIND_LABEL, PLACEHOLDERS, generateDocument, type DocKind } from '@/lib/docgen'

const CATS = ['Certidão de nascimento', 'Documento do responsável', 'Comprovante de residência', 'Carteira de vacinação', 'Laudo / relatório médico', 'Contrato assinado', 'Diploma / formação', 'Contrato de trabalho', 'Outro'].map((v) => ({ value: v, label: v }))
const soon = (d?: string | null) => { if (!d) return null; const diff = (new Date(d).getTime() - Date.now()) / 86400000; return diff < 0 ? 'expired' : diff <= 30 ? 'soon' : null }

function Files() {
  const toast = useToast(); const [up, setUp] = useState(false); const [key, setKey] = useState(0)
  const pend = useAsync(async () => {
    const { count } = await supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'documentacao_pendente').is('archived_at', null)
    const { data } = await supabase.from('documents').select('id, expires_on').not('expires_on', 'is', null)
    return { pending: count ?? 0, expiring: (data ?? []).filter((d: Row) => soon(d.expires_on)).length }
  }, [key])
  const [owner, setOwner] = useState<'student' | 'teacher' | 'employee'>('student')
  const [f, setF] = useState<Row>({ owner_id: '', category: 'Outro', name: '', expires_on: '' }); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const table = owner === 'student' ? 'students' : owner === 'teacher' ? 'teachers' : 'employees'
  async function save() {
    setErr(''); if (!f.owner_id) return setErr('Selecione o titular do documento.'); if (!file) return setErr('Escolha o arquivo.')
    setBusy(true)
    try { const path = await uploadPrivate(`${owner}s/${f.owner_id}`, file)
      const { error } = await supabase.from('documents').insert({ [`${owner}_id`]: f.owner_id, category: f.category, name: f.name.trim() || file.name, storage_path: path, expires_on: f.expires_on || null }); if (error) throw new Error(errMsg(error))
      toast.success('Documento arquivado.'); setUp(false); setFile(null); setF({ owner_id: '', category: 'Outro', name: '', expires_on: '' }); setKey((k) => k + 1)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div>
      {(pend.data?.pending || pend.data?.expiring) ? <div className="mb-4 flex items-start gap-3 rounded-xl border border-gold/60 bg-white p-4 text-sm" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <p>{pend.data.pending > 0 && <><strong>{pend.data.pending}</strong> matrícula(s) com documentação pendente (<Link className="font-semibold text-olive underline" to="/matriculas">ver</Link>). </>}{pend.data.expiring > 0 && <><strong>{pend.data.expiring}</strong> documento(s) vencido(s) ou vencendo em 30 dias.</>}</p></div> : null}
      <CrudPage table="documents" singular="Documento" writeRoles={DS} createDisabled editDisabled reloadKey={key} orderBy={{ column: 'created_at', ascending: false }} searchColumns={['name', 'category']}
        select="*, student:students(full_name), teacher:teachers(full_name), employee:employees(full_name)" emptyText="Nenhum documento arquivado."
        filters={[{ key: 'category', label: 'Categoria', options: CATS }]}
        extraActions={<button className="btn-primary" onClick={() => setUp(true)}><Upload className="h-4 w-4" /> Enviar documento</button>}
        columns={[{ key: 'name', label: 'Documento', render: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'category', label: 'Categoria' },
          { key: 'owner', label: 'Titular', render: (r) => r.student?.full_name ?? r.teacher?.full_name ?? r.employee?.full_name ?? '—' },
          { key: 'expires_on', label: 'Validade', render: (r) => { const s = soon(r.expires_on); return r.expires_on ? <span>{formatDate(r.expires_on)} {s === 'expired' ? <Badge tone="bad">Vencido</Badge> : s === 'soon' ? <Badge tone="warn">Vence em breve</Badge> : null}</span> : '—' } }]}
        fields={[]} rowActions={(r) => <button className="rounded-lg p-2 hover:bg-cream" title="Baixar" aria-label="Baixar" onClick={() => openPrivate(r.storage_path).catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /></button>} />
      {up && <Modal title="Enviar documento" onClose={() => setUp(false)} footer={<><button className="btn-secondary" onClick={() => setUp(false)}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Enviando…' : 'Arquivar'}</button></>}>
        <div className="space-y-4"><div className="flex gap-2">{(['student', 'teacher', 'employee'] as const).map((o) => <button key={o} className={owner === o ? 'btn-primary' : 'btn-secondary'} onClick={() => { setOwner(o); setF({ ...f, owner_id: '' }) }}>{o === 'student' ? 'Aluno' : o === 'teacher' ? 'Professor' : 'Funcionário'}</button>)}</div>
          <div><label className="label">Titular</label><Picker key={owner} table={table} value={f.owner_id || null} onChange={(id) => setF({ ...f, owner_id: id ?? '' })} /></div>
          <FormGrid form={f} setForm={setF} fields={[{ name: 'category', label: 'Categoria', type: 'select', required: true, options: CATS }, { name: 'name', label: 'Nome (opcional)' }, { name: 'expires_on', label: 'Validade', type: 'date', hint: 'Gera alerta de vencimento.' }]} />
          <div><label className="label" htmlFor="fl">Arquivo (até 10 MB)</label><input id="fl" type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div></div>
        {err && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{err}</p>}</Modal>}
    </div>
  )
}

function Generate() {
  const toast = useToast(); const [sid, setSid] = useState<string | null>(null); const [kind, setKind] = useState<DocKind>('declaracao_matricula'); const [busy, setBusy] = useState(false)
  async function go() { if (!sid) return toast.error('Selecione o aluno.'); setBusy(true); try { await generateDocument(kind, sid) } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) } }
  return (
    <div className="card max-w-2xl space-y-4 p-6"><p className="text-sm text-muted">Os documentos usam os modelos editáveis (aba “Modelos”) ou o modelo padrão, com os dados reais cadastrados. É preciso preencher os dados oficiais da escola em Configurações.</p>
      <div><label className="label" htmlFor="dk">Documento</label><select id="dk" className="input" value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>{(Object.keys(DOC_KIND_LABEL) as DocKind[]).map((k) => <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>)}</select></div>
      <div><label className="label">Aluno</label><Picker table="students" value={sid} onChange={setSid} /></div>
      <button className="btn-primary" disabled={busy} onClick={() => void go()}><FileText className="h-4 w-4" /> {busy ? 'Gerando…' : 'Gerar PDF'}</button>
      <p className="text-xs text-muted">O contrato padrão é apenas um ponto de partida: revise-o com assessoria jurídica antes de usar. Relatórios de alunos estão em Relatórios.</p></div>
  )
}

function Templates() {
  const toast = useToast(); const [key, setKey] = useState(0)
  async function seed() {
    const { data } = await supabase.from('document_templates').select('kind'); const have = new Set((data ?? []).map((d: Row) => d.kind))
    const rows = (Object.keys(DEFAULT_TEMPLATES) as DocKind[]).filter((k) => !have.has(k)).map((k) => ({ kind: k, name: `${DOC_KIND_LABEL[k]} (padrão)`, body: DEFAULT_TEMPLATES[k] }))
    if (!rows.length) return toast.success('Os modelos padrão já existem.')
    const { error } = await supabase.from('document_templates').insert(rows); error ? toast.error(errMsg(error)) : (toast.success('Modelos padrão criados.'), setKey((k) => k + 1))
  }
  return (
    <div><p className="mb-4 text-sm text-muted">Variáveis disponíveis (use entre chaves duplas): <code className="text-xs">{PLACEHOLDERS.map((p) => `{{${p}}}`).join('  ')}</code></p>
      <CrudPage table="document_templates" singular="Modelo" writeRoles={DS} reloadKey={key} orderBy={{ column: 'name' }} defaults={{ is_active: true, kind: 'declaracao_matricula' }} formWide
        extraActions={<button className="btn-secondary" onClick={() => void seed()}>Criar modelos padrão</button>}
        columns={[{ key: 'name', label: 'Modelo', render: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'kind', label: 'Tipo', render: (r) => (DOC_KIND_LABEL as any)[r.kind] ?? 'Outro' }, { key: 'is_active', label: 'Situação', render: (r) => (r.is_active ? <Badge tone="good">Ativo</Badge> : <Badge>Inativo</Badge>) }]}
        fields={[{ name: 'name', label: 'Nome', required: true }, { name: 'kind', label: 'Tipo', type: 'select', required: true, options: [...Object.entries(DOC_KIND_LABEL), ['outro', 'Outro']].map(([value, label]) => ({ value, label })) },
          { name: 'body', label: 'Texto do modelo', type: 'textarea', required: true }, { name: 'is_active', label: 'Situação', type: 'checkbox', placeholder: 'Ativo (o mais recente de cada tipo é usado)' }]} /></div>
  )
}

export default function DocumentsPage() {
  void todayISO
  return (<><PageHeader title="Documentos" subtitle="Arquivos de alunos e funcionários, validade, pendências e geração de documentos escolares." />
    <Tabs tabs={[{ id: 'arq', label: 'Arquivos', content: <Files /> }, { id: 'ger', label: 'Gerar documentos', content: <Generate /> }, { id: 'mod', label: 'Modelos', content: <Templates /> }]} /></>)
}
