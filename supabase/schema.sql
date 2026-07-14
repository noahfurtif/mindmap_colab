-- ============================================================
-- SCHEMA PHASE 1 : auth + boards + nodes + edges
-- A exécuter dans Supabase SQL Editor
-- ============================================================

-- Une "board" = une carte mentale appartenant à un utilisateur
create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Ma carte mentale',
  created_at timestamptz default now()
);

-- Un noeud (bulle) de la carte
create table if not exists nodes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Nouvelle bulle',
  notes text default '',
  position_x float not null default 0,
  position_y float not null default 0,
  is_root boolean default false,
  created_at timestamptz default now()
);

-- Une connexion entre deux noeuds (Phase 2, créée maintenant pour éviter une migration plus tard)
create table if not exists edges (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  source_node_id uuid references nodes(id) on delete cascade not null,
  target_node_id uuid references nodes(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- Tâches liées à un noeud (Phase 2, table créée maintenant)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id) on delete cascade not null,
  content text not null,
  done boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- RLS : chaque utilisateur ne voit/modifie que ses propres données
-- ============================================================
alter table boards enable row level security;
alter table nodes enable row level security;
alter table edges enable row level security;
alter table tasks enable row level security;

create policy "boards_owner_all" on boards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "nodes_owner_all" on nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "edges_owner_all" on edges
  for all using (
    auth.uid() = (select user_id from boards where boards.id = edges.board_id)
  ) with check (
    auth.uid() = (select user_id from boards where boards.id = edges.board_id)
  );

create policy "tasks_owner_all" on tasks
  for all using (
    auth.uid() = (select user_id from nodes where nodes.id = tasks.node_id)
  ) with check (
    auth.uid() = (select user_id from nodes where nodes.id = tasks.node_id)
  );

-- ============================================================
-- Realtime : activer la réplication pour la synchro temps réel
-- ============================================================
alter publication supabase_realtime add table nodes;
alter publication supabase_realtime add table edges;
alter publication supabase_realtime add table tasks;
