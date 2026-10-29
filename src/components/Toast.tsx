import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

type Kind = 'success' | 'error'
interface T { id: number; kind: Kind; text: string }
const Ctx = createContext<(kind: Kind, text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([])
  const push = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, kind, text }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 5000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`flex items-start gap-3 rounded-xl border bg-white p-3.5 shadow-card ${t.kind === 'success' ? 'border-olive/40' : 'border-red-300'}`}>
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-olive" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />}
            <p className="flex-1 text-sm">{t.text}</p>
            <button aria-label="Fechar" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}><X className="h-4 w-4 text-muted" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
export const useToast = () => {
  const push = useContext(Ctx)
  return { success: (t: string) => push('success', t), error: (t: string) => push('error', t) }
}
