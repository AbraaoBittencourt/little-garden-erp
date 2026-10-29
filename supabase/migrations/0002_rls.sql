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
