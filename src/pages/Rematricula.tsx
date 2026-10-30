import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, CheckCircle2, Clock, XCircle, Search, MessageSquare,
  Sparkles, Download, Phone, Calendar, ArrowRight, UserCheck, AlertTriangle
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
  status_2027: RematriculaStatus
  notes_2027: string
  guardian_name: string
  guardian_phone: string
  guardian_whatsapp: string
}

interface ClassOption {
  id: string
  name: string
}

export default function RematriculaPage() {
  const toast = useToast()
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

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 1. Localiza ou cria o ano letivo de 2027
      let { data: years } = await supabase.from('school_years').select('id, year').order('year')
      let y27 = years?.find((y) => y.year === 2027)

      if (!y27) {
        // Se ainda não existir ano 2027, tenta criar
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

      // 4. Busca matrículas existentes para o ano letivo de 2027
      let enrollments2027: any[] = []
      if (activeYear2027Id) {
        const { data: enList } = await supabase
          .from('enrollments')
          .select('id, student_id, class_id, status, notes')
          .eq('school_year_id', activeYear2027Id)
          .is('archived_at', null)
        enrollments2027 = enList ?? []
      }

      // 5. Busca responsáveis vinculados
      const { data: guardiansData } = await supabase
        .from('student_guardians')
        .select(`
          student_id, is_financial,
          guardian:guardians (full_name, phone, whatsapp)
        `)

      const guardianMap = new Map<string, { name: string; phone: string; whatsapp: string }>()
      ;(guardiansData ?? []).forEach((g: any) => {
        if (!guardianMap.has(g.student_id) || g.is_financial) {
          guardianMap.set(g.student_id, {
            name: g.guardian?.full_name || '',
            phone: g.guardian?.phone || '',
            whatsapp: g.guardian?.whatsapp || g.guardian?.phone || '',
          })
        }
      })

      const enrollmentMap = new Map<string, any>()
      enrollments2027.forEach((e) => enrollmentMap.set(e.student_id, e))

      const mapped: StudentRow[] = (stList ?? []).map((s: any) => {
        const en = enrollmentMap.get(s.id)
        const guard = guardianMap.get(s.id) || { name: 'Não vinculado', phone: '', whatsapp: '' }
        return {
          id: s.id,
          full_name: s.full_name,
          birth_date: s.birth_date,
          current_class_id: s.current_class_id,
          current_class_name: s.classes?.name || 'Sem turma',
          target_class_id: en?.class_id || s.current_class_id,
          enrollment_2027_id: en?.id || null,
          status_2027: (en?.status as RematriculaStatus) || 'renovacao_pendente',
          notes_2027: en?.notes || '',
          guardian_name: guard.name,
          guardian_phone: guard.phone,
          guardian_whatsapp: guard.whatsapp,
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
        // Atualiza a matrícula existente de 2027
        const { error } = await supabase
          .from('enrollments')
          .update({ status: newStatus, class_id: student.target_class_id })
          .eq('id', student.enrollment_2027_id)
        if (error) throw error
      } else {
        // Cria nova matrícula para 2027
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

  // Salvar observações de rematrícula
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

  // Envio de WhatsApp com mensagem personalizada de rematrícula
  function openWhatsApp(student: StudentRow) {
    const rawPhone = (student.guardian_whatsapp || student.guardian_phone || '').replace(/\D/g, '')
    if (!rawPhone) {
      toast.error('O responsável não possui telefone/WhatsApp cadastrado.')
      return
    }

    const phone = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`
    const msg = encodeURIComponent(
      `Olá, ${student.guardian_name}! 🌿 Escola Little Garden.\n\nEstamos iniciando o período de Rematrícula para o Ano Letivo de 2027 do(a) aluno(a) *${student.full_name}*.\n\nGaranta a vaga e as condições especiais de renovação para 2027. Como podemos te ajudar com a documentação?`
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
    const cancelled = students.filter((s) => s.status_2027 === 'cancelada').length
    const rate = total > 0 ? Math.round((confirmed / total) * 100) : 0
    return { total, confirmed, inProgress, pending, cancelled, rate }
  }, [students])

  // Exportar lista
  function handleExport() {
    exportCSV(
      'rematriculas-2027',
      [
        { key: 'aluno', label: 'Aluno' },
        { key: 'turma_atual', label: 'Turma Atual (2026)' },
        { key: 'turma_destino', label: 'Turma Destino (2027)' },
        { key: 'responsavel', label: 'Responsável' },
        { key: 'telefone', label: 'Telefone/WhatsApp' },
        { key: 'status', label: 'Status Rematrícula' },
        { key: 'notas', label: 'Observações' },
      ],
      filteredStudents.map((s) => ({
        aluno: s.full_name,
        turma_atual: s.current_class_name,
        turma_destino: classes.find((c) => c.id === s.target_class_id)?.name || 'A definir',
        responsavel: s.guardian_name,
        telefone: s.guardian_whatsapp || s.guardian_phone || '-',
        status: STATUS_LABELS[s.status_2027],
        notas: s.notes_2027,
      }))
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanha de Rematrícula 2027"
        subtitle="Acompanhamento e renovação de matrícula dos alunos para o Ano Letivo de 2027."
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary flex items-center gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" /> Exportar lista CSV
            </button>
            <button className="btn-primary flex items-center gap-2" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" /> Atualizar dados
            </button>
          </div>
        }
      />

      {/* KPI Cards da Campanha 2027 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Base de Alunos (2026)</p>
          <p className="mt-1 text-2xl font-bold text-forest">{stats.total}</p>
          <p className="mt-1 text-[11px] text-muted">Elegíveis para renovação</p>
        </div>

        <div className="card p-4 border-l-4 border-l-emerald-600">
          <p className="text-xs font-semibold text-emerald-800">Confirmadas (2027)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.confirmed}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-medium">Vagas garantidas para 2027</p>
        </div>

        <div className="card p-4">
          <p className="text-xs font-semibold text-blue-800">Em contato / Doc</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{stats.inProgress}</p>
          <p className="mt-1 text-[11px] text-muted">Em processo com os pais</p>
        </div>

        <div className="card p-4">
          <p className="text-xs font-semibold text-amber-800">Ainda pendentes</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{stats.pending}</p>
          <p className="mt-1 text-[11px] text-muted">Aguardando primeiro contato</p>
        </div>

        <div className="card p-4 bg-forest text-nude">
          <p className="text-xs font-semibold text-nude/80">Taxa de Retenção</p>
          <p className="mt-1 text-2xl font-bold text-white">{stats.rate}%</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-gold rounded-full" style={{ width: `${stats.rate}%` }} />
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
            <option value="all">Todas as turmas atuais</option>
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
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela de Alunos para Rematrícula */}
      {loading ? (
        <Loading label="Carregando campanha de rematrícula 2027..." />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => void load()} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-nude bg-[#FAF7F2]/60 text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="p-4">Aluno</th>
                  <th className="p-4">Turma Atual</th>
                  <th className="p-4">Turma Pretendida (2027)</th>
                  <th className="p-4">Responsável & Contato</th>
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
                          className="input py-1.5 px-2.5 text-xs w-full max-w-[190px]"
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

                      <td className="p-4">
                        <p className="font-medium text-xs text-forest">{st.guardian_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted">
                            {st.guardian_whatsapp || st.guardian_phone || 'Sem telefone'}
                          </span>
                          {(st.guardian_whatsapp || st.guardian_phone) && (
                            <button
                              type="button"
                              onClick={() => openWhatsApp(st)}
                              title="Abrir mensagem de Rematrícula no WhatsApp"
                              className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                            >
                              <MessageSquare className="h-3 w-3" /> WhatsApp
                            </button>
                          )}
                        </div>
                      </td>

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
                              <CheckCircle2 className="h-4 w-4" /> Rematriculado
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted">
                      Nenhum aluno encontrado para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
          <p>
            Você está confirmando a renovação de matrícula do(a) aluno(a):
          </p>
          <p className="font-semibold text-forest text-base">
            {confirmDialog?.student.full_name}
          </p>
          <p className="text-muted text-xs">
            Turma prevista para 2027:{' '}
            <strong>
              {classes.find((c) => c.id === confirmDialog?.targetClassId)?.name ||
                'A mesma turma atual ou a definir'}
            </strong>
          </p>
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
          Aluno: <strong>{student.full_name}</strong> | Responsável: {student.guardian_name}
        </p>
        <div>
          <label className="label">Histórico de contato ou pendências</label>
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
