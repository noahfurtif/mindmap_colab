/**
 * BoardSelector.jsx
 * -----------------
 * Écran de sélection de carte affiché après la connexion.
 * Montre la carte personnelle de l'utilisateur + les cartes partagées avec lui.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function BoardSelector({ session, onSelect }) {
  const [ownBoard, setOwnBoard] = useState(null)
  const [sharedBoards, setSharedBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadBoards()
  }, [session.user.id])

  async function loadBoards() {
    setLoading(true)
    setError(null)
    const userId = session.user.id

    // Ma carte
    let { data: boards, error: boardsErr } = await supabase
      .from('boards')
      .select('*')
      .eq('user_id', userId)
      .limit(1)

    if (boardsErr) {
      console.error('Erreur boards:', boardsErr)
      setError(boardsErr.message)
      setLoading(false)
      return
    }

    let board = boards?.[0]

    // Créer la board si elle n'existe pas encore
    if (!board) {
      const { data: newBoard, error: createErr } = await supabase
        .from('boards')
        .insert({ user_id: userId, title: 'Ma carte mentale' })
        .select()
        .single()
      if (createErr) {
        console.error('Erreur création board:', createErr)
        setError(createErr.message)
        setLoading(false)
        return
      }
      board = newBoard
    }

    setOwnBoard(board)

    // Cartes partagées avec moi
    const { data: memberOf, error: memberErr } = await supabase
      .from('board_members')
      .select('role, boards(id, title, user_id)')
      .eq('user_id', userId)

    if (memberErr) {
      console.error('Erreur members:', memberErr)
      // Pas bloquant, on continue
    }

    setSharedBoards(
      (memberOf || [])
        .filter((m) => m.boards) // ignorer les entrées sans board
        .map((m) => ({ ...m.boards, role: m.role }))
    )

    setLoading(false)
  }

  if (loading) return <div style={{ padding: 32, color: '#9aa4b2' }}>Chargement…</div>

  if (error) return (
    <div style={{ padding: 32, color: '#ff6b6b' }}>
      <p>Erreur : {error}</p>
      <p style={{ fontSize: 13, color: '#9aa4b2' }}>
        Vérifie que tu as bien exécuté <strong>schema_sharing.sql</strong> dans Supabase SQL Editor.
      </p>
      <button onClick={loadBoards} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#4f7cff', color: '#fff', cursor: 'pointer' }}>
        Réessayer
      </button>
    </div>
  )

  return (
    <div className="board-selector">
      <h1 className="board-selector-title">🧠 Mes cartes mentales</h1>

      {/* Ma carte */}
      <div className="board-section-label">Ma carte</div>
      {ownBoard ? (
        <div className="board-card own" onClick={() => onSelect(ownBoard.id, 'owner')}>
          <span className="board-icon">🗺️</span>
          <div>
            <div className="board-card-title">{ownBoard.title}</div>
            <div className="board-card-meta">Propriétaire · Cliquer pour ouvrir</div>
          </div>
        </div>
      ) : (
        <p style={{ color: '#ff6b6b', fontSize: 13 }}>Impossible de charger ta carte.</p>
      )}

      {/* Cartes partagées */}
      {sharedBoards.length > 0 && (
        <>
          <div className="board-section-label" style={{ marginTop: 24 }}>Partagées avec moi</div>
          {sharedBoards.map((b) => (
            <div key={b.id} className="board-card shared" onClick={() => onSelect(b.id, b.role)}>
              <span className="board-icon">🤝</span>
              <div>
                <div className="board-card-title">{b.title}</div>
                <div className="board-card-meta">
                  {b.role === 'editor' ? '✏️ Éditeur' : '👁️ Lecteur'}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {sharedBoards.length === 0 && (
        <p className="board-empty" style={{ marginTop: 24 }}>Aucune carte partagée avec vous pour l'instant.</p>
      )}
    </div>
  )
}
