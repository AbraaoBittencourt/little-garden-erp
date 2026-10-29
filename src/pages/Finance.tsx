import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Banknote, CalendarClock, GraduationCap, HandCoins, Percent, PiggyBank, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import CrudPage from '@/components/CrudPage'
import Tabs from '@/components/Tabs'
import Badge from '@/components/Badge'
import { ErrorBox, PageHeader, StatCard } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { errMsg } from '@/lib/db'
import { DF, DSF } from '@/lib/roles'
import { formatBRL, MONTHS, MONTHS_SHORT } from '@/lib/format'
import { Link } from 'react-router-dom'

function Panel() {
  const now = new Date(); const [year, setYear] = useState(now.getFullYear()); const [month, setMonth] = useState(now.getMonth() + 1)
  const { data: d, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.rpc('finance_summary', { p_year: year, p_month: month }); if (error) throw new Error(errMsg(error)); return data as Record<string, any>
  }, [year, month])
  const years = [year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i)
  const result = d ? d.received - d.paid_out : 0
  return (
    <div>
      <div className="card mb-6 flex flex-wrap gap-3 p-4"><select aria-label="Mês" className="input !w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <select aria-label="Ano" className="input !w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        <Link className="btn-secondary ml-auto" to="/relatorios">Relatórios financeiros</Link></div>
      {error ? <ErrorBox message={error} onRetry={() => void reload()} /> : loading && !d ? <Loading /> : d && (
        <div className={loading ? 'opacity-60' : ''}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Receita prevista (vencimentos do mês)" value={formatBRL(d.expected)} icon={Wallet} />
            <StatCard label="Receita recebida" value={formatBRL(d.received)} icon={TrendingUp} tone="good" />
            <StatCard label="Contas a receber (em aberto)" value={formatBRL(d.receivable_open)} icon={HandCoins} />
            <StatCard label="Contas a pagar (em aberto)" value={formatBRL(d.payable_open)} icon={Receipt} />
            <StatCard label="Mensalidades vencidas" value={d.overdue_count} hint={formatBRL(d.overdue_amount)} icon={AlertTriangle} tone={d.overdue_count ? 'bad' : 'default'} />
            <StatCard label="Mensalidades a vencer" value={d.upcoming_count} hint={formatBRL(d.upcoming_amount)} icon={CalendarClock} />
            <StatCard label="Descontos concedidos" value={formatBRL(d.discounts)} icon={Percent} />
            <StatCard label="Bolsas escolares" value={formatBRL(d.scholarship_discounts)} hint={`${d.scholarship_students} aluno(s) com bolsa`} icon={GraduationCap} />
            <StatCard label="Multas e juros" value={formatBRL(d.fees)} icon={Banknote} />
            <StatCard label="Despesas fixas" value={formatBRL(d.expenses_fixed)} icon={TrendingDown} />
            <StatCard label="Despesas variáveis" value={formatBRL(d.expenses_variable)} icon={TrendingDown} />
            <StatCard label="Resultado do mês (caixa)" value={formatBRL(result)} hint="Recebido − despesas pagas" icon={PiggyBank} tone={result < 0 ? 'bad' : 'good'} />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="card p-5"><h2 className="mb-3 text-base font-semibold">Fluxo de caixa mensal ({year})</h2><div className="h-64"><ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.series.map((s: any) => ({ ...s, mes: MONTHS_SHORT[s.month - 1] }))}><CartesianGrid strokeDasharray="3 3" stroke="#E8D8C8" /><XAxis dataKey="mes" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} width={60} /><Tooltip formatter={(v: number) => formatBRL(v)} /><Legend />
                <Bar dataKey="entradas" name="Entradas" fill="#687653" radius={[6, 6, 0, 0]} /><Bar dataKey="saidas" name="Saídas" fill="#B69A62" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
            <div className="card p-5"><h2 className="mb-3 text-base font-semibold">Saldo mensal ({year})</h2><div className="h-64"><ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.series.map((s: any) => ({ mes: MONTHS_SHORT[s.month - 1], saldo: s.entradas - s.saidas }))}><CartesianGrid strokeDasharray="3 3" stroke="#E8D8C8" /><XAxis dataKey="mes" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} width={60} /><Tooltip formatter={(v: number) => formatBRL(v)} />
                <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#354735" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></div>
          </div>
          {d.payable_overdue_count > 0 && <p className="mt-4 rounded-xl border border-gold/60 bg-white p-4 text-sm"><strong>{d.payable_overdue_count}</strong> conta(s) a pagar vencida(s), somando <strong>{formatBRL(d.payable_overdue_amount)}</strong>.</p>}
          <p className="mt-4 text-xs text-muted">Receita prevista e despesas por vencimento (competência); entradas e saídas do fluxo de caixa por data de pagamento. Nada é marcado como pago sem lançamento manual.</p>
        </div>)}
    </div>
  )
}

