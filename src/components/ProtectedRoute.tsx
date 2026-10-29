import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Hourglass, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import type { Role } from '@/lib/types'

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted" role="status">
      <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-nude border-t-olive" /> {label}
    </div>
  )
}

/** Exige sessão + perfil ativo + ao menos um papel. As regras reais ficam no banco (RLS). */
export function ProtectedRoute() {
  const { session, profile, roles, loading, signOut } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="min-h-screen bg-cream"><Loading /></div>
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!profile) return <div className="min-h-screen bg-cream"><Loading label="Carregando seu perfil…" /></div>
  if (!profile.is_active || roles.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-6">
        <div className="card max-w-md p-8 text-center">
          <Hourglass className="mx-auto h-10 w-10 text-gold" />
          <h1 className="mt-4 text-xl font-semibold">Acesso aguardando liberação</h1>
          <p className="mt-2 text-sm text-muted">Sua conta foi criada, mas a Direção ainda não ativou o acesso nem definiu seu perfil. Fale com a administração da escola.</p>
          <button className="btn-secondary mt-6" onClick={() => void signOut()}><LogOut className="h-4 w-4" /> Sair</button>
        </div>
      </div>
    )
  }
  return <Outlet />
}

export function RoleRoute({ roles }: { roles: Role[] }) {
  const { hasRole } = useAuth()
  return hasRole(...roles) ? <Outlet /> : (
    <div className="card p-8 text-center">
      <h1 className="text-xl font-semibold">Acesso restrito</h1>
      <p className="mt-2 text-sm text-muted">Seu perfil não tem permissão para acessar esta área.</p>
    </div>
  )
}
