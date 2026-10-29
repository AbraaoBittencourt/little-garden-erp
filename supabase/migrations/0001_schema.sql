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
