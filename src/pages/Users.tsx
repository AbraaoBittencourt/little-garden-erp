import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { UserPlus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS, type Profile, type Role } from '@/lib/types'
import { formatDateTime } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/Toast'
import { ErrorBox, PageHeader } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import ConfirmDialog from '@/components/ConfirmDialog'

const ROLES = Object.keys(ROLE_LABELS) as Role[]
type Row = Profile & { roles: Role[] }

export default function UsersPage() {
  const { session } = useAuth(); const toast = useToast()
  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [invite, setInvite] = useState(false); const [confirm, setConfirm] = useState<Row | null>(null); const [busy, setBusy] = useState(false)
  const me = session?.user.id

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, phone, is_active, last_access_at').order('full_name'),
      supabase.from('user_roles').select('user_id, role'),
    ])
    if (p.error || r.error) setError((p.error ?? r.error)!.message)
    else {
      const map = new Map<string, Role[]>()
      ;(r.data as { user_id: string; role: Role }[]).forEach((x) => map.set(x.user_id, [...(map.get(x.user_id) ?? []), x.role]))
      setRows((p.data as Profile[]).map((u) => ({ ...u, roles: map.get(u.id) ?? [] })))
    }
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function addRole(u: Row, role: Role) {
    if (!role) return
    const { error } = await supabase.from('user_roles').insert({ user_id: u.id, role })
    if (error) toast.error('Não foi possível adicionar o perfil.'); else { toast.success('Perfil adicionado.'); void load() }
  }
  async function removeRole(u: Row, role: Role) {
    if (u.id === me && role === 'direcao') return toast.error('Você não pode remover seu próprio perfil de Direção.')
    const { error } = await supabase.from('user_roles').delete().eq('user_id', u.id).eq('role', role)
    if (error) toast.error('Não foi possível remover o perfil.'); else { toast.success('Perfil removido.'); void load() }
  }
  async function toggleActive() {
    if (!confirm) return
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ is_active: !confirm.is_active }).eq('id', confirm.id)
    setBusy(false); setConfirm(null)
    if (error) toast.error('Não foi possível alterar o status.'); else { toast.success('Status atualizado.'); void load() }
  }

  return (
    <>
      <PageHeader title="Usuários e permissões" subtitle="Defina quem acessa o sistema e com qual perfil. Novos usuários só entram após ativação."
        actions={<button className="btn-primary" onClick={() => setInvite(true)}><UserPlus className="h-4 w-4" /> Convidar usuário</button>} />
      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={() => void load()} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-nude text-muted"><tr><th className="p-4 font-semibold">Usuário</th><th className="p-4 font-semibold">Perfis</th><th className="p-4 font-semibold">Último acesso</th><th className="p-4 font-semibold">Status</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-nude/60 align-top last:border-0">
                  <td className="p-4"><p className="font-semibold">{u.full_name || '(sem nome)'}</p><p className="text-muted">{u.email}</p></td>
                  <td className="p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.roles.map((r) => (
                        <span key={r} className="inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-xs font-semibold">{ROLE_LABELS[r]}
                          <button aria-label={`Remover ${ROLE_LABELS[r]}`} onClick={() => void removeRole(u, r)}><X className="h-3 w-3 text-muted" /></button></span>
                      ))}
                      <select aria-label="Adicionar perfil" className="rounded-lg border border-nude bg-white px-2 py-1 text-xs" value="" onChange={(e) => void addRole(u, e.target.value as Role)}>
                        <option value="">+ perfil</option>{ROLES.filter((r) => !u.roles.includes(r)).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="p-4 text-muted">{formatDateTime(u.last_access_at)}</td>
                  <td className="p-4">
                    <button disabled={u.id === me} onClick={() => setConfirm(u)} title={u.id === me ? 'Você não pode desativar a si mesmo' : ''}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${u.is_active ? 'bg-olive/15 text-olive' : 'bg-red-50 text-red-800'} disabled:opacity-60`}>{u.is_active ? 'Ativo' : 'Inativo'}</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted">Nenhum usuário encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!confirm} busy={busy} danger={!!confirm?.is_active} title={confirm?.is_active ? 'Desativar usuário?' : 'Ativar usuário?'}
        confirmLabel={confirm?.is_active ? 'Desativar' : 'Ativar'} onConfirm={() => void toggleActive()} onCancel={() => setConfirm(null)}>
        {confirm?.is_active ? 'O usuário perderá o acesso imediatamente. O histórico é preservado.' : 'O usuário poderá acessar os módulos permitidos pelos perfis atribuídos.'}
      </ConfirmDialog>
      {invite && <InviteModal onClose={() => setInvite(false)} onDone={() => { setInvite(false); void load() }} />}
    </>
  )
}

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [roles, setRoles] = useState<Role[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('')
    if (!name.trim()) return setError('Informe o nome completo.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Informe um e-mail válido.')
    if (roles.length === 0) return setError('Selecione ao menos um perfil.')
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('admin-create-user', { body: { email, full_name: name.trim(), roles, redirectTo: `${window.location.origin}/redefinir-senha` } })
    setBusy(false)
    if (error || data?.error) return setError(data?.error ?? 'Não foi possível convidar. Confirme se a Edge Function admin-create-user foi publicada.')
    toast.success('Convite enviado por e-mail.'); onDone()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/50 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6" noValidate>
        <h2 className="text-lg font-semibold">Convidar usuário</h2>
        <div><label className="label" htmlFor="n">Nome completo</label><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="m">E-mail</label><input id="m" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <fieldset><legend className="label">Perfis</legend>
          <div className="grid grid-cols-2 gap-2">{ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])} /> {ROLE_LABELS[r]}</label>))}</div></fieldset>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button><button className="btn-primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar convite'}</button></div>
      </form>
    </div>
  )
}
