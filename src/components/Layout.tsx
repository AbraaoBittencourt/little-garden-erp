import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { ROLE_LABELS } from '@/lib/types'
import { useAuth } from '@/contexts/AuthContext'
import Logo from './Logo'

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Logo />
      <div className="leading-tight">
        <p className="font-heading text-lg font-semibold tracking-wide text-white">LITTLE GARDEN</p>
        <p className="text-xs text-nude/80">Gestão escolar</p>
      </div>
    </div>
  )
}

export default function Layout() {
  const { profile, roles, hasRole, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => hasRole(...i.roles)) })).filter((g) => g.items.length)

  const sidebar = (
    <div className="flex h-full flex-col bg-forest text-nude">
      <div className="px-5 pb-4 pt-6"><Brand /></div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Menu principal">
        {groups.map((g) => (
          <div key={g.title} className="mt-4">
            <p className="px-3 pb-1.5 text-xs font-semibold text-nude/60">{g.title}</p>
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={() => setOpen(false)}
                className={({ isActive }) => `mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-olive text-white' : 'hover:bg-white/10'}`}>
                <i.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1">{i.label}</span>
                {!i.ready && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-nude/70">Etapa {i.stage}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-semibold text-white">{profile?.full_name || profile?.email}</p>
        <p className="truncate text-xs text-nude/70">{roles.map((r) => ROLE_LABELS[r]).join(', ')}</p>
        <button onClick={() => void signOut()} className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/10">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 lg:block">{sidebar}</aside>

      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-nude bg-cream/95 px-4 py-3 backdrop-blur lg:hidden">
        <button aria-label="Abrir menu" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-nude/50"><Menu className="h-5 w-5" /></button>
        <p className="font-heading font-semibold tracking-wide">LITTLE GARDEN</p>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-forest/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
            {sidebar}
            <button aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-nude hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
        </div>
      )}

      <main className="lg:pl-72" key={loc.pathname}>
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><Outlet /></div>
      </main>
    </div>
  )
}
