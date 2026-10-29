import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Upload } from 'lucide-react'
import CrudPage from '@/components/CrudPage'
import Badge from '@/components/Badge'
import Modal from '@/components/Modal'
import { PageHeader } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { classOptions, stageOptions } from '@/lib/options'
import { DS } from '@/lib/roles'
import { SHIFT_LABEL, STUDENT_STATUS, errMsg, opts, type Row } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { downloadFile, parseCSV } from '@/lib/csv'
import { isValidCPF, maskCPF } from '@/lib/masks'
import type { FieldDef } from '@/components/Fields'

export const studentFields: FieldDef[] = [
  { name: 'full_name', label: 'Nome completo', required: true, full: true },
  { name: 'birth_date', label: 'Data de nascimento', type: 'date', required: true },
  { name: 'cpf', label: 'CPF (quando aplicável)', type: 'cpf' },
  { name: 'document_id', label: 'Documento de identificação' },
  { name: 'address', label: 'Endereço', full: true },
  { name: 'city', label: 'Cidade' }, { name: 'zip_code', label: 'CEP', type: 'cep' },
  { name: 'stage_id', label: 'Etapa de ensino', type: 'select', options: stageOptions },
  { name: 'current_class_id', label: 'Turma atual', type: 'select', options: classOptions, hint: 'A turma é atualizada automaticamente quando uma matrícula é confirmada.' },
  { name: 'shift', label: 'Turno', type: 'select', options: opts(SHIFT_LABEL) },
  { name: 'admitted_on', label: 'Data de ingresso', type: 'date' },
  { name: 'status', label: 'Status', type: 'select', required: true, options: opts(STUDENT_STATUS) },
]

export default function StudentsPage() {
  const [imp, setImp] = useState(false); const [key, setKey] = useState(0)
  return (
    <>
      <PageHeader title="Alunos" subtitle="Cadastro, busca e acompanhamento. Clique no nome para abrir a ficha completa." />
      <CrudPage table="students" singular="Aluno" archive reloadKey={key}
        select="*, class:classes(name), stage:education_stages(name)"
        searchColumns={['full_name', 'cpf', 'document_id']} orderBy={{ column: 'full_name' }}
        writeRoles={DS} deleteRoles={DS} defaults={{ status: 'pre_matricula', city: 'Lauro de Freitas' }}
        filters={[{ key: 'status', label: 'Status', options: opts(STUDENT_STATUS) }, { key: 'stage_id', label: 'Etapa', options: stageOptions }, { key: 'current_class_id', label: 'Turma', options: classOptions }]}
        columns={[
          { key: 'full_name', label: 'Aluno', render: (r) => <Link className="font-semibold text-olive hover:underline" to={`/alunos/${r.id}`}>{r.full_name}</Link> },
          { key: 'birth_date', label: 'Nascimento', render: (r) => formatDate(r.birth_date) },
          { key: 'class', label: 'Turma', render: (r) => r.class?.name ?? '—' },
          { key: 'stage', label: 'Etapa', render: (r) => r.stage?.name ?? '—' },
          { key: 'shift', label: 'Turno', render: (r) => (r.shift ? SHIFT_LABEL[r.shift] : '—') },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={r.status === 'ativo' ? 'good' : r.status === 'pre_matricula' ? 'warn' : 'neutral'}>{STUDENT_STATUS[r.status]}</Badge> },
        ]}
        fields={studentFields}
        extraActions={<ImportButton onClick={() => setImp(true)} />}
      />
      {imp && <ImportModal onClose={() => setImp(false)} onDone={() => { setImp(false); setKey((k) => k + 1) }} />}
    </>
  )
}

function ImportButton({ onClick }: { onClick: () => void }) {
  const { hasRole } = (useAuthLite())
  return hasRole ? <button className="btn-secondary" onClick={onClick}><Upload className="h-4 w-4" /> Importar CSV</button> : null
}
import { useAuth } from '@/contexts/AuthContext'
function useAuthLite() { const { hasRole } = useAuth(); return { hasRole: hasRole(...DS) } }

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z]+/g, '_')
const ALIAS: Record<string, string> = { nome: 'full_name', nome_completo: 'full_name', aluno: 'full_name', data_de_nascimento: 'birth_date', nascimento: 'birth_date', data_nascimento: 'birth_date', cpf: 'cpf', documento: 'document_id', rg: 'document_id', endereco: 'address', cidade: 'city', cep: 'zip_code', turno: 'shift' }

function toISODate(v: string): string | null {
  const t = v.trim(); if (!t) return null
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t); if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t); return m ? t : 'INVALID'
}

