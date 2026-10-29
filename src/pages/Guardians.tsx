import CrudPage from '@/components/CrudPage'
import Badge from '@/components/Badge'
import { PageHeader } from '@/components/ui'
import { DS } from '@/lib/roles'
import { usersByRole } from '@/lib/options'
import type { FieldDef } from '@/components/Fields'

export const guardianFields: FieldDef[] = [
  { name: 'full_name', label: 'Nome completo', required: true, full: true },
  { name: 'cpf', label: 'CPF', type: 'cpf', required: true }, { name: 'phone', label: 'Telefone', type: 'phone' },
  { name: 'whatsapp', label: 'WhatsApp', type: 'phone' }, { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'address', label: 'Endereço', full: true }, { name: 'city', label: 'Cidade' }, { name: 'zip_code', label: 'CEP', type: 'cep' },
  { name: 'user_id', label: 'Acesso à área dos responsáveis', type: 'select', options: usersByRole('responsavel'), full: true, hint: 'Opcional. Convide o usuário em "Usuários e permissões" com o perfil Responsável e vincule aqui.' },
]

export default function GuardiansPage() {
  return (
    <>
      <PageHeader title="Responsáveis" subtitle="Pais e responsáveis autorizados. O vínculo com cada aluno (parentesco, financeiro, retirada) é feito na ficha do aluno." />
      <CrudPage table="guardians" singular="Responsável" archive
        select="*, links:student_guardians(relationship, is_financial, student:students(full_name))"
        searchColumns={['full_name', 'cpf', 'email', 'phone']} orderBy={{ column: 'full_name' }}
        writeRoles={DS} deleteRoles={DS} defaults={{ city: 'Lauro de Freitas' }}
        columns={[
          { key: 'full_name', label: 'Responsável', render: (r) => <span className="font-semibold">{r.full_name}</span> },
          { key: 'cpf', label: 'CPF' }, { key: 'phone', label: 'Contato', render: (r) => r.whatsapp || r.phone || '—' },
          { key: 'links', label: 'Alunos vinculados', render: (r) => (r.links?.length ? <div className="flex flex-wrap gap-1">{r.links.map((l: any, i: number) => <Badge key={i} tone={l.is_financial ? 'good' : 'neutral'}>{l.student?.full_name} · {l.relationship}</Badge>)}</div> : <span className="text-muted">Sem vínculo</span>) },
          { key: 'user_id', label: 'Portal', render: (r) => (r.user_id ? <Badge tone="good">Com acesso</Badge> : <Badge>Sem acesso</Badge>) },
        ]}
        fields={guardianFields} />
    </>
  )
}
