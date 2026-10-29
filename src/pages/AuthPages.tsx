import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Leaf } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabaseConfigured } from '@/lib/supabase'
import Logo from '@/components/Logo'

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-forest p-12 text-nude lg:flex lg:flex-col lg:justify-between">
        <Leaf className="pointer-events-none absolute -bottom-16 -right-10 h-[28rem] w-[28rem] rotate-[-18deg] text-olive/30" strokeWidth={0.6} />
        <div className="flex items-center gap-4"><Logo size={56} /><p className="font-heading text-2xl font-semibold tracking-wide text-white">LITTLE GARDEN</p></div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-snug text-white">Gestão escolar com o cuidado de um jardim.</h2>
          <p className="mt-4 text-nude/80">Secretaria, financeiro e pedagógico reunidos em um só lugar, para a direção e a equipe da escola.</p>
        </div>
        <p className="text-xs text-nude/60">Lauro de Freitas, Bahia</p>
      </section>
      <section className="flex items-center justify-center bg-cream p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><Logo size={44} /><p className="font-heading text-xl font-semibold tracking-wide">LITTLE GARDEN</p></div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
          {!supabaseConfigured && (
            <p className="mb-4 rounded-xl border border-gold/50 bg-white p-3 text-sm text-forest" role="alert">
              O Supabase ainda não foi configurado. Preencha o arquivo <code>.env.local</code> (veja <code>.env.example</code>).
            </p>
          )}
          {children}
        </div>
      </section>
    </div>
  )
}

const Err = ({ msg }: { msg: string }) => msg ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{msg}</p> : null

export function LoginPage() {
  const { signIn, session, loading } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  if (!loading && session) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault(); setError('')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Informe um e-mail válido.')
    if (password.length < 6) return setError('A senha deve ter ao menos 6 caracteres.')
    setBusy(true)
    try { await signIn(email, password); nav((loc.state as { from?: string } | null)?.from ?? '/', { replace: true }) }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Shell title="Entrar" subtitle="Acesse com o e-mail e a senha cadastrados pela escola.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div><label className="label" htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@escola.com.br" /></div>
        <div><label className="label" htmlFor="pw">Senha</label>
          <div className="relative">
            <input id="pw" type={show ? 'text' : 'password'} autoComplete="current-password" className="input pr-11" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div></div>
        <Err msg={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <p className="text-center text-sm"><Link to="/esqueci-a-senha" className="font-semibold text-olive hover:underline">Esqueci minha senha</Link></p>
      </form>
    </Shell>
  )
}

export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Informe um e-mail válido.')
    setBusy(true)
    try { await sendPasswordReset(email); setDone(true) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Shell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {done ? (
        <div className="space-y-4"><p className="rounded-xl bg-white p-4 text-sm">Se o e-mail estiver cadastrado, você receberá o link em instantes. Confira também a caixa de spam.</p>
          <Link to="/login" className="btn-secondary w-full">Voltar ao login</Link></div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div><label className="label" htmlFor="e">E-mail</label><input id="e" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <Err msg={error} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Enviando…' : 'Enviar link'}</button>
          <p className="text-center text-sm"><Link to="/login" className="font-semibold text-olive hover:underline">Voltar ao login</Link></p>
        </form>
      )}
    </Shell>
  )
}

export function ResetPasswordPage() {
  const { updatePassword, session, loading, signOut } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('')
    if (pw.length < 8) return setError('A nova senha deve ter ao menos 8 caracteres.')
    if (pw !== pw2) return setError('As senhas não conferem.')
    setBusy(true)
    try { await updatePassword(pw); await signOut(); nav('/login', { replace: true }) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Shell title="Criar nova senha" subtitle="Defina a nova senha de acesso.">
      {!loading && !session ? (
        <div className="space-y-4"><Err msg="Link inválido ou expirado. Solicite um novo link de recuperação." /><Link to="/esqueci-a-senha" className="btn-secondary w-full">Solicitar novo link</Link></div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div><label className="label" htmlFor="p1">Nova senha</label><input id="p1" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <div><label className="label" htmlFor="p2">Confirmar senha</label><input id="p2" type="password" autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          <Err msg={error} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
        </form>
      )}
    </Shell>
  )
}
