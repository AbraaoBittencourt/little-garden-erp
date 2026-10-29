import { useEffect, useState } from 'react'
import { maskCEP, maskCNPJ, maskCPF, maskCurrency, maskPhone, isValidCPF, parseCurrency } from '@/lib/masks'
import Picker from './Picker'

export type FieldType = 'text' | 'email' | 'number' | 'date' | 'datetime' | 'textarea' | 'select' | 'checkbox' | 'currency' | 'cpf' | 'cnpj' | 'phone' | 'cep' | 'picker'
export interface Option { value: string; label: string; meta?: any }
export type OptionsSrc = Option[] | (() => Promise<Option[]>)

export interface FieldDef {
  name: string; label: string; type?: FieldType; required?: boolean; options?: OptionsSrc; placeholder?: string
  full?: boolean; hint?: string; min?: number; max?: number; step?: string; persist?: boolean
  pickerTable?: string; pickerLabel?: string; pickerFilter?: (q: any) => any
  validate?: (v: any, form: Record<string, any>) => string | null
  onChange?: (v: any, patch: (p: Record<string, any>) => void, opt?: Option) => void
  hideWhen?: (form: Record<string, any>) => boolean
}

export function useOptions(src?: OptionsSrc) {
  const [o, setO] = useState<Option[]>(Array.isArray(src) ? src : [])
  useEffect(() => {
    if (!src) return
    if (Array.isArray(src)) { setO(src); return }
    let alive = true
    src().then((r) => alive && setO(r)).catch(() => alive && setO([]))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return o
}

export function validateField(f: FieldDef, v: any, form: Record<string, any>): string | null {
  const empty = v === '' || v == null || v === false && f.type !== 'checkbox'
  if (f.required && (v === '' || v == null)) return `Informe: ${f.label}.`
  if (v === '' || v == null) return f.validate ? f.validate(v, form) : null
  if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return `${f.label}: e-mail inválido.`
  if (f.type === 'cpf' && !isValidCPF(v)) return `${f.label}: CPF inválido.`
  if (f.type === 'cnpj' && String(v).replace(/\D/g, '').length !== 14) return `${f.label}: CNPJ deve ter 14 dígitos.`
  if (f.type === 'cep' && String(v).replace(/\D/g, '').length !== 8) return `${f.label}: CEP deve ter 8 dígitos.`
  if (f.type === 'phone' && ![10, 11].includes(String(v).replace(/\D/g, '').length)) return `${f.label}: telefone inválido.`
  if (f.type === 'number') {
    const n = Number(v)
    if (Number.isNaN(n)) return `${f.label}: número inválido.`
    if (f.min != null && n < f.min) return `${f.label}: mínimo ${f.min}.`
    if (f.max != null && n > f.max) return `${f.label}: máximo ${f.max}.`
  }
  if (f.type === 'currency' && parseCurrency(String(v)) < 0) return `${f.label}: valor inválido.`
  void empty
  return f.validate ? f.validate(v, form) : null
}

/** Converte o estado do formulário (strings) em valores do banco. */
export function toDb(f: FieldDef, v: any) {
  if (v === '' || v == null) return f.type === 'checkbox' ? false : null
  if (f.type === 'number') return Number(v)
  if (f.type === 'currency') return parseCurrency(String(v))
  if (f.type === 'datetime') return new Date(v).toISOString()
  return typeof v === 'string' ? v.trim() : v
}
export function fromDb(f: FieldDef, v: any) {
  if (v == null) return f.type === 'checkbox' ? false : ''
  if (f.type === 'currency') return maskCurrency(String(Math.round(Number(v) * 100)))
  if (f.type === 'datetime') { const d = new Date(v); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
  if (f.type === 'number') return String(v)
  return v
}

export function FieldInput({ f, value, onChange, disabled }: { f: FieldDef; value: any; onChange: (v: any, opt?: Option) => void; disabled?: boolean }) {
  const opts = useOptions(f.options)
  const id = `f-${f.name}`
  const set = (v: any, opt?: Option) => onChange(v, opt)
  switch (f.type) {
    case 'textarea': return <textarea id={id} className="input min-h-[96px]" value={value ?? ''} disabled={disabled} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />
    case 'select': return (
      <select id={id} className="input" value={value ?? ''} disabled={disabled} onChange={(e) => set(e.target.value, opts.find((o) => o.value === e.target.value))}>
        <option value="">{f.required ? 'Selecione…' : '— Nenhum —'}</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>)
    case 'checkbox': return <label className="flex items-center gap-2 py-2 text-sm"><input id={id} type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => set(e.target.checked)} /> {f.placeholder ?? 'Sim'}</label>
    case 'picker': return <Picker id={id} table={f.pickerTable!} labelCol={f.pickerLabel} value={value || null} filter={f.pickerFilter} disabled={disabled} onChange={(id) => set(id ?? '')} />
    case 'currency': return <input id={id} inputMode="numeric" className="input" value={value ?? ''} disabled={disabled} placeholder="R$ 0,00" onChange={(e) => set(e.target.value ? maskCurrency(e.target.value) : '')} />
    case 'cpf': return <input id={id} inputMode="numeric" className="input" value={value ?? ''} disabled={disabled} placeholder="000.000.000-00" onChange={(e) => set(maskCPF(e.target.value))} />
    case 'cnpj': return <input id={id} inputMode="numeric" className="input" value={value ?? ''} disabled={disabled} placeholder="00.000.000/0000-00" onChange={(e) => set(maskCNPJ(e.target.value))} />
    case 'phone': return <input id={id} inputMode="tel" className="input" value={value ?? ''} disabled={disabled} placeholder="(71) 90000-0000" onChange={(e) => set(maskPhone(e.target.value))} />
    case 'cep': return <input id={id} inputMode="numeric" className="input" value={value ?? ''} disabled={disabled} placeholder="00000-000" onChange={(e) => set(maskCEP(e.target.value))} />
    case 'number': return <input id={id} type="number" className="input" value={value ?? ''} min={f.min} max={f.max} step={f.step ?? '1'} disabled={disabled} onChange={(e) => set(e.target.value)} />
    case 'date': return <input id={id} type="date" className="input" value={value ?? ''} disabled={disabled} onChange={(e) => set(e.target.value)} />
    case 'datetime': return <input id={id} type="datetime-local" className="input" value={value ?? ''} disabled={disabled} onChange={(e) => set(e.target.value)} />
    default: return <input id={id} type={f.type === 'email' ? 'email' : 'text'} className="input" value={value ?? ''} disabled={disabled} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />
  }
}

export function FormGrid({ fields, form, setForm, disabled }: { fields: FieldDef[]; form: Record<string, any>; setForm: (f: Record<string, any>) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.filter((f) => !f.hideWhen?.(form)).map((f) => (
        <div key={f.name} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
          <label className="label" htmlFor={`f-${f.name}`}>{f.label}{f.required && <span className="text-red-700"> *</span>}</label>
          <FieldInput f={f} value={form[f.name]} disabled={disabled} onChange={(v, opt) => {
            const next = { ...form, [f.name]: v }
            setForm(next)
            f.onChange?.(v, (p) => setForm({ ...next, ...p }), opt)
          }} />
          {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
        </div>
      ))}
    </div>
  )
}
