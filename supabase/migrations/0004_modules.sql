-- =====================================================================
-- LITTLE GARDEN ERP — 0004: Etapas 2 a 5 (matrículas, cobranças, frequência,
-- pedagógico, documentos, comunicação, LGPD)
-- =====================================================================

-- ---------- Ajustes em tabelas existentes ----------
alter table public.school_settings add column if not exists min_attendance_infantil_percent numeric(5,2) not null default 60; -- LDB art. 31 (Ed. Infantil)
alter table public.school_events add column if not exists kind text not null default 'evento' check (kind in ('evento','reuniao','feriado','recesso'));

-- ---------- Novas tabelas ----------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid references public.guardians(id) on delete set null,
  purpose text not null, granted boolean not null default true,
  granted_at date not null default current_date, notes text,
  recorded_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.consents (student_id);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('declaracao_matricula','comprovante_matricula','ficha_cadastral','contrato','outro')),
  name text not null, body text not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (kind, name)
);

create table public.pedagogical_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, stage_id uuid references public.education_stages(id), body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.pedagogical_records (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('planejamento','atividade','reuniao')),
  class_id uuid references public.classes(id), title text not null, content text,
  record_date date not null default current_date,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.pedagogical_records (class_id, record_date);

create table public.student_class_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id),
  started_on date not null default current_date, ended_on date
);
create index on public.student_class_history (student_id);

-- anexos de registros pedagógicos
alter table public.documents add column if not exists record_id uuid references public.pedagogical_records(id) on delete cascade;
alter table public.documents drop constraint if exists documents_check;
alter table public.documents add constraint documents_one_owner check (num_nonnulls(student_id, teacher_id, employee_id, record_id) = 1);

do $$ declare t text; begin
  foreach t in array array['document_templates','pedagogical_templates','pedagogical_records'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['consents','document_templates','pedagogical_records','school_events','announcements'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- ---------- Regras de negócio ----------
-- 1) Matrícula: controle de vagas
create or replace function public.enrollment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap int; used int;
begin
  if new.status = 'confirmada' and new.class_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.class_id is distinct from new.class_id) then
    select capacity into cap from classes where id = new.class_id;
    select count(*) into used from enrollments
      where class_id = new.class_id and status = 'confirmada' and archived_at is null and id <> new.id;
    if used >= cap then raise exception 'Turma sem vagas disponíveis. Use a lista de espera.'; end if;
  end if;
  return new;
end $$;
create trigger enrollment_guard before insert or update on public.enrollments
  for each row execute function public.enrollment_guard();

-- 2) Matrícula confirmada atualiza o cadastro do aluno
create or replace function public.sync_student_from_enrollment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmada' and new.class_id is not null then
    update students s set current_class_id = new.class_id,
           stage_id = c.stage_id, shift = c.shift, status = 'ativo',
           admitted_on = coalesce(s.admitted_on, new.enrolled_on, current_date)
      from classes c where c.id = new.class_id and s.id = new.student_id;
  end if;
  return null;
end $$;
create trigger enrollment_sync after insert or update of status, class_id on public.enrollments
  for each row execute function public.sync_student_from_enrollment();

-- 3) Histórico de turmas
create or replace function public.track_class_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.current_class_id is not distinct from new.current_class_id then return null; end if;
  update student_class_history set ended_on = current_date where student_id = new.id and ended_on is null;
  if new.current_class_id is not null then
    insert into student_class_history (student_id, class_id) values (new.id, new.current_class_id);
  end if;
  return null;
end $$;
create trigger students_class_history after insert or update of current_class_id on public.students
  for each row execute function public.track_class_history();

-- 4) Educação Infantil não usa nota numérica
create or replace function public.assessment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare numeric_ok boolean;
begin
  if new.score is not null then
    select st.uses_numeric_grades into numeric_ok from classes c join education_stages st on st.id = c.stage_id where c.id = new.class_id;
    if not coalesce(numeric_ok, false) then
      raise exception 'Esta etapa não utiliza nota numérica. Use o registro descritivo.';
    end if;
  end if;
  return new;
end $$;
create trigger assessment_guard before insert or update on public.assessments
  for each row execute function public.assessment_guard();

