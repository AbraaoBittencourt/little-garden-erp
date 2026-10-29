import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Archive, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errMsg, type Row } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import type { Role } from '@/lib/types'
import { useToast } from './Toast'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import { FormGrid, fromDb, toDb, useOptions, validateField, type FieldDef, type OptionsSrc } from './Fields'
import { Loading } from './ProtectedRoute'

export interface ColumnDef { key: string; label: string; render?: (row: Row) => ReactNode; className?: string }
export interface FilterDef { key: string; label: string; options: OptionsSrc }

export interface CrudProps {
  table: string; select?: string; singular: string
  columns: ColumnDef[]; fields: FieldDef[]; searchColumns?: string[]; filters?: FilterDef[]
  orderBy?: { column: string; ascending?: boolean }
  writeRoles: Role[]; deleteRoles?: Role[]; archive?: boolean
  defaults?: Row; baseFilter?: (q: any) => any
  toPayload?: (form: Row) => Row; fromRow?: (row: Row, form: Row) => Row
  rowActions?: (row: Row, reload: () => void) => ReactNode
  extraActions?: ReactNode; createDisabled?: boolean; editDisabled?: boolean
  pageSize?: number; emptyText?: string; createLabel?: string; formWide?: boolean
  afterSave?: (saved: Row | null, isNew: boolean) => Promise<void> | void
  reloadKey?: number
}

