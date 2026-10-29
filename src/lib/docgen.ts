import { supabase } from './supabase'
import { getSchool, schoolName } from './school'
import { textPDF } from './pdf'
import { formatBRL, formatDate } from './format'
import { SHIFT_LABEL, ENROLL_STATUS, safeName } from './db'

export type DocKind = 'declaracao_matricula' | 'comprovante_matricula' | 'ficha_cadastral' | 'contrato'
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  declaracao_matricula: 'Declaração de matrícula', comprovante_matricula: 'Comprovante de matrícula',
  ficha_cadastral: 'Ficha cadastral', contrato: 'Contrato de prestação de serviços educacionais',
}
export const PLACEHOLDERS = ['escola_nome', 'escola_razao_social', 'escola_cnpj', 'escola_endereco', 'escola_cidade', 'escola_telefone', 'escola_email',
  'aluno_nome', 'aluno_nascimento', 'aluno_cpf', 'aluno_endereco', 'turma', 'etapa', 'turno', 'ano_letivo', 'situacao_matricula',
  'responsavel_nome', 'responsavel_cpf', 'responsavel_telefone', 'plano_nome', 'mensalidade', 'parcelas', 'dia_vencimento', 'bolsa', 'data_hoje']

export const DEFAULT_TEMPLATES: Record<DocKind, string> = {
  declaracao_matricula: `DECLARAÇÃO DE MATRÍCULA\n\nDeclaramos, para os devidos fins, que {{aluno_nome}}, nascido(a) em {{aluno_nascimento}}, encontra-se regularmente matriculado(a) nesta instituição no ano letivo de {{ano_letivo}}, na turma {{turma}} ({{etapa}}), turno {{turno}}.\n\n{{escola_cidade}}, {{data_hoje}}.\n\n\n______________________________________\n{{escola_razao_social}}\nCNPJ {{escola_cnpj}}`,
  comprovante_matricula: `COMPROVANTE DE MATRÍCULA\n\nAluno(a): {{aluno_nome}}\nData de nascimento: {{aluno_nascimento}}\nResponsável: {{responsavel_nome}} (CPF {{responsavel_cpf}})\nAno letivo: {{ano_letivo}}\nEtapa: {{etapa}}\nTurma: {{turma}}\nTurno: {{turno}}\nSituação: {{situacao_matricula}}\nPlano: {{plano_nome}} — {{parcelas}} parcelas de {{mensalidade}}, vencimento todo dia {{dia_vencimento}}\nBolsa/desconto: {{bolsa}}\n\n{{escola_cidade}}, {{data_hoje}}.\n\n{{escola_razao_social}} — CNPJ {{escola_cnpj}}\n{{escola_endereco}} — {{escola_telefone}} — {{escola_email}}`,
  ficha_cadastral: `FICHA CADASTRAL DO ALUNO\n\nDADOS DO ALUNO\nNome: {{aluno_nome}}\nNascimento: {{aluno_nascimento}}\nCPF: {{aluno_cpf}}\nEndereço: {{aluno_endereco}}\n\nMATRÍCULA\nAno letivo: {{ano_letivo}} | Etapa: {{etapa}} | Turma: {{turma}} | Turno: {{turno}}\nSituação: {{situacao_matricula}}\n\nRESPONSÁVEL\nNome: {{responsavel_nome}}\nCPF: {{responsavel_cpf}}\nTelefone: {{responsavel_telefone}}\n\n{{escola_cidade}}, {{data_hoje}}.`,
  contrato: `[MODELO PADRÃO — REVISAR COM ASSESSORIA JURÍDICA ANTES DE USAR]\n\nCONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS\n\nCONTRATADA: {{escola_razao_social}}, CNPJ {{escola_cnpj}}, com sede em {{escola_endereco}}.\nCONTRATANTE: {{responsavel_nome}}, CPF {{responsavel_cpf}}, responsável pelo(a) aluno(a) {{aluno_nome}}.\n\nCLÁUSULA 1ª — OBJETO. Prestação de serviços educacionais na etapa {{etapa}}, turma {{turma}}, turno {{turno}}, no ano letivo de {{ano_letivo}}.\n\nCLÁUSULA 2ª — VALOR E PAGAMENTO. O valor da mensalidade é de {{mensalidade}}, em {{parcelas}} parcelas, com vencimento todo dia {{dia_vencimento}}. Bolsa/desconto aplicado: {{bolsa}}.\n\nCLÁUSULA 3ª — ATRASO. Multa e juros conforme parâmetros definidos pela escola e acordados entre as partes.\n\nCLÁUSULA 4ª — VIGÊNCIA E RESCISÃO. [Definir com a escola.]\n\nCLÁUSULA 5ª — PROTEÇÃO DE DADOS. Os dados pessoais do aluno e do responsável serão tratados conforme a Lei nº 13.709/2018 (LGPD), exclusivamente para as finalidades escolares.\n\n{{escola_cidade}}, {{data_hoje}}.\n\n\n______________________________   ______________________________\nContratada                        Contratante`,
}

