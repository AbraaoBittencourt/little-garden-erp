import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  RefreshCw, CheckCircle2, Clock, XCircle, Search, MessageSquare,
  Sparkles, Download, Phone, Calendar, ArrowRight, UserCheck, AlertTriangle,
  UserPlus, DollarSign, User, ShieldAlert, X, ChevronDown, Check
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatBRL, formatDate } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/Toast'
import { ErrorBox, PageHeader } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import ConfirmDialog from '@/components/ConfirmDialog'
import { exportCSV } from '@/lib/csv'

type RematriculaStatus =
  | 'renovacao_pendente'
  | 'contato_realizado'
  | 'documentacao_pendente'
  | 'confirmada'
  | 'cancelada'

const STATUS_LABELS: Record<RematriculaStatus, string> = {
  renovacao_pendente: 'Pendente',
  contato_realizado: 'Contato realizado',
  documentacao_pendente: 'Doc. pendente',
  confirmada: 'Confirmada 2027',
  cancelada: 'Não renovará',
}

const STATUS_BADGES: Record<RematriculaStatus, { bg: string; text: string; border: string }> = {
  renovacao_pendente: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  contato_realizado: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  documentacao_pendente: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  confirmada: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  cancelada: { bg: 'bg-stone-100', text: 'text-stone-600', border: 'border-stone-200' },
}

interface StudentRow {
  id: string
  full_name: string
  birth_date: string | null
  current_class_id: string | null
  current_class_name: string
  target_class_id: string | null
  enrollment_2027_id: string | null
  plan_id: string | null
  monthly_amount: number | null
  status_2027: RematriculaStatus
  notes_2027: string
  guardian_id: string | null
  guardian_name: string
  guardian_phone: string
  guardian_whatsapp: string
  guardian_cpf: string | null
}

interface ClassOption {
  id: string
  name: string
}

