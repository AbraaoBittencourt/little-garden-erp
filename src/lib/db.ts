import { supabase } from './supabase'

export type Row = Record<string, any>

/** Traduz erros do PostgREST/Postgres para mensagens claras em português. */
export function errMsg(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return ''
  const m = e.message ?? ''
  if (e.code === '23505') return 'Já existe um registro com esses dados (duplicidade).'
  if (e.code === '23503') return 'Não é possível concluir: existem registros vinculados a este item.'
  if (e.code === '23514') return 'Algum valor informado não é permitido. Revise os campos.'
  if (e.code === '42501' || /row-level security|permission denied/i.test(m)) return 'Você não tem permissão para esta operação.'
  if (/fetch|network/i.test(m)) return 'Falha de conexão. Verifique sua internet e tente novamente.'
  if (e.code === 'P0001' || /^[A-ZÀ-Ú]/.test(m) && m.length < 160 && !/^(JWT|Could not|relation|column)/.test(m)) return m
  return 'Não foi possível concluir a operação. Tente novamente.'
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

export function safeName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
}

/** Envia arquivo ao bucket privado 'documents'. Retorna o caminho gravado. */
export async function uploadPrivate(path: string, file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error('O arquivo deve ter até 10 MB.')
  const full = `${path}/${crypto.randomUUID()}-${safeName(file.name)}`
  const { error } = await supabase.storage.from('documents').upload(full, file, { contentType: file.type || undefined })
  if (error) throw new Error('Falha ao enviar o arquivo. Verifique sua permissão e tente novamente.')
  return full
}

export async function openPrivate(path: string) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60)
  if (error || !data) throw new Error('Não foi possível abrir o arquivo.')
  window.open(data.signedUrl, '_blank', 'noopener')
}

export function derivedInvoiceStatus(status: string, dueDate: string): 'pendente' | 'pago' | 'parcialmente_pago' | 'vencido' | 'cancelado' {
  if ((status === 'pendente' || status === 'parcialmente_pago') && dueDate < todayISO()) return 'vencido'
  return status as any
}
export const INVOICE_LABEL: Record<string, string> = { pendente: 'Pendente', pago: 'Pago', parcialmente_pago: 'Parcialmente pago', vencido: 'Vencido', cancelado: 'Cancelado' }
export const SHIFT_LABEL: Record<string, string> = { manha: 'Manhã', tarde: 'Tarde', integral: 'Integral' }
export const STUDENT_STATUS: Record<string, string> = { pre_matricula: 'Pré-matrícula', ativo: 'Ativo', transferido: 'Transferido', concluido: 'Concluído', inativo: 'Inativo' }
export const ENROLL_STATUS: Record<string, string> = { interessado: 'Interessado', pre_matricula: 'Pré-matrícula', documentacao_pendente: 'Documentação pendente', confirmada: 'Matrícula confirmada', renovacao_pendente: 'Renovação pendente', cancelada: 'Cancelada', lista_espera: 'Lista de espera' }
export const METHOD_LABEL: Record<string, string> = { pix: 'PIX', dinheiro: 'Dinheiro', cartao: 'Cartão', transferencia: 'Transferência bancária', boleto: 'Boleto' }
export const ATT_LABEL: Record<string, string> = { presente: 'Presente', ausente: 'Ausente', falta_justificada: 'Falta justificada' }
export const CLASS_STATUS: Record<string, string> = { planejada: 'Planejada', ativa: 'Ativa', encerrada: 'Encerrada' }
export const WORK_STATUS: Record<string, string> = { ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' }
export const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }))

/** Busca todas as páginas de uma consulta (PostgREST limita 1000 linhas por chamada). */
export async function fetchAll<T = Row>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>, max = 20000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(errMsg(error))
    out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break
  }
  return out
}
