// Edge Function: cria/convida usuário e atribui papéis. Somente a Direção pode chamar.
// Deploy: supabase functions deploy admin-create-user
// A SUPABASE_SERVICE_ROLE_KEY é injetada automaticamente no ambiente da função (nunca vai ao frontend).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ROLES = ['direcao', 'secretaria', 'financeiro', 'coordenacao', 'professor', 'responsavel']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: u } = await caller.auth.getUser()
    if (!u.user) return json({ error: 'Não autenticado.' }, 401)
    const { data: isDir } = await caller.rpc('has_role', { r: 'direcao' })
    if (!isDir) return json({ error: 'Apenas a Direção pode criar usuários.' }, 403)

    const { email, full_name, roles, redirectTo } = await req.json()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'E-mail inválido.' }, 400)
    if (!Array.isArray(roles) || roles.length === 0 || roles.some((r: string) => !ROLES.includes(r)))
      return json({ error: 'Informe ao menos um perfil válido.' }, 400)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name }, redirectTo,
    })
    if (error) return json({ error: error.message }, 400)
    const id = data.user.id
    await admin.from('profiles').update({ is_active: true, full_name: full_name ?? '' }).eq('id', id)
    await admin.from('user_roles').insert(roles.map((role: string) => ({ user_id: id, role })))
    return json({ ok: true, id })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
