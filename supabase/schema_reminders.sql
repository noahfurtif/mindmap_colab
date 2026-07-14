-- ============================================================
-- SCHEMA REMINDERS
-- A exécuter dans Supabase SQL Editor
-- ============================================================

-- Ajouter une colonne pour éviter les doublons de rappels
-- La valeur est mise à jour après chaque envoi d'email
alter table tasks
  add column if not exists notified_at date;
