import { supabase } from './supabase'
export interface School { legal_name: string | null; trade_name: string | null; cnpj: string | null; address: string | null; city: string | null; state: string | null; zip_code: string | null; phone: string | null; email: string | null }
let cache: School | null = null
export async function getSchool(force = false): Promise<School> {
  if (cache && !force) return cache
  const { data } = await supabase.from('school_settings').select('legal_name, trade_name, cnpj, address, city, state, zip_code, phone, email').eq('id', 1).maybeSingle()
  cache = (data as School) ?? { legal_name: null, trade_name: 'Little Garden', cnpj: null, address: null, city: null, state: null, zip_code: null, phone: null, email: null }
  return cache
}
export const schoolName = (s: School) => s.trade_name || s.legal_name || 'Little Garden'
