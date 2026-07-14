-- ============================================================
-- SCHEMA EMPLOYEES
-- A exécuter dans Supabase SQL Editor
-- ============================================================

-- Table des employés (par carte mentale)
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  first_name text not null,
  last_name text not null,
  email text default '',
  skills text default '',
  created_at timestamptz default now()
);

-- Ajouter la colonne d'assignation sur les tâches
-- on delete set null : si l'employé est supprimé, la tâche reste sans assignation
alter table tasks
  add column if not exists assigned_to uuid references employees(id) on delete set null;

-- RLS
alter table employees enable row level security;

-- Propriétaire : accès complet
create policy "employees_owner_all" on employees
  for all using (
    auth.uid() = (select user_id from boards where id = employees.board_id)
  ) with check (
    auth.uid() = (select user_id from boards where id = employees.board_id)
  );

-- Membres : lecture
create policy "employees_member_read" on employees
  for select using (
    exists (
      select 1 from board_members
      where board_id = employees.board_id and user_id = auth.uid()
    )
  );

-- Membres éditeurs : écriture
create policy "employees_editor_write" on employees
  for all using (
    exists (
      select 1 from board_members
      where board_id = employees.board_id and user_id = auth.uid() and role = 'editor'
    )
  ) with check (
    exists (
      select 1 from board_members
      where board_id = employees.board_id and user_id = auth.uid() and role = 'editor'
    )
  );

-- Realtime
alter publication supabase_realtime add table employees;
alter table employees replica identity full;