interface Parsed { line: number; data: Row; errors: string[] }

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast(); const ref = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Parsed[] | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  async function onFile(f?: File) {
    if (!f) return; setErr('')
    const table = parseCSV(await f.text())
    if (table.length < 2) return setErr('O arquivo está vazio ou sem linhas de dados.')
    const head = table[0].map((h) => ALIAS[norm(h)] ?? null)
    if (!head.includes('full_name')) return setErr('Coluna obrigatória não encontrada: "nome". Baixe o modelo para conferir.')
    const cpfs = table.slice(1).map((r) => (r[head.indexOf('cpf')] ?? '').replace(/\D/g, '')).filter(Boolean)
    const { data: existing } = cpfs.length ? await supabase.from('students').select('cpf').in('cpf', cpfs.map(maskCPF)) : { data: [] }
    const known = new Set((existing ?? []).map((x: any) => x.cpf))
    const seen = new Set<string>()
    const parsed: Parsed[] = table.slice(1).map((r, i) => {
      const data: Row = {}; const errors: string[] = []
      head.forEach((k, j) => { if (k) data[k] = (r[j] ?? '').trim() })
      if (!data.full_name) errors.push('nome obrigatório')
      const d = toISODate(data.birth_date ?? ''); if (d === 'INVALID') errors.push('data inválida (use DD/MM/AAAA)'); data.birth_date = d === 'INVALID' ? null : d
      if (data.cpf) { if (!isValidCPF(data.cpf)) errors.push('CPF inválido'); else { data.cpf = maskCPF(data.cpf); if (known.has(data.cpf)) errors.push('CPF já cadastrado'); if (seen.has(data.cpf)) errors.push('CPF repetido no arquivo'); seen.add(data.cpf) } } else data.cpf = null
      if (data.shift) { const s = norm(data.shift); data.shift = s.startsWith('man') ? 'manha' : s.startsWith('tar') ? 'tarde' : s.startsWith('int') ? 'integral' : null }
      else data.shift = null
      Object.keys(data).forEach((k) => data[k] === '' && (data[k] = null))
      data.status = 'pre_matricula'; data.city = data.city ?? 'Lauro de Freitas'
      return { line: i + 2, data, errors }
    })
    setRows(parsed)
  }
  const ok = rows?.filter((r) => r.errors.length === 0) ?? []
  async function confirm() {
    setBusy(true)
    const { error } = await supabase.from('students').insert(ok.map((r) => r.data))
    setBusy(false)
    if (error) return setErr(errMsg(error))
    toast.success(`${ok.length} aluno(s) importado(s).`); onDone()
  }
  return (
    <Modal title="Importar alunos por CSV" wide onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button>{rows && <button className="btn-primary" disabled={busy || ok.length === 0} onClick={() => void confirm()}>{busy ? 'Importando…' : `Importar ${ok.length} linha(s) válida(s)`}</button>}</>}>
      <p className="text-sm text-muted">Colunas aceitas: nome (obrigatória), data de nascimento, CPF, documento, endereço, cidade, CEP, turno. Os alunos entram como <strong>pré-matrícula</strong>. Nada é gravado antes da sua confirmação.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => downloadFile('modelo_alunos.csv', '\ufeffnome;data de nascimento;cpf;documento;endereco;cidade;cep;turno\r\n', 'text/csv;charset=utf-8')}><Download className="h-4 w-4" /> Baixar modelo</button>
        <button className="btn-primary" onClick={() => ref.current?.click()}><Upload className="h-4 w-4" /> Escolher arquivo</button>
        <input ref={ref} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {err && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{err}</p>}
      {rows && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-nude">
          <table className="w-full text-left text-sm"><thead className="bg-cream text-muted"><tr><th className="p-2.5">Linha</th><th className="p-2.5">Nome</th><th className="p-2.5">Nascimento</th><th className="p-2.5">Validação</th></tr></thead>
            <tbody>{rows.slice(0, 200).map((r) => (
              <tr key={r.line} className="border-t border-nude/60"><td className="p-2.5">{r.line}</td><td className="p-2.5">{r.data.full_name ?? '—'}</td><td className="p-2.5">{formatDate(r.data.birth_date)}</td>
                <td className="p-2.5">{r.errors.length ? <Badge tone="bad">{r.errors.join('; ')}</Badge> : <Badge tone="good">OK</Badge>}</td></tr>))}</tbody></table>
          {rows.length > 200 && <p className="p-2.5 text-xs text-muted">Mostrando as 200 primeiras de {rows.length} linhas.</p>}
        </div>
      )}
    </Modal>
  )
}
