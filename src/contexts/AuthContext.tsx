import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  roles: Role[]
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  hasRole: (...allowed: Role[]) => boolean
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string) => {
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, phone, is_active, last_access_at').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ])
    setProfile((p.data as Profile) ?? null)
    setRoles(((r.data ?? []) as { role: Role }[]).map((x) => x.role))
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      if (mounted) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // não chamar o Supabase direto dentro do callback (evita deadlock); adia para o próximo ciclo
      setTimeout(() => {
        if (!mounted) return
        if (s) void loadProfile(s.user.id)
        else { setProfile(null); setRoles([]) }
      }, 0)
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      throw new Error(error.message.toLowerCase().includes('invalid') ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Verifique sua conexão e tente novamente.')
    }
    await loadProfile(data.user.id)
    void supabase.rpc('touch_last_access')
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null); setRoles([])
  }, [])

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
    if (error) throw new Error('Não foi possível enviar o e-mail agora. Tente novamente em instantes.')
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
  }, [])

  const refreshProfile = useCallback(async () => { if (session) await loadProfile(session.user.id) }, [session, loadProfile])
  const hasRole = useCallback((...allowed: Role[]) => allowed.some((r) => roles.includes(r)), [roles])

  const value = useMemo(() => ({ session, profile, roles, loading, signIn, signOut, sendPasswordReset, updatePassword, hasRole, refreshProfile }),
    [session, profile, roles, loading, signIn, signOut, sendPasswordReset, updatePassword, hasRole, refreshProfile])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return c
}
