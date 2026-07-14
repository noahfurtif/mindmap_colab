/**
 * useRealtime.js
 * --------------
 * Hook gérant la synchronisation temps réel des nœuds et connexions
 * d'une carte via Supabase Realtime (WebSockets).
 * Utilisé dans MindMap.jsx.
 *
 * Note : la synchro du contenu des nœuds (tâches, finances, etc.)
 * est gérée séparément dans useNodeData.js.
 */
import { useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Abonnement temps réel aux changements de nodes et edges d'une board.
 * Appelle les callbacks fournis quand un changement distant arrive.
 */
export function useRealtime({ boardId, onNodeChange, onEdgeChange }) {
  useEffect(() => {
    if (!boardId) return

    const channel = supabase
      .channel(`board-${boardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nodes', filter: `board_id=eq.${boardId}` },
        (payload) => onNodeChange(payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'edges', filter: `board_id=eq.${boardId}` },
        (payload) => onEdgeChange(payload)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [boardId])
}
