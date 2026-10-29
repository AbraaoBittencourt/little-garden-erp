import type { ReactNode } from 'react'

export default function ConfirmDialog({ open, title, children, confirmLabel = 'Confirmar', danger, busy, onConfirm, onCancel }: {
  open: boolean; title: string; children?: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/50 p-4" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <div className="card w-full max-w-md p-6">
        <h2 id="dlg-title" className="text-lg font-semibold">{title}</h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>{busy ? 'Aguarde…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
