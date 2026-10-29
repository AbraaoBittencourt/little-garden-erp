export type Role = 'direcao' | 'secretaria' | 'financeiro' | 'coordenacao' | 'professor' | 'responsavel'

export const ROLE_LABELS: Record<Role, string> = {
  direcao: 'Direção',
  secretaria: 'Secretaria',
  financeiro: 'Financeiro',
  coordenacao: 'Coordenação pedagógica',
  professor: 'Professor',
  responsavel: 'Responsável',
}

export interface Profile {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  is_active: boolean
  last_access_at: string | null
}

export interface DashboardData {
  active_students: number
  confirmed_enrollments: number
  teachers_active: number
  employees_active: number
  revenue_received: number
  revenue_expected: number
  expenses_month: number
  overdue_count: number
  overdue_amount: number
  delinquency_rate: number | null
  students_by_stage: { name: string; total: number }[]
  class_vacancies: { id: string; name: string; capacity: number; enrolled: number; available: number }[]
  birthdays: { name: string; day: number }[]
  upcoming_events: { id: string; title: string; starts_at: string }[]
  pending_documents: number
  series_revenue_expenses: { month: number; receitas: number; despesas: number }[]
  series_students: { month: number; alunos: number }[]
  series_enrollments_by_class: { name: string; total: number }[]
  series_delinquency: { month: number; taxa: number | null }[]
}
