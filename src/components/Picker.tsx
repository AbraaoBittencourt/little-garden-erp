import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

/** Campo com busca por nome em uma tabela (alunos, responsáveis…). */
export default function Picker({ table, labelCol = 'full_name', value, onChange, placeholder = 'Digite para buscar…', filter, id, disabled }: {
  table: string; labelCol?: string; value: string | null; onChange: (id: string | null, label?: string) => void
  placeholder?: string; filter?: (q: any) => any; id?: string; disabled?: boolean
}) {
  const [text, setText] = useState(''); const [items, setItems] = useState<{ id: string; label: string }[]>([])
  const [open, setOpen] = useState(false); const [label, setLabel] = useState('')
  const t = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!value) { setLabel(''); return }
    void (async () => {
      const { data } = await supabase.from(table).select(`id, ${labelCol}`).eq('id', value).maybeSingle()
      if (data) setLabel(String((data as any)[labelCol]))
    })()
  }, [value, table, labelCol])

  function search(q: string) {
    setText(q); setOpen(true); clearTimeout(t.current)
    t.current = setTimeout(async () => {
      let query: any = supabase.from(table).select(`id, ${labelCol}`).order(labelCol).limit(8)
      if (q.trim()) query = query.ilike(labelCol, `%${q.trim().replace(/[,()%]/g, ' ')}%`)
      if (filter) query = filter(query)
      const { data } = await query
      setItems(((data ?? []) as any[]).map((r) => ({ id: r.id, label: String(r[labelCol]) })))
    }, 220)
  }

  if (value && !open) {
    return (
      <div className="flex items-center gap-2">
        <input id={id} className="input" value={label} readOnly />
        {!disabled && <button type="button" className="btn-secondary shrink-0" onClick={() => { onChange(null); setText(''); setLabel(''); search('') }}>Trocar</button>}
      </div>
    )
  }
  return (
    <div className="relative">
      <input id={id} className="input" value={text} placeholder={placeholder} disabled={disabled} autoComplete="off"
        onChange={(e) => search(e.target.value)} onFocus={() => search(text)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-nude bg-white shadow-card">
          {items.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nenhum resultado</li>}
          {items.map((i) => (
            <li key={i.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-cream"
              onMouseDown={(e) => { e.preventDefault(); onChange(i.id, i.label); setLabel(i.label); setOpen(false) }}>{i.label}</button></li>
          ))}
        </ul>
      )}
    </div>
  )
}
