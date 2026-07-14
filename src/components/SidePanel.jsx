/**
 * SidePanel.jsx
 * -------------
 * Panneau latéral d'une entreprise (nœud).
 * Contient 6 onglets : Général, Tâches, Budget, KPIs, Journal, Liens.
 *
 * Ce composant ne gère QUE le rendu UI.
 * Toute la logique de données (CRUD, realtime, sauvegarde) est dans :
 *   → src/hooks/useNodeData.js
 */

import { useState } from 'react'
import { useNodeData } from '../hooks/useNodeData'
import { SIDE_TABS, STATUS_OPTIONS, JOURNAL_TYPES, kpiColor, kpiBg } from '../lib/constants'

export default function SidePanel({ node, onClose, session, canEdit = true, onNodeUpdate, onStatsChange, employees = [] }) {
  const [tab, setTab] = useState('general')
  const [fullscreen, setFullscreen] = useState(false)

  // Toute la logique données vient de ce hook
  const d = useNodeData({ node, session, canEdit, onNodeUpdate, onStatsChange })

  if (!node) return null

  const today = new Date().toISOString().split('T')[0]
  const currentStatus = STATUS_OPTIONS.find(s => s.value === d.status) || STATUS_OPTIONS[0]
  const pendingTasks = d.tasks.filter(t => !t.done)
    .sort((a, b) => ({ urgent: 0, normal: 1, low: 2 }[a.priority] ?? 1) - ({ urgent: 0, normal: 1, low: 2 }[b.priority] ?? 1))
  const doneTasks = d.tasks.filter(t => t.done)

  return (
    <div className={`side-panel${fullscreen ? ' fullscreen' : ''}`}>

      {/* ── EN-TÊTE ── */}
      <div className="panel-header">
        <div className="panel-header-top">
          {/* Mini-avatar cliquable pour changer le logo */}
          <div
            className="panel-mini-avatar"
            onClick={() => canEdit && d.logoInputRef.current?.click()}
            title={canEdit ? 'Changer le logo' : ''}
            style={{ cursor: canEdit ? 'pointer' : 'default' }}
          >
            {d.logoUrl ? <img src={d.logoUrl} alt="" /> : <span style={{ color: currentStatus.color }}>{d.title?.[0]?.toUpperCase() || '?'}</span>}
            {canEdit && <div className="panel-avatar-edit">📷</div>}
            {d.uploading && <div className="panel-avatar-edit" style={{ background: 'rgba(0,0,0,.7)' }}>⏳</div>}
          </div>
          {canEdit && <input ref={d.logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={d.handleLogoUpload} />}

          <div className="panel-header-info">
            {canEdit
              ? <input className="panel-title-input" value={d.title} onChange={e => d.handleField(d.setTitle, 'title', e.target.value)} placeholder="Nom de l'entreprise" />
              : <div className="panel-title-static">{d.title}</div>
            }
            <div className="panel-status-row" style={{ color: currentStatus.color }}>
              {currentStatus.label}
              {d.saving && <span className="saving-badge">· sauvegarde…</span>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button className="close-btn" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Réduire' : 'Plein écran'}>
              {fullscreen ? '⊡' : '⊞'}
            </button>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {d.error && (
          <div className="panel-error" onClick={() => d.setError(null)}>
            ⚠️ {d.error} <span style={{ float: 'right' }}>✕</span>
          </div>
        )}

        <div className="panel-tabs">
          {SIDE_TABS.map(t => (
            <button key={t.id} className={`panel-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENU ── */}
      <div className="panel-content">

        {/* ─────────────────────── GÉNÉRAL ─────────────────────── */}
        {tab === 'general' && (
          <div className="tab-section">
            <div className="field-group">
              <label className="field-label">Statut</label>
              <select className="field-select" value={d.status}
                onChange={e => d.handleField(d.setStatus, 'status', e.target.value)} disabled={!canEdit}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Secteur</label>
              <input className="field-input" value={d.sector}
                onChange={e => d.handleField(d.setSector, 'sector', e.target.value)}
                placeholder="Ex : SaaS, E-commerce…" readOnly={!canEdit} />
            </div>
            <div className="field-group">
              <label className="field-label">Description</label>
              <textarea className="field-textarea" value={d.description}
                onChange={e => d.handleField(d.setDescription, 'description', e.target.value)}
                placeholder="Décris l'entreprise en quelques mots…" rows={3} readOnly={!canEdit} />
            </div>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label">Création</label>
                <input className="field-input" type="date" value={d.foundedAt}
                  onChange={e => d.handleField(d.setFoundedAt, 'foundedAt', e.target.value)} readOnly={!canEdit} />
              </div>
              <div className="field-group">
                <label className="field-label">Site web</label>
                <input className="field-input" value={d.website}
                  onChange={e => d.handleField(d.setWebsite, 'website', e.target.value)}
                  placeholder="https://…" readOnly={!canEdit} />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Notes {d.saving && <span className="saving-badge">sauvegarde…</span>}</label>
              <textarea className="field-textarea notes-area" value={d.notes}
                onChange={e => d.scheduleNotesSave(e.target.value)}
                placeholder={canEdit ? 'Écris tes notes ici…' : 'Lecture seule'}
                rows={4} readOnly={!canEdit} />
            </div>
            {d.website && (
              <a className="website-link" href={d.website.startsWith('http') ? d.website : 'https://' + d.website}
                target="_blank" rel="noreferrer">🌐 Ouvrir le site →</a>
            )}
          </div>
        )}

        {/* ─────────────────────── TÂCHES ─────────────────────── */}
        {tab === 'tasks' && (
          <div className="tab-section">
            {canEdit && (
              <form onSubmit={d.handleAddTask} className="task-add-form">
                <input className="field-input" value={d.newTask}
                  onChange={e => d.setNewTask(e.target.value)} placeholder="Nouvelle tâche…" required />
                <div className="task-add-meta">
                  <select className="field-select small" value={d.newTaskPriority} onChange={e => d.setNewTaskPriority(e.target.value)}>
                    <option value="urgent">🔴 Urgent</option>
                    <option value="normal">🟡 Normal</option>
                    <option value="low">⚪ Faible</option>
                  </select>
                  <input className="field-input small" type="date" value={d.newTaskDate} onChange={e => d.setNewTaskDate(e.target.value)} />
                  {employees.length > 0 && (
                    <select className="field-select small" value={d.newTaskAssignee} onChange={e => d.setNewTaskAssignee(e.target.value)}>
                      <option value="">👤 Personne</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                      ))}
                    </select>
                  )}
                  <button type="submit" className="btn-primary small">+</button>
                </div>
              </form>
            )}

            {d.tasks.length === 0 && <p className="empty-state">Aucune tâche pour l'instant</p>}

            <ul className="task-list-v2">
              {pendingTasks.map(task => {
                const overdue = task.due_date && task.due_date < today
                return (
                  <li key={task.id} className={`task-item-v2 ${task.priority || 'normal'}${overdue ? ' overdue' : ''}`}>
                    <button className="task-check-v2" onClick={() => d.handleToggleTask(task)} disabled={!canEdit}>☐</button>
                    <div className="task-body">
                      {d.editingTaskId === task.id ? (
                        <input className="task-edit-input" value={d.editingText}
                          onChange={e => d.setEditingText(e.target.value)}
                          onBlur={() => d.handleSaveTaskName(task.id)}
                          onKeyDown={e => { if (e.key === 'Enter') d.handleSaveTaskName(task.id); if (e.key === 'Escape') d.setEditingTaskId(null) }}
                          autoFocus />
                      ) : (
                        <span className="task-text"
                          onDoubleClick={() => { if (canEdit) { d.setEditingTaskId(task.id); d.setEditingText(task.content) } }}
                          title={canEdit ? 'Double-clic pour renommer' : ''}>
                          {task.content}
                        </span>
                      )}
                      <div className="task-meta-row">
                        {task.assigned_to && employees.find(e => e.id === task.assigned_to) && (
                          <span className="task-assignee">
                            👤 {employees.find(e => e.id === task.assigned_to)?.first_name}
                          </span>
                        )}
                        <span className={`task-priority-badge ${task.priority || 'normal'}`}>
                          {task.priority === 'urgent' ? '🔴 Urgent' : task.priority === 'low' ? '⚪ Faible' : '🟡 Normal'}
                        </span>
                        {task.due_date && <span className={`task-date${overdue ? ' overdue' : ''}`}>📅 {task.due_date}</span>}
                      </div>
                    </div>
                    {canEdit && <button className="task-del" onClick={() => d.handleDeleteTask(task.id)}>×</button>}
                  </li>
                )
              })}
            </ul>

            {doneTasks.length > 0 && (
              <details className="done-section" style={{ marginTop: 12 }}>
                <summary>✓ Terminées ({doneTasks.length})</summary>
                <ul className="task-list-v2" style={{ marginTop: 8 }}>
                  {doneTasks.map(task => (
                    <li key={task.id} className="task-item-v2 done">
                      <button className="task-check-v2 checked" onClick={() => d.handleToggleTask(task)} disabled={!canEdit}>✓</button>
                      {d.editingTaskId === task.id ? (
                        <input className="task-edit-input" value={d.editingText}
                          onChange={e => d.setEditingText(e.target.value)}
                          onBlur={() => d.handleSaveTaskName(task.id)}
                          onKeyDown={e => { if (e.key === 'Enter') d.handleSaveTaskName(task.id); if (e.key === 'Escape') d.setEditingTaskId(null) }}
                          autoFocus />
                      ) : (
                        <span className="task-text done"
                          onDoubleClick={() => { if (canEdit) { d.setEditingTaskId(task.id); d.setEditingText(task.content) } }}>
                          {task.content}
                        </span>
                      )}
                      {canEdit && <button className="task-del" onClick={() => d.handleDeleteTask(task.id)}>×</button>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* ─────────────────────── BUDGET ─────────────────────── */}
        {tab === 'finances' && (
          <div className="tab-section">
            {/* Objectif mensuel + barre de progression */}
            <div className="fin-goal-card">
              <div className="fin-goal-top">
                <span className="fin-goal-label">🎯 Objectif mensuel</span>
                <div className="fin-goal-input-row">
                  {canEdit
                    ? <input className="field-input small" type="number" value={d.monthlyGoal}
                        onChange={e => d.setMonthlyGoal(parseFloat(e.target.value) || 0)} style={{ width: 100 }} />
                    : <span style={{ fontWeight: 700 }}>{d.monthlyGoal}€</span>
                  }
                  {canEdit && <button className="btn-ghost small" onClick={d.handleSaveGoal}>Sauver</button>}
                </div>
              </div>
              {d.monthlyGoal > 0 && (
                <>
                  <div className="big-progress-bar">
                    <div className="big-progress-fill" style={{ width: `${d.goalPercent}%`, background: kpiColor(d.goalPercent) }} />
                  </div>
                  <div className="fin-goal-stats">
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>{d.totalRevenue.toFixed(0)}€</span>
                    <span style={{ color: '#9aa4b2' }}>/ {d.monthlyGoal}€</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: kpiColor(d.goalPercent) }}>{Math.round(d.goalPercent)}%</span>
                  </div>
                </>
              )}
            </div>

            {/* Résumé revenus / dépenses */}
            <div className="fin-summary-cards">
              <div className="fin-summary-card" style={{ borderColor: '#22c55e33', background: '#0f2a1a' }}>
                <div style={{ fontSize: 20 }}>💰</div>
                <div>
                  <div style={{ fontSize: 11, color: '#9aa4b2' }}>Revenus</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>+{d.totalRevenue.toFixed(0)}€</div>
                </div>
              </div>
              <div className="fin-summary-card" style={{ borderColor: '#ef444433', background: '#2a0f0f' }}>
                <div style={{ fontSize: 20 }}>💸</div>
                <div>
                  <div style={{ fontSize: 11, color: '#9aa4b2' }}>Dépenses</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>-{d.totalExpense.toFixed(0)}€</div>
                </div>
              </div>
            </div>
            <div className={`fin-net-banner ${d.netProfit >= 0 ? 'positive' : 'negative'}`}>
              {d.netProfit >= 0 ? '📈' : '📉'} Bénéfice net : <strong>{d.netProfit >= 0 ? '+' : ''}{d.netProfit.toFixed(2)}€</strong>
            </div>

            {/* Formulaire ajout */}
            {canEdit && (
              <form onSubmit={d.handleAddFinance} className="fin-add-form">
                <input className="field-input" value={d.newFinLabel} onChange={e => d.setNewFinLabel(e.target.value)} placeholder="Libellé…" required />
                <div className="fin-add-row">
                  <select className="field-select small" value={d.newFinType} onChange={e => d.setNewFinType(e.target.value)}>
                    <option value="income">💰 Revenu</option>
                    <option value="expense">💸 Dépense</option>
                  </select>
                  <input className="field-input small" type="number" min="0" step="0.01" value={d.newFinAmount} onChange={e => d.setNewFinAmount(e.target.value)} placeholder="Montant €" required />
                  <input className="field-input small" type="date" value={d.newFinDate} onChange={e => d.setNewFinDate(e.target.value)} />
                  <button type="submit" className="btn-primary small">+</button>
                </div>
              </form>
            )}

            <ul className="fin-list">
              {d.finances.length === 0 && <p className="empty-state">Aucune entrée financière</p>}
              {d.finances.map(f => (
                <li key={f.id} className="fin-item">
                  <span className={`fin-dot ${f.amount >= 0 ? 'income' : 'expense'}`} />
                  <span className="fin-date">{f.entry_date}</span>
                  <span className="fin-label">{f.label}</span>
                  <span className="fin-amount" style={{ color: f.amount >= 0 ? '#22c55e' : '#ef4444' }}>
                    {f.amount >= 0 ? '+' : ''}{f.amount.toFixed(2)}€
                  </span>
                  {canEdit && <button className="task-del" onClick={() => d.handleDeleteFinance(f.id)}>×</button>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─────────────────────── KPIs ─────────────────────── */}
        {tab === 'kpis' && (
          <div className="tab-section">
            {canEdit && (
              <form onSubmit={d.handleAddKpi} className="kpi-add-form">
                <div className="kpi-add-row">
                  <input className="field-input" style={{ width: 52 }} value={d.newKpi.icon} onChange={e => d.setNewKpi(k => ({...k, icon: e.target.value}))} placeholder="📊" />
                  <input className="field-input" value={d.newKpi.name} onChange={e => d.setNewKpi(k => ({...k, name: e.target.value}))} placeholder="Nom de l'indicateur…" required />
                </div>
                <div className="kpi-add-row">
                  <input className="field-input small" type="number" value={d.newKpi.current} onChange={e => d.setNewKpi(k => ({...k, current: e.target.value}))} placeholder="Valeur actuelle" />
                  <span style={{ color: '#6b7585', alignSelf: 'center' }}>/</span>
                  <input className="field-input small" type="number" value={d.newKpi.target} onChange={e => d.setNewKpi(k => ({...k, target: e.target.value}))} placeholder="Objectif" required />
                  <input className="field-input small" type="date" value={d.newKpi.date} onChange={e => d.setNewKpi(k => ({...k, date: e.target.value}))} />
                  <button type="submit" className="btn-primary small">+</button>
                </div>
              </form>
            )}

            {d.kpis.length === 0 && <p className="empty-state">Aucun KPI défini</p>}

            <div className="kpi-cards">
              {d.kpis.map(kpi => {
                const pct = kpi.target_value > 0 ? Math.min((kpi.current_value / kpi.target_value) * 100, 100) : 0
                const color = kpiColor(pct)
                return (
                  <div key={kpi.id} className="kpi-card" style={{ borderColor: color + '44', background: kpiBg(pct) }}>
                    <div className="kpi-card-header">
                      <span className="kpi-big-icon">{kpi.icon}</span>
                      <div className="kpi-card-info">
                        <span className="kpi-card-name">{kpi.name}</span>
                        {kpi.target_date && <span className="kpi-card-date">📅 {kpi.target_date}</span>}
                      </div>
                      {canEdit && <button className="task-del" onClick={() => d.handleDeleteKpi(kpi.id)}>×</button>}
                    </div>
                    <div className="kpi-big-bar">
                      <div className="kpi-big-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
                    </div>
                    <div className="kpi-card-values">
                      {canEdit
                        ? <input className="kpi-value-input" type="number" value={kpi.current_value}
                            onChange={e => d.handleUpdateKpiValue(kpi, e.target.value)} style={{ color }} />
                        : <span style={{ color, fontWeight: 700, fontSize: 18 }}>{kpi.current_value}</span>
                      }
                      <span className="kpi-target">/ {kpi.target_value}</span>
                      <div className="kpi-pct-badge" style={{ background: color + '22', color }}>{Math.round(pct)}%</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─────────────────────── JOURNAL ─────────────────────── */}
        {tab === 'journal' && (
          <div className="tab-section">
            {canEdit && (
              <form onSubmit={d.handleAddJournal} className="journal-add-form">
                <div className="journal-add-row">
                  <select className="field-select small" value={d.newEntry.type} onChange={e => d.setNewEntry(j => ({...j, type: e.target.value}))}>
                    {JOURNAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input className="field-input small" type="date" value={d.newEntry.date} onChange={e => d.setNewEntry(j => ({...j, date: e.target.value}))} />
                </div>
                <textarea className="field-textarea" value={d.newEntry.content} onChange={e => d.setNewEntry(j => ({...j, content: e.target.value}))} placeholder="Décris l'événement…" rows={3} required />
                <button type="submit" className="btn-primary">+ Ajouter</button>
              </form>
            )}
            {d.journal.length === 0 && <p className="empty-state">Le journal est vide</p>}
            <ul className="journal-list">
              {d.journal.map(entry => {
                const typeObj = JOURNAL_TYPES.find(t => t.value === entry.type) || JOURNAL_TYPES[0]
                return (
                  <li key={entry.id} className="journal-entry" style={{ borderLeftColor: typeObj.color }}>
                    <div className="journal-entry-header">
                      <span className="journal-type-badge" style={{ color: typeObj.color }}>{typeObj.label}</span>
                      <span className="journal-entry-date">{entry.entry_date}</span>
                      {canEdit && <button className="task-del" onClick={() => d.handleDeleteJournal(entry.id)}>×</button>}
                    </div>
                    <p className="journal-entry-content">{entry.content}</p>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* ─────────────────────── LIENS ─────────────────────── */}
        {tab === 'links' && (
          <div className="tab-section">
            {canEdit && (
              <form onSubmit={d.handleAddLink} className="link-add-form">
                <input className="field-input" value={d.newLink.name} onChange={e => d.setNewLink(l => ({...l, name: e.target.value}))} placeholder="Nom du lien…" required />
                <div className="link-add-row">
                  <input className="field-input" value={d.newLink.url} onChange={e => d.setNewLink(l => ({...l, url: e.target.value}))} placeholder="https://…" required />
                  <button type="submit" className="btn-primary small">+</button>
                </div>
              </form>
            )}
            {d.links.length === 0 && <p className="empty-state">Aucun lien ajouté</p>}
            <ul className="links-list">
              {d.links.map(link => {
                const domain = (() => { try { return new URL(link.url).hostname.replace('www.', '') } catch { return link.url } })()
                return (
                  <li key={link.id} className="link-card">
                    <img className="link-favicon"
                      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                      alt="" onError={e => { e.target.style.display = 'none' }} />
                    <div className="link-info">
                      <span className="link-name">{link.name}</span>
                      <span className="link-domain">{domain}</span>
                    </div>
                    <a href={link.url} target="_blank" rel="noreferrer" className="link-open-btn">Ouvrir →</a>
                    {canEdit && <button className="task-del" onClick={() => d.handleDeleteLink(link.id)}>×</button>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

      </div>
    </div>
  )
}