function FilterSelect({ f, value, onChange }: { f: FilterDef; value: string; onChange: (v: string) => void }) {
  const o = useOptions(f.options)
  return (
    <select aria-label={f.label} className="input !w-auto min-w-[10rem]" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{f.label}: todos</option>{o.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
    </select>
  )
}

export default function CrudPage(p: CrudProps) {
  const { hasRole } = useAuth(); const toast = useToast()
  const canWrite = hasRole(...p.writeRoles)
  const canDelete = hasRole(...(p.deleteRoles ?? ['direcao']))
  const size = p.pageSize ?? 10
  const [rows, setRows] = useState<Row[]>([]); const [count, setCount] = useState(0); const [page, setPage] = useState(0)
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [fv, setFv] = useState<Record<string, string>>({})
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [editing, setEditing] = useState<Row | 'new' | null>(null); const [form, setForm] = useState<Row>({}); const [saving, setSaving] = useState(false); const [formErr, setFormErr] = useState('')
  const [del, setDel] = useState<Row | null>(null); const [busy, setBusy] = useState(false)
  const seq = useRef(0); const t = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(() => { setDq(q); setPage(0) }, 280); return () => clearTimeout(t.current) }, [q])

  const load = useCallback(async () => {
    const id = ++seq.current
    setLoading(true); setError('')
    let query: any = supabase.from(p.table).select(p.select ?? '*', { count: 'exact' })
    if (p.archive) query = showArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
    if (p.baseFilter) query = p.baseFilter(query)
    for (const [k, v] of Object.entries(fv)) if (v) query = query.eq(k, v === '__true' ? true : v === '__false' ? false : v)
    if (dq.trim() && p.searchColumns?.length) {
      const s = dq.trim().replace(/[,()%*]/g, ' ')
      query = query.or(p.searchColumns.map((c) => `${c}.ilike.%${s}%`).join(','))
    }
    const ob = p.orderBy ?? { column: 'created_at', ascending: false }
    const { data, count: c, error: e } = await query.order(ob.column, { ascending: ob.ascending ?? true }).range(page * size, page * size + size - 1)
    if (id !== seq.current) return
    if (e) setError(errMsg(e)); else { setRows((data ?? []) as Row[]); setCount(c ?? 0) }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.table, p.select, p.archive, showArchived, JSON.stringify(fv), dq, page, size, p.reloadKey])
  useEffect(() => { void load() }, [load])

  function openNew() { const f: Row = {}; p.fields.forEach((x) => { f[x.name] = x.type === 'checkbox' ? false : '' }); setForm({ ...f, ...(p.defaults ?? {}) }); setFormErr(''); setEditing('new') }
  function openEdit(r: Row) {
    const f: Row = {}; p.fields.forEach((x) => { f[x.name] = fromDb(x, r[x.name]) })
    setForm(p.fromRow ? { ...f, ...p.fromRow(r, f) } : f); setFormErr(''); setEditing(r)
  }

  async function save() {
    setFormErr('')
    for (const f of p.fields) { if (f.hideWhen?.(form)) continue; const m = validateField(f, form[f.name], form); if (m) return setFormErr(m) }
    const payload: Row = {}
    p.fields.forEach((f) => { if (f.persist !== false && !f.hideWhen?.(form)) payload[f.name] = toDb(f, form[f.name]) })
    const final = p.toPayload ? { ...payload, ...p.toPayload(form) } : payload
    setSaving(true)
    const isNew = editing === 'new'
    const res: any = isNew
      ? await supabase.from(p.table).insert(final).select().maybeSingle()
      : await supabase.from(p.table).update(final).eq('id', (editing as Row).id).select().maybeSingle()
    if (res.error) { setSaving(false); return setFormErr(errMsg(res.error)) }
    try { await p.afterSave?.(res.data ?? null, isNew) } catch (e) { toast.error((e as Error).message) }
    setSaving(false); setEditing(null); toast.success(isNew ? `${p.singular} cadastrado(a).` : `${p.singular} atualizado(a).`); void load()
  }

  async function remove() {
    if (!del) return
    setBusy(true)
    const res = p.archive
      ? await supabase.from(p.table).update({ archived_at: del.archived_at ? null : new Date().toISOString() }).eq('id', del.id)
      : await supabase.from(p.table).delete().eq('id', del.id)
    setBusy(false)
    if (res.error) toast.error(errMsg(res.error)); else { toast.success(p.archive ? (del.archived_at ? 'Registro restaurado.' : 'Registro arquivado.') : 'Registro excluído.'); setDel(null); void load() }
  }

  const pages = Math.max(1, Math.ceil(count / size))
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {p.searchColumns && (
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input aria-label="Buscar" className="input pl-9" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        {p.filters?.map((f) => <FilterSelect key={f.key} f={f} value={fv[f.key] ?? ''} onChange={(v) => { setFv({ ...fv, [f.key]: v }); setPage(0) }} />)}
        {p.archive && <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); setPage(0) }} /> Arquivados</label>}
        <div className="ml-auto flex items-center gap-2">
          {p.extraActions}
          {canWrite && !p.createDisabled && <button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> {p.createLabel ?? `Novo(a) ${p.singular.toLowerCase()}`}</button>}
        </div>
      </div>

      {error ? <p className="card border border-red-200 p-4 text-sm text-red-800" role="alert">{error} <button className="ml-2 font-semibold underline" onClick={() => void load()}>Tentar novamente</button></p> : (
        <div className="card overflow-x-auto">
          {loading && rows.length === 0 ? <Loading /> : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-nude text-muted"><tr>
                {p.columns.map((c) => <th key={c.key} className="p-3.5 font-semibold">{c.label}</th>)}
                <th className="p-3.5 text-right font-semibold"><span className="sr-only">Ações</span></th>
              </tr></thead>
              <tbody className={loading ? 'opacity-50' : ''}>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-nude/60 last:border-0">
                    {p.columns.map((c) => <td key={c.key} className={`p-3.5 align-top ${c.className ?? ''}`}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
                    <td className="p-3.5 align-top"><div className="flex items-center justify-end gap-1">
                      {p.rowActions?.(r, () => void load())}
                      {canWrite && !p.editDisabled && <button title="Editar" aria-label="Editar" className="rounded-lg p-2 hover:bg-cream" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></button>}
                      {canDelete && (p.archive
                        ? <button title={r.archived_at ? 'Restaurar' : 'Arquivar'} aria-label={r.archived_at ? 'Restaurar' : 'Arquivar'} className="rounded-lg p-2 hover:bg-cream" onClick={() => setDel(r)}>{r.archived_at ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</button>
                        : <button title="Excluir" aria-label="Excluir" className="rounded-lg p-2 text-red-700 hover:bg-red-50" onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></button>)}
                    </div></td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && <tr><td colSpan={p.columns.length + 1} className="p-8 text-center text-muted">{p.emptyText ?? 'Nenhum registro encontrado.'}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {count > size && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted">
          <span>{count} registro(s) — página {page + 1} de {pages}</span>
          <div className="flex gap-2">
            <button className="btn-secondary !px-3" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
            <button className="btn-secondary !px-3" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? `Novo(a) ${p.singular.toLowerCase()}` : `Editar ${p.singular.toLowerCase()}`} wide={p.formWide} onClose={() => setEditing(null)}
          footer={<><button className="btn-secondary" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button><button className="btn-primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
          <FormGrid fields={p.fields} form={form} setForm={setForm} />
          {formErr && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{formErr}</p>}
        </Modal>
      )}
      <ConfirmDialog open={!!del} busy={busy} danger={!del?.archived_at} title={p.archive ? (del?.archived_at ? 'Restaurar registro?' : 'Arquivar registro?') : 'Excluir registro?'}
        confirmLabel={p.archive ? (del?.archived_at ? 'Restaurar' : 'Arquivar') : 'Excluir'} onConfirm={() => void remove()} onCancel={() => setDel(null)}>
        {p.archive ? 'O registro deixa de aparecer nas listas, mas o histórico escolar e financeiro é preservado.' : 'Esta ação não pode ser desfeita.'}
      </ConfirmDialog>
    </div>
  )
}
