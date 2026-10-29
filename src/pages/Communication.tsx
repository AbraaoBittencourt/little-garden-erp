import { useState } from 'react'
import { Copy, MessageCircle, Mail, Send } from 'lucide-react'
import CrudPage from '@/components/CrudPage'
import Tabs from '@/components/Tabs'
import Badge from '@/components/Badge'
import Modal from '@/components/Modal'
import { PageHeader } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { DSC } from '@/lib/roles'
import { type Row } from '@/lib/db'
import { formatDateTime } from '@/lib/format'
import { classOptions } from '@/lib/options'
import { getSchool, schoolName } from '@/lib/school'

const AUD = { geral: 'Aviso geral', turma: 'Por turma', individual: 'Individual' }
const EVK = { evento: 'Evento', feriado: 'Feriado', recesso: 'Recesso', reuniao: 'Reunião com responsáveis' }
const kindOpts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }))
const waNumber = (p?: string | null) => { const d = (p ?? '').replace(/\D/g, ''); return d ? (d.startsWith('55') ? d : `55${d}`) : '' }

function Recipients({ ann, onClose }: { ann: Row; onClose: () => void }) {
  const toast = useToast()
  const { data, loading } = useAsync(async () => {
    const school = await getSchool()
    let sids: string[] = []
    if (ann.audience === 'individual' && ann.student_id) sids = [ann.student_id]
    else if (ann.audience === 'turma' && ann.class_id) sids = ((await supabase.from('enrollments').select('student_id').eq('class_id', ann.class_id).eq('status', 'confirmada')).data ?? []).map((e: Row) => e.student_id)
    else sids = ((await supabase.from('students').select('id').eq('status', 'ativo').is('archived_at', null)).data ?? []).map((s: Row) => s.id)
    const { data: links } = sids.length ? await supabase.from('student_guardians').select('guardian:guardians(id, full_name, phone, whatsapp, email), student:students(full_name)').in('student_id', sids) : { data: [] }
    const map = new Map<string, Row>(); (links ?? []).forEach((l: Row) => { const g = l.guardian; if (g && !map.has(g.id)) map.set(g.id, { ...g, kids: [l.student?.full_name] }); else if (g) map.get(g.id)!.kids.push(l.student?.full_name) })
    const reads = (await supabase.from('announcement_reads').select('user_id', { count: 'exact', head: true }).eq('announcement_id', ann.id)).count ?? 0
    return { list: [...map.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)), school, reads }
  }, [ann.id])
  const text = `*${ann.title}*\n\n${ann.body}\n\n— ${data ? schoolName(data.school) : 'Little Garden'}`
  return (
    <Modal title={`Enviar: ${ann.title}`} wide onClose={onClose}>
      <p className="mb-3 text-sm text-muted">O sistema não envia mensagens automaticamente. Escolha o canal por responsável: o texto abre pronto no WhatsApp ou no seu e-mail.</p>
      <button className="btn-secondary mb-4" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Texto copiado.'))}><Copy className="h-4 w-4" /> Copiar texto</button>
      {loading ? <Loading /> : <><ul className="divide-y divide-nude/60 text-sm">{data!.list.map((g) => { const wa = waNumber(g.whatsapp || g.phone); return (
        <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><div><p className="font-semibold">{g.full_name}</p><p className="text-xs text-muted">{g.kids.filter(Boolean).join(', ')}</p></div>
          <div className="flex gap-2">{wa ? <a className="btn-secondary !py-1.5" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`}><MessageCircle className="h-4 w-4" /> WhatsApp</a> : <Badge>Sem telefone</Badge>}
            {g.email ? <a className="btn-secondary !py-1.5" href={`mailto:${g.email}?subject=${encodeURIComponent(ann.title)}&body=${encodeURIComponent(`${ann.body}\n\n— ${schoolName(data!.school)}`)}`}><Mail className="h-4 w-4" /> E-mail</a> : <Badge>Sem e-mail</Badge>}</div></li>) })}
        {data!.list.length === 0 && <li className="py-3 text-muted">Nenhum responsável encontrado para este público.</li>}</ul>
        <p className="mt-4 text-xs text-muted">Leituras registradas na área dos responsáveis: <strong>{data!.reads}</strong>. Leituras por WhatsApp/e-mail não são rastreadas.</p></>}
    </Modal>
  )
}

export default function CommunicationPage() {
  const [send, setSend] = useState<Row | null>(null)
  return (
    <>
      <PageHeader title="Comunicação" subtitle="Comunicados, calendário de eventos e reuniões com responsáveis." />
      <Tabs tabs={[
        { id: 'com', label: 'Comunicados', content: (
          <CrudPage table="announcements" singular="Comunicado" writeRoles={DSC} orderBy={{ column: 'created_at', ascending: false }} searchColumns={['title']} formWide
            select="*, class:classes(name), student:students(full_name)" defaults={{ audience: 'geral' }}
            filters={[{ key: 'audience', label: 'Público', options: kindOpts(AUD) }]}
            fromRow={(r) => ({ publish: !!r.published_at })} toPayload={(f) => ({ published_at: f.publish ? new Date().toISOString() : null, class_id: f.audience === 'turma' ? f.class_id || null : null, student_id: f.audience === 'individual' ? f.student_id || null : null })}
            columns={[{ key: 'title', label: 'Comunicado', render: (r) => <span className="font-semibold">{r.title}</span> }, { key: 'audience', label: 'Público', render: (r) => <Badge>{(AUD as any)[r.audience]}{r.class?.name ? ` · ${r.class.name}` : ''}{r.student?.full_name ? ` · ${r.student.full_name}` : ''}</Badge> },
              { key: 'published_at', label: 'Publicação', render: (r) => (r.published_at ? formatDateTime(r.published_at) : <Badge tone="warn">Rascunho</Badge>) }]}
            fields={[{ name: 'title', label: 'Título', required: true, full: true }, { name: 'audience', label: 'Público', type: 'select', required: true, options: kindOpts(AUD) },
              { name: 'class_id', label: 'Turma', type: 'select', options: classOptions, hideWhen: (f) => f.audience !== 'turma', validate: (v, f) => (f.audience === 'turma' && !v ? 'Selecione a turma.' : null) },
              { name: 'student_id', label: 'Aluno', type: 'picker', pickerTable: 'students', hideWhen: (f) => f.audience !== 'individual', validate: (v, f) => (f.audience === 'individual' && !v ? 'Selecione o aluno.' : null) },
              { name: 'body', label: 'Mensagem', type: 'textarea', required: true }, { name: 'publish', label: 'Publicação', type: 'checkbox', persist: false, placeholder: 'Publicar na área dos responsáveis' }]}
            rowActions={(r) => <button className="rounded-lg p-2 text-olive hover:bg-cream" title="Enviar" aria-label="Enviar" onClick={() => setSend(r)}><Send className="h-4 w-4" /></button>} />) },
        { id: 'cal', label: 'Calendário escolar', content: (
          <CrudPage table="school_events" singular="Evento" writeRoles={DSC} orderBy={{ column: 'starts_at', ascending: false }} searchColumns={['title', 'location']} baseFilter={(q) => q.neq('kind', 'reuniao')} defaults={{ kind: 'evento' }}
            filters={[{ key: 'kind', label: 'Tipo', options: kindOpts({ evento: 'Evento', feriado: 'Feriado', recesso: 'Recesso' }) }]}
            columns={[{ key: 'starts_at', label: 'Início', render: (r) => formatDateTime(r.starts_at) }, { key: 'title', label: 'Evento', render: (r) => <span className="font-semibold">{r.title}</span> }, { key: 'kind', label: 'Tipo', render: (r) => <Badge>{(EVK as any)[r.kind]}</Badge> }, { key: 'location', label: 'Local' }]}
            fields={[{ name: 'title', label: 'Título', required: true, full: true }, { name: 'kind', label: 'Tipo', type: 'select', required: true, options: kindOpts({ evento: 'Evento', feriado: 'Feriado', recesso: 'Recesso' }) }, { name: 'location', label: 'Local' },
              { name: 'starts_at', label: 'Início', type: 'datetime', required: true }, { name: 'ends_at', label: 'Término', type: 'datetime' }, { name: 'description', label: 'Descrição', type: 'textarea' }]} />) },
        { id: 'reu', label: 'Reuniões com responsáveis', content: (
          <CrudPage table="school_events" singular="Reunião" writeRoles={DSC} orderBy={{ column: 'starts_at', ascending: false }} searchColumns={['title']} baseFilter={(q) => q.eq('kind', 'reuniao')} defaults={{ kind: 'reuniao' }}
            columns={[{ key: 'starts_at', label: 'Data e hora', render: (r) => formatDateTime(r.starts_at) }, { key: 'title', label: 'Reunião', render: (r) => <span className="font-semibold">{r.title}</span> }, { key: 'location', label: 'Local' }]}
            fields={[{ name: 'title', label: 'Assunto', required: true, full: true }, { name: 'starts_at', label: 'Data e hora', type: 'datetime', required: true }, { name: 'location', label: 'Local' }, { name: 'description', label: 'Pauta', type: 'textarea' }]} />) },
      ]} />
      {send && <Recipients ann={send} onClose={() => setSend(null)} />}
    </>
  )
}
