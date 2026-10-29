import { Link } from 'react-router-dom'
import { FileText, Receipt as ReceiptIcon, Plus } from 'lucide-react'
import CrudPage from '@/components/CrudPage'
import Badge from '@/components/Badge'
import { PageHeader } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { classOptions, planOptions, scholarshipOptions, yearOptions } from '@/lib/options'
import { DS } from '@/lib/roles'
import { ENROLL_STATUS, errMsg, opts } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { generateDocument } from '@/lib/docgen'
import { useAuth } from '@/contexts/AuthContext'

export default function EnrollmentsPage() {
  const toast = useToast(); const { hasRole } = useAuth()
  return (
    <>
      <PageHeader title="Matrículas" subtitle="Acompanhe matrículas, renovações, documentação pendente e lista de espera." />
      <CrudPage table="enrollments" singular="Matrícula" archive writeRoles={DS} deleteRoles={DS} createDisabled
        select="*, student:students(id, full_name), class:classes(name), year:school_years(year), plan:payment_plans(name), scholarship:scholarships(name)"
        orderBy={{ column: 'created_at', ascending: false }}
        filters={[{ key: 'status', label: 'Situação', options: opts(ENROLL_STATUS) }, { key: 'school_year_id', label: 'Ano letivo', options: yearOptions }, { key: 'class_id', label: 'Turma', options: classOptions }]}
        extraActions={hasRole(...DS) ? <Link to="/matriculas/nova" className="btn-primary"><Plus className="h-4 w-4" /> Nova matrícula</Link> : undefined}
        columns={[
          { key: 'student', label: 'Aluno', render: (r) => <Link className="font-semibold text-olive hover:underline" to={`/alunos/${r.student?.id}`}>{r.student?.full_name}</Link> },
          { key: 'year', label: 'Ano', render: (r) => r.year?.year }, { key: 'class', label: 'Turma', render: (r) => r.class?.name ?? '—' },
          { key: 'plan', label: 'Plano', render: (r) => r.plan?.name ?? '—' }, { key: 'scholarship', label: 'Bolsa', render: (r) => r.scholarship?.name ?? '—' },
          { key: 'enrolled_on', label: 'Data', render: (r) => formatDate(r.enrolled_on) },
          { key: 'status', label: 'Situação', render: (r) => <Badge tone={r.status === 'confirmada' ? 'good' : r.status === 'cancelada' ? 'bad' : 'warn'}>{ENROLL_STATUS[r.status]}</Badge> },
        ]}
        fields={[
          { name: 'status', label: 'Situação', type: 'select', required: true, options: opts(ENROLL_STATUS), hint: 'Ao confirmar, o sistema verifica as vagas da turma e atualiza o cadastro do aluno.' },
          { name: 'class_id', label: 'Turma', type: 'select', options: classOptions }, { name: 'plan_id', label: 'Plano de pagamento', type: 'select', options: planOptions },
          { name: 'scholarship_id', label: 'Bolsa / desconto', type: 'select', options: scholarshipOptions }, { name: 'enrolled_on', label: 'Data da matrícula', type: 'date' },
          { name: 'notes', label: 'Observações', type: 'textarea' },
        ]}
        rowActions={(r, reload) => (<>
          {r.status === 'confirmada' && r.plan_id && <button className="rounded-lg px-2 py-1.5 text-xs font-semibold text-olive hover:bg-cream" onClick={async () => {
            const { data, error } = await supabase.rpc('generate_invoices', { p_enrollment: r.id }); error ? toast.error(errMsg(error)) : toast.success(`${data} cobrança(s) gerada(s).`); reload() }}>Gerar cobranças</button>}
          <button className="rounded-lg p-2 hover:bg-cream" title="Contrato" aria-label="Contrato" onClick={() => generateDocument('contrato', r.student?.id, r.id).catch((e) => toast.error(e.message))}><FileText className="h-4 w-4" /></button>
          <button className="rounded-lg p-2 hover:bg-cream" title="Comprovante" aria-label="Comprovante" onClick={() => generateDocument('comprovante_matricula', r.student?.id, r.id).catch((e) => toast.error(e.message))}><ReceiptIcon className="h-4 w-4" /></button></>)} />
    </>
  )
}
