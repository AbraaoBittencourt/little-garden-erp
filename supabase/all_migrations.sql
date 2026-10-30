-- =====================================================================
-- LITTLE GARDEN ERP — 0001: Esquema relacional
-- Execute no SQL Editor do Supabase (ou via `supabase db push`).
-- =====================================================================
create extension if not exists "pgcrypto";

-- ---------- Tipos ----------
create type public.user_role as enum ('direcao','secretaria','financeiro','coordenacao','professor','responsavel');
create type public.student_status as enum ('pre_matricula','ativo','transferido','concluido','inativo');
create type public.enrollment_status as enum ('interessado','pre_matricula','documentacao_pendente','confirmada','renovacao_pendente','cancelada','lista_espera');
create type public.invoice_status as enum ('pendente','pago','parcialmente_pago','cancelado'); -- "vencido" é derivado: pendente/parcial com due_date < hoje
create type public.payment_method as enum ('pix','dinheiro','cartao','transferencia','boleto');
create type public.expense_status as enum ('pendente','pago','cancelado');
create type public.attendance_status as enum ('presente','ausente','falta_justificada');
create type public.shift_type as enum ('manha','tarde','integral');
create type public.class_status as enum ('planejada','ativa','encerrada');
create type public.work_status as enum ('ativo','afastado','desligado');

-- ---------- Utilitários ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Usuários e perfis ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  is_active boolean not null default false,       -- novos usuários NASCEM inativos
  last_access_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index on public.user_roles (user_id);

