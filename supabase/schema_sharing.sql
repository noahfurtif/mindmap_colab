-- ============================================================
-- PHASE 3 : Partage de cartes (board_members + board_invites)
-- A exécuter dans Supabase SQL Editor
-- ============================================================

-- Membres d'une carte (invitations acceptées)
create table if not exists board_members (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text check (role in ('viewer', 'editor')) not null default 'viewer',
  created_at timestamptz default now(),
  unique(board_id, user_id)
);

-- Invitations (par email ou par lien avec token)
create table if not exists board_invites (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  invited_by uuid references auth.users(id) not null,
  email text,                  -- null = invitation par lien
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  role text check (role in ('viewer', 'editor')) not null default 'viewer',
  accepted boolean default false,
  expires_at timestamptz default now() + interval '7 days',
  created_at timestamptz default now()
);

alter table board_members enable row level security;
alter table board_invites enable row level security;

-- board_members : le propriétaire gère, les membres peuvent se voir
create policy "members_owner_manage" on board_members
  for all using (
    auth.uid() = (select user_id from boards where id = board_id)
  ) with check (
    auth.uid() = (select user_id from boards where id = board_id)
  );

create policy "members_self_read" on board_members
  for select using (auth.uid() = user_id);

-- board_invites : le propriétaire gère, n'importe qui peut lire par token (pour rejoindre)
create policy "invites_owner_manage" on board_invites
  for all using (auth.uid() = invited_by) with check (auth.uid() = invited_by);

create policy "invites_read_by_token" on board_invites
  for select using (true); -- lecture publique pour valider un token

create policy "invites_accept" on board_invites
  for update using (true); -- pour marquer accepted=true

-- ============================================================
-- Mettre à jour les RLS des tables existantes
-- pour autoriser les membres à accéder aux données
-- ============================================================

-- BOARDS : propriétaire OU membre peut lire
drop policy if exists "boards_owner_all" on boards;

create policy "boards_owner_all" on boards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "boards_member_read" on boards
  for select using (
    exists (select 1 from board_members where board_id = boards.id and user_id = auth.uid())
  );

-- NODES : propriétaire peut tout faire, membre-editor peut tout faire, viewer peut lire
drop policy if exists "nodes_owner_all" on nodes;

create policy "nodes_owner_all" on nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "nodes_member_read" on nodes
  for select using (
    exists (select 1 from board_members where board_id = nodes.board_id and user_id = auth.uid())
  );

create policy "nodes_editor_insert" on nodes
  for insert with check (
    exists (
      select 1 from board_members
      where board_id = nodes.board_id and user_id = auth.uid() and role = 'editor'
    )
  );

create policy "nodes_editor_update" on nodes
  for update using (
    exists (
      select 1 from board_members
      where board_id = nodes.board_id and user_id = auth.uid() and role = 'editor'
    )
  );

create policy "nodes_editor_delete" on nodes
  for delete using (
    exists (
      select 1 from board_members
      where board_id = nodes.board_id and user_id = auth.uid() and role = 'editor'
    )
  );

-- EDGES
drop policy if exists "edges_owner_all" on edges;

create policy "edges_owner_all" on edges
  for all using (
    auth.uid() = (select user_id from boards where id = edges.board_id)
  ) with check (
    auth.uid() = (select user_id from boards where id = edges.board_id)
  );

create policy "edges_member_read" on edges
  for select using (
    exists (select 1 from board_members where board_id = edges.board_id and user_id = auth.uid())
  );

create policy "edges_editor_write" on edges
  for insert with check (
    exists (
      select 1 from board_members
      where board_id = edges.board_id and user_id = auth.uid() and role = 'editor'
    )
  );

create policy "edges_editor_delete" on edges
  for delete using (
    exists (
      select 1 from board_members
      where board_id = edges.board_id and user_id = auth.uid() and role = 'editor'
    )
  );

-- TASKS
drop policy if exists "tasks_owner_all" on tasks;

create policy "tasks_owner_all" on tasks
  for all using (
    auth.uid() = (select user_id from nodes where id = tasks.node_id)
  ) with check (
    auth.uid() = (select user_id from nodes where id = tasks.node_id)
  );

create policy "tasks_member_read" on tasks
  for select using (
    exists (
      select 1 from board_members bm
      join nodes n on n.board_id = bm.board_id
      where n.id = tasks.node_id and bm.user_id = auth.uid()
    )
  );

create policy "tasks_editor_write" on tasks
  for all using (
    exists (
      select 1 from board_members bm
      join nodes n on n.board_id = bm.board_id
      where n.id = tasks.node_id and bm.user_id = auth.uid() and bm.role = 'editor'
    )
  ) with check (
    exists (
      select 1 from board_members bm
      join nodes n on n.board_id = bm.board_id
      where n.id = tasks.node_id and bm.user_id = auth.uid() and bm.role = 'editor'
    )
  );

-- FILES
drop policy if exists "files_owner_all" on files;

create policy "files_owner_all" on files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "files_member_read" on files
  for select using (
    exists (
      select 1 from board_members bm
      join nodes n on n.board_id = bm.board_id
      where n.id = files.node_id and bm.user_id = auth.uid()
    )
  );

-- Realtime pour board_members
alter publication supabase_realtime add table board_members;