export function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '—')
}

/** Reúne os dados reais (nada inventado) e gera o PDF a partir do modelo ativo ou do padrão. */
export async function generateDocument(kind: DocKind, studentId: string, enrollmentId?: string) {
  const school = await getSchool(true)
  const missing = ([['razão social', school.legal_name], ['CNPJ', school.cnpj], ['endereço', school.address]] as const).filter(([, v]) => !v).map(([n]) => n)
  if (missing.length) throw new Error(`Cadastre os dados oficiais da escola em Configurações antes de gerar documentos (faltam: ${missing.join(', ')}).`)

  const { data: st, error } = await supabase.from('students').select('*').eq('id', studentId).maybeSingle()
  if (error || !st) throw new Error('Aluno não encontrado.')
  let eq = supabase.from('enrollments').select('*, class:classes(name, shift, stage:education_stages(name)), year:school_years(year), plan:payment_plans(name, monthly_amount, installments, due_day), scholarship:scholarships(name, discount_percent)').eq('student_id', studentId).neq('status', 'cancelada').order('created_at', { ascending: false }).limit(1)
  if (enrollmentId) eq = supabase.from('enrollments').select('*, class:classes(name, shift, stage:education_stages(name)), year:school_years(year), plan:payment_plans(name, monthly_amount, installments, due_day), scholarship:scholarships(name, discount_percent)').eq('id', enrollmentId).limit(1)
  const { data: enr } = await eq
  const e: any = enr?.[0]
  const { data: links } = await supabase.from('student_guardians').select('is_financial, guardian:guardians(full_name, cpf, phone)').eq('student_id', studentId)
  const g: any = (links ?? []).find((l: any) => l.is_financial)?.guardian ?? (links ?? [])[0]?.guardian

  const vars: Record<string, string> = {
    escola_nome: schoolName(school), escola_razao_social: school.legal_name ?? '', escola_cnpj: school.cnpj ?? '',
    escola_endereco: [school.address, school.city, school.state].filter(Boolean).join(', '), escola_cidade: school.city ?? '',
    escola_telefone: school.phone ?? '', escola_email: school.email ?? '',
    aluno_nome: st.full_name, aluno_nascimento: formatDate(st.birth_date), aluno_cpf: st.cpf ?? '—',
    aluno_endereco: [st.address, st.city, st.zip_code].filter(Boolean).join(', ') || '—',
    turma: e?.class?.name ?? '—', etapa: e?.class?.stage?.name ?? '—', turno: e?.class?.shift ? SHIFT_LABEL[e.class.shift] : '—',
    ano_letivo: e?.year?.year ? String(e.year.year) : '—', situacao_matricula: e ? ENROLL_STATUS[e.status] : '—',
    responsavel_nome: g?.full_name ?? '—', responsavel_cpf: g?.cpf ?? '—', responsavel_telefone: g?.phone ?? '—',
    plano_nome: e?.plan?.name ?? '—', mensalidade: e?.plan ? formatBRL(e.plan.monthly_amount) : '—',
    parcelas: e?.plan ? String(e.plan.installments) : '—', dia_vencimento: e?.plan ? String(e.plan.due_day) : '—',
    bolsa: e?.scholarship ? `${e.scholarship.name} (${e.scholarship.discount_percent}%)` : 'Nenhuma',
    data_hoje: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
  }
  if ((kind === 'contrato' || kind === 'comprovante_matricula' || kind === 'declaracao_matricula') && !e) throw new Error('O aluno ainda não possui matrícula.')

  const { data: tpl } = await supabase.from('document_templates').select('body').eq('kind', kind).eq('is_active', true).order('updated_at', { ascending: false }).limit(1)
  const body = renderTemplate((tpl?.[0] as any)?.body ?? DEFAULT_TEMPLATES[kind], vars)
  await textPDF({ title: DOC_KIND_LABEL[kind], body, filename: `${kind}_${safeName(st.full_name)}.pdf` })
}