-- Cria o perfil (inativo, sem papel) quando um usuário é criado no Auth
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Configurações da escola ----------
create table public.school_years (
  id uuid primary key default gen_random_uuid(),
  year int not null unique check (year between 2000 and 2100),
  starts_on date, ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index school_years_one_current on public.school_years (is_current) where is_current;

create table public.school_settings (
  id int primary key default 1 check (id = 1),        -- linha única
  legal_name text, trade_name text default 'Little Garden', cnpj text,
  address text, city text default 'Lauro de Freitas', state text default 'BA', zip_code text,
  phone text, email text, logo_path text,
  late_fee_percent numeric(5,2) not null default 0,   -- definir conforme contrato
  daily_interest_percent numeric(5,3) not null default 0,
  min_attendance_percent numeric(5,2) not null default 75, -- LDB: mínimo 75% de frequência
  updated_at timestamptz not null default now()
);
insert into public.school_settings (id) values (1) on conflict do nothing;

create table public.education_stages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text not null,
  uses_numeric_grades boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Pessoas ----------
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null, cpf text unique, phone text, email text,
  degree text, admitted_on date, status public.work_status not null default 'ativo',
  notes text, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null, cpf text unique, phone text, email text,
  position text, degree text, admitted_on date, status public.work_status not null default 'ativo',
  notes text, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school_year_id uuid not null references public.school_years(id),
  stage_id uuid not null references public.education_stages(id),
  grade_group text, shift public.shift_type not null,
  capacity int not null check (capacity > 0),
  head_teacher_id uuid references public.teachers(id) on delete set null,
  status public.class_status not null default 'planejada',
  archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_year_id, name, shift)
);
create index on public.classes (school_year_id, stage_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, photo_path text, birth_date date,
  cpf text unique, document_id text,
  address text, city text, zip_code text,
  stage_id uuid references public.education_stages(id),
  current_class_id uuid references public.classes(id) on delete set null,
  shift public.shift_type, admitted_on date,
  status public.student_status not null default 'pre_matricula',
  archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.students (status);
create index on public.students (current_class_id);
create index on public.students (full_name);

-- Observações administrativas restritas (tabela separada = RLS própria)
create table public.student_admin_notes (
  student_id uuid primary key references public.students(id) on delete cascade,
  notes text, updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null, -- futura área dos responsáveis
  full_name text not null, cpf text unique, phone text, whatsapp text, email text,
  address text, city text, zip_code text, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  relationship text not null,
  is_financial boolean not null default false,
  is_legal boolean not null default false,
  can_pickup boolean not null default false,
  is_emergency_contact boolean not null default false,
  created_at timestamptz not null default now(),
  unique (student_id, guardian_id)
);
create index on public.student_guardians (guardian_id);

-- ---------- Matrículas e financeiro ----------
create table public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null, monthly_amount numeric(12,2) not null check (monthly_amount >= 0),
  installments int not null default 12 check (installments > 0),
  due_day int not null default 10 check (due_day between 1 and 28),
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.scholarships (
  id uuid primary key default gen_random_uuid(),
  name text not null, discount_percent numeric(5,2) not null check (discount_percent between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  class_id uuid references public.classes(id),
  school_year_id uuid not null references public.school_years(id),
  plan_id uuid references public.payment_plans(id),
  scholarship_id uuid references public.scholarships(id),
  status public.enrollment_status not null default 'interessado',
  enrolled_on date, contract_path text, notes text, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- impede matrícula ativa duplicada (mesmo aluno, turma e ano letivo)
create unique index enrollments_no_dup on public.enrollments (student_id, class_id, school_year_id)
  where status <> 'cancelada' and class_id is not null;
create index on public.enrollments (class_id, status);
create index on public.enrollments (school_year_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  enrollment_id uuid not null references public.enrollments(id),
  competence date not null check (extract(day from competence) = 1), -- 1º dia do mês de competência
  due_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  fine numeric(12,2) not null default 0 check (fine >= 0),
  interest numeric(12,2) not null default 0 check (interest >= 0),
  total numeric(12,2) generated always as (amount - discount + fine + interest) stored,
  status public.invoice_status not null default 'pendente',
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (enrollment_id, competence)                      -- evita cobrança duplicada
);
create index on public.invoices (due_date, status);
create index on public.invoices (student_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id),
  paid_on date not null, amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null, reference text, notes text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.payments (paid_on);
create index on public.payments (invoice_id);

-- Atualiza o status da cobrança a partir dos pagamentos (somente confirmados manualmente)
create or replace function public.sync_invoice_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv uuid := coalesce(new.invoice_id, old.invoice_id); paid numeric; tot numeric; cur public.invoice_status;
begin
  select total, status into tot, cur from invoices where id = inv;
  if cur = 'cancelado' then return null; end if;
  select coalesce(sum(amount),0) into paid from payments where invoice_id = inv;
  update invoices set status = (case when paid >= tot and tot > 0 then 'pago'
                                     when paid > 0 then 'parcialmente_pago'
                                     else 'pendente' end)::public.invoice_status where id = inv;
  return null;
end $$;
create trigger payments_sync after insert or update or delete on public.payments
  for each row execute function public.sync_invoice_status();

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, document text, phone text, email text, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id),
  category_id uuid references public.expense_categories(id),
  description text not null, amount numeric(12,2) not null check (amount >= 0),
  due_date date not null, paid_on date,
  account text, cost_center text, receipt_path text, is_fixed boolean not null default false,
  status public.expense_status not null default 'pendente',
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.expenses (due_date, status);

-- ---------- Acadêmico / pedagógico ----------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null, stage_id uuid references public.education_stages(id), is_active boolean not null default true,
  created_at timestamptz not null default now(), unique (name, stage_id)
);
create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id),
  teacher_id uuid references public.teachers(id) on delete set null,
  unique (class_id, subject_id)
);
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  student_id uuid not null references public.students(id),
  date date not null, status public.attendance_status not null, notes text,
  recorded_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (class_id, student_id, date)
);
create index on public.attendance_records (student_id, date);
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  class_id uuid not null references public.classes(id),
  subject_id uuid references public.subjects(id),
  title text not null, score numeric(5,2) check (score between 0 and 10), -- nota só no Fund. I
  descriptive_text text, assessed_on date not null default current_date,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.pedagogical_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  class_id uuid references public.classes(id),
  period text, content text not null,
  is_sensitive boolean not null default false,       -- visível só a direção/coordenação/autor
  author_id uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------- Documentos, comunicação, auditoria ----------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  category text not null, name text not null, storage_path text not null, expires_on date,
  uploaded_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(student_id, teacher_id, employee_id) = 1)
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null,
  audience text not null default 'geral' check (audience in ('geral','turma','individual')),
  class_id uuid references public.classes(id), student_id uuid references public.students(id),
  published_at timestamptz, created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.school_events (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, location text,
  starts_at timestamptz not null, ends_at timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null, record_id text, action text not null,
  old_data jsonb, new_data jsonb,
  user_id uuid default auth.uid(), created_at timestamptz not null default now()
);
create index on public.audit_logs (table_name, created_at desc);

