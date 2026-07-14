/**
 * ContextMenu.jsx
 * ---------------
 * Menu contextuel au clic droit sur une bulle.
 * Options : Ouvrir, Renommer, Dupliquer, Ajouter sous-projet, Supprimer.
 * Se ferme au clic extérieur ou via Escape.
 */
import { useEffect, useRef } from 'react'

const MENU_ITEMS = [
  { id: 'open',      icon: '✎',  label: 'Ouvrir le panneau',  danger: false },
  { id: 'rename',    icon: '✏️', label: 'Renommer',           danger: false },
  { id: 'duplicate', icon: '📋', label: 'Dupliquer',          danger: false },
  { id: 'child',     icon: '➕', label: 'Ajouter un sous-projet', danger: false },
  { id: 'divider' },
  { id: 'delete',    icon: '🗑️', label: 'Supprimer',          danger: true  },
]

export default function ContextMenu({ x, y, nodeId, onAction, onClose, canEdit }) {
  const ref = useRef(null)

  // Fermer si clic en dehors
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Ajuster position pour ne pas sortir de l'écran
  const menuWidth = 210
  const menuHeight = 220
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x
  const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y

  const items = canEdit ? MENU_ITEMS : MENU_ITEMS.filter(i => i.id === 'open')

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.id === 'divider') return <div key={i} className="context-divider" />
        return (
          <button
            key={item.id}
            className={`context-item${item.danger ? ' danger' : ''}`}
            onClick={() => { onAction(item.id, nodeId); onClose() }}
          >
            <span className="context-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
