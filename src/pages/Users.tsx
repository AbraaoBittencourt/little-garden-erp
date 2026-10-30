import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  UserPlus, X, Shield, CheckCircle2, Clock, Search,
  KeyRound, Copy, Check, Eye, EyeOff, Sparkles, Filter, ChevronDown
} from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS, ROLE_COLORS, type Profile, type Role } from '@/lib/types'
import { formatDateTime } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/Toast'
import { ErrorBox, PageHeader } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import ConfirmDialog from '@/components/ConfirmDialog'

const ROLES: Role[] = ['direcao', 'secretaria', 'financeiro', 'coordenacao', 'professor', 'responsavel']
type Row = Profile & { roles: Role[] }

export default function UsersPage() {
  const { session } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [inviteModal, setInviteModal] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState<Row | null>(null)
  const [resetModal, setResetModal] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const me = session?.user.id

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, phone, is_active, last_access_at').order('full_name'),
      supabase.from('user_roles').select('user_id, role'),
    ])
    if (p.error || r.error) {
      setError((p.error ?? r.error)!.message)
    } else {
      const map = new Map<string, Role[]>()
      ;(r.data as { user_id: string; role: Role }[]).forEach((x) =>
        map.set(x.user_id, [...(map.get(x.user_id) ?? []), x.role])
      )
      setRows((p.data as Profile[]).map((u) => ({ ...u, roles: map.get(u.id) ?? [] })))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function addRole(u: Row, role: Role) {
    if (!role || u.roles.includes(role)) return
    const { error } = await supabase.from('user_roles').insert({ user_id: u.id, role })
    if (error) {
      toast.error('Não foi possível adicionar o perfil.')
    } else {
      toast.success(`Perfil ${ROLE_LABELS[role]} atribuído.`)
      void load()
    }
  }

  async function removeRole(u: Row, role: Role) {
    if (u.id === me && role === 'direcao') {
      toast.error('Você não pode remover seu próprio perfil de Direção.')
      return
    }
    const { error } = await supabase.from('user_roles').delete().eq('user_id', u.id).eq('role', role)
    if (error) {
      toast.error('Não foi possível remover o perfil.')
    } else {
      toast.success('Perfil removido.')
      void load()
    }
  }

  async function toggleActive() {
    if (!confirmToggle) return
    setBusy(true)
    const nextStatus = !confirmToggle.is_active
    const { error } = await supabase.from('profiles').update({ is_active: nextStatus }).eq('id', confirmToggle.id)
    setBusy(false)
    setConfirmToggle(null)
    if (error) {
      toast.error('Não foi possível alterar o status.')
    } else {
      toast.success(nextStatus ? 'Usuário ativado com sucesso.' : 'Usuário desativado.')
      void load()
    }
  }

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const term = search.toLowerCase()
      const matchesSearch =
        !term ||
        (r.full_name || '').toLowerCase().includes(term) ||
        (r.email || '').toLowerCase().includes(term)
      const matchesRole = roleFilter === 'all' || r.roles.includes(roleFilter as Role)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && r.is_active) ||
        (statusFilter === 'inactive' && !r.is_active)
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [rows, search, roleFilter, statusFilter])

  const stats = useMemo(() => {
    const total = rows.length
    const active = rows.filter((r) => r.is_active).length
    const inactive = total - active
    const rolesCount = new Set(rows.flatMap((r) => r.roles)).size
    return { total, active, inactive, rolesCount }
  }, [rows])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Usuários e Acessos"
        subtitle="Gerencie logins, permissões e políticas de controle de acesso por setor da escola."
        actions={
          <button className="btn-primary flex items-center gap-2" onClick={() => setInviteModal(true)}>
            <UserPlus className="h-4 w-4" /> Convidar / Novo usuário
          </button>
        }
      />

      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest/10 text-forest">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted">Total de usuários</p>
            <p className="text-2xl font-bold text-forest">{stats.total}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-olive/15 text-olive">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted">Usuários ativos</p>
            <p className="text-2xl font-bold text-olive">{stats.active}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-700">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted">Acessos inativos</p>
            <p className="text-2xl font-bold text-red-700">{stats.inactive}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/20 text-forest">
            <Filter className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted">Setores configurados</p>
            <p className="text-2xl font-bold text-forest">{stats.rolesCount} de {ROLES.length}</p>
          </div>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            className="input w-full pl-10"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input text-xs py-2 px-3 w-auto"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">Todos os perfis</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>

          <select
            className="input text-xs py-2 px-3 w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="active">Apenas Ativos</option>
            <option value="inactive">Apenas Inativos</option>
          </select>
        </div>
      </div>

      {/* Tabela de Usuários */}
      {loading ? (
        <Loading label="Carregando usuários e permissões..." />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => void load()} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-nude bg-[#FAF7F2]/60 text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="p-4">Usuário</th>
                  <th className="p-4">Perfis e Setores</th>
                  <th className="p-4">Último Acesso</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nude/60">
                {filteredRows.map((u) => {
                  const isCurrent = u.id === me
                  const initials = (u.full_name || u.email || 'U')
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((n) => n[0].toUpperCase())
                    .join('')

                  return (
                    <tr key={u.id} className="hover:bg-cream/40 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-bold text-nude">
                            {initials}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-forest">{u.full_name || '(Sem nome cadastrado)'}</p>
                              {isCurrent && (
                                <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">
                                  Você
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {u.roles.map((r) => {
                            const c = ROLE_COLORS[r]
                            return (
                              <span
                                key={r}
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}
                              >
                                {ROLE_LABELS[r]}
                                <button
                                  type="button"
                                  aria-label={`Remover perfil ${ROLE_LABELS[r]}`}
                                  onClick={() => void removeRole(u, r)}
                                  className="opacity-60 hover:opacity-100 hover:text-red-700 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            )
                          })}

                          {/* Seletor rápido para adicionar novo perfil */}
                          {ROLES.filter((r) => !u.roles.includes(r)).length > 0 && (
                            <div className="relative inline-block">
                              <select
                                aria-label="Adicionar perfil"
                                className="cursor-pointer rounded-full border border-dashed border-muted/50 bg-white px-2.5 py-1 text-xs text-muted hover:border-forest hover:text-forest transition-colors appearance-none pr-5"
                                value=""
                                onChange={(e) => void addRole(u, e.target.value as Role)}
                              >
                                <option value="" disabled>+ Adicionar</option>
                                {ROLES.filter((r) => !u.roles.includes(r)).map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABELS[r]}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted" />
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="p-4 text-xs text-muted">
                        {u.last_access_at ? (
                          formatDateTime(u.last_access_at)
                        ) : (
                          <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
                            Nunca acessou
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <button
                          disabled={isCurrent}
                          onClick={() => setConfirmToggle(u)}
                          title={isCurrent ? 'Você não pode desativar o seu próprio usuário' : 'Clique para alternar o status'}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-transform active:scale-95 ${
                            u.is_active
                              ? 'bg-olive/15 text-olive hover:bg-olive/25'
                              : 'bg-red-50 text-red-800 hover:bg-red-100'
                          } disabled:opacity-60 disabled:pointer-events-none`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-olive' : 'bg-red-600'}`} />
                          {u.is_active ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>

                      <td className="p-4 text-right">
                        <button
                          type="button"
                          className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1.5"
                          onClick={() => setResetModal(u)}
                          title="Redefinir senha de acesso"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>Senha</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted">
                      Nenhum usuário corresponde aos filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Diálogo de confirmação de Ativar / Desativar */}
      <ConfirmDialog
        open={!!confirmToggle}
        busy={busy}
        danger={!!confirmToggle?.is_active}
        title={confirmToggle?.is_active ? 'Desativar acesso do usuário?' : 'Ativar usuário?'}
        confirmLabel={confirmToggle?.is_active ? 'Sim, desativar' : 'Sim, ativar'}
        onConfirm={() => void toggleActive()}
        onCancel={() => setConfirmToggle(null)}
      >
        {confirmToggle?.is_active
          ? `O usuário ${confirmToggle?.full_name || confirmToggle?.email} perderá o acesso ao painel imediatamente.`
          : `O usuário ${confirmToggle?.full_name || confirmToggle?.email} poderá acessar os módulos permitidos pelos seus perfis.`}
      </ConfirmDialog>

      {/* Modal de Convidar / Criar Usuário */}
      {inviteModal && (
        <CreateUserModal
          onClose={() => setInviteModal(false)}
          onDone={() => {
            setInviteModal(false)
            void load()
          }}
        />
      )}

      {/* Modal de Redefinir Senha */}
      {resetModal && (
        <ResetPasswordModal
          user={resetModal}
          onClose={() => setResetModal(null)}
        />
      )}
    </div>
  )
}

function CreateUserModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [roles, setRoles] = useState<Role[]>(['secretaria'])
  const [isActive, setIsActive] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; pass: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function generateSecurePassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    let p = 'LG@'
    for (let i = 0; i < 6; i++) p += chars[Math.floor(Math.random() * chars.length)]
    p += '27!'
    setPassword(p)
  }

  useEffect(() => {
    generateSecurePassword()
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Informe o nome completo do usuário.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Informe um e-mail válido.')
    if (!password || password.length < 6) return setError('A senha deve ter pelo menos 6 caracteres.')
    if (roles.length === 0) return setError('Selecione pelo menos um perfil de acesso.')

    setBusy(true)
    const cleanEmail = email.trim()
    const cleanName = name.trim()
    const cleanPassword = password

    try {
      // 1. Tenta criar com cliente isolado sem derrubar a sessão do admin
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      const isolatedClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      })

      const { data: signUpData, error: signUpError } = await isolatedClient.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          data: { full_name: cleanName }
        }
      })

      if (signUpError) {
        throw new Error(signUpError.message)
      }

      const newUserId = signUpData.user?.id
      if (!newUserId) {
        throw new Error('Não foi possível registrar o usuário na autenticação.')
      }

      // 2. Atualiza o perfil e papéis no banco com a sessão do admin
      await supabase
        .from('profiles')
        .update({ is_active: isActive, full_name: cleanName })
        .eq('id', newUserId)

      // 3. Insere os papéis
      if (roles.length > 0) {
        await supabase
          .from('user_roles')
          .insert(roles.map((r) => ({ user_id: newUserId, role: r })))
      }

      toast.success('Usuário criado com sucesso no banco de dados!')
      setCreatedCredentials({ email: cleanEmail, pass: cleanPassword })
    } catch (err: unknown) {
      setError((err as Error).message || 'Erro ao criar usuário.')
    } finally {
      setBusy(false)
    }
  }

  function copyCredentials() {
    if (!createdCredentials) return
    const text = `Acesso ao Little Garden ERP:\nURL: ${window.location.origin}\nE-mail: ${createdCredentials.email}\nSenha provisória: ${createdCredentials.pass}`
    void navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Credenciais copiadas para a área de transferência!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="card w-full max-w-lg space-y-5 p-6 sm:p-7 shadow-2xl">
        {createdCredentials ? (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-olive/15 text-olive">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-forest">Login criado com sucesso!</h2>
              <p className="mt-1 text-sm text-muted">
                O usuário já está registrado e liberado para acessar os módulos permitidos.
              </p>
            </div>

            <div className="rounded-xl border border-gold/40 bg-cream/70 p-4 text-left space-y-2 text-sm">
              <div>
                <span className="text-xs font-semibold text-muted">E-MAIL DE ACESSO:</span>
                <p className="font-mono font-semibold text-forest select-all">{createdCredentials.email}</p>
              </div>
              <div>
                <span className="text-xs font-semibold text-muted">SENHA TEMPORÁRIA:</span>
                <p className="font-mono font-semibold text-forest select-all">{createdCredentials.pass}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary flex items-center justify-center gap-2"
                onClick={copyCredentials}
              >
                {copied ? <Check className="h-4 w-4 text-olive" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado!' : 'Copiar dados de acesso'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onDone}
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="flex items-center justify-between border-b border-nude pb-3">
              <div>
                <h2 className="text-lg font-bold text-forest">Novo Usuário / Convidar Login</h2>
                <p className="text-xs text-muted">Cadastre o acesso e atribua os perfis por setor escolar.</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-muted hover:bg-nude/40 hover:text-forest"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="label" htmlFor="user-name">
                Nome completo *
              </label>
              <input
                id="user-name"
                className="input"
                placeholder="Ex: Maria Clara Santos"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="label" htmlFor="user-email">
                E-mail institucional ou de login *
              </label>
              <input
                id="user-email"
                type="email"
                className="input"
                placeholder="nome@escola.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0" htmlFor="user-pw">
                  Senha inicial / provisória *
                </label>
                <button
                  type="button"
                  className="text-xs font-semibold text-olive hover:underline inline-flex items-center gap-1"
                  onClick={generateSecurePassword}
                >
                  <Sparkles className="h-3 w-3" /> Gerar nova senha
                </button>
              </div>
              <div className="relative">
                <input
                  id="user-pw"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10 font-mono text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-forest"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="label">
                Perfis e Setores de Acesso * <span className="text-xs font-normal text-muted">(Múltipla escolha)</span>
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => {
                  const checked = roles.includes(r)
                  const isFinance = r === 'financeiro'
                  const isDir = r === 'direcao'

                  return (
                    <label
                      key={r}
                      className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer text-xs transition-colors ${
                        checked ? 'border-olive bg-olive/10 font-semibold text-forest' : 'border-nude hover:bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-nude text-olive focus:ring-olive"
                        checked={checked}
                        onChange={() => {
                          setRoles(
                            checked ? roles.filter((x) => x !== r) : [...roles, r]
                          )
                        }}
                      />
                      <div>
                        <p>{ROLE_LABELS[r]}</p>
                        <p className="text-[10px] font-normal text-muted">
                          {isDir
                            ? 'Acesso total irrestrito (inclui Financeiro)'
                            : isFinance
                            ? 'Acesso ao setor Financeiro'
                            : r === 'secretaria'
                            ? 'Alunos, matrículas, turmas e docs'
                            : r === 'coordenacao'
                            ? 'Pedagógico, diário e turmas'
                            : r === 'professor'
                            ? 'Diário e turmas próprias'
                            : 'Acesso aos filhos'}
                        </p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="rounded-xl bg-cream/70 p-3 border border-nude/80">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-forest">
                <input
                  type="checkbox"
                  className="rounded border-nude text-olive focus:ring-olive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>Ativar acesso imediatamente (usuário poderá entrar assim que receber a senha)</span>
              </label>
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-nude">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Cadastrando no banco...' : 'Cadastrar Usuário'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function ResetPasswordModal({ user, onClose }: { user: Row; onClose: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSendEmail() {
    if (!user.email) return
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/redefinir-senha`
    })
    setBusy(false)
    if (error) {
      toast.error('Não foi possível enviar o e-mail de recuperação.')
    } else {
      toast.success(`E-mail com instruções enviado para ${user.email}`)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-nude pb-3">
          <h2 className="text-lg font-bold text-forest">Redefinir Senha</h2>
          <button type="button" className="text-muted hover:text-forest" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-muted">
          Você pode enviar um link de redefinição para o e-mail do usuário <strong>{user.full_name || user.email}</strong>.
        </p>

        <div className="rounded-xl bg-cream p-3 text-xs text-forest">
          <p className="font-semibold">Destinatário:</p>
          <p className="font-mono">{user.email}</p>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-nude">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={handleSendEmail} disabled={busy}>
            {busy ? 'Enviando e-mail...' : 'Enviar Link por E-mail'}
          </button>
        </div>
      </div>
    </div>
  )
}