-- ---------- Triggers: updated_at e auditoria ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','school_years','teachers','employees','classes','students','guardians',
    'payment_plans','enrollments','invoices','expenses','suppliers','attendance_records','assessments','pedagogical_reports']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid text;
begin
  rid := coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', '');
  insert into public.audit_logs (table_name, record_id, action, old_data, new_data)
  values (tg_table_name, rid, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['user_roles','school_settings','students','guardians','student_guardians','enrollments',
    'invoices','payments','expenses','teachers','employees','classes','payment_plans','scholarships','documents','pedagogical_reports']
  loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t);
  end loop;
end $$;
-- =====================================================================
-- LITTLE GARDEN ERP — 0002: Funções de permissão e políticas RLS
-- Regra geral: usuário só acessa dados se estiver ATIVO e tiver papel adequado.
-- =====================================================================

-- ---------- Funções auxiliares (SECURITY DEFINER, sem recursão de RLS) ----------
create or replace function public.has_any_role(roles public.user_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and p.is_active and ur.role = any(roles)
  )
$$;
create or replace function public.has_role(r public.user_role) returns boolean
language sql stable as $$ select public.has_any_role(array[r]) $$;

-- turmas em que o professor logado atua (responsável ou via disciplina)
create or replace function public.teacher_class_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.id from public.classes c join public.teachers t on t.id = c.head_teacher_id
   where t.user_id = auth.uid() and public.has_role('professor')
  union
  select cs.class_id from public.class_subjects cs join public.teachers t on t.id = cs.teacher_id
   where t.user_id = auth.uid() and public.has_role('professor')
$$;
create or replace function public.teacher_student_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.student_id from public.enrollments e
   where e.class_id in (select public.teacher_class_ids()) and e.status = 'confirmada'
$$;
-- alunos vinculados ao responsável logado
create or replace function public.guardian_student_ids(only_financial boolean default false) returns setof uuid
language sql stable security definer set search_path = public as $$
  select sg.student_id from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
   where g.user_id = auth.uid() and public.has_role('responsavel') and (not only_financial or sg.is_financial)
$$;

-- registra último acesso (chamada pelo frontend após o login)
create or replace function public.touch_last_access() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_access_at = now() where id = auth.uid()
$$;

-- ---------- Gerador de políticas ----------
-- read_roles / write_roles: papéis com leitura / escrita; delete_roles: exclusão física (restrita)
create or replace function public._apply_rls(tbl text, read_roles public.user_role[], write_roles public.user_role[], delete_roles public.user_role[])
returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', tbl);
  execute format('create policy "%s_select" on public.%I for select to authenticated using (public.has_any_role(%L::public.user_role[]))', tbl, tbl, read_roles);
  execute format('create policy "%s_insert" on public.%I for insert to authenticated with check (public.has_any_role(%L::public.user_role[]))', tbl, tbl, write_roles);
  execute format('create policy "%s_update" on public.%I for update to authenticated using (public.has_any_role(%L::public.user_role[])) with check (public.has_any_role(%L::public.user_role[]))', tbl, tbl, write_roles, write_roles);
  execute format('create policy "%s_delete" on public.%I for delete to authenticated using (public.has_any_role(%L::public.user_role[]))', tbl, tbl, delete_roles);
