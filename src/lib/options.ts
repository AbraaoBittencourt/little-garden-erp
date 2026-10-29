import { supabase } from './supabase'
import type { Option } from '@/components/Fields'

export const tableOptions = (table: string, label = 'name', extra?: (q: any) => any, metaCols = ''): (() => Promise<Option[]>) => async () => {
  let q: any = supabase.from(table).select(`id, ${label}${metaCols ? ', ' + metaCols : ''}`).order(label)
  if (extra) q = extra(q)
  const { data } = await q
  return ((data ?? []) as any[]).map((r) => ({ value: r.id, label: String(r[label]), meta: r }))
}
export const stageOptions = tableOptions('education_stages', 'name', (q) => q.eq('is_active', true))
export const yearOptions: () => Promise<Option[]> = async () => {
  const { data } = await supabase.from('school_years').select('id, year, is_current').order('year', { ascending: false })
  return ((data ?? []) as any[]).map((r) => ({ value: r.id, label: `${r.year}${r.is_current ? ' (vigente)' : ''}`, meta: r }))
}
export const classOptions: () => Promise<Option[]> = async () => {
  const { data } = await supabase.from('classes').select('id, name, shift, capacity, status, stage_id, school_year_id, year:school_years(year)').is('archived_at', null).order('name')
  return ((data ?? []) as any[]).map((r) => ({ value: r.id, label: `${r.name} — ${r.year?.year ?? ''}`, meta: r }))
}
export const teacherOptions = tableOptions('teachers', 'full_name', (q) => q.is('archived_at', null).eq('status', 'ativo'))
export const subjectOptions = tableOptions('subjects', 'name', (q) => q.eq('is_active', true))
export const planOptions = tableOptions('payment_plans', 'name', (q) => q.eq('is_active', true), 'monthly_amount, installments, due_day')
export const scholarshipOptions = tableOptions('scholarships', 'name', (q) => q.eq('is_active', true), 'discount_percent')
export const categoryOptions = tableOptions('expense_categories', 'name', (q) => q.eq('is_active', true))
export const supplierOptions = tableOptions('suppliers', 'name', (q) => q.is('archived_at', null))
export const usersByRole = (role: string): (() => Promise<Option[]>) => async () => {
  const { data } = await supabase.rpc('list_users_by_role', { r: role })
  return ((data ?? []) as any[]).map((u) => ({ value: u.id, label: `${u.full_name || u.email} (${u.email})` }))
}
