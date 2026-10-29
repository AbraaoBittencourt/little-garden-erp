import { useState } from 'react'
import { FileText, Paperclip, Download, X } from 'lucide-react'
import CrudPage from '@/components/CrudPage'
import Tabs from '@/components/Tabs'
import Badge from '@/components/Badge'
import Modal from '@/components/Modal'
import { PageHeader } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { useAuth } from '@/contexts/AuthContext'
import { DC, PED } from '@/lib/roles'
import { errMsg, openPrivate, todayISO, uploadPrivate, type Row } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { classOptions, stageOptions, subjectOptions, tableOptions } from '@/lib/options'
import { textPDF } from '@/lib/pdf'

const KIND = { planejamento: 'Planejamento', atividade: 'Atividade', reuniao: 'Reunião pedagógica' }
const kindOpts = Object.entries(KIND).map(([value, label]) => ({ value, label }))

function Attachments({ rec }: { rec: Row }) {
  const toast = useToast()
  const { data, loading, reload } = useAsync(async () => (await supabase.from('documents').select('id, name, storage_path').eq('record_id', rec.id)).data as Row[] ?? [], [rec.id])
  async function up(f?: File) {
    if (!f) return
    try { const path = await uploadPrivate(`records/${rec.id}`, f)
      const { error } = await supabase.from('documents').insert({ record_id: rec.id, category: 'Anexo pedagógico', name: f.name, storage_path: path }); if (error) throw new Error(errMsg(error)); toast.success('Anexo enviado.'); void reload()
    } catch (e) { toast.error((e as Error).message) }
  }
  async function rm(d: Row) { const { error } = await supabase.from('documents').delete().eq('id', d.id); error ? toast.error('Somente a Direção pode remover anexos.') : void reload() }
  const { hasRole } = useAuth()
  return loading ? <Loading /> : (
    <div className="space-y-3 text-sm"><label className="btn-primary cursor-pointer"><Paperclip className="h-4 w-4" /> Anexar arquivo<input type="file" className="sr-only" onChange={(e) => void up(e.target.files?.[0])} /></label>
      <ul className="divide-y divide-nude/60">{(data ?? []).map((d) => <li key={d.id} className="flex items-center justify-between py-2"><span className="truncate">{d.name}</span><span className="flex gap-1"><button aria-label="Baixar" className="rounded-lg p-2 hover:bg-cream" onClick={() => openPrivate(d.storage_path).catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /></button>{hasRole('direcao') && <button aria-label="Remover" className="rounded-lg p-2 text-red-700 hover:bg-red-50" onClick={() => void rm(d)}><X className="h-4 w-4" /></button>}</span></li>)}
        {(data ?? []).length === 0 && <li className="py-2 text-muted">Sem anexos.</li>}</ul></div>
  )
}

export default function PedagogicalPage() {
  const [att, setAtt] = useState<Row | null>(null); const toast = useToast()
  const tplOptions = tableOptions('pedagogical_templates', 'name', (q) => q.eq('is_active', true), 'body')
  return (
    <>
      <PageHeader title="Pedagógico" subtitle="Avaliações, relatórios descritivos, planejamento, atividades e reuniões. Na Educação Infantil, priorize o registro descritivo." />
      <Tabs tabs={[
        { id: 'aval', label: 'Avaliações', content: (
          <CrudPage table="assessments" singular="Avaliação" writeRoles={PED} orderBy={{ column: 'assessed_on', ascending: false }} deleteRoles={['direcao']}
            select="*, student:students(full_name), class:classes(name), subject:subjects(name)" defaults={{ assessed_on: todayISO() }}
            filters={[{ key: 'class_id', label: 'Turma', options: classOptions }, { key: 'subject_id', label: 'Disciplina', options: subjectOptions }]}
            columns={[{ key: 'assessed_on', label: 'Data', render: (r) => formatDate(r.assessed_on) }, { key: 'student', label: 'Aluno', render: (r) => <span className="font-semibold">{r.student?.full_name}</span> }, { key: 'class', label: 'Turma', render: (r) => r.class?.name },
              { key: 'title', label: 'Avaliação' }, { key: 'score', label: 'Nota', render: (r) => (r.score != null ? String(r.score).replace('.', ',') : '—') }, { key: 'descriptive_text', label: 'Descrição', render: (r) => <span className="line-clamp-2 max-w-xs text-muted">{r.descriptive_text ?? '—'}</span> }]}
            fields={[{ name: 'class_id', label: 'Turma', type: 'select', required: true, options: classOptions }, { name: 'student_id', label: 'Aluno', type: 'picker', pickerTable: 'students', required: true, full: true },
              { name: 'subject_id', label: 'Disciplina / componente', type: 'select', options: subjectOptions }, { name: 'assessed_on', label: 'Data', type: 'date', required: true },
              { name: 'title', label: 'Título da avaliação', required: true, full: true }, { name: 'score', label: 'Nota (0 a 10)', type: 'number', min: 0, max: 10, step: '0.1', hint: 'Somente Ensino Fundamental I. Na Educação Infantil use o texto descritivo.' },
              { name: 'descriptive_text', label: 'Registro descritivo', type: 'textarea' }]} />) },
        { id: 'rel', label: 'Relatórios descritivos', content: (
          <CrudPage table="pedagogical_reports" singular="Relatório" writeRoles={PED} orderBy={{ column: 'created_at', ascending: false }} deleteRoles={['direcao']}
            select="*, student:students(full_name), class:classes(name)"
            columns={[{ key: 'student', label: 'Aluno', render: (r) => <span className="font-semibold">{r.student?.full_name}</span> }, { key: 'class', label: 'Turma', render: (r) => r.class?.name ?? '—' }, { key: 'period', label: 'Período' },
              { key: 'is_sensitive', label: 'Sigilo', render: (r) => (r.is_sensitive ? <Badge tone="warn">Sensível</Badge> : '—') }, { key: 'created_at', label: 'Criado em', render: (r) => formatDate(r.created_at) }]}
            formWide fields={[{ name: 'student_id', label: 'Aluno', type: 'picker', pickerTable: 'students', required: true, full: true }, { name: 'class_id', label: 'Turma', type: 'select', options: classOptions }, { name: 'period', label: 'Período', placeholder: 'Ex.: 1º trimestre/2026' },
              { name: 'template', label: 'Usar modelo', type: 'select', options: tplOptions, persist: false, full: true, hint: 'Preenche o texto abaixo com a estrutura do modelo escolhido.', onChange: (_v, patch, opt) => opt && patch({ content: opt.meta?.body ?? '' }) },
              { name: 'content', label: 'Relatório', type: 'textarea', required: true }, { name: 'is_sensitive', label: 'Sigilo', type: 'checkbox', placeholder: 'Observação sensível (visível só a direção, coordenação e autor)' }]}
            rowActions={(r) => <button className="rounded-lg p-2 hover:bg-cream" title="Gerar PDF" aria-label="Gerar PDF" onClick={() => textPDF({ title: `Relatório pedagógico — ${r.student?.full_name}`, body: `${r.period ? `Período: ${r.period}\n` : ''}${r.class?.name ? `Turma: ${r.class.name}\n` : ''}\n${r.content}`, filename: `relatorio_${r.student?.full_name?.replace(/\W+/g, '_')}.pdf` }).catch((e) => toast.error(e.message))}><FileText className="h-4 w-4" /></button>} />) },
        { id: 'reg', label: 'Planejamento, atividades e reuniões', content: (
          <CrudPage table="pedagogical_records" singular="Registro" writeRoles={PED} orderBy={{ column: 'record_date', ascending: false }} deleteRoles={['direcao']}
            select="*, class:classes(name)" defaults={{ kind: 'planejamento', record_date: todayISO() }}
            filters={[{ key: 'kind', label: 'Tipo', options: kindOpts }, { key: 'class_id', label: 'Turma', options: classOptions }]} searchColumns={['title']}
            columns={[{ key: 'record_date', label: 'Data', render: (r) => formatDate(r.record_date) }, { key: 'kind', label: 'Tipo', render: (r) => <Badge>{(KIND as any)[r.kind]}</Badge> }, { key: 'title', label: 'Título', render: (r) => <span className="font-semibold">{r.title}</span> }, { key: 'class', label: 'Turma', render: (r) => r.class?.name ?? 'Geral' }]}
            fields={[{ name: 'kind', label: 'Tipo', type: 'select', required: true, options: kindOpts }, { name: 'record_date', label: 'Data', type: 'date', required: true }, { name: 'title', label: 'Título', required: true, full: true }, { name: 'class_id', label: 'Turma', type: 'select', options: classOptions }, { name: 'content', label: 'Conteúdo', type: 'textarea' }]}
            rowActions={(r) => <button className="rounded-lg p-2 hover:bg-cream" title="Anexos" aria-label="Anexos" onClick={() => setAtt(r)}><Paperclip className="h-4 w-4" /></button>} />) },
        { id: 'mod', label: 'Modelos de relatório', hidden: false, content: (
          <CrudPage table="pedagogical_templates" singular="Modelo" writeRoles={DC} orderBy={{ column: 'name' }} select="*, stage:education_stages(name)" defaults={{ is_active: true }}
            columns={[{ key: 'name', label: 'Modelo', render: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'stage', label: 'Etapa', render: (r) => r.stage?.name ?? 'Todas' }, { key: 'is_active', label: 'Situação', render: (r) => (r.is_active ? <Badge tone="good">Ativo</Badge> : <Badge>Inativo</Badge>) }]}
            fields={[{ name: 'name', label: 'Nome do modelo', required: true }, { name: 'stage_id', label: 'Etapa', type: 'select', options: stageOptions }, { name: 'body', label: 'Estrutura do relatório', type: 'textarea', required: true, hint: 'Ex.: títulos de eixos (Linguagem, Movimento, Socioemocional…) para o professor completar.' }, { name: 'is_active', label: 'Situação', type: 'checkbox', placeholder: 'Ativo' }]} />) },
      ]} />
      {att && <Modal title={`Anexos — ${att.title}`} onClose={() => setAtt(null)}><Attachments rec={att} /></Modal>}
    </>
  )
}