end $$;

do $$
declare
  D public.user_role[] := '{direcao}';
  DS public.user_role[] := '{direcao,secretaria}';
  DF public.user_role[] := '{direcao,financeiro}';
  DC public.user_role[] := '{direcao,coordenacao}';
  DSC public.user_role[] := '{direcao,secretaria,coordenacao}';
  STAFF public.user_role[] := '{direcao,secretaria,financeiro,coordenacao}';
  ALL_INTERNAL public.user_role[] := '{direcao,secretaria,financeiro,coordenacao,professor}';
begin
  -- configuração e estrutura
  perform public._apply_rls('school_settings', ALL_INTERNAL, D, D);
  perform public._apply_rls('school_years', ALL_INTERNAL, D, D);
  perform public._apply_rls('education_stages', ALL_INTERNAL, D, D);
  perform public._apply_rls('subjects', ALL_INTERNAL, DC, D);
  -- pessoas
  perform public._apply_rls('teachers', STAFF, DSC, D);
  perform public._apply_rls('employees', '{direcao,secretaria}', DS, D);
  perform public._apply_rls('guardians', STAFF, DS, D);
  perform public._apply_rls('student_guardians', STAFF, DS, D);
  perform public._apply_rls('student_admin_notes', DS, DS, D);
  -- matrículas e financeiro
  perform public._apply_rls('payment_plans', '{direcao,secretaria,financeiro}', DF, D);
  perform public._apply_rls('scholarships', '{direcao,secretaria,financeiro}', DF, D);
  perform public._apply_rls('invoices', '{direcao,secretaria,financeiro}', DF, D);
  perform public._apply_rls('payments', '{direcao,secretaria,financeiro}', DF, D);
  perform public._apply_rls('expense_categories', DF, DF, D);
  perform public._apply_rls('suppliers', DF, DF, D);
  perform public._apply_rls('expenses', DF, DF, D);
  -- comunicação (leitura geral é complementada abaixo)
  perform public._apply_rls('school_events', ALL_INTERNAL, DSC, D);
  -- tabelas com regras especiais: só habilita RLS aqui, políticas abaixo
  alter table public.profiles enable row level security;
  alter table public.user_roles enable row level security;
  alter table public.students enable row level security;
  alter table public.classes enable row level security;
  alter table public.enrollments enable row level security;
  alter table public.class_subjects enable row level security;
  alter table public.attendance_records enable row level security;
  alter table public.assessments enable row level security;
  alter table public.pedagogical_reports enable row level security;
  alter table public.documents enable row level security;
  alter table public.announcements enable row level security;
  alter table public.audit_logs enable row level security;
end $$;

-- ---------- profiles / user_roles ----------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role('direcao'));
create policy profiles_update on public.profiles for update to authenticated
  using (public.has_role('direcao')) with check (public.has_role('direcao'));
-- (sem insert/delete: perfis nascem pelo trigger do Auth)

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role('direcao'));
create policy user_roles_insert on public.user_roles for insert to authenticated with check (public.has_role('direcao'));
create policy user_roles_delete on public.user_roles for delete to authenticated using (public.has_role('direcao'));

-- ---------- students ----------
create policy students_select on public.students for select to authenticated using (
  public.has_any_role('{direcao,secretaria,financeiro,coordenacao}')
  or id in (select public.teacher_student_ids())
  or id in (select public.guardian_student_ids())
);
create policy students_insert on public.students for insert to authenticated with check (public.has_any_role('{direcao,secretaria}'));
create policy students_update on public.students for update to authenticated
  using (public.has_any_role('{direcao,secretaria}')) with check (public.has_any_role('{direcao,secretaria}'));
create policy students_delete on public.students for delete to authenticated using (public.has_role('direcao'));

-- ---------- classes / class_subjects / enrollments ----------
create policy classes_select on public.classes for select to authenticated using (
  public.has_any_role('{direcao,secretaria,financeiro,coordenacao}') or id in (select public.teacher_class_ids()));
