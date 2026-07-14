-- ============================================================
-- PHASE 3 : table files + policies Storage bucket doc_entreprise
-- A exécuter dans Supabase SQL Editor
-- ============================================================

-- Table pour stocker les métadonnées des fichiers
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  storage_path text not null,
  size bigint,
  created_at timestamptz default now()
);

alter table files enable row level security;

create policy "files_owner_all" on files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Policies Storage pour le bucket doc_entreprise
-- ============================================================

-- Lire ses propres fichiers
create policy "storage_select" on storage.objects
  for select using (
    bucket_id = 'doc_entreprise' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Uploader dans son propre dossier
create policy "storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'doc_entreprise' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Supprimer ses propres fichiers
create policy "storage_delete" on storage.objects
  for delete using (
    bucket_id = 'doc_entreprise' and auth.uid()::text = (storage.foldername(name))[1]
  );
