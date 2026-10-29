import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-forest">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'default' }: {
  label: string; value: ReactNode; hint?: string; icon: LucideIcon; tone?: 'default' | 'good' | 'bad'
}) {
  const color = tone === 'good' ? 'text-olive' : tone === 'bad' ? 'text-red-700' : 'text-forest'
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <span className="rounded-lg bg-cream p-2 text-olive"><Icon className="h-4 w-4" /></span>
      </div>
      <p className={`mt-2 font-heading text-2xl font-semibold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card border border-red-200 p-6" role="alert">
      <p className="font-semibold text-red-800">Não foi possível carregar os dados</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry && <button className="btn-secondary mt-4" onClick={onRetry}>Tentar novamente</button>}
    </div>
  )
}