create policy classes_write on public.classes for all to authenticated
  using (public.has_any_role('{direcao,secretaria,coordenacao}')) with check (public.has_any_role('{direcao,secretaria,coordenacao}'));

create policy class_subjects_select on public.class_subjects for select to authenticated using (
  public.has_any_role('{direcao,secretaria,coordenacao}') or class_id in (select public.teacher_class_ids()));
create policy class_subjects_write on public.class_subjects for all to authenticated
  using (public.has_any_role('{direcao,coordenacao}')) with check (public.has_any_role('{direcao,coordenacao}'));

create policy enrollments_select on public.enrollments for select to authenticated using (
  public.has_any_role('{direcao,secretaria,financeiro,coordenacao}')
  or class_id in (select public.teacher_class_ids())
  or student_id in (select public.guardian_student_ids()));
create policy enrollments_insert on public.enrollments for insert to authenticated with check (public.has_any_role('{direcao,secretaria}'));
create policy enrollments_update on public.enrollments for update to authenticated
  using (public.has_any_role('{direcao,secretaria}')) with check (public.has_any_role('{direcao,secretaria}'));
create policy enrollments_delete on public.enrollments for delete to authenticated using (public.has_role('direcao'));

-- ---------- Financeiro: responsáveis financeiros enxergam as próprias cobranças ----------
create policy invoices_guardian_select on public.invoices for select to authenticated
  using (student_id in (select public.guardian_student_ids(true)));

-- ---------- Frequência ----------
create policy attendance_select on public.attendance_records for select to authenticated using (
  public.has_any_role('{direcao,secretaria,coordenacao}')
  or class_id in (select public.teacher_class_ids())
  or student_id in (select public.guardian_student_ids()));
create policy attendance_insert on public.attendance_records for insert to authenticated with check (
  public.has_any_role('{direcao,secretaria,coordenacao}') or class_id in (select public.teacher_class_ids()));
create policy attendance_update on public.attendance_records for update to authenticated
  using (public.has_any_role('{direcao,secretaria,coordenacao}') or class_id in (select public.teacher_class_ids()))
  with check (public.has_any_role('{direcao,secretaria,coordenacao}') or class_id in (select public.teacher_class_ids()));
create policy attendance_delete on public.attendance_records for delete to authenticated using (public.has_role('direcao'));

-- ---------- Pedagógico (financeiro NÃO tem acesso) ----------
create policy assessments_select on public.assessments for select to authenticated using (
  public.has_any_role('{direcao,coordenacao}') or class_id in (select public.teacher_class_ids()));
create policy assessments_insert on public.assessments for insert to authenticated with check (
  public.has_any_role('{direcao,coordenacao}') or class_id in (select public.teacher_class_ids()));
create policy assessments_update on public.assessments for update to authenticated
  using (public.has_any_role('{direcao,coordenacao}') or (class_id in (select public.teacher_class_ids()) and created_by = auth.uid()))
  with check (public.has_any_role('{direcao,coordenacao}') or (class_id in (select public.teacher_class_ids()) and created_by = auth.uid()));
create policy assessments_delete on public.assessments for delete to authenticated using (public.has_role('direcao'));

create policy ped_reports_select on public.pedagogical_reports for select to authenticated using (
  public.has_any_role('{direcao,coordenacao}')
  or author_id = auth.uid()
  or (not is_sensitive and class_id in (select public.teacher_class_ids())));
create policy ped_reports_insert on public.pedagogical_reports for insert to authenticated with check (
  public.has_any_role('{direcao,coordenacao}') or class_id in (select public.teacher_class_ids()));
create policy ped_reports_update on public.pedagogical_reports for update to authenticated
  using (public.has_any_role('{direcao,coordenacao}') or author_id = auth.uid())
  with check (public.has_any_role('{direcao,coordenacao}') or author_id = auth.uid());