export default function RematriculaPage() {
  const toast = useToast()
  const { hasRole } = useAuth()
  const canEdit = hasRole('direcao', 'secretaria')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [students, setStudents] = useState<StudentRow[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [year2027Id, setYear2027Id] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [classFilter, setClassFilter] = useState<string>('all')
  const [confirmDialog, setConfirmDialog] = useState<{ student: StudentRow; targetClassId: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notesModal, setNotesModal] = useState<StudentRow | null>(null)
  const [newStudentModal, setNewStudentModal] = useState(false)
  const [priceModal, setPriceModal] = useState<StudentRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 1. Localiza ou cria o ano letivo de 2027
      let { data: years } = await supabase.from('school_years').select('id, year').order('year')
      let y27 = years?.find((y) => y.year === 2027)

      if (!y27) {
        const { data: createdYear } = await supabase
          .from('school_years')
          .insert({ year: 2027, starts_on: '2027-01-01', ends_on: '2027-12-31', is_current: false })
          .select('id, year')
          .maybeSingle()
        y27 = createdYear ?? undefined
      }

      const activeYear2027Id = y27?.id || null
      setYear2027Id(activeYear2027Id)

      // 2. Busca turmas
      const { data: cls } = await supabase
        .from('classes')
        .select('id, name')
        .is('archived_at', null)
        .order('name')
      setClasses(cls ?? [])

      // 3. Busca alunos ativos
      const { data: stList, error: stErr } = await supabase
        .from('students')
        .select(`
          id, full_name, birth_date, current_class_id,
          classes:current_class_id (name)
        `)
        .is('archived_at', null)
        .eq('status', 'ativo')
        .order('full_name')

      if (stErr) throw stErr

      // 4. Busca matrículas existentes para 2027 (com plano de mensalidade)
      let enrollments2027: any[] = []
      if (activeYear2027Id) {
        const { data: enList } = await supabase
          .from('enrollments')
          .select(`
            id, student_id, class_id, status, notes, plan_id,
            plan:payment_plans (monthly_amount)
          `)
          .eq('school_year_id', activeYear2027Id)
          .is('archived_at', null)
        enrollments2027 = enList ?? []
      }

      // 5. Busca responsáveis vinculados
      const { data: guardiansData } = await supabase
        .from('student_guardians')
        .select(`
          student_id, is_financial,
          guardian:guardians (id, full_name, phone, whatsapp, cpf)
        `)

      const guardianMap = new Map<string, { id: string | null; name: string; phone: string; whatsapp: string; cpf: string | null }>()
      ;(guardiansData ?? []).forEach((g: any) => {
        if (!guardianMap.has(g.student_id) || g.is_financial) {
          guardianMap.set(g.student_id, {
            id: g.guardian?.id || null,
            name: g.guardian?.full_name || '',
            phone: g.guardian?.phone || '',
            whatsapp: g.guardian?.whatsapp || g.guardian?.phone || '',
            cpf: g.guardian?.cpf || null,
          })
        }
      })

      const enrollmentMap = new Map<string, any>()
      enrollments2027.forEach((e) => enrollmentMap.set(e.student_id, e))

      const mapped: StudentRow[] = (stList ?? []).map((s: any) => {
        const en = enrollmentMap.get(s.id)
        const guard = guardianMap.get(s.id) || { id: null, name: 'Não vinculado', phone: '', whatsapp: '', cpf: null }

        // Extrai valor da mensalidade do plano ou de anotações
        let monthlyAmount = en?.plan?.monthly_amount ? Number(en.plan.monthly_amount) : null
        if (!monthlyAmount && en?.notes) {
          const match = en.notes.match(/R\$\s*([\d.,]+)/)
          if (match) {
            monthlyAmount = parseFloat(match[1].replace('.', '').replace(',', '.'))
          }
        }

        return {
          id: s.id,
          full_name: s.full_name,
          birth_date: s.birth_date,
          current_class_id: s.current_class_id,
          current_class_name: s.classes?.name || 'Sem turma',
          target_class_id: en?.class_id || s.current_class_id,
          enrollment_2027_id: en?.id || null,
          plan_id: en?.plan_id || null,
          monthly_amount: monthlyAmount,
          status_2027: (en?.status as RematriculaStatus) || 'renovacao_pendente',
          notes_2027: en?.notes || '',
          guardian_id: guard.id,
          guardian_name: guard.name,
          guardian_phone: guard.phone,
          guardian_whatsapp: guard.whatsapp,
          guardian_cpf: guard.cpf,
        }
      })

      setStudents(mapped)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados da rematrícula.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Salvar alteração rápida de status
  async function handleStatusChange(student: StudentRow, newStatus: RematriculaStatus) {
    if (!year2027Id) {
      toast.error('Ano letivo 2027 não configurado no banco.')
      return
    }

    try {
      if (student.enrollment_2027_id) {
        const { error } = await supabase
          .from('enrollments')
          .update({ status: newStatus, class_id: student.target_class_id })
          .eq('id', student.enrollment_2027_id)
        if (error) throw error
      } else {
        const { data: newEn, error } = await supabase
          .from('enrollments')
          .insert({
            student_id: student.id,
            school_year_id: year2027Id,
            class_id: student.target_class_id,
            status: newStatus,
            notes: student.notes_2027 || 'Rematrícula 2027',
          })
          .select('id')
          .single()
        if (error) throw error
        student.enrollment_2027_id = newEn.id
      }

      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, status_2027: newStatus } : s))
      )
      toast.success(`Status de ${student.full_name} atualizado: ${STATUS_LABELS[newStatus]}`)
    } catch (err: any) {
      toast.error('Erro ao atualizar: ' + err.message)
    }
  }

  // Confirmar rematrícula definitiva
  async function handleConfirmRematricula() {
    if (!confirmDialog || !year2027Id) return
    setBusy(true)
    const { student, targetClassId } = confirmDialog

    try {
      if (student.enrollment_2027_id) {
        const { error } = await supabase
          .from('enrollments')
          .update({
            status: 'confirmada',
            class_id: targetClassId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', student.enrollment_2027_id)
        if (error) throw error
      } else {
        const { data: newEn, error } = await supabase
          .from('enrollments')
          .insert({
            student_id: student.id,
            school_year_id: year2027Id,
            class_id: targetClassId,
            status: 'confirmada',
            notes: 'Rematrícula confirmada para o ano letivo de 2027.',
          })
          .select('id')
          .single()
        if (error) throw error
        student.enrollment_2027_id = newEn.id
      }

      setStudents((prev) =>
        prev.map((s) =>
          s.id === student.id
            ? { ...s, status_2027: 'confirmada', target_class_id: targetClassId }
            : s
        )
      )
      toast.success(`Rematrícula 2027 confirmada com sucesso para ${student.full_name}!`)
      setConfirmDialog(null)
    } catch (err: any) {
      toast.error('Erro ao confirmar rematrícula: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  // Atualizar valor da mensalidade do aluno
  async function handleSavePrice(studentId: string, amount: number) {
    if (!year2027Id) return
    const st = students.find((s) => s.id === studentId)
    if (!st) return

    try {
      // 1. Cria ou busca um plano de pagamento com este valor
      let planId: string | null = null
      const { data: existingPlan } = await supabase
        .from('payment_plans')
        .select('id')
        .eq('monthly_amount', amount)
        .limit(1)
        .maybeSingle()

      if (existingPlan) {
        planId = existingPlan.id
      } else {
        const { data: newPlan } = await supabase
          .from('payment_plans')
          .insert({
            name: `Mensalidade 2027 (${formatBRL(amount)})`,
            monthly_amount: amount,
            installments: 12,
            due_day: 10,
          })
          .select('id')
          .single()
        if (newPlan) planId = newPlan.id
      }

      // 2. Atualiza na matrícula de 2027
      const notesWithPrice = `${st.notes_2027 ? `${st.notes_2027} | ` : ''}Mensalidade 2027: ${formatBRL(amount)}`
      if (st.enrollment_2027_id) {
        await supabase
          .from('enrollments')
          .update({
            plan_id: planId,
            notes: notesWithPrice,
          })
          .eq('id', st.enrollment_2027_id)
      } else {
        const { data: newEn } = await supabase
          .from('enrollments')
          .insert({
            student_id: st.id,
            school_year_id: year2027Id,
            class_id: st.target_class_id,
            plan_id: planId,
            status: st.status_2027,
            notes: notesWithPrice,
          })
          .select('id')
          .single()
        if (newEn) st.enrollment_2027_id = newEn.id
      }

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? { ...s, monthly_amount: amount, plan_id: planId, notes_2027: notesWithPrice }
            : s
        )
      )
      toast.success(`Mensalidade de ${st.full_name} atualizada para ${formatBRL(amount)}`)
      setPriceModal(null)
    } catch (err: any) {
      toast.error('Erro ao salvar valor: ' + err.message)
    }
  }

  // Salvar anotações
  async function handleSaveNotes(studentId: string, notes: string) {
    if (!year2027Id) return
    const st = students.find((s) => s.id === studentId)
    if (!st) return

    try {
      if (st.enrollment_2027_id) {
        await supabase
          .from('enrollments')
          .update({ notes })
          .eq('id', st.enrollment_2027_id)
      } else {
        const { data } = await supabase
          .from('enrollments')
          .insert({
            student_id: st.id,
            school_year_id: year2027Id,
            class_id: st.target_class_id,
            status: st.status_2027,
            notes,
          })
          .select('id')
          .single()
        if (data) st.enrollment_2027_id = data.id
      }

      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, notes_2027: notes } : s))
      )
      toast.success('Observações salvas.')
      setNotesModal(null)
    } catch (err: any) {
      toast.error('Erro ao salvar observação: ' + err.message)
    }
  }

  // Envio de WhatsApp com mensagem de rematrícula
  function openWhatsApp(student: StudentRow) {
    const rawPhone = (student.guardian_whatsapp || student.guardian_phone || '').replace(/\D/g, '')
    if (!rawPhone) {
      toast.error('O responsável não possui telefone/WhatsApp cadastrado.')
      return
    }

    const phone = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`
    const priceText = student.monthly_amount
      ? ` com o valor de mensalidade de *${formatBRL(student.monthly_amount)}*`
      : ''
    const msg = encodeURIComponent(
      `Olá, ${student.guardian_name}! 🌿 Escola Little Garden.\n\nEstamos iniciando o período de Rematrícula para o Ano Letivo de 2027 do(a) aluno(a) *${student.full_name}*${priceText}.\n\nGaranta a vaga e as condições especiais de renovação para 2027. Podemos enviar o contrato digital para assinatura?`
    )
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  // Filtros
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const term = search.toLowerCase()
      const matchesSearch =
        !term ||
        s.full_name.toLowerCase().includes(term) ||
        s.guardian_name.toLowerCase().includes(term)
      const matchesStatus = statusFilter === 'all' || s.status_2027 === statusFilter
      const matchesClass = classFilter === 'all' || s.current_class_id === classFilter
      return matchesSearch && matchesStatus && matchesClass
    })
  }, [students, search, statusFilter, classFilter])

  // KPIs
  const stats = useMemo(() => {
    const total = students.length
    const confirmed = students.filter((s) => s.status_2027 === 'confirmada').length
    const inProgress = students.filter(
      (s) => s.status_2027 === 'contato_realizado' || s.status_2027 === 'documentacao_pendente'
    ).length
    const pending = students.filter((s) => s.status_2027 === 'renovacao_pendente').length
    const rate = total > 0 ? Math.round((confirmed / total) * 100) : 0
    const projectedRevenue = students
      .filter((s) => s.status_2027 === 'confirmada' && s.monthly_amount)
      .reduce((acc, s) => acc + (s.monthly_amount || 0), 0)

    return { total, confirmed, inProgress, pending, rate, projectedRevenue }
  }, [students])

  // Exportar lista
  function handleExport() {
    exportCSV(
      'rematriculas-2027',
      [
        { key: 'aluno', label: 'Aluno' },
        { key: 'turma_atual', label: 'Turma Atual (2026)' },
        { key: 'turma_destino', label: 'Turma Destino (2027)' },
        { key: 'responsavel_financeiro', label: 'Responsável Financeiro' },
        { key: 'cpf_responsavel', label: 'CPF Responsável' },
        { key: 'telefone', label: 'Telefone/WhatsApp' },
        { key: 'mensalidade', label: 'Mensalidade 2027' },
        { key: 'status', label: 'Status Rematrícula' },
        { key: 'notas', label: 'Observações' },
      ],
      filteredStudents.map((s) => ({
        aluno: s.full_name,
        turma_atual: s.current_class_name,
        turma_destino: classes.find((c) => c.id === s.target_class_id)?.name || 'A definir',
        responsavel_financeiro: s.guardian_name,
        cpf_responsavel: s.guardian_cpf || '-',
        telefone: s.guardian_whatsapp || s.guardian_phone || '-',
        mensalidade: s.monthly_amount ? formatBRL(s.monthly_amount) : 'A definir',
        status: STATUS_LABELS[s.status_2027],
        notas: s.notes_2027,
      }))
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanha de Rematrícula 2027"
        subtitle="Acompanhamento, renovações e matrícula de novos alunos com definição de mensalidade e responsável financeiro."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary flex items-center gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" /> Exportar CSV
            </button>
            {canEdit && (
              <button
                className="btn-primary flex items-center gap-2 bg-[#687653] hover:bg-[#525e41]"
                onClick={() => setNewStudentModal(true)}
              >
                <UserPlus className="h-4 w-4" /> Cadastrar Novo Aluno (2027)
              </button>
            )}
            <button className="btn-secondary p-2.5" onClick={() => void load()} title="Atualizar dados">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* KPI Cards da Campanha 2027 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Total de Alunos (2027)</p>
          <p className="mt-1 text-2xl font-bold text-forest">{stats.total}</p>
          <p className="mt-1 text-[11px] text-muted">Base de renovação e novos</p>
        </div>

        <div className="card p-4 border-l-4 border-l-emerald-600">
          <p className="text-xs font-semibold text-emerald-800">Confirmadas (2027)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.confirmed}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-medium">Vagas garantidas para 2027</p>
        </div>

        <div className="card p-4">
          <p className="text-xs font-semibold text-blue-800">Em contato / Doc</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{stats.inProgress}</p>
          <p className="mt-1 text-[11px] text-muted">Aguardando assinatura</p>
        </div>

        <div className="card p-4">
          <p className="text-xs font-semibold text-amber-800">Pendentes</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{stats.pending}</p>
          <p className="mt-1 text-[11px] text-muted">Aguardando contato</p>
        </div>

        <div className="card p-4 bg-forest text-nude">
          <p className="text-xs font-semibold text-nude/80">Receita Mensal Confirmada</p>
          <p className="mt-1 text-2xl font-bold text-white">{formatBRL(stats.projectedRevenue)}</p>
          <p className="mt-1 text-[11px] text-nude/70">Retenção: {stats.rate}%</p>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            className="input w-full pl-10"
            placeholder="Buscar por nome do aluno ou responsável..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input text-xs py-2 px-3 w-auto"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="all">Todas as turmas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="input text-xs py-2 px-3 w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela de Rematrícula e Novos Alunos */}
      {loading ? (
        <Loading label="Carregando campanha de rematrícula 2027..." />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => void load()} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-nude bg-[#FAF7F2]/60 text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="p-4">Aluno</th>
                  <th className="p-4">Turma Atual</th>
                  <th className="p-4">Turma Pretendida (2027)</th>
                  <th className="p-4">Responsável Financeiro</th>
                  <th className="p-4">Mensalidade 2027</th>
                  <th className="p-4">Status 2027</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nude/60">
                {filteredStudents.map((st) => {
                  const badge = STATUS_BADGES[st.status_2027]
                  const isConfirmed = st.status_2027 === 'confirmada'

                  return (
                    <tr key={st.id} className="hover:bg-cream/40 transition-colors">
                      <td className="p-4">
                        <p className="font-semibold text-forest">{st.full_name}</p>
                        {st.birth_date && (
                          <p className="text-xs text-muted">Nasc: {formatDate(st.birth_date)}</p>
                        )}
                        {st.notes_2027 && (
                          <p className="mt-1 text-[11px] text-muted italic line-clamp-1">
                            "{st.notes_2027}"
                          </p>
                        )}
                      </td>

                      <td className="p-4">
                        <span className="rounded-lg bg-cream px-2.5 py-1 text-xs font-medium text-forest border border-nude">
                          {st.current_class_name}
                        </span>
                      </td>

                      <td className="p-4">
                        <select
                          className="input py-1.5 px-2.5 text-xs w-full max-w-[170px]"
                          value={st.target_class_id || ''}
                          disabled={isConfirmed}
                          onChange={(e) => {
                            const newTarget = e.target.value || null
                            setStudents((prev) =>
                              prev.map((s) =>
                                s.id === st.id ? { ...s, target_class_id: newTarget } : s
                              )
                            )
                          }}
                        >
                          <option value="">A definir para 2027</option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Responsável Financeiro */}
                      <td className="p-4">
                        <div className="flex items-start gap-2">
                          <User className="h-4 w-4 mt-0.5 text-olive shrink-0" />
                          <div>
                            <p className="font-semibold text-xs text-forest">{st.guardian_name}</p>
                            {st.guardian_cpf && (
                              <p className="text-[11px] text-muted">CPF: {st.guardian_cpf}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] text-muted">
                                {st.guardian_whatsapp || st.guardian_phone || 'Sem telefone'}
                              </span>
                              {(st.guardian_whatsapp || st.guardian_phone) && (
                                <button
                                  type="button"
                                  onClick={() => openWhatsApp(st)}
                                  title="Abrir WhatsApp com o Responsável Financeiro"
                                  className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                                >
                                  <MessageSquare className="h-3 w-3" /> WhatsApp
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Valor da Mensalidade */}
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => setPriceModal(st)}
                          title="Clique para definir ou alterar o valor da mensalidade"
                          className="group inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-cream/70 px-2.5 py-1 text-xs text-forest hover:bg-gold/20 transition-colors"
                        >
                          <DollarSign className="h-3.5 w-3.5 text-olive" />
                          <span className="font-bold">
                            {st.monthly_amount ? formatBRL(st.monthly_amount) : 'Definir valor'}
                          </span>
                        </button>
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <select
                          className={`rounded-full px-3 py-1 text-xs font-semibold border cursor-pointer ${badge.bg} ${badge.text} ${badge.border}`}
                          value={st.status_2027}
                          onChange={(e) =>
                            void handleStatusChange(st, e.target.value as RematriculaStatus)
                          }
                        >
                          {Object.entries(STATUS_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Ações */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn-secondary text-xs py-1 px-2.5"
                            onClick={() => setNotesModal(st)}
                            title="Anotações sobre a renovação"
                          >
                            Notas
                          </button>

                          {!isConfirmed ? (
                            <button
                              type="button"
                              className="btn-primary text-xs py-1 px-3 flex items-center gap-1.5"
                              onClick={() =>
                                setConfirmDialog({
                                  student: st,
                                  targetClassId: st.target_class_id || st.current_class_id || '',
                                })
                              }
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>Confirmar 2027</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 px-2 py-1">
                              <CheckCircle2 className="h-4 w-4" /> Vaga 2027
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted">
                      Nenhum aluno encontrado para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Cadastrar Novo Aluno 2027 */}
      {newStudentModal && (
        <NewStudentModal
          classes={classes}
          year2027Id={year2027Id}
          onClose={() => setNewStudentModal(false)}
          onSuccess={() => {
            setNewStudentModal(false)
            void load()
          }}
        />
      )}

      {/* Modal de Definir / Editar Valor da Mensalidade */}
      {priceModal && (
        <PriceModal
          student={priceModal}
          onClose={() => setPriceModal(null)}
          onSave={(amount) => void handleSavePrice(priceModal.id, amount)}
        />
      )}

      {/* Diálogo de Confirmação de Rematrícula */}
      <ConfirmDialog
        open={!!confirmDialog}
        busy={busy}
        title="Confirmar Rematrícula para 2027?"
        confirmLabel="Sim, confirmar vaga 2027"
        onConfirm={() => void handleConfirmRematricula()}
        onCancel={() => setConfirmDialog(null)}
      >
        <div className="space-y-2 text-sm">
          <p>Você está confirmando a renovação de matrícula do(a) aluno(a):</p>
          <p className="font-semibold text-forest text-base">{confirmDialog?.student.full_name}</p>
          <p className="text-muted text-xs">
            Responsável Financeiro: <strong>{confirmDialog?.student.guardian_name}</strong>
          </p>
          <p className="text-muted text-xs">
            Turma prevista para 2027:{' '}
            <strong>
              {classes.find((c) => c.id === confirmDialog?.targetClassId)?.name || 'Turma a definir'}
            </strong>
          </p>
          {confirmDialog?.student.monthly_amount && (
            <p className="text-emerald-800 font-semibold text-xs">
              Valor da Mensalidade: {formatBRL(confirmDialog.student.monthly_amount)}
            </p>
          )}
        </div>
      </ConfirmDialog>

      {/* Modal de Anotações */}
      {notesModal && (
        <NotesModal
          student={notesModal}
          onClose={() => setNotesModal(null)}
          onSave={(notes) => void handleSaveNotes(notesModal.id, notes)}
        />
      )}
    </div>
  )
}

/** Modal de Cadastro de Novo Aluno para 2027 */
function NewStudentModal({
  classes,
  year2027Id,
  onClose,
  onSuccess,
}: {
  classes: ClassOption[]
  year2027Id: string | null
  onClose: () => void
  onSuccess: () => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Dados do Aluno
  const [studentName, setStudentName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [studentCpf, setStudentCpf] = useState('')
  const [targetClassId, setTargetClassId] = useState('')
  const [shift, setShift] = useState<'manha' | 'tarde' | 'integral'>('manha')

  // Dados do Responsável Financeiro
  const [guardianName, setGuardianName] = useState('')
  const [relationship, setRelationship] = useState('Mãe')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [guardianWhatsapp, setGuardianWhatsapp] = useState('')
  const [guardianCpf, setGuardianCpf] = useState('')
  const [guardianEmail, setGuardianEmail] = useState('')

  // Financeiro
  const [monthlyPrice, setMonthlyPrice] = useState('750,00')
  const [dueDay, setDueDay] = useState('10')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!studentName.trim()) return setError('Informe o nome completo do aluno.')
    if (!guardianName.trim()) return setError('Informe o nome do responsável financeiro.')
    if (!guardianPhone.trim() && !guardianWhatsapp.trim()) {
      return setError('Informe ao menos um telefone/WhatsApp de contato do responsável.')
    }
    const priceNum = parseFloat(monthlyPrice.replace(/\./g, '').replace(',', '.'))
    if (isNaN(priceNum) || priceNum < 0) {
      return setError('Informe um valor de mensalidade válido.')
    }

    setBusy(true)
    try {
      // 1. Cadastra o aluno
      const { data: student, error: stErr } = await supabase
        .from('students')
        .insert({
          full_name: studentName.trim(),
          birth_date: birthDate || null,
          cpf: studentCpf || null,
          current_class_id: targetClassId || null,
          shift,
          status: 'ativo',
        })
        .select('id')
        .single()

      if (stErr) throw stErr

      // 2. Cadastra o responsável financeiro
      const whatsappVal = guardianWhatsapp.trim() || guardianPhone.trim()
      const { data: guardian, error: gdErr } = await supabase
        .from('guardians')
        .insert({
          full_name: guardianName.trim(),
          cpf: guardianCpf || null,
          phone: guardianPhone.trim() || null,
          whatsapp: whatsappVal || null,
          email: guardianEmail.trim() || null,
        })
        .select('id')
        .single()

      if (gdErr) throw gdErr

      // 3. Vincula como responsável financeiro
      const { error: linkErr } = await supabase.from('student_guardians').insert({
        student_id: student.id,
        guardian_id: guardian.id,
        relationship,
        is_financial: true,
        is_legal: true,
        can_pickup: true,
        is_emergency_contact: true,
      })

      if (linkErr) throw linkErr

      // 4. Cria plano de pagamento com o valor da mensalidade informado
      let planId: string | null = null
      const { data: existingPlan } = await supabase
        .from('payment_plans')
        .select('id')
        .eq('monthly_amount', priceNum)
        .limit(1)
        .maybeSingle()

      if (existingPlan) {
        planId = existingPlan.id
      } else {
        const { data: newPlan } = await supabase
          .from('payment_plans')
          .insert({
            name: `Mensalidade 2027 (${formatBRL(priceNum)})`,
            monthly_amount: priceNum,
            installments: 12,
            due_day: parseInt(dueDay, 10) || 10,
          })
          .select('id')
          .single()
        if (newPlan) planId = newPlan.id
      }

      // 5. Cria a matrícula no ano letivo 2027
      if (year2027Id) {
        const fullNotes = `Novo aluno cadastrado 2027. Resp. Financeiro: ${guardianName.trim()}. Mensalidade: ${formatBRL(priceNum)}${notes.trim() ? ` | Obs: ${notes.trim()}` : ''}`
        await supabase.from('enrollments').insert({
          student_id: student.id,
          school_year_id: year2027Id,
          class_id: targetClassId || null,
          plan_id: planId,
          status: 'confirmada',
          notes: fullNotes,
        })
      }

      toast.success(`Aluno ${studentName.trim()} cadastrado e matriculado com sucesso para 2027!`)
      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar o cadastro do novo aluno.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="card w-full max-w-2xl p-6 sm:p-7 space-y-5 shadow-2xl my-6">
        <div className="flex items-center justify-between border-b border-nude pb-3">
          <div>
            <h2 className="text-lg font-bold text-forest flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-olive" />
              Cadastrar Novo Aluno — Ano Letivo 2027
            </h2>
            <p className="text-xs text-muted">
              Preencha os dados do aluno, o responsável financeiro e o valor da mensalidade escolar.
            </p>
          </div>
          <button type="button" className="text-muted hover:text-forest" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* SEÇÃO 1: DADOS DO ALUNO */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-olive border-b border-nude/70 pb-1">
              1. Dados do Aluno
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Nome Completo do Aluno *</label>
                <input
                  className="input"
                  placeholder="Ex: Theo Silva Santos"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Data de Nascimento</label>
                <input
                  type="date"
                  className="input"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>

              <div>
                <label className="label">CPF do Aluno (quando houver)</label>
                <input
                  className="input"
                  placeholder="000.000.000-00"
                  value={studentCpf}
                  onChange={(e) => setStudentCpf(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Turma Pretendida (2027) *</label>
                <select
                  className="input"
                  value={targetClassId}
                  onChange={(e) => setTargetClassId(e.target.value)}
                >
                  <option value="">Selecione a turma...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Turno</label>
                <select
                  className="input"
                  value={shift}
                  onChange={(e) => setShift(e.target.value as any)}
                >
                  <option value="manha">Manhã</option>
                  <option value="tarde">Tarde</option>
                  <option value="integral">Integral</option>
                </select>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: RESPONSÁVEL FINANCEIRO */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-olive border-b border-nude/70 pb-1">
              2. Responsável Financeiro
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Nome Completo do Responsável Financeiro *</label>
                <input
                  className="input"
                  placeholder="Ex: Juliana Silva Santos"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Grau de Parentesco</label>
                <select
                  className="input"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                >
                  <option value="Mãe">Mãe</option>
                  <option value="Pai">Pai</option>
                  <option value="Avó/Avô">Avó / Avô</option>
                  <option value="Tio/Tia">Tio / Tia</option>
                  <option value="Responsável Legal">Responsável Legal</option>
                </select>
              </div>

              <div>
                <label className="label">CPF do Responsável Financeiro</label>
                <input
                  className="input"
                  placeholder="000.000.000-00"
                  value={guardianCpf}
                  onChange={(e) => setGuardianCpf(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Telefone / Celular *</label>
                <input
                  className="input"
                  placeholder="(71) 98888-7777"
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="label">WhatsApp para Cobranças e Recados</label>
                <input
                  className="input"
                  placeholder="(71) 98888-7777"
                  value={guardianWhatsapp}
                  onChange={(e) => setGuardianWhatsapp(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="label">E-mail do Responsável</label>
                <input
                  type="email"
                  className="input"
                  placeholder="responsavel@email.com"
                  value={guardianEmail}
                  onChange={(e) => setGuardianEmail(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: MENSALIDADE E CONDIÇÕES */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-olive border-b border-nude/70 pb-1">
              3. Mensalidade Escolar (2027)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Valor da Mensalidade (R$) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-muted text-sm">
                    R$
                  </span>
                  <input
                    className="input pl-10 font-bold text-forest text-base"
                    placeholder="750,00"
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label">Dia do Vencimento</label>
                <select className="input" value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
                  <option value="5">Dia 05</option>
                  <option value="10">Dia 10 (Padrão)</option>
                  <option value="15">Dia 15</option>
                  <option value="20">Dia 20</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="label">Observações e Acordos Financeiros</label>
                <textarea
                  className="input min-h-[70px]"
                  rows={2}
                  placeholder="Ex: Desconto de irmão de 10% aplicado; inclusão de taxa de material no primeiro boleto..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-nude">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Gravando no banco...' : 'Confirmar e Cadastrar Aluno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Modal para Definir ou Editar o Valor da Mensalidade */
function PriceModal({
  student,
  onClose,
  onSave,
}: {
  student: StudentRow
  onClose: () => void
  onSave: (amount: number) => void
}) {
  const [val, setVal] = useState(student.monthly_amount ? String(student.monthly_amount) : '750,00')
  const [error, setError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const num = parseFloat(val.replace(/\./g, '').replace(',', '.'))
    if (isNaN(num) || num <= 0) {
      setError('Informe um valor de mensalidade válido.')
      return
    }
    onSave(num)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-sm p-6 space-y-4 shadow-2xl">
        <h2 className="text-lg font-bold text-forest">Definir Mensalidade 2027</h2>
        <p className="text-xs text-muted">
          Aluno: <strong>{student.full_name}</strong>
          <br />
          Responsável Financeiro: <strong>{student.guardian_name}</strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Valor da Mensalidade (R$)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-muted text-sm">
                R$
              </span>
              <input
                className="input pl-10 font-bold text-forest text-lg"
                placeholder="0,00"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-nude">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar Valor
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Modal de Anotações */
function NotesModal({
  student,
  onClose,
  onSave,
}: {
  student: StudentRow
  onClose: () => void
  onSave: (notes: string) => void
}) {
  const [text, setText] = useState(student.notes_2027)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl">
        <h2 className="text-lg font-bold text-forest">Anotações da Rematrícula 2027</h2>
        <p className="text-xs text-muted">
          Aluno: <strong>{student.full_name}</strong> | Resp. Financeiro: {student.guardian_name}
        </p>
        <div>
          <label className="label">Histórico de contato ou pendências financeiras</label>
          <textarea
            className="input min-h-[120px]"
            rows={4}
            placeholder="Ex: Mãe pediu para aguardar o dia 10 para assinar o contrato; solicitou mudança de turno para a tarde..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-nude">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={() => onSave(text)}>
            Salvar anotação
          </button>
        </div>
      </div>
    </div>
  )
}
