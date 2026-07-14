/**
 * EmployeesPanel.jsx
 * ------------------
 * Panneau de gestion des employés d'une carte mentale.
 * S'ouvre en overlay depuis la toolbar.
 *
 * Fonctionnalités :
 *  - Créer un profil employé (prénom, nom, email, compétences)
 *  - Voir la liste des employés avec leurs tâches assignées
 *  - Supprimer un employé (ses tâches restent, juste désassignées)
 *  - Synchronisation temps réel entre collaborateurs
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Génère les initiales pour l'avatar
function initials(first, last) {
  return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || '?'
}

// Couleur d'avatar déterministe selon le nom
const AVATAR_COLORS = ['#4f7cff', '#22c55e', '#f59e0b', '#a78bfa', '#f97316', '#ef4444', '#3b82f6']
function avatarColor(id) {
  let hash = 0
  for (const c of (id || '')) hash = (hash + c.charCodeAt(0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[hash]
}

const EMPTY_FORM = { first_name: '', last_name: '', email: '', skills: '' }

export default function EmployeesPanel({ boardId, session, canEdit, onClose, onEmployeesChange }) {
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [taskCounts, setTaskCounts] = useState({}) // { employeeId: count }

  // ── Chargement initial ──────────────────────────────────────────
  useEffect(() => {
    loadEmployees()

    // Realtime : sync si un collaborateur ajoute/modifie un employé
    const channel = supabase
      .channel(`employees-${boardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') setEmployees(es => es.find(e => e.id === n.id) ? es : [...es, n])
          else if (eventType === 'UPDATE') setEmployees(es => es.map(e => e.id === n.id ? n : e))
          else if (eventType === 'DELETE') setEmployees(es => es.filter(e => e.id !== o.id))
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [boardId])

  async function loadEmployees() {
    setLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at')
    if (!error) {
      setEmployees(data || [])
      // Compter les tâches assignées par employé
      if (data?.length > 0) {
        const ids = data.map(e => e.id)
        const { data: tasks } = await supabase
          .from('tasks')
          .select('assigned_to')
          .in('assigned_to', ids)
          .eq('done', false)
        const counts = {}
        for (const t of tasks || []) {
          counts[t.assigned_to] = (counts[t.assigned_to] || 0) + 1
        }
        setTaskCounts(counts)
      }
    }
    setLoading(false)
  }

  // ── CRUD ────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.first_name.trim() || !form.last_name.trim()) return

    if (editingId) {
      // Modification
      const { error } = await supabase.from('employees')
        .update({ first_name: form.first_name.trim(), last_name: form.last_name.trim(),
          email: form.email.trim(), skills: form.skills.trim() })
        .eq('id', editingId)
      if (error) { setError(error.message); return }
      setEmployees(es => es.map(e => e.id === editingId ? { ...e, ...form } : e))
      setEditingId(null)
    } else {
      // Création
      const { data, error } = await supabase.from('employees')
        .insert({ board_id: boardId, user_id: session.user.id,
          first_name: form.first_name.trim(), last_name: form.last_name.trim(),
          email: form.email.trim(), skills: form.skills.trim() })
        .select().single()
      if (error) { setError(error.message); return }
      setEmployees(es => [...es, data])
    }

    setForm(EMPTY_FORM)
    onEmployeesChange?.()
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cet employé ? Ses tâches seront désassignées.')) return
    await supabase.from('employees').delete().eq('id', id)
    setEmployees(es => es.filter(e => e.id !== id))
    onEmployeesChange?.()
  }

  function startEdit(emp) {
    setEditingId(emp.id)
    setForm({ first_name: emp.first_name, last_name: emp.last_name,
      email: emp.email || '', skills: emp.skills || '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  return (
    <div className="employees-overlay" onClick={onClose}>
      <div className="employees-panel" onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="employees-header">
          <div>
            <h2 className="employees-title">👥 Équipe</h2>
            <p className="employees-subtitle">{employees.length} employé{employees.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Formulaire création / édition */}
        {canEdit && (
          <form onSubmit={handleSubmit} className="employees-form">
            <h3 className="employees-form-title">
              {editingId ? '✏️ Modifier' : '+ Nouvel employé'}
            </h3>
            <div className="employees-form-row">
              <div className="field-group">
                <label className="field-label">Prénom *</label>
                <input className="field-input" value={form.first_name}
                  onChange={e => setForm(f => ({...f, first_name: e.target.value}))}
                  placeholder="Jean" required />
              </div>
              <div className="field-group">
                <label className="field-label">Nom *</label>
                <input className="field-input" value={form.last_name}
                  onChange={e => setForm(f => ({...f, last_name: e.target.value}))}
                  placeholder="Dupont" required />
              </div>
            </div>
            <div className="employees-form-row">
              <div className="field-group">
                <label className="field-label">Email</label>
                <input className="field-input" type="email" value={form.email}
                  onChange={e => setForm(f => ({...f, email: e.target.value}))}
                  placeholder="jean.dupont@email.com" />
              </div>
              <div className="field-group">
                <label className="field-label">Compétences</label>
                <input className="field-input" value={form.skills}
                  onChange={e => setForm(f => ({...f, skills: e.target.value}))}
                  placeholder="Design, React, Marketing…" />
              </div>
            </div>
            {error && <div className="panel-error">{error}</div>}
            <div className="employees-form-actions">
              <button type="submit" className="btn-primary">
                {editingId ? 'Sauvegarder' : '+ Ajouter'}
              </button>
              {editingId && (
                <button type="button" className="btn-ghost" onClick={cancelEdit}>Annuler</button>
              )}
            </div>
          </form>
        )}

        {/* Liste des employés */}
        <div className="employees-list">
          {loading && <p className="empty-state">Chargement…</p>}
          {!loading && employees.length === 0 && (
            <p className="empty-state">Aucun employé pour l'instant.<br/>Ajoutez le premier membre de votre équipe.</p>
          )}

          {employees.map(emp => (
            <div key={emp.id} className={`employee-card${editingId === emp.id ? ' editing' : ''}`}>
              {/* Avatar */}
              <div className="employee-avatar" style={{ background: avatarColor(emp.id) }}>
                {initials(emp.first_name, emp.last_name)}
              </div>

              {/* Infos */}
              <div className="employee-info">
                <div className="employee-name">{emp.first_name} {emp.last_name}</div>
                {emp.email && (
                  <a href={`mailto:${emp.email}`} className="employee-email">✉️ {emp.email}</a>
                )}
                {emp.skills && (
                  <div className="employee-skills">
                    {emp.skills.split(',').map(s => s.trim()).filter(Boolean).map(skill => (
                      <span key={skill} className="skill-badge">{skill}</span>
                    ))}
                  </div>
                )}
                {taskCounts[emp.id] > 0 && (
                  <div className="employee-tasks-count">
                    ✅ {taskCounts[emp.id]} tâche{taskCounts[emp.id] > 1 ? 's' : ''} assignée{taskCounts[emp.id] > 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {/* Actions */}
              {canEdit && (
                <div className="employee-actions">
                  <button className="employee-action-btn" onClick={() => startEdit(emp)} title="Modifier">✏️</button>
                  <button className="employee-action-btn danger" onClick={() => handleDelete(emp.id)} title="Supprimer">🗑️</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