create policy ped_reports_delete on public.pedagogical_reports for delete to authenticated using (public.has_role('direcao'));

-- ---------- Documentos ----------
create policy documents_select on public.documents for select to authenticated using (public.has_any_role('{direcao,secretaria}'));
create policy documents_write on public.documents for all to authenticated
  using (public.has_any_role('{direcao,secretaria}')) with check (public.has_any_role('{direcao,secretaria}'));

-- ---------- Comunicados ----------
create policy announcements_select on public.announcements for select to authenticated using (
  public.has_any_role('{direcao,secretaria,coordenacao}')
  or (published_at is not null and (
        audience = 'geral'
        or (audience = 'turma' and (class_id in (select public.teacher_class_ids())
              or class_id in (select e.class_id from public.enrollments e where e.student_id in (select public.guardian_student_ids()))))
        or (audience = 'individual' and student_id in (select public.guardian_student_ids()))
  )) and public.has_any_role('{professor,responsavel,financeiro}'));
create policy announcements_write on public.announcements for all to authenticated
  using (public.has_any_role('{direcao,secretaria,coordenacao}')) with check (public.has_any_role('{direcao,secretaria,coordenacao}'));

-- ---------- Auditoria: somente leitura pela Direção (gravação só via trigger) ----------
create policy audit_select on public.audit_logs for select to authenticated using (public.has_role('direcao'));

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('school-assets','school-assets', true) on conflict do nothing; -- logotipo
insert into storage.buckets (id, name, public) values ('documents','documents', false) on conflict do nothing;      -- PRIVADO

create policy "assets_read" on storage.objects for select using (bucket_id = 'school-assets');
create policy "assets_write" on storage.objects for insert to authenticated with check (bucket_id = 'school-assets' and public.has_role('direcao'));
create policy "assets_update" on storage.objects for update to authenticated using (bucket_id = 'school-assets' and public.has_role('direcao'));
create policy "assets_delete" on storage.objects for delete to authenticated using (bucket_id = 'school-assets' and public.has_role('direcao'));
create policy "docs_read" on storage.objects for select to authenticated using (bucket_id = 'documents' and public.has_any_role('{direcao,secretaria}'));
create policy "docs_write" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and public.has_any_role('{direcao,secretaria}'));
create policy "docs_update" on storage.objects for update to authenticated using (bucket_id = 'documents' and public.has_any_role('{direcao,secretaria}'));
create policy "docs_delete" on storage.objects for delete to authenticated using (bucket_id = 'documents' and public.has_role('direcao'));

-- ---------- Revoga acesso anônimo às tabelas e funções sensíveis ----------
revoke all on all tables in schema public from anon;
revoke execute on function public.touch_last_access() from anon;
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


-- =====================================================================
-- ATIVAÇÃO AUTOMÁTICA DO PRIMEIRO ADMINISTRADOR (admin@littlegarden.com.br)
-- =====================================================================
-- 1. Confirma o e-mail no Auth
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'admin@littlegarden.com.br';

-- 2. Garante o perfil ativo
insert into public.profiles (id, full_name, email, is_active)
select id, 'Direção Little Garden', email, true
from auth.users
where email = 'admin@littlegarden.com.br'
on conflict (id) do update set is_active = true, full_name = 'Direção Little Garden';

-- 3. Atribui a permissão total de Direção
insert into public.user_roles (user_id, role)
select id, 'direcao'::public.user_role
from auth.users
where email = 'admin@littlegarden.com.br'
on conflict (user_id, role) do nothing;
-- =====================================================================
-- LITTLE GARDEN ERP — 0006: Fardamentos, Materiais Escolares e Rematrícula 2027
-- =====================================================================

-- 1. Garante a existência do Ano Letivo de 2027
insert into public.school_years (year, starts_on, ends_on, is_current)
values (2027, '2027-01-01', '2027-12-31', false)
on conflict (year) do nothing;

