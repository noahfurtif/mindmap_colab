# Carte Mentale Collaborative — Phase 1 (MVP)

## Ce qui est fait (Phase 1)
- Authentification Supabase (email/mot de passe, login + signup + logout)
- Espace privé par utilisateur (RLS : chaque user ne voit que ses données)
- Carte mentale React Flow avec bulle centrale créée automatiquement
- Ajout de bulles à l'infini (bouton "+ bulle" sur chaque noeud)
- Drag & drop libre, sauvegarde de la position en base au relâchement
- Connexions manuelles entre bulles (glisser depuis le bord d'une bulle)
- Édition du titre de chaque bulle (sauvegardé au blur)
- Schéma DB complet (boards, nodes, edges, tasks) avec RLS + realtime activé
  pour préparer les Phases 2 et 3 sans migration supplémentaire

## Installation

1. Créer un projet sur https://supabase.com
2. Dans le SQL Editor du projet, exécuter `supabase/schema.sql`
3. Copier `.env.example` en `.env.local` et renseigner :
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   (Project Settings > API)
4. Installer les dépendances :
   ```
   npm install
   ```
5. Lancer le serveur de dev :
   ```
   npm run dev
   ```

## Ce qu'il reste (prochaines phases)

### Phase 2
- Panneau latéral pour éditer notes + tâches d'une bulle (tables déjà créées)
- Tâches cochables / suppression = tâche faite
- UI : clic sur une bulle ouvre le panneau au lieu d'éditer inline

### Phase 3
- Upload de fichiers (Supabase Storage)
- Synchronisation temps réel multi-utilisateur (abonnement `supabase.channel`)
- Partage de carte entre utilisateurs (table `board_members` + RLS adaptée)

## Prochaine action proposée
Implémenter le panneau latéral (Phase 2) : clic sur une bulle → ouverture
d'un panneau avec notes (textarea) et liste de tâches, branché sur les
tables `nodes.notes` et `tasks` déjà créées dans le schéma.
