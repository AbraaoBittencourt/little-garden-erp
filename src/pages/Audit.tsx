import { useState } from 'react'
import { Eye } from 'lucide-react'
import CrudPage from '@/components/CrudPage'
import Badge from '@/components/Badge'
import Modal from '@/components/Modal'
import { PageHeader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { formatDateTime } from '@/lib/format'
import type { Row } from '@/lib/db'

const TABLES = ['students', 'guardians', 'student_guardians', 'enrollments', 'invoices', 'payments', 'expenses', 'teachers', 'employees', 'classes', 'payment_plans', 'scholarships', 'documents', 'pedagogical_reports', 'consents', 'user_roles', 'school_settings', 'announcements', 'school_events', 'document_templates', 'pedagogical_records']
const ACT: Record<string, string> = { INSERT: 'Criação', UPDATE: 'Alteração', DELETE: 'Exclusão' }

export default function AuditPage() {
  const [view, setView] = useState<Row | null>(null)
  const people = useAsync(async () => Object.fromEntries(((await supabase.from('profiles').select('id, full_name, email')).data ?? []).map((p: Row) => [p.id, p.full_name || p.email])), [])
  const changed = (r: Row) => r.action === 'UPDATE' && r.old_data && r.new_data ? Object.keys(r.new_data).filter((k) => JSON.stringify(r.old_data[k]) !== JSON.stringify(r.new_data[k]) && k !== 'updated_at') : []
  return (
    <>
      <PageHeader title="Auditoria" subtitle="Registro de operações relevantes: quem fez, quando e o que mudou. Somente leitura." />
      <CrudPage table="audit_logs" singular="Registro" writeRoles={[]} deleteRoles={[]} createDisabled editDisabled pageSize={20} orderBy={{ column: 'created_at', ascending: false }}
        filters={[{ key: 'table_name', label: 'Tabela', options: TABLES.map((t) => ({ value: t, label: t })) }, { key: 'action', label: 'Ação', options: Object.entries(ACT).map(([value, label]) => ({ value, label })) }]}
        columns={[{ key: 'created_at', label: 'Data e hora', render: (r) => formatDateTime(r.created_at) }, { key: 'user_id', label: 'Usuário', render: (r) => (r.user_id ? (people.data as any)?.[r.user_id] ?? 'Usuário removido' : 'Sistema') },
          { key: 'table_name', label: 'Tabela' }, { key: 'action', label: 'Ação', render: (r) => <Badge tone={r.action === 'DELETE' ? 'bad' : r.action === 'INSERT' ? 'good' : 'warn'}>{ACT[r.action]}</Badge> },
          { key: 'fields', label: 'Campos alterados', render: (r) => <span className="text-muted">{changed(r).join(', ') || '—'}</span> }]}
        fields={[]} rowActions={(r) => <button className="rounded-lg p-2 hover:bg-cream" title="Ver detalhes" aria-label="Ver detalhes" onClick={() => setView(r)}><Eye className="h-4 w-4" /></button>} />
      {view && <Modal title={`${ACT[view.action]} em ${view.table_name}`} wide onClose={() => setView(null)}>
        <div className="grid gap-4 md:grid-cols-2">{(['old_data', 'new_data'] as const).map((k) => <div key={k}><h3 className="mb-1 text-sm font-semibold">{k === 'old_data' ? 'Antes' : 'Depois'}</h3><pre className="max-h-96 overflow-auto rounded-xl bg-cream p-3 text-xs">{view[k] ? JSON.stringify(view[k], null, 2) : '—'}</pre></div>)}</div></Modal>}
    </>
  )
}
