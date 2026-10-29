import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anon && !url.includes('SEU-PROJETO'))

// Somente a chave pública (anon). A segurança real vem das políticas RLS do banco.
export const supabase = createClient(url || 'http://localhost:54321', anon || 'sem-chave', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
