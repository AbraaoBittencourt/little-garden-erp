import CrudPage from '@/components/CrudPage'
import Tabs from '@/components/Tabs'
import Badge from '@/components/Badge'
import { PageHeader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { DS, DSC } from '@/lib/roles'
import { WORK_STATUS, opts } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { usersByRole } from '@/lib/options'
import type { FieldDef, Option } from '@/components/Fields'

const base: FieldDef[] = [
  { name: 'full_name', label: 'Nome completo', required: true, full: true }, { name: 'cpf', label: 'CPF', type: 'cpf' },
  { name: 'phone', label: 'Telefone', type: 'phone' }, { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'degree', label: 'Formação' }, { name: 'admitted_on', label: 'Data de admissão', type: 'date' },
  { name: 'status', label: 'Status profissional', type: 'select', required: true, options: opts(WORK_STATUS) },
  { name: 'notes', label: 'Observações administrativas', type: 'textarea' },
]
const positions = async (): Promise<Option[]> => {
  const { data } = await supabase.from('employees').select('position').not('position', 'is', null)
  return Array.from(new Set((data ?? []).map((d: any) => d.position as string))).sort().map((p) => ({ value: p, label: p }))
}
const st = (r: any) => <Badge tone={r.status === 'ativo' ? 'good' : r.status === 'afastado' ? 'warn' : 'neutral'}>{WORK_STATUS[r.status]}</Badge>

export default function StaffPage() {
  return (
    <>
      <PageHeader title="Professores e funcionários" subtitle="Cadastro da equipe. Não há cálculo de folha de pagamento neste módulo." />
      <Tabs tabs={[
        { id: 'prof', label: 'Professores', content: (
          <CrudPage table="teachers" singular="Professor" archive writeRoles={DSC} deleteRoles={DS} searchColumns={['full_name', 'cpf', 'email']} orderBy={{ column: 'full_name' }}
            defaults={{ status: 'ativo' }} filters={[{ key: 'status', label: 'Status', options: opts(WORK_STATUS) }]}
            select="*, classes:classes(name), subjects:class_subjects(subject:subjects(name))"
            columns={[
              { key: 'full_name', label: 'Professor', render: (r) => <span className="font-semibold">{r.full_name}</span> }, { key: 'degree', label: 'Formação' },
              { key: 'classes', label: 'Turmas', render: (r) => r.classes?.map((c: any) => c.name).join(', ') || '—' },
              { key: 'subjects', label: 'Disciplinas', render: (r) => Array.from(new Set(r.subjects?.map((s: any) => s.subject?.name))).join(', ') || '—' },
              { key: 'admitted_on', label: 'Admissão', render: (r) => formatDate(r.admitted_on) }, { key: 'status', label: 'Status', render: st },
            ]}
            fields={[...base, { name: 'user_id', label: 'Usuário de acesso', type: 'select', options: usersByRole('professor'), full: true, hint: 'Vincule o login do professor para que ele veja apenas suas turmas.' }]} />) },
        { id: 'func', label: 'Funcionários', content: (
          <CrudPage table="employees" singular="Funcionário" archive writeRoles={DS} deleteRoles={DS} searchColumns={['full_name', 'cpf', 'position']} orderBy={{ column: 'full_name' }}
            defaults={{ status: 'ativo' }} filters={[{ key: 'status', label: 'Status', options: opts(WORK_STATUS) }, { key: 'position', label: 'Cargo', options: positions }]}
            columns={[
              { key: 'full_name', label: 'Funcionário', render: (r) => <span className="font-semibold">{r.full_name}</span> }, { key: 'position', label: 'Cargo' }, { key: 'phone', label: 'Telefone' },
              { key: 'admitted_on', label: 'Admissão', render: (r) => formatDate(r.admitted_on) }, { key: 'status', label: 'Status', render: st },
            ]}
            fields={[base[0], { name: 'position', label: 'Cargo', required: true }, ...base.slice(1)]} />) },
      ]} />
    </>
  )
}