const active = (r: any) => (r.is_active ? <Badge tone="good">Ativo</Badge> : <Badge>Inativo</Badge>)
function Registers() {
  return (
    <div className="space-y-10">
      <section><h2 className="mb-3 text-lg font-semibold">Planos de pagamento</h2>
        <CrudPage table="payment_plans" singular="Plano" writeRoles={DF} orderBy={{ column: 'name' }} defaults={{ installments: 12, due_day: 10, is_active: true }}
          columns={[{ key: 'name', label: 'Plano', render: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'monthly_amount', label: 'Mensalidade', render: (r) => formatBRL(r.monthly_amount) }, { key: 'installments', label: 'Parcelas' }, { key: 'due_day', label: 'Vencimento (dia)' }, { key: 'is_active', label: 'Situação', render: active }]}
          fields={[{ name: 'name', label: 'Nome do plano', required: true, full: true }, { name: 'monthly_amount', label: 'Valor da mensalidade', type: 'currency', required: true }, { name: 'installments', label: 'Quantidade de parcelas', type: 'number', required: true, min: 1, max: 24 }, { name: 'due_day', label: 'Dia de vencimento', type: 'number', required: true, min: 1, max: 28 }, { name: 'is_active', label: 'Situação', type: 'checkbox', placeholder: 'Ativo' }]} /></section>
      <section><h2 className="mb-3 text-lg font-semibold">Bolsas e descontos</h2>
        <CrudPage table="scholarships" singular="Bolsa" writeRoles={DF} orderBy={{ column: 'name' }} defaults={{ is_active: true }}
          columns={[{ key: 'name', label: 'Bolsa', render: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'discount_percent', label: 'Desconto', render: (r) => `${r.discount_percent}%${Number(r.discount_percent) === 100 ? ' (integral)' : ''}` }, { key: 'is_active', label: 'Situação', render: active }]}
          fields={[{ name: 'name', label: 'Nome', required: true }, { name: 'discount_percent', label: 'Desconto (%)', type: 'number', required: true, min: 0, max: 100, step: '0.01', hint: '100% = bolsa integral.' }, { name: 'is_active', label: 'Situação', type: 'checkbox', placeholder: 'Ativa' }]} /></section>
      <section><h2 className="mb-3 text-lg font-semibold">Categorias de despesa</h2>
        <CrudPage table="expense_categories" singular="Categoria" writeRoles={DF} orderBy={{ column: 'name' }} defaults={{ is_active: true }}
          columns={[{ key: 'name', label: 'Categoria' }, { key: 'is_active', label: 'Situação', render: active }]}
          fields={[{ name: 'name', label: 'Nome', required: true }, { name: 'is_active', label: 'Situação', type: 'checkbox', placeholder: 'Ativa' }]} /></section>
      <section><h2 className="mb-3 text-lg font-semibold">Fornecedores</h2>
        <CrudPage table="suppliers" singular="Fornecedor" archive writeRoles={DF} orderBy={{ column: 'name' }} searchColumns={['name', 'document']}
          columns={[{ key: 'name', label: 'Fornecedor', render: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'document', label: 'CNPJ/CPF' }, { key: 'phone', label: 'Telefone' }, { key: 'email', label: 'E-mail' }]}
          fields={[{ name: 'name', label: 'Nome / razão social', required: true, full: true }, { name: 'document', label: 'CNPJ ou CPF' }, { name: 'phone', label: 'Telefone', type: 'phone' }, { name: 'email', label: 'E-mail', type: 'email' }]} /></section>
    </div>
  )
}

export default function FinancePage() {
  return (<><PageHeader title="Financeiro" subtitle="Painel financeiro, planos, bolsas, categorias e fornecedores." />
    <Tabs tabs={[{ id: 'painel', label: 'Painel', content: <Panel /> }, { id: 'cad', label: 'Cadastros', content: <Registers /> }]} /></>)
}
export { DSF }
