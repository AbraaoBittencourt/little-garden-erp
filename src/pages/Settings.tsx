import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { maskCNPJ, maskCEP, maskPhone } from '@/lib/masks'
import { useToast } from '@/components/Toast'
import { ErrorBox, PageHeader } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import Logo from '@/components/Logo'
import CrudPage from '@/components/CrudPage'
import Badge from '@/components/Badge'
import { Link } from 'react-router-dom'

interface Settings {
  legal_name: string | null; trade_name: string | null; cnpj: string | null; address: string | null; city: string | null; state: string | null
  zip_code: string | null; phone: string | null; email: string | null
  late_fee_percent: number; daily_interest_percent: number; min_attendance_percent: number; min_attendance_infantil_percent: number
}
interface Year { id: string; year: number; is_current: boolean }

export default function SettingsPage() {
  const toast = useToast()
  const [s, setS] = useState<Settings | null>(null); const [years, setYears] = useState<Year[]>([])
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [newYear, setNewYear] = useState(''); const [bust, setBust] = useState(0)

  async function load() {
    const [a, b] = await Promise.all([supabase.from('school_settings').select('*').eq('id', 1).maybeSingle(), supabase.from('school_years').select('id, year, is_current').order('year', { ascending: false })])
    if (a.error || b.error) setError((a.error ?? b.error)!.message); else { setS(a.data as Settings); setYears((b.data ?? []) as Year[]) }
  }
  useEffect(() => { void load() }, [])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => (x ? { ...x, [k]: v } : x))
  const clean = (v: string | null) => (v && v.trim() ? v.trim() : null)

  async function save(e: FormEvent) {
    e.preventDefault(); if (!s) return
    if (s.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) return toast.error('E-mail da escola inválido.')
    if (s.cnpj && s.cnpj.replace(/\D/g, '').length !== 14) return toast.error('CNPJ deve ter 14 dígitos.')
    setBusy(true)
    const { error } = await supabase.from('school_settings').update({
      legal_name: clean(s.legal_name), trade_name: clean(s.trade_name), cnpj: clean(s.cnpj), address: clean(s.address), city: clean(s.city), state: clean(s.state),
      zip_code: clean(s.zip_code), phone: clean(s.phone), email: clean(s.email),
      late_fee_percent: s.late_fee_percent, daily_interest_percent: s.daily_interest_percent, min_attendance_percent: s.min_attendance_percent, min_attendance_infantil_percent: s.min_attendance_infantil_percent, updated_at: new Date().toISOString(),
    }).eq('id', 1)
    setBusy(false)
    error ? toast.error('Não foi possível salvar as configurações.') : toast.success('Configurações salvas.')
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return toast.error('Use uma imagem PNG, JPG, WEBP ou SVG.')
    if (file.size > 2 * 1024 * 1024) return toast.error('O logotipo deve ter até 2 MB.')
    const { error } = await supabase.storage.from('school-assets').upload('logo', file, { upsert: true, contentType: file.type, cacheControl: '60' })
    if (error) return toast.error('Falha ao enviar o logotipo.')
    toast.success('Logotipo atualizado. Recarregue a página para vê-lo no menu.'); setBust(Date.now())
  }

  async function addYear() {
    const y = Number(newYear)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return toast.error('Informe um ano válido (ex.: 2026).')
    const { error } = await supabase.from('school_years').insert({ year: y, starts_on: `${y}-01-01`, ends_on: `${y}-12-31` })
    if (error) return toast.error(error.code === '23505' ? 'Esse ano letivo já existe.' : 'Não foi possível criar o ano letivo.')
    setNewYear(''); toast.success('Ano letivo criado.'); void load()
  }
  async function makeCurrent(id: string) {
    await supabase.from('school_years').update({ is_current: false }).eq('is_current', true)
    const { error } = await supabase.from('school_years').update({ is_current: true }).eq('id', id)
    error ? toast.error('Não foi possível definir o ano vigente.') : toast.success('Ano letivo vigente atualizado.'); void load()
  }

  if (error) return <ErrorBox message={error} onRetry={() => { setError(''); void load() }} />
  if (!s) return <Loading />
  const txt = (k: keyof Settings) => (s[k] as string | null) ?? ''
  return (
    <>
      <PageHeader title="Configurações" subtitle="Dados oficiais da escola. Preencha somente com informações confirmadas." />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <form onSubmit={save} className="card space-y-4 p-6" noValidate>
          <h2 className="text-lg font-semibold">Dados da instituição</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <F label="Razão social"><input className="input" value={txt('legal_name')} onChange={(e) => set('legal_name', e.target.value)} /></F>
            <F label="Nome fantasia"><input className="input" value={txt('trade_name')} onChange={(e) => set('trade_name', e.target.value)} /></F>
            <F label="CNPJ"><input className="input" inputMode="numeric" value={txt('cnpj')} onChange={(e) => set('cnpj', maskCNPJ(e.target.value))} /></F>
            <F label="Telefone"><input className="input" value={txt('phone')} onChange={(e) => set('phone', maskPhone(e.target.value))} /></F>
            <F label="E-mail"><input className="input" type="email" value={txt('email')} onChange={(e) => set('email', e.target.value)} /></F>
            <F label="CEP"><input className="input" value={txt('zip_code')} onChange={(e) => set('zip_code', maskCEP(e.target.value))} /></F>
            <div className="sm:col-span-2"><F label="Endereço"><input className="input" value={txt('address')} onChange={(e) => set('address', e.target.value)} /></F></div>
            <F label="Cidade"><input className="input" value={txt('city')} onChange={(e) => set('city', e.target.value)} /></F>
            <F label="UF"><input className="input" maxLength={2} value={txt('state')} onChange={(e) => set('state', e.target.value.toUpperCase())} /></F>
          </div>
          <h2 className="pt-2 text-lg font-semibold">Parâmetros</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <F label="Multa por atraso (%)"><input className="input" type="number" min={0} max={100} step="0.01" value={s.late_fee_percent} onChange={(e) => set('late_fee_percent', Number(e.target.value))} /></F>
            <F label="Juros ao dia (%)"><input className="input" type="number" min={0} max={100} step="0.001" value={s.daily_interest_percent} onChange={(e) => set('daily_interest_percent', Number(e.target.value))} /></F>
            <F label="Freq. mínima — Ens. Fundamental (%)"><input className="input" type="number" min={0} max={100} step="0.01" value={s.min_attendance_percent} onChange={(e) => set('min_attendance_percent', Number(e.target.value))} /></F>
            <F label="Freq. mínima — Ed. Infantil (%)"><input className="input" type="number" min={0} max={100} step="0.01" value={s.min_attendance_infantil_percent} onChange={(e) => set('min_attendance_infantil_percent', Number(e.target.value))} /></F>
          </div>
          <p className="text-xs text-muted">Multa e juros devem seguir o contrato de prestação de serviços. Limites padrão da LDB: 75% no Ensino Fundamental e 60% na Educação Infantil; confirme com a legislação vigente.</p>
          <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar configurações'}</button></div>
        </form>

        <div className="space-y-6">
          <div className="card p-6"><h2 className="text-lg font-semibold">Logotipo</h2>
            <div className="mt-4 flex items-center gap-4"><div className="rounded-xl bg-forest p-2"><Logo size={64} bust={bust} /></div>
              <label className="btn-secondary cursor-pointer">Enviar imagem<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => void uploadLogo(e.target.files?.[0])} /></label></div>
            <p className="mt-3 text-xs text-muted">PNG, JPG, WEBP ou SVG, até 2 MB.</p></div>
          <div className="card p-6"><h2 className="text-lg font-semibold">Anos letivos</h2>
            <ul className="mt-3 space-y-2 text-sm">{years.length === 0 && <li className="text-muted">Nenhum ano letivo cadastrado.</li>}
              {years.map((y) => (<li key={y.id} className="flex items-center justify-between"><span className="font-semibold">{y.year}</span>
                {y.is_current ? <span className="rounded-full bg-olive/15 px-2.5 py-1 text-xs font-semibold text-olive">Vigente</span> : <button className="text-xs font-semibold text-olive hover:underline" onClick={() => void makeCurrent(y.id)}>Definir como vigente</button>}</li>))}</ul>
            <div className="mt-4 flex gap-2"><input className="input" placeholder="Ex.: 2026" inputMode="numeric" value={newYear} onChange={(e) => setNewYear(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Novo ano letivo" /><button className="btn-secondary" onClick={() => void addYear()}>Adicionar</button></div></div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="card p-6"><h2 className="mb-4 text-lg font-semibold">Etapas de ensino</h2>
          <CrudPage table="education_stages" singular="Etapa" writeRoles={['direcao']} pageSize={20} orderBy={{ column: 'name' }} defaults={{ is_active: true }}
            columns={[{ key: 'name', label: 'Etapa' }, { key: 'uses_numeric_grades', label: 'Notas', render: (r) => (r.uses_numeric_grades ? 'Numéricas' : 'Descritivas') }, { key: 'is_active', label: 'Situação', render: (r) => (r.is_active ? <Badge tone="good">Ativa</Badge> : <Badge>Inativa</Badge>) }]}
            fields={[{ name: 'name', label: 'Nome', required: true }, { name: 'code', label: 'Código', required: true, placeholder: 'Ex.: EI' }, { name: 'uses_numeric_grades', label: 'Avaliação', type: 'checkbox', placeholder: 'Usa nota numérica' }, { name: 'is_active', label: 'Situação', type: 'checkbox', placeholder: 'Ativa' }]} /></div>
        <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Atalhos de configuração</h2>
          <ul className="space-y-2 text-sm"><li><Link className="font-semibold text-olive hover:underline" to="/financeiro">Planos, bolsas, categorias e fornecedores</Link> — Financeiro › Cadastros</li>
            <li><Link className="font-semibold text-olive hover:underline" to="/turmas">Turmas, turnos e disciplinas</Link></li><li><Link className="font-semibold text-olive hover:underline" to="/comunicacao">Calendário escolar</Link></li>
            <li><Link className="font-semibold text-olive hover:underline" to="/documentos">Modelos de documentos e contratos</Link></li><li><Link className="font-semibold text-olive hover:underline" to="/usuarios">Usuários e permissões</Link></li></ul>
          <p className="mt-4 text-sm text-muted">Formas de pagamento disponíveis: PIX, dinheiro, cartão, transferência bancária e boleto (lançamento manual; nenhuma integração bancária ativa).</p></div>
      </div>
      <div className="card mt-6 overflow-x-auto p-6"><h2 className="mb-1 text-lg font-semibold">Políticas de acesso</h2><p className="mb-4 text-sm text-muted">Aplicadas no banco de dados (RLS); não dependem do que aparece na tela.</p>
        <table className="w-full min-w-[640px] text-left text-sm"><thead className="text-muted"><tr><th className="p-2.5">Área</th><th className="p-2.5">Direção</th><th className="p-2.5">Secretaria</th><th className="p-2.5">Financeiro</th><th className="p-2.5">Coordenação</th><th className="p-2.5">Professor</th><th className="p-2.5">Responsável</th></tr></thead>
          <tbody>{[['Alunos e matrículas', 'Total', 'Total', 'Leitura', 'Leitura', 'Suas turmas', 'Seus filhos'], ['Financeiro', 'Total', 'Leitura', 'Total', '—', '—', 'Cobranças dos filhos'], ['Frequência', 'Total', 'Total', '—', 'Total', 'Suas turmas', 'Seus filhos'], ['Pedagógico', 'Total', '—', '—', 'Total', 'Suas turmas', '—'], ['Documentos', 'Total', 'Total', '—', '—', '—', '—'], ['Usuários e auditoria', 'Total', '—', '—', '—', '—', '—']].map((r) => <tr key={r[0]} className="border-t border-nude/60">{r.map((c, i) => <td key={i} className={`p-2.5 ${i === 0 ? 'font-semibold' : ''}`}>{c}</td>)}</tr>)}</tbody></table></div>
    </>
  )
}
const F = ({ label, children }: { label: string; children: React.ReactNode }) => <div><label className="label">{label}</label>{children}</div>
