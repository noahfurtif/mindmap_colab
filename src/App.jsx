/**
 * App.jsx
 * -------
 * Composant racine de l'application.
 * Gère : authentification, sélection de la carte, et traitement des invitations.
 *
 * Flux principal :
 *   1. Non connecté → <Auth />
 *   2. Connecté, pas de carte choisie → <BoardSelector />
 *   3. Connecté, carte choisie → <MindMap />
 */
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Auth from './components/Auth'
import MindMap from './components/MindMap'
import BoardSelector from './components/BoardSelector'

export default function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [selectedBoard, setSelectedBoard] = useState(null) // { id, role }
  const [joinMsg, setJoinMsg] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Traiter tous les types d'invitation dès que l'utilisateur est connecté
  useEffect(() => {
    if (!session) return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('join')
    const boardId = params.get('board_id')
    const role = params.get('role')

    if (token) {
      handleJoinToken(token)
    } else if (boardId && role) {
      // Arrivée depuis un lien email Supabase Auth
      handleJoinFromEmail(boardId, role)
    } else {
      checkPendingEmailInvites()
    }
  }, [session?.user?.id])

  async function handleJoinFromEmail(boardId, role) {
    // Appel de la fonction SQL sécurisée qui gère le RLS
    const { error } = await supabase.rpc('accept_board_invite', {
      p_board_id: boardId,
      p_role: role,
    })

    // Nettoyer l'URL
    window.history.replaceState({}, '', window.location.pathname)

    if (error) {
      setJoinMsg("Erreur d'acces : " + error.message)
      return
    }

    // Ouvrir directement la carte
    setSelectedBoard({ id: boardId, role })
    setJoinMsg(`Bienvenue ! Tu as rejoint la carte en tant que ${role === 'editor' ? 'editeur' : 'lecteur'}.`)
  }

  async function handleJoinToken(token) {
    const { data: invite, error } = await supabase
      .from('board_invites')
      .select('*')
      .eq('token', token)
      .eq('accepted', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !invite) {
      setJoinMsg('Ce lien est invalide ou a expiré.')
      // Nettoyer l'URL
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    // Ajouter comme membre (ignore si déjà membre)
    await supabase.from('board_members').upsert({
      board_id: invite.board_id,
      user_id: session.user.id,
      role: invite.role,
    }, { onConflict: 'board_id,user_id' })

    // Marquer l'invite comme acceptée
    await supabase.from('board_invites').update({ accepted: true }).eq('id', invite.id)

    // Nettoyer l'URL et ouvrir la carte
    window.history.replaceState({}, '', window.location.pathname)
    setSelectedBoard({ id: invite.board_id, role: invite.role })
    setJoinMsg(`✅ Tu as rejoint la carte en tant que ${invite.role === 'editor' ? 'éditeur' : 'lecteur'} !`)
  }

  async function checkPendingEmailInvites() {
    const userEmail = session.user.email
    if (!userEmail) return

    const { data: invites } = await supabase
      .from('board_invites')
      .select('*')
      .eq('email', userEmail)
      .eq('accepted', false)
      .gt('expires_at', new Date().toISOString())

    if (!invites || invites.length === 0) return

    for (const invite of invites) {
      await supabase.from('board_members').upsert({
        board_id: invite.board_id,
        user_id: session.user.id,
        role: invite.role,
      }, { onConflict: 'board_id,user_id' })
      await supabase.from('board_invites').update({ accepted: true }).eq('id', invite.id)
    }

    if (invites.length > 0) {
      setJoinMsg(`✅ ${invites.length} carte(s) partagée(s) ajoutée(s) à ton espace !`)
    }
  }

  if (authLoading) return <div style={{ padding: 24, color: '#fff' }}>Chargement…</div>
  if (!session) return <Auth />

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {selectedBoard && (
            <button onClick={() => setSelectedBoard(null)} title="Mes cartes">
              ← Cartes
            </button>
          )}
          <strong>🧠 Carte Mentale Collaborative</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#9aa4b2' }}>{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Déconnexion</button>
        </div>
      </div>

      {/* Message de confirmation d'invitation */}
      {joinMsg && (
        <div className="join-banner">
          {joinMsg}
          <button onClick={() => setJoinMsg(null)} className="close-btn" style={{ marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      {/* Contenu principal */}
      {!selectedBoard ? (
        <BoardSelector
          session={session}
          onSelect={(id, role) => setSelectedBoard({ id, role })}
        />
      ) : (
        <MindMap
          session={session}
          boardId={selectedBoard.id}
          role={selectedBoard.role}
        />
      )}
    </div>
  )
}
