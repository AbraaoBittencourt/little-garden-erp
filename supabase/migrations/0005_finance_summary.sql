-- =====================================================================
-- LITTLE GARDEN ERP — 0005: Resumo financeiro agregado no banco
-- Regime de caixa para entradas/saídas; competência (vencimento) para previsto.
-- SECURITY INVOKER: a RLS do usuário continua valendo (somente Direção/Financeiro enxergam valores).
-- =====================================================================
create or replace function public.finance_summary(p_year int, p_month int) returns jsonb
language plpgsql stable set search_path = public as $$
declare ms date := make_date(p_year, p_month, 1); me date := (make_date(p_year, p_month, 1) + interval '1 month')::date; res jsonb;
begin
  with inv as (
    select i.*, coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0) as paid,
           (select e.scholarship_id from enrollments e where e.id = i.enrollment_id) as sch
      from invoices i where i.status <> 'cancelado'
  ), exp as (select * from expenses where status <> 'cancelado')
  select jsonb_build_object(
    'expected',          (select coalesce(sum(total),0) from inv where due_date >= ms and due_date < me),
    'received',          (select coalesce(sum(p.amount),0) from payments p where p.paid_on >= ms and p.paid_on < me),
    'receivable_open',   (select coalesce(sum(total - paid),0) from inv where status in ('pendente','parcialmente_pago')),
    'overdue_count',     (select count(*) from inv where status in ('pendente','parcialmente_pago') and due_date < current_date),
    'overdue_amount',    (select coalesce(sum(total - paid),0) from inv where status in ('pendente','parcialmente_pago') and due_date < current_date),
    'upcoming_amount',   (select coalesce(sum(total - paid),0) from inv where status in ('pendente','parcialmente_pago') and due_date >= current_date),
    'upcoming_count',    (select count(*) from inv where status in ('pendente','parcialmente_pago') and due_date >= current_date),
    'discounts',         (select coalesce(sum(discount),0) from inv where due_date >= ms and due_date < me),
    'scholarship_discounts', (select coalesce(sum(discount),0) from inv where sch is not null and due_date >= ms and due_date < me),
    'scholarship_students',  (select count(distinct student_id) from inv where sch is not null),
    'fees',              (select coalesce(sum(fine + interest),0) from inv where due_date >= ms and due_date < me),
    'expenses_month',    (select coalesce(sum(amount),0) from exp where due_date >= ms and due_date < me),
    'expenses_fixed',    (select coalesce(sum(amount),0) from exp where is_fixed and due_date >= ms and due_date < me),
    'expenses_variable', (select coalesce(sum(amount),0) from exp where not is_fixed and due_date >= ms and due_date < me),
    'payable_open',      (select coalesce(sum(amount),0) from exp where status = 'pendente'),
    'payable_overdue_count', (select count(*) from exp where status = 'pendente' and due_date < current_date),
    'payable_overdue_amount', (select coalesce(sum(amount),0) from exp where status = 'pendente' and due_date < current_date),
    'paid_out',          (select coalesce(sum(amount),0) from exp where status = 'pago' and paid_on >= ms and paid_on < me),
    'series', (select jsonb_agg(jsonb_build_object('month', m,
        'entradas', (select coalesce(sum(p.amount),0) from payments p where extract(year from p.paid_on) = p_year and extract(month from p.paid_on) = m),
        'saidas',   (select coalesce(sum(amount),0) from exp where status = 'pago' and extract(year from paid_on) = p_year and extract(month from paid_on) = m)) order by m)
        from generate_series(1,12) m)
  ) into res;
  return res;
end $$;
grant execute on function public.finance_summary(int, int) to authenticated;
revoke execute on function public.finance_summary(int, int) from anon;
