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
