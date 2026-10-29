import { useState } from 'react'
import { Users } from 'lucide-react'
import CrudPage from '@/components/CrudPage'
import Tabs from '@/components/Tabs'
import Modal from '@/components/Modal'
import Badge from '@/components/Badge'
import { PageHeader } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { useAuth } from '@/contexts/AuthContext'
import { DC, DSC } from '@/lib/roles'
import { CLASS_STATUS, SHIFT_LABEL, errMsg, opts, type Row } from '@/lib/db'
import { stageOptions, subjectOptions, teacherOptions, yearOptions } from '@/lib/options'
import { FormGrid } from '@/components/Fields'

function ClassStudents({ cls }: { cls: Row }) {
  const { data, loading } = useAsync(async () => {
    const { data } = await supabase.from('enrollments').select('id, status, student:students(id, full_name)').eq('class_id', cls.id).in('status', ['confirmada', 'lista_espera']).is('archived_at', null)
    return (data ?? []) as Row[]
  }, [cls.id])
  const conf = (data ?? []).filter((e) => e.status === 'confirmada'); const wait = (data ?? []).filter((e) => e.status === 'lista_espera')
  return loading ? <Loading /> : (
    <div className="space-y-4 text-sm">
      <p>Matriculados: <strong>{conf.length}</strong> de {cls.capacity} — vagas disponíveis: <strong>{Math.max(cls.capacity - conf.length, 0)}</strong></p>
      <ul className="divide-y divide-nude/60">{conf.map((e) => <li key={e.id} className="py-2">{e.student?.full_name}</li>)}{conf.length === 0 && <li className="py-2 text-muted">Nenhum aluno matriculado.</li>}</ul>
      {wait.length > 0 && <><h3 className="font-semibold">Lista de espera ({wait.length})</h3><ul className="divide-y divide-nude/60">{wait.map((e) => <li key={e.id} className="py-2">{e.student?.full_name}</li>)}</ul></>}
    </div>
  )
}

function ClassSubjects({ cls }: { cls: Row }) {
  const toast = useToast(); const { hasRole } = useAuth(); const can = hasRole(...DC)
  const { data, loading, reload } = useAsync(async () => {
    const { data } = await supabase.from('class_subjects').select('id, subject:subjects(name), teacher:teachers(full_name)').eq('class_id', cls.id)
    return (data ?? []) as Row[]
  }, [cls.id])
  const [form, setForm] = useState<Row>({ subject_id: '', teacher_id: '' })
  async function add() {
    if (!form.subject_id) return toast.error('Selecione a disciplina.')
    const { error } = await supabase.from('class_subjects').insert({ class_id: cls.id, subject_id: form.subject_id, teacher_id: form.teacher_id || null })
    if (error) return toast.error(errMsg(error)); setForm({ subject_id: '', teacher_id: '' }); toast.success('Disciplina vinculada.'); void reload()
  }
  async function rm(id: string) { const { error } = await supabase.from('class_subjects').delete().eq('id', id); error ? toast.error(errMsg(error)) : void reload() }
  return (
    <div className="space-y-4 text-sm">
      {loading ? <Loading /> : <ul className="divide-y divide-nude/60">{(data ?? []).map((s) => (
        <li key={s.id} className="flex items-center justify-between py-2"><span><strong>{s.subject?.name}</strong> — {s.teacher?.full_name ?? 'sem professor'}</span>{can && <button className="text-xs font-semibold text-red-700 hover:underline" onClick={() => void rm(s.id)}>Remover</button>}</li>))}
        {(data ?? []).length === 0 && <li className="py-2 text-muted">Nenhuma disciplina vinculada.</li>}</ul>}
      {can && <><FormGrid form={form} setForm={setForm} fields={[{ name: 'subject_id', label: 'Disciplina / componente', type: 'select', options: subjectOptions, required: true }, { name: 'teacher_id', label: 'Professor', type: 'select', options: teacherOptions }]} />
        <button className="btn-primary" onClick={() => void add()}>Vincular</button></>}
    </div>
  )
}

