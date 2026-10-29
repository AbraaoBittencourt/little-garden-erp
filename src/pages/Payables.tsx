import { useState } from 'react'
import { CheckCircle2, Paperclip } from 'lucide-react'
import CrudPage from '@/components/CrudPage'
import Badge from '@/components/Badge'
import Modal from '@/components/Modal'
import { PageHeader } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { categoryOptions, supplierOptions } from '@/lib/options'
import { DF } from '@/lib/roles'
import { errMsg, openPrivate, todayISO, uploadPrivate, type Row } from '@/lib/db'
import { formatBRL, formatDate } from '@/lib/format'

const ST: Record<string, string> = { pendente: 'Pendente', pago: 'Pago', cancelado: 'Cancelado' }
export default function PayablesPage() {
  const toast = useToast(); const [pay, setPay] = useState<Row | null>(null); const [date, setDate] = useState(todayISO()); const [key, setKey] = useState(0)
  async function markPaid() {
    const { error } = await supabase.from('expenses').update({ status: 'pago', paid_on: date }).eq('id', pay!.id)
    if (error) return toast.error(errMsg(error)); toast.success('Pagamento registrado.'); setPay(null); setKey((k) => k + 1)
  }
  async function receipt(r: Row, f?: File) {
    if (!f) return
    try { const path = await uploadPrivate(`expenses/${r.id}`, f); const { error } = await supabase.from('expenses').update({ receipt_path: path }).eq('id', r.id); if (error) throw new Error(errMsg(error)); toast.success('Comprovante anexado.'); setKey((k) => k + 1) }
    catch (e) { toast.error((e as Error).message) }
  }
  return (
    <>
      <PageHeader title="Contas a pagar" subtitle="Despesas, fornecedores, vencimentos e comprovantes." />
      <CrudPage table="expenses" singular="Despesa" writeRoles={DF} reloadKey={key} orderBy={{ column: 'due_date', ascending: false }} searchColumns={['description', 'cost_center']}
        select="*, supplier:suppliers(name), category:expense_categories(name)" defaults={{ status: 'pendente', due_date: todayISO() }}
        filters={[{ key: 'status', label: 'Status', options: Object.entries(ST).map(([value, label]) => ({ value, label })) }, { key: 'category_id', label: 'Categoria', options: categoryOptions }, { key: 'is_fixed', label: 'Tipo', options: [{ value: '__true', label: 'Fixa' }, { value: '__false', label: 'Variável' }] }]}
        columns={[
          { key: 'due_date', label: 'Vencimento', render: (r) => formatDate(r.due_date) }, { key: 'description', label: 'Descrição', render: (r) => <span className="font-semibold">{r.description}</span> },
          { key: 'supplier', label: 'Fornecedor', render: (r) => r.supplier?.name ?? '—' }, { key: 'category', label: 'Categoria', render: (r) => r.category?.name ?? '—' },
          { key: 'amount', label: 'Valor', render: (r) => formatBRL(r.amount) }, { key: 'paid_on', label: 'Pago em', render: (r) => formatDate(r.paid_on) },
          { key: 'status', label: 'Status', render: (r) => { const late = r.status === 'pendente' && r.due_date < todayISO(); return <Badge tone={r.status === 'pago' ? 'good' : late ? 'bad' : 'neutral'}>{late ? 'Vencida' : ST[r.status]}</Badge> } },
        ]}
        fields={[
          { name: 'description', label: 'Descrição da despesa', required: true, full: true }, { name: 'supplier_id', label: 'Fornecedor', type: 'select', options: supplierOptions }, { name: 'category_id', label: 'Categoria', type: 'select', options: categoryOptions, required: true },
          { name: 'amount', label: 'Valor', type: 'currency', required: true }, { name: 'due_date', label: 'Vencimento', type: 'date', required: true },
          { name: 'status', label: 'Status', type: 'select', required: true, options: Object.entries(ST).map(([value, label]) => ({ value, label })) },
          { name: 'paid_on', label: 'Data de pagamento', type: 'date', validate: (v, f) => (f.status === 'pago' && !v ? 'Informe a data de pagamento.' : null) },
          { name: 'account', label: 'Conta utilizada' }, { name: 'cost_center', label: 'Centro de custo' }, { name: 'is_fixed', label: 'Tipo', type: 'checkbox', placeholder: 'Despesa fixa' },
        ]}
        rowActions={(r) => (<>
          {r.status === 'pendente' && <button className="rounded-lg p-2 text-olive hover:bg-cream" title="Registrar pagamento" aria-label="Registrar pagamento" onClick={() => { setDate(todayISO()); setPay(r) }}><CheckCircle2 className="h-4 w-4" /></button>}
          {r.receipt_path ? <button className="rounded-lg px-2 py-1.5 text-xs font-semibold text-olive hover:bg-cream" onClick={() => openPrivate(r.receipt_path).catch((e) => toast.error(e.message))}>Comprovante</button>
            : <label className="cursor-pointer rounded-lg p-2 hover:bg-cream" title="Anexar comprovante"><Paperclip className="h-4 w-4" /><input type="file" className="sr-only" onChange={(e) => void receipt(r, e.target.files?.[0])} /></label>}</>)} />
      {pay && <Modal title="Registrar pagamento da despesa" onClose={() => setPay(null)} footer={<><button className="btn-secondary" onClick={() => setPay(null)}>Cancelar</button><button className="btn-primary" onClick={() => void markPaid()}>Confirmar pagamento</button></>}>
        <p className="mb-3 text-sm">{pay.description} — <strong>{formatBRL(pay.amount)}</strong></p><label className="label" htmlFor="pd">Data do pagamento</label><input id="pd" type="date" className="input max-w-xs" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Modal>}
    </>
  )
}
