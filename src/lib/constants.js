/**
 * constants.js
 * -----------
 * Toutes les constantes partagées entre les composants.
 * Modifier ici pour propager partout.
 */

// ── Statuts d'une entreprise ─────────────────────────────────────────────────
// Utilisé dans : BubbleNode (badge), SidePanel (dropdown Général)

export const STATUS_CONFIG = {
  idea:     { icon: '💡', color: '#f59e0b', label: 'Idée' },
  building: { icon: '⛏️', color: '#3b82f6', label: 'En construction' },
  active:   { icon: '💲', color: '#22c55e', label: 'Actif' },
  paused:   { icon: '🕐', color: '#f97316', label: 'En pause' },
  closed:   { icon: '🚫', color: '#ef4444', label: 'Fermé' },
}

// Format tableau pour les <select> dans le SidePanel
export const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({
  value,
  label: `${cfg.icon} ${cfg.label}`,
  color: cfg.color,
}))

// ── Types d'entrées du journal ───────────────────────────────────────────────
// Utilisé dans : SidePanel (onglet Journal)

export const JOURNAL_TYPES = [
  { value: 'decision',  label: '✍️ Décision',  color: '#4f7cff' },
  { value: 'milestone', label: '🎉 Milestone', color: '#22c55e' },
  { value: 'problem',   label: '⚠️ Problème',  color: '#ef4444' },
  { value: 'idea',      label: '💡 Idée',      color: '#f59e0b' },
  { value: 'meeting',   label: '📞 Réunion',   color: '#a78bfa' },
]

// ── Onglets du panneau latéral ────────────────────────────────────────────────
// Utilisé dans : SidePanel

export const SIDE_TABS = [
  { id: 'general',  label: '📋 Général' },
  { id: 'tasks',    label: '✅ Tâches' },
  { id: 'finances', label: '💰 Budget' },
  { id: 'kpis',     label: '📊 KPIs' },
  { id: 'journal',  label: '📓 Journal' },
  { id: 'links',    label: '🔗 Liens' },
]

// ── Supabase Storage ──────────────────────────────────────────────────────────
export const STORAGE_BUCKET = 'doc_entreprise'

// ── Utilitaires visuels KPI ────────────────────────────────────────────────────
// Retourne une couleur selon le pourcentage atteint d'un KPI

export function kpiColor(pct) {
  if (pct >= 70) return '#22c55e'  // vert
  if (pct >= 30) return '#f97316'  // orange
  return '#ef4444'                  // rouge
}

export function kpiBg(pct) {
  if (pct >= 70) return '#0f2a1a'
  if (pct >= 30) return '#2a1a0f'
  return '#2a0f0f'
}