export default function ClassesPage() {
  const [view, setView] = useState<{ kind: 'students' | 'subjects'; cls: Row } | null>(null)
  return (
    <>
      <PageHeader title="Turmas" subtitle="Estrutura escolar: turmas, capacidade, professores e disciplinas." />
      <Tabs tabs={[
        { id: 'turmas', label: 'Turmas', content: (
          <CrudPage table="classes" singular="Turma" archive writeRoles={DSC} deleteRoles={DSC}
            select="*, stage:education_stages(name), year:school_years(year), teacher:teachers(full_name)"
            searchColumns={['name', 'grade_group']} orderBy={{ column: 'name' }} defaults={{ status: 'planejada' }}
            filters={[{ key: 'school_year_id', label: 'Ano letivo', options: yearOptions }, { key: 'stage_id', label: 'Etapa', options: stageOptions }, { key: 'status', label: 'Situação', options: opts(CLASS_STATUS) }]}
            columns={[
              { key: 'name', label: 'Turma', render: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'year', label: 'Ano', render: (r) => r.year?.year }, { key: 'stage', label: 'Etapa', render: (r) => r.stage?.name },
              { key: 'grade_group', label: 'Série/agrupamento' }, { key: 'shift', label: 'Turno', render: (r) => SHIFT_LABEL[r.shift] },
              { key: 'capacity', label: 'Capacidade' }, { key: 'teacher', label: 'Professor', render: (r) => r.teacher?.full_name ?? '—' },
              { key: 'status', label: 'Situação', render: (r) => <Badge tone={r.status === 'ativa' ? 'good' : 'neutral'}>{CLASS_STATUS[r.status]}</Badge> },
            ]}
            fields={[
              { name: 'name', label: 'Nome da turma', required: true }, { name: 'school_year_id', label: 'Ano letivo', type: 'select', required: true, options: yearOptions },
              { name: 'stage_id', label: 'Etapa', type: 'select', required: true, options: stageOptions }, { name: 'grade_group', label: 'Série ou agrupamento', placeholder: 'Ex.: Maternal II, 1º ano' },
              { name: 'shift', label: 'Turno', type: 'select', required: true, options: opts(SHIFT_LABEL) }, { name: 'capacity', label: 'Capacidade máxima', type: 'number', required: true, min: 1, max: 100 },
              { name: 'head_teacher_id', label: 'Professor responsável', type: 'select', options: teacherOptions }, { name: 'status', label: 'Situação', type: 'select', required: true, options: opts(CLASS_STATUS) },
            ]}
            rowActions={(r) => (<>
              <button className="rounded-lg p-2 hover:bg-cream" title="Alunos da turma" aria-label="Alunos da turma" onClick={() => setView({ kind: 'students', cls: r })}><Users className="h-4 w-4" /></button>
              <button className="rounded-lg px-2 py-1.5 text-xs font-semibold text-olive hover:bg-cream" onClick={() => setView({ kind: 'subjects', cls: r })}>Disciplinas</button></>)} />) },
        { id: 'disciplinas', label: 'Disciplinas', content: (
          <CrudPage table="subjects" singular="Disciplina" writeRoles={DC} orderBy={{ column: 'name' }} searchColumns={['name']}
            select="*, stage:education_stages(name)" defaults={{ is_active: true }}
            columns={[{ key: 'name', label: 'Disciplina / componente' }, { key: 'stage', label: 'Etapa', render: (r) => r.stage?.name ?? 'Todas' }, { key: 'is_active', label: 'Situação', render: (r) => (r.is_active ? <Badge tone="good">Ativa</Badge> : <Badge>Inativa</Badge>) }]}
            fields={[{ name: 'name', label: 'Nome', required: true }, { name: 'stage_id', label: 'Etapa', type: 'select', options: stageOptions }, { name: 'is_active', label: 'Situação', type: 'checkbox', placeholder: 'Ativa' }]} />) },
      ]} />
      {view && <Modal title={`${view.kind === 'students' ? 'Alunos' : 'Disciplinas'} — ${view.cls.name}`} onClose={() => setView(null)}>
        {view.kind === 'students' ? <ClassStudents cls={view.cls} /> : <ClassSubjects cls={view.cls} />}</Modal>}
    </>
  )
}
