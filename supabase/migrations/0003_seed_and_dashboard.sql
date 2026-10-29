-- =====================================================================
-- LITTLE GARDEN ERP — 0003: Dados de referência (NÃO são dados de alunos) e dashboard
-- =====================================================================

-- Etapas oferecidas pela escola (informadas no briefing)
insert into public.education_stages (code, name, uses_numeric_grades) values
  ('EI','Educação Infantil', false),
  ('EF1','Ensino Fundamental I', true)
on conflict (code) do nothing;

-- Categorias financeiras sugeridas
insert into public.expense_categories (name) values
  ('Folha de pagamento'),('Aluguel'),('Água e energia'),('Alimentação'),('Material pedagógico'),
  ('Manutenção'),('Marketing'),('Tecnologia'),('Impostos'),('Serviços terceirizados'),('Outras despesas')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- dashboard_summary: todos os indicadores calculados a partir das tabelas.
-- SECURITY INVOKER (padrão): a RLS do usuário logado continua valendo.
-- Definições:
--  * Receita prevista  = soma de cobranças (total) com vencimento no mês, exceto canceladas
--  * Receita recebida  = soma de pagamentos com data de pagamento no mês
--  * Despesas do mês   = soma de despesas com vencimento no mês, exceto canceladas
--  * Em atraso         = cobranças pendentes/parciais com vencimento anterior a hoje (saldo = total - pago)
--  * Inadimplência     = saldo em atraso das cobranças vencidas no mês ÷ total das cobranças vencidas no mês
--  * Evolução de alunos = alunos acumulados por data de ingresso (aproximação)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary(
  p_year int, p_month int, p_stage uuid default null, p_class uuid default null
) returns jsonb language plpgsql stable as $$
declare
  m_start date := make_date(p_year, p_month, 1);
  m_end date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  y_id uuid;
  res jsonb;
begin
  select id into y_id from public.school_years where year = p_year;

  with fs as (
    select s.* from public.students s
     where s.archived_at is null
       and (p_stage is null or s.stage_id = p_stage)
       and (p_class is null or s.current_class_id = p_class)
  ),
  inv as (
    select i.*, coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0) as paid
      from public.invoices i where i.student_id in (select id from fs) and i.status <> 'cancelado'
  ),
  months as (select generate_series(1,12) as m)
  select jsonb_build_object(
    'active_students', (select count(*) from fs where status = 'ativo'),
    'confirmed_enrollments', (select count(*) from public.enrollments e
        where e.status = 'confirmada' and e.archived_at is null and e.school_year_id = y_id
          and e.student_id in (select id from fs)),
    'teachers_active', (select count(*) from public.teachers where status = 'ativo' and archived_at is null),
    'employees_active', (select count(*) from public.employees where status = 'ativo' and archived_at is null),
    'revenue_received', (select coalesce(sum(p.amount),0) from public.payments p
        where p.paid_on >= m_start and p.paid_on < m_end and p.invoice_id in (select id from inv)),
    'revenue_expected', (select coalesce(sum(total),0) from inv where due_date >= m_start and due_date < m_end),
    'expenses_month', (select coalesce(sum(amount),0) from public.expenses
        where due_date >= m_start and due_date < m_end and status <> 'cancelado'),
    'overdue_count', (select count(*) from inv where status in ('pendente','parcialmente_pago') and due_date < current_date),
    'overdue_amount', (select coalesce(sum(total - paid),0) from inv where status in ('pendente','parcialmente_pago') and due_date < current_date),
    'delinquency_rate', (select case when sum(total) > 0
        then round(100 * sum(case when status in ('pendente','parcialmente_pago') then total - paid else 0 end) / sum(total), 1) end
        from inv where due_date >= m_start and due_date < least(m_end, current_date)),
    'students_by_stage', coalesce((select jsonb_agg(jsonb_build_object('name', st.name, 'total', x.c) order by st.name)
        from (select stage_id, count(*) c from fs where status = 'ativo' and stage_id is not null group by stage_id) x
        join public.education_stages st on st.id = x.stage_id), '[]'::jsonb),
    'class_vacancies', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'capacity', c.capacity,
          'enrolled', coalesce(e.n,0), 'available', greatest(c.capacity - coalesce(e.n,0),0)) order by c.name)
        from public.classes c
        left join (select class_id, count(*) n from public.enrollments
                    where status = 'confirmada' and archived_at is null group by class_id) e on e.class_id = c.id
        where c.archived_at is null and c.status = 'ativa' and c.school_year_id = y_id
          and (p_stage is null or c.stage_id = p_stage) and (p_class is null or c.id = p_class)), '[]'::jsonb),
    'birthdays', coalesce((select jsonb_agg(jsonb_build_object('name', full_name, 'day', extract(day from birth_date)::int)
          order by extract(day from birth_date))
        from fs where status = 'ativo' and birth_date is not null and extract(month from birth_date) = p_month), '[]'::jsonb),
    'upcoming_events', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'starts_at', starts_at) order by starts_at)
        from (select * from public.school_events where starts_at >= now() order by starts_at limit 5) ev), '[]'::jsonb),
    'pending_documents', (select count(*) from public.enrollments where status = 'documentacao_pendente' and archived_at is null)
        + (select count(*) from public.documents where expires_on is not null and expires_on < current_date),
    'series_revenue_expenses', (select jsonb_agg(jsonb_build_object('month', months.m,
          'receitas', coalesce((select sum(p.amount) from public.payments p where p.invoice_id in (select id from inv)
              and extract(year from p.paid_on) = p_year and extract(month from p.paid_on) = months.m), 0),
          'despesas', coalesce((select sum(amount) from public.expenses where status <> 'cancelado'
              and extract(year from due_date) = p_year and extract(month from due_date) = months.m), 0)) order by months.m) from months),
    'series_students', (select jsonb_agg(jsonb_build_object('month', months.m,
          'alunos', (select count(*) from fs where status in ('ativo','transferido','concluido') and admitted_on is not null
              and admitted_on < (make_date(p_year, months.m, 1) + interval '1 month'))) order by months.m) from months),
    'series_enrollments_by_class', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'total', x.n) order by c.name)
        from (select class_id, count(*) n from public.enrollments
               where status = 'confirmada' and archived_at is null and school_year_id = y_id
                 and student_id in (select id from fs) group by class_id) x
        join public.classes c on c.id = x.class_id), '[]'::jsonb),
    'series_delinquency', (select jsonb_agg(jsonb_build_object('month', months.m,
          'taxa', (select case when sum(total) > 0 then round(100 * sum(case when status in ('pendente','parcialmente_pago') then total - paid else 0 end) / sum(total), 1) end
                   from inv where extract(year from due_date) = p_year and extract(month from due_date) = months.m and due_date < current_date)) order by months.m) from months)
  ) into res;
  return res;
end $$;
grant execute on function public.dashboard_summary(int,int,uuid,uuid) to authenticated;
