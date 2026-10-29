import { useState } from 'react'
import { Sprout } from 'lucide-react'

const base = import.meta.env.VITE_SUPABASE_URL
export const LOGO_URL = `${base}/storage/v1/object/public/school-assets/logo`

/** Espaço reservado para o logotipo oficial: se não houver arquivo enviado, mostra o marcador padrão. */
export default function Logo({ size = 44, bust }: { size?: number; bust?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-xl border border-dashed border-gold/70 bg-white/10 text-gold" title="Espaço reservado para o logotipo">
        <Sprout className="h-1/2 w-1/2" />
      </div>
    )
  }
  return <img src={`${LOGO_URL}${bust ? `?v=${bust}` : ''}`} alt="Logotipo da Escola Little Garden" style={{ width: size, height: size }} className="shrink-0 rounded-xl object-contain" onError={() => setFailed(true)} />
}
