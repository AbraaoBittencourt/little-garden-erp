import { useLocation } from 'react-router-dom'
import { Sprout, Hammer } from 'lucide-react'
import { ALL_NAV_ITEMS } from '@/lib/nav'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/ui'

const STAGES: Record<number, string> = {
  2: 'Etapa 2 — Gestão escolar', 3: 'Etapa 3 — Financeiro', 4: 'Etapa 4 — Pedagógico', 5: 'Etapa 5 — Operação e expansão',
}

export function ModulePlaceholder() {
  const { pathname } = useLocation()
  const item = ALL_NAV_ITEMS.find((i) => i.to === pathname)
  return (
    <>
      <PageHeader title={item?.label ?? 'Módulo'} />
      <div className="card flex flex-col items-center p-10 text-center">
        <Hammer className="h-9 w-9 text-gold" />
        <h2 className="mt-4 text-lg font-semibold">Módulo ainda não implementado</h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          Este módulo está planejado para a {item ? STAGES[item.stage] : 'próxima etapa'}. As tabelas do banco e as permissões (RLS) já estão prontas na Etapa 1.
        </p>
      </div>
    </>
  )
}

export function Welcome() {
  const { profile, hasRole } = useAuth()
  return (
    <>
      <PageHeader title={`Olá, ${profile?.full_name?.split(' ')[0] || 'bem-vindo(a)'}`} subtitle="Little Garden ERP" />
      <div className="card flex flex-col items-center p-10 text-center">
        <Sprout className="h-9 w-9 text-olive" />
        <p className="mt-3 max-w-md text-sm text-muted">
          {hasRole('responsavel') && !hasRole('professor')
            ? 'A área dos responsáveis (boletos, comunicados e frequência) será disponibilizada em uma etapa futura.'
            : 'Use o menu lateral para acessar os módulos disponíveis para o seu perfil. Os módulos de rotina serão liberados nas próximas etapas.'}
        </p>
      </div>
    </>
  )
}

export function NotFound() {
  return <div className="card p-10 text-center"><h1 className="text-xl font-semibold">Página não encontrada</h1></div>
}
