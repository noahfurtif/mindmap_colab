-- ============================================================
-- PHASE 4 : Business Mind Map
-- Ajouter colonnes à nodes + nouvelles tables
-- A exécuter dans Supabase SQL Editor
-- ============================================================

-- Nouvelles colonnes sur nodes
alter table nodes
  add column if not exists status text default 'idea'
    check (status in ('idea','building','active','paused','closed')),
  add column if not exists sector text default '',
  add column if not exists description text default '',
  add column if not exists website text default '',
  add column if not exists logo_url text default '',
  add column if not exists founded_at date;

-- Finances : entrées de revenus / dépenses
create table if not exists finances (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  label text not null,
  amount float not null,         -- positif = revenu, négatif = dépense
  entry_date date default current_date,
  monthly_goal float default 0,
  created_at timestamptz default now()
);

-- KPIs
create table if not exists kpis (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  icon text default '📊',
  current_value float default 0,
  target_value float not null,
  target_date date,
  created_at timestamptz default now()
);

-- Journal de bord
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text default 'note'
    check (type in ('decision','milestone','problem','idea','meeting')),
  content text not null,
  entry_date date default current_date,
  created_at timestamptz default now()
);

-- Liens utiles
create table if not exists links (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  url text not null,
  created_at timestamptz default now()
);

-- RLS
alter table finances enable row level security;
alter table kpis enable row level security;
alter table journal_entries enable row level security;
alter table links enable row level security;

create policy "finances_owner" on finances
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kpis_owner" on kpis
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "journal_owner" on journal_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "links_owner" on links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Mettre à jour les tâches : ajouter priorité et date limite
alter table tasks
  add column if not exists priority text default 'normal'
    check (priority in ('urgent','normal','low')),
  add column if not exists due_date date;

-- Realtime
alter publication supabase_realtime add table finances;
alter publication supabase_realtime add table kpis;

-- ============================================================
-- IMPORTANT : rendre le dossier logos/ public dans le bucket
-- A faire dans Supabase Dashboard :
-- Storage → doc_entreprise → Policies → New Policy
-- Ou via SQL :
-- ============================================================
insert into storage.buckets (id, name, public) 
values ('doc_entreprise', 'doc_entreprise', false)
on conflict (id) do nothing;

-- Policy lecture publique uniquement pour les logos
create policy "logos_public_read" on storage.objects
  for select using (
    bucket_id = 'doc_entreprise' and
    (storage.foldername(name))[1] = 'logos'
  );