-- 2. Tabela de Catálogo de Fardamentos e Materiais
create table if not exists public.school_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('fardamento', 'material')),
  name text not null,
  category text,
  stage_id uuid references public.education_stages(id) on delete set null,
  size text,
  unit_price numeric(10,2) not null default 0.00,
  cost_price numeric(10,2) default 0.00,
  stock_quantity int default 0,
  min_stock int default 0,
  school_year_id uuid references public.school_years(id) on delete set null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger de updated_at
drop trigger if exists set_school_items_updated_at on public.school_items;
create trigger set_school_items_updated_at
before update on public.school_items
for each row execute function public.set_updated_at();

-- 3. Políticas de Segurança (RLS)
alter table public.school_items enable row level security;

drop policy if exists school_items_select on public.school_items;
create policy school_items_select on public.school_items
for select to authenticated
using (public.has_any_role('{direcao,secretaria,financeiro,coordenacao,professor}'));

drop policy if exists school_items_insert on public.school_items;
create policy school_items_insert on public.school_items
for insert to authenticated
with check (public.has_any_role('{direcao,secretaria}'));

drop policy if exists school_items_update on public.school_items;
create policy school_items_update on public.school_items
for update to authenticated
using (public.has_any_role('{direcao,secretaria}'))
with check (public.has_any_role('{direcao,secretaria}'));

drop policy if exists school_items_delete on public.school_items;
create policy school_items_delete on public.school_items
for delete to authenticated
using (public.has_role('direcao'));

-- 4. Dados Iniciais de Fardamentos e Materiais Little Garden
insert into public.school_items (type, name, category, size, unit_price, cost_price, stock_quantity, min_stock, description, is_active)
values
  ('fardamento', 'Camisa Polo Manga Curta (Uniforme Diário)', 'Diário', 'Tam 2 a 12, P, M', 65.00, 32.00, 48, 10, 'Polo em piquet verde floresta com gola em ribana e brasão bordado.', true),
  ('fardamento', 'Bermuda Helanca com Elástico', 'Diário', 'Tam 2 a 12', 55.00, 26.00, 35, 10, 'Bermuda confortável com bolsos e cordão ajustável na cintura.', true),
  ('fardamento', 'Saia-Short Feminina Helanca', 'Diário', 'Tam 2 a 10', 58.00, 28.00, 22, 8, 'Saia com short embutido para maior liberdade de movimento.', true),
  ('fardamento', 'Casaco Moletom com Zíper e Capuz', 'Inverno', 'Tam 2 a 12, P', 110.00, 55.00, 18, 5, 'Moletom flanelado verde musgo com forro macio e estampa bordada.', true),
  ('fardamento', 'Camisa Regata de Algodão (Ed. Física)', 'Educação Física', 'Tam 2 a 12', 45.00, 20.00, 40, 10, '100% algodão penteado, fresca e ideal para atividades esportivas.', true),
  ('material', 'Kit de Material Pedagógico Coletivo — Infantil I e II', 'Kit Pedagógico', 'Kit Anual 2027', 420.00, 290.00, 30, 5, 'Massas de modelar, tintas guache, papéis coloridos, giz de cera jumbo e pincéis.', true),
  ('material', 'Kit de Material Pedagógico Coletivo — Infantil III e IV', 'Kit Pedagógico', 'Kit Anual 2027', 460.00, 310.00, 25, 5, 'Tesouras sem ponta, canetas hidrográficas, pastas, blocos de desenho A3 e A4.', true),
  ('material', 'Kit Didático e Cadernos — Ensino Fundamental I', 'Livros e Cadernos', 'Kit Anual 2027', 550.00, 390.00, 20, 5, 'Cadernos brochura personalizados, agenda escolar 2027 e kit de arte avançado.', true),
  ('material', 'Taxa Anual de Materiais de Higiene e Primeiros Socorros', 'Taxa Anual', 'Por Aluno', 180.00, 110.00, 100, 10, 'Lenços umedecidos, álcool 70%, sabonetes líquidos infantis e curativos.', true)
on conflict do nothing;
