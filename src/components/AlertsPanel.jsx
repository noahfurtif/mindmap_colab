/**
 * AlertsPanel.jsx
 * ---------------
 * Panneau d'alertes affiché en overlay haut-gauche de la carte.
 * Affiche en temps réel : tâches urgentes/en retard + KPIs en danger (<30%).
 * Un clic sur une alerte ouvre directement le panneau de l'entreprise concernée.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const STATUS_COLOR = {
  idea: '#f59e0b', building: '#3b82f6',
  active: '#22c55e', paused: '#f97316', closed: '#ef4444',
}

export default function AlertsPanel({ boardId, onSelectNode }) {
  const [open, setOpen] = useState(false)
  const [urgentTasks, setUrgentTasks] = useState([])
  const [dangerKpis, setDangerKpis] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAlerts()
    const interval = setInterval(loadAlerts, 60000) // refresh toutes les 60s
    return () => clearInterval(interval)
  }, [boardId])

  async function loadAlerts() {
    const today = new Date().toISOString().split('T')[0]

    // Tâches urgentes / en retard liées à ce board
    try {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*, node:node_id!inner(id, title, logo_url, status, board_id)')
        .eq('node.board_id', boardId)
        .eq('done', false)

      const urgent = (tasks || []).filter(t =>
        t.priority === 'urgent' || (t.due_date && t.due_date < today)
      )
      setUrgentTasks(urgent)
    } catch {
      setUrgentTasks([])
    }

    // KPIs en danger (< 30%)
    try {
      const { data: kpis } = await supabase
        .from('kpis')
        .select('*, node:node_id!inner(id, title, logo_url, status, board_id)')
        .eq('node.board_id', boardId)

      const danger = (kpis || []).filter(k =>
        k.target_value > 0 && (k.current_value / k.target_value) < 0.3
      )
      setDangerKpis(danger)
    } catch {
      setDangerKpis([])
    }

    setLoading(false)
  }

  const total = urgentTasks.length + dangerKpis.length

  function NodeAvatar({ node }) {
    const color = STATUS_COLOR[node.status] || '#666'
    return (
      <div className="alert-avatar" style={{ borderColor: color }}>
        {node.logo_url
          ? <img src={node.logo_url} alt="" />
          : <span style={{ color }}>{node.title?.[0]?.toUpperCase() || '?'}</span>
        }
      </div>
    )
  }

  return (
    <div className="alerts-panel">
      {/* Bouton toggle */}
      <button
        className={`alerts-toggle ${total > 0 ? 'has-alerts' : 'no-alerts'}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="alerts-toggle-left">
          {total > 0
            ? <><span className="alerts-badge">{total}</span> Alertes</>
            : <>✅ Aucune alerte</>
          }
        </span>
        <span className="alerts-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {/* Liste déroulante */}
      {open && (
        <div className="alerts-dropdown">
          {loading && <div className="alerts-empty">Chargement…</div>}

          {!loading && total === 0 && (
            <div className="alerts-empty">✨ Tout est en ordre !</div>
          )}

          {urgentTasks.length > 0 && (
            <div className="alerts-section">
              <div className="alerts-section-title">🔴 Tâches urgentes / en retard</div>
              {urgentTasks.map(task => (
                <div
                  key={task.id}
                  className="alert-item"
                  onClick={() => { onSelectNode(task.node.id); setOpen(false) }}
                >
                  <NodeAvatar node={task.node} />
                  <div className="alert-content">
                    <span className="alert-node-name">{task.node.title}</span>
                    <span className="alert-task-text">{task.content}</span>
                  </div>
                  {task.due_date && (
                    <span className="alert-date" style={{ color: task.due_date < new Date().toISOString().split('T')[0] ? '#ef4444' : '#9aa4b2' }}>
                      {task.due_date}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {dangerKpis.length > 0 && (
            <div className="alerts-section">
              <div className="alerts-section-title">📉 KPIs en danger</div>
              {dangerKpis.map(kpi => {
                const pct = Math.round((kpi.current_value / kpi.target_value) * 100)
                return (
                  <div
                    key={kpi.id}
                    className="alert-item"
                    onClick={() => { onSelectNode(kpi.node.id); setOpen(false) }}
                  >
                    <NodeAvatar node={kpi.node} />
                    <div className="alert-content">
                      <span className="alert-node-name">{kpi.node.title}</span>
                      <span className="alert-task-text">{kpi.icon} {kpi.name}</span>
                    </div>
                    <span className="alert-pct" style={{ color: '#ef4444' }}>{pct}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
