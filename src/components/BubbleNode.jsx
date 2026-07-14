/**
 * BubbleNode.jsx
 * --------------
 * Composant visuel d'un nœud (bulle = entreprise) dans React Flow.
 * Affiche : avatar/logo, badge de statut style Discord, popup au survol.
 * Reçoit tous ses callbacks depuis MindMap via la prop `data`.
 */

import { memo, useRef, useState } from 'react'
import { Handle, Position } from 'reactflow'
import { STATUS_CONFIG } from '../lib/constants'

function BubbleNode({ data, id }) {
  const [hovered, setHovered] = useState(false)
  const hideTimer = useRef(null)
  const status = STATUS_CONFIG[data.status] || STATUS_CONFIG.idea
  const hasLogo = !!data.logo_url

  function handleMouseEnter() {
    clearTimeout(hideTimer.current)
    setHovered(true)
    data.onHoverChange?.(id, true)
  }
  function handleMouseLeave() {
    hideTimer.current = setTimeout(() => {
      setHovered(false)
      data.onHoverChange?.(id, false)
    }, 180)
  }
  function handleContextMenu(e) {
    e.preventDefault()
    e.stopPropagation()
    data.onContextMenu?.(id, e.clientX, e.clientY)
  }

  return (
    <div
      className={`business-bubble${data.selected ? ' selected' : ''}`}
      style={{ '--status-color': status.color }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => { e.stopPropagation(); data.onSelect(id) }}
      onContextMenu={handleContextMenu}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* Avatar — PAS nodrag ici pour garder le drag */}
      <div className="bubble-avatar" style={{ borderColor: status.color }}>
        {hasLogo
          ? <img src={data.logo_url} alt={data.title} className="bubble-logo" />
          : <div className="bubble-initials" style={{ background: status.color + '33' }}>
              {data.title?.[0]?.toUpperCase() || '?'}
            </div>
        }
        <div className="bubble-status-badge" style={{ background: status.color }} title={status.label}>
          <span>{status.icon}</span>
        </div>
      </div>

      {/* Nom — PAS nodrag pour garder le drag */}
      <div className="bubble-name">{data.title || 'Sans nom'}</div>

      {/* Popup — nodrag uniquement ici car elle a des boutons interactifs */}
      {hovered && (
        <div
          className="bubble-popup nodrag"
          onMouseEnter={() => { clearTimeout(hideTimer.current); setHovered(true) }}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="popup-header">
            <span className="popup-title">{data.title}</span>
            <span className="popup-status" style={{ color: status.color }}>
              {status.icon} {status.label}
            </span>
          </div>
          {data.sector && <div className="popup-sector">{data.sector}</div>}
          {data.description && <div className="popup-desc">{data.description}</div>}

          {(data.urgentTasks > 0 || data.kpiAlert || (data.goalPercent != null && data.goalPercent > 0)) && (
            <div className="popup-divider" />
          )}

          <div className="popup-stats">
            {data.urgentTasks > 0 && (
              <span className="popup-stat urgent">
                ⚠️ {data.urgentTasks} tâche{data.urgentTasks > 1 ? 's urgentes' : ' urgente'}
              </span>
            )}
            {data.kpiAlert && <span className="popup-stat danger">📉 KPI en danger</span>}
            {data.goalPercent != null && data.goalPercent > 0 && (
              <div className="popup-goal">
                <div className="popup-goal-bar">
                  <div className="popup-goal-fill" style={{
                    width: `${Math.min(data.goalPercent, 100)}%`,
                    background: data.goalPercent >= 70 ? '#22c55e' : data.goalPercent >= 30 ? '#f97316' : '#ef4444'
                  }} />
                </div>
                <span className="popup-goal-label">💰 {Math.round(data.goalPercent)}% objectif mensuel</span>
              </div>
            )}
          </div>

          <div className="popup-actions">
            <button className="popup-open-btn" onClick={(e) => { e.stopPropagation(); data.onSelect(id) }}>
              ✎ Ouvrir
            </button>
            {data.canEdit && (
              <button className="popup-add-btn" onClick={(e) => { e.stopPropagation(); data.onAddChild(id) }}>
                + Sous-projet
              </button>
            )}
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

export default memo(BubbleNode)
