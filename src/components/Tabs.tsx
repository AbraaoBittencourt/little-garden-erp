import { useState, type ReactNode } from 'react'

export interface TabDef { id: string; label: string; content: ReactNode; hidden?: boolean }

export default function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const visible = tabs.filter((t) => !t.hidden)
  const [active, setActive] = useState(initial ?? visible[0]?.id)
  const cur = visible.find((t) => t.id === active) ?? visible[0]
  return (
    <div>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-nude" role="tablist">
        {visible.map((t) => (
          <button key={t.id} role="tab" aria-selected={cur?.id === t.id} onClick={() => setActive(t.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${cur?.id === t.id ? 'border-olive text-forest' : 'border-transparent text-muted hover:text-forest'}`}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" key={cur?.id}>{cur?.content}</div>
    </div>
  )
}