-- 5) Gera as mensalidades de uma matrícula confirmada
create or replace function public.generate_invoices(p_enrollment uuid, p_first date default null) returns int
language plpgsql security definer set search_path = public as $$
declare e enrollments; pl payment_plans; disc numeric := 0; i int; n int := 0; start_m date; comp date;
begin
  if not public.has_any_role('{direcao,secretaria,financeiro}') then raise exception 'Sem permissão para gerar cobranças.'; end if;
  select * into e from enrollments where id = p_enrollment;
  if e.id is null then raise exception 'Matrícula não encontrada.'; end if;
  if e.status <> 'confirmada' then raise exception 'A matrícula precisa estar confirmada para gerar cobranças.'; end if;
  if e.plan_id is null then raise exception 'A matrícula não possui plano de pagamento.'; end if;
  select * into pl from payment_plans where id = e.plan_id;
  select coalesce(max(discount_percent), 0) into disc from scholarships where id = e.scholarship_id;
  start_m := date_trunc('month', coalesce(p_first, (select make_date(year,1,1) from school_years where id = e.school_year_id)))::date;
  for i in 0 .. pl.installments - 1 loop
    comp := (start_m + make_interval(months => i))::date;
    insert into invoices (student_id, enrollment_id, competence, due_date, amount, discount)
    values (e.student_id, e.id, comp, comp + (pl.due_day - 1), pl.monthly_amount, round(pl.monthly_amount * disc / 100, 2))
    on conflict (enrollment_id, competence) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- 6) Multa e juros conforme parâmetros da escola (aplicação manual, auditada)
create or replace function public.apply_late_charges(p_invoice uuid) returns void
language plpgsql set search_path = public as $$
declare i invoices; s school_settings; base numeric;
begin
  select * into i from invoices where id = p_invoice;
  select * into s from school_settings where id = 1;
  if i.id is null or i.status not in ('pendente','parcialmente_pago') or i.due_date >= current_date then
    raise exception 'A cobrança não está vencida.';
  end if;
  base := i.amount - i.discount;
  update invoices set fine = round(base * s.late_fee_percent / 100, 2),
                      interest = round(base * s.daily_interest_percent / 100 * (current_date - i.due_date), 2)
   where id = p_invoice;
end $$;

-- 7) Resumo de frequência por turma e período (limite legal por etapa)
create or replace function public.attendance_summary(p_class uuid, p_from date, p_to date)
returns table (student_id uuid, student_name text, total int, presentes int, ausentes int, justificadas int, percent numeric, min_percent numeric)
language sql stable set search_path = public as $$
  select a.student_id, s.full_name, count(*)::int,
         (count(*) filter (where a.status = 'presente'))::int,
         (count(*) filter (where a.status = 'ausente'))::int,
         (count(*) filter (where a.status = 'falta_justificada'))::int,
         round(100.0 * count(*) filter (where a.status = 'presente') / nullif(count(*), 0), 1),
         case when st.code = 'EI' then ss.min_attendance_infantil_percent else ss.min_attendance_percent end
    from attendance_records a
    join students s on s.id = a.student_id
    join classes c on c.id = a.class_id
    join education_stages st on st.id = c.stage_id
    cross join school_settings ss
   where a.class_id = p_class and a.date between p_from and p_to
   group by a.student_id, s.full_name, st.code, ss.min_attendance_infantil_percent, ss.min_attendance_percent
   order by s.full_name
$$;

-- 8) Usuários por perfil (para vincular acessos a responsáveis/professores)
create or replace function public.list_users_by_role(r public.user_role)
returns table (id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email from profiles p join user_roles ur on ur.user_id = p.id
   where ur.role = r and p.is_active and public.has_any_role('{direcao,secretaria}') order by p.full_name
$$;

-- 9) Exportação dos dados pessoais de um aluno (direito do titular — LGPD)
create or replace function public.export_student_data(p_student uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'gerado_em', now(),
    'aluno', to_jsonb(s),
    'responsaveis', (select coalesce(jsonb_agg(jsonb_build_object('responsavel', to_jsonb(g), 'vinculo', to_jsonb(sg))), '[]') from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = s.id),
    'matriculas', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from enrollments e where e.student_id = s.id),
    'cobrancas', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from invoices i where i.student_id = s.id),
    'pagamentos', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from payments p join invoices i on i.id = p.invoice_id where i.student_id = s.id),
    'frequencia', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from attendance_records a where a.student_id = s.id),
    'avaliacoes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from assessments x where x.student_id = s.id),
    'documentos', (select coalesce(jsonb_agg(jsonb_build_object('categoria', d.category, 'nome', d.name, 'validade', d.expires_on)), '[]') from documents d where d.student_id = s.id),
    'consentimentos', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from consents c where c.student_id = s.id)
  ) from students s where s.id = p_student and public.has_any_role('{direcao,secretaria}')
