export type Role = 'direcao' | 'secretaria' | 'financeiro' | 'coordenacao' | 'professor' | 'responsavel'

export const ROLE_LABELS: Record<Role, string> = {
  direcao: 'Direção',
  secretaria: 'Secretaria',
  financeiro: 'Financeiro',
  coordenacao: 'Coordenação pedagógica',
  professor: 'Professor',
  responsavel: 'Responsável',
}

export const ROLE_COLORS: Record<Role, { bg: string; text: string; border: string }> = {
  direcao: { bg: 'bg-[#354735]/15', text: 'text-[#354735]', border: 'border-[#354735]/30' },
  financeiro: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  secretaria: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  coordenacao: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  professor: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  responsavel: { bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-300' },
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

export interface SchoolItem {
  id: string
  type: 'fardamento' | 'material'
  name: string
  category: string
  stage_id?: string | null
  size?: string | null
  unit_price: number
  cost_price?: number | null
  stock_quantity: number
  min_stock?: number
  school_year_id?: string | null
  description?: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}
