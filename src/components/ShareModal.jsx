/**
 * ShareModal.jsx
 * --------------
 * Modal de partage d'une carte mentale.
 * Deux modes : invitation par lien (token) ou par email (Edge Function Supabase).
 * Affiche aussi la liste des membres actuels avec gestion des rôles.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ShareModal({ boardId, onClose, session }) {
  const [tab, setTab] = useState('link') // 'link' | 'email'
  const [role, setRole] = useState('editor')
  const [email, setEmail] = useState('')
  const [linkRole, setLinkRole] = useState('editor')
  const [generatedLink, setGeneratedLink] = useState('')
  const [members, setMembers] = useState([])
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    loadMembers()
  }, [boardId])

  async function loadMembers() {
    const { data } = await supabase
      .from('board_members')
      .select('*, profiles:user_id(email)')
      .eq('board_id', boardId)
    setMembers(data || [])
  }

  // ---- Générer un lien d'invitation ----
  async function handleGenerateLink() {
    setLoading(true)
    const { data, error } = await supabase
      .from('board_invites')
      .insert({ board_id: boardId, invited_by: session.user.id, role: linkRole })
      .select()
      .single()
    if (error) { setMsg({ type: 'error', text: error.message }); setLoading(false); return }

    const link = `${window.location.origin}${window.location.pathname}?join=${data.token}`
    setGeneratedLink(link)
    setLoading(false)
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ---- Inviter par email via Edge Function ----
  async function handleEmailInvite(e) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setMsg(null)

    try {
      // Récupérer le token de session pour l'envoyer à l'Edge Function
      const { data: { session: currentSession } } = await supabase.auth.getSession()

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: email.trim(),
            board_id: boardId,
            role,
            app_url: window.location.origin,
          })
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setMsg({ type: "error", text: result.error || "Erreur lors de l'envoi" })
      } else {
        setMsg({ type: 'success', text: `✅ Email d'invitation envoyé à ${email} !` })
        setEmail('')
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Erreur réseau : ' + err.message })
    }

    setLoading(false)
  }

  // ---- Retirer un membre ----
  async function handleRemoveMember(memberId) {
    await supabase.from('board_members').delete().eq('id', memberId)
    setMembers((m) => m.filter((x) => x.id !== memberId))
  }

  // ---- Changer le rôle d'un membre ----
  async function handleChangeRole(memberId, newRole) {
    await supabase.from('board_members').update({ role: newRole }).eq('id', memberId)
    setMembers((m) => m.map((x) => x.id === memberId ? { ...x, role: newRole } : x))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Partager la carte</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Onglets */}
        <div className="modal-tabs">
          <button
            className={`modal-tab${tab === 'link' ? ' active' : ''}`}
            onClick={() => setTab('link')}
          >
            🔗 Lien
          </button>
          <button
            className={`modal-tab${tab === 'email' ? ' active' : ''}`}
            onClick={() => setTab('email')}
          >
            ✉️ Email
          </button>
        </div>

        {/* Tab Lien */}
        {tab === 'link' && (
          <div className="modal-body">
            <p className="modal-hint">Génère un lien que tu envoies à qui tu veux.</p>
            <div className="role-row">
              <span>Permission :</span>
              <select value={linkRole} onChange={(e) => setLinkRole(e.target.value)} className="role-select">
                <option value="editor">Éditeur (peut modifier)</option>
                <option value="viewer">Lecteur (lecture seule)</option>
              </select>
            </div>
            <button className="primary-btn" onClick={handleGenerateLink} disabled={loading}>
              {loading ? '…' : 'Générer le lien'}
            </button>
            {generatedLink && (
              <div className="link-box">
                <input readOnly value={generatedLink} className="link-input" />
                <button className="copy-btn" onClick={handleCopyLink}>
                  {copied ? '✓ Copié !' : 'Copier'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab Email */}
        {tab === 'email' && (
          <div className="modal-body">
            <p className="modal-hint">La personne verra la carte dès sa prochaine connexion.</p>
            <form onSubmit={handleEmailInvite} className="email-invite-form">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemple.com"
                className="task-input"
                required
              />
              <select value={role} onChange={(e) => setRole(e.target.value)} className="role-select">
                <option value="editor">Éditeur</option>
                <option value="viewer">Lecteur</option>
              </select>
              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? '…' : 'Inviter'}
              </button>
            </form>
            {msg && (
              <p className={`modal-msg ${msg.type}`}>{msg.text}</p>
            )}
          </div>
        )}

        {/* Liste des membres actuels */}
        {members.length > 0 && (
          <div className="modal-members">
            <div className="section-label" style={{ padding: '0 0 8px' }}>Membres actuels</div>
            {members.map((m) => (
              <div key={m.id} className="member-row">
                <span className="member-email">{m.profiles?.email || '—'}</span>
                <select
                  value={m.role}
                  onChange={(e) => handleChangeRole(m.id, e.target.value)}
                  className="role-select small"
                >
                  <option value="editor">Éditeur</option>
                  <option value="viewer">Lecteur</option>
                </select>
                <button className="task-delete" onClick={() => handleRemoveMember(m.id)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