$$;

-- ---------- RLS das novas tabelas ----------
select public._apply_rls('consents', '{direcao,secretaria}', '{direcao,secretaria}', '{direcao}');
select public._apply_rls('document_templates', '{direcao,secretaria}', '{direcao,secretaria}', '{direcao}');
select public._apply_rls('pedagogical_templates', '{direcao,coordenacao,professor}', '{direcao,coordenacao}', '{direcao}');

alter table public.pedagogical_records enable row level security;
create policy ped_records_select on public.pedagogical_records for select to authenticated using (
  public.has_any_role('{direcao,coordenacao}') or class_id in (select public.teacher_class_ids()));
create policy ped_records_insert on public.pedagogical_records for insert to authenticated with check (
  public.has_any_role('{direcao,coordenacao}') or class_id in (select public.teacher_class_ids()));
create policy ped_records_update on public.pedagogical_records for update to authenticated
  using (public.has_any_role('{direcao,coordenacao}') or (created_by = auth.uid() and class_id in (select public.teacher_class_ids())))
  with check (public.has_any_role('{direcao,coordenacao}') or (created_by = auth.uid() and class_id in (select public.teacher_class_ids())));
create policy ped_records_delete on public.pedagogical_records for delete to authenticated using (public.has_role('direcao'));

alter table public.student_class_history enable row level security;
create policy class_history_select on public.student_class_history for select to authenticated
  using (public.has_any_role('{direcao,secretaria,coordenacao}'));

alter table public.announcement_reads enable row level security;
create policy reads_select on public.announcement_reads for select to authenticated
  using (user_id = auth.uid() or public.has_any_role('{direcao,secretaria,coordenacao}'));
create policy reads_insert on public.announcement_reads for insert to authenticated
  with check (user_id = auth.uid() and public.has_any_role('{responsavel,professor}'));

-- responsável enxerga turma dos filhos e o calendário
create policy classes_guardian_select on public.classes for select to authenticated
  using (id in (select e.class_id from public.enrollments e where e.student_id in (select public.guardian_student_ids())));
create policy events_guardian_select on public.school_events for select to authenticated using (public.has_role('responsavel'));

-- anexos de registros pedagógicos (documentos)
create policy documents_records_select on public.documents for select to authenticated using (
  record_id is not null and (public.has_any_role('{direcao,coordenacao}') or
    record_id in (select pr.id from public.pedagogical_records pr where pr.class_id in (select public.teacher_class_ids()))));
create policy documents_records_write on public.documents for all to authenticated
  using (record_id is not null and public.has_any_role('{direcao,coordenacao,professor}'))
  with check (record_id is not null and public.has_any_role('{direcao,coordenacao,professor}'));

-- storage: comprovantes financeiros e anexos pedagógicos em pastas próprias do bucket privado
create policy "docs_fin_rw" on storage.objects for all to authenticated
  using (bucket_id = 'documents' and name like 'expenses/%' and public.has_any_role('{direcao,financeiro}'))
  with check (bucket_id = 'documents' and name like 'expenses/%' and public.has_any_role('{direcao,financeiro}'));
create policy "docs_ped_rw" on storage.objects for all to authenticated
  using (bucket_id = 'documents' and name like 'records/%' and public.has_any_role('{direcao,coordenacao,professor}'))
  with check (bucket_id = 'documents' and name like 'records/%' and public.has_any_role('{direcao,coordenacao,professor}'));

-- ---------- Permissões das funções e tabelas novas ----------
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
grant execute on function public.generate_invoices(uuid, date), public.apply_late_charges(uuid),
  public.attendance_summary(uuid, date, date), public.list_users_by_role(public.user_role),
  public.export_student_data(uuid) to authenticated;
