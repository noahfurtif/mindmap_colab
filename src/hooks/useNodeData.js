/**
 * useNodeData.js
 * --------------
 * Hook React centralisant TOUTE la logique de données du panneau latéral.
 *
 * Responsabilités :
 *  - Chargement initial depuis Supabase (tasks, finances, kpis, journal, liens)
 *  - Opérations CRUD pour chaque onglet
 *  - Abonnement realtime : toute modification d'un autre utilisateur
 *    est reflétée instantanément sans recharger
 *  - Auto-sauvegarde des champs généraux (debounce 800ms)
 *
 * Usage :
 *  const data = useNodeData({ node, session, canEdit, onNodeUpdate, onStatsChange })
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { STORAGE_BUCKET } from '../lib/constants'

export function useNodeData({ node, session, canEdit, onNodeUpdate, onStatsChange }) {

  // ── GÉNÉRAL ─────────────────────────────────────────────────────────────────
  const [title, setTitle]           = useState('')
  const [status, setStatus]         = useState('idea')
  const [sector, setSector]         = useState('')
  const [description, setDescription] = useState('')
  const [website, setWebsite]       = useState('')
  const [foundedAt, setFoundedAt]   = useState('')
  const [logoUrl, setLogoUrl]       = useState('')
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [error, setError]           = useState(null)
  const saveTimer   = useRef(null)
  const logoInputRef = useRef(null)
  // Évite d'écraser la saisie en cours avec le realtime d'un autre utilisateur
  const isTypingRef = useRef(false)

  // ── TÂCHES ──────────────────────────────────────────────────────────────────
  const [tasks, setTasks]                   = useState([])
  const [newTask, setNewTask]               = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState('normal')
  const [newTaskDate, setNewTaskDate]       = useState('')
  const [editingTaskId, setEditingTaskId]   = useState(null)
  const [editingText, setEditingText]       = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')

  // ── FINANCES ────────────────────────────────────────────────────────────────
  const [finances, setFinances]         = useState([])
  const [monthlyGoal, setMonthlyGoal]   = useState(0)
  const [newFinLabel, setNewFinLabel]   = useState('')
  const [newFinAmount, setNewFinAmount] = useState('')
  const [newFinDate, setNewFinDate]     = useState('')
  const [newFinType, setNewFinType]     = useState('income')

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const [kpis, setKpis] = useState([])
  const [newKpi, setNewKpi] = useState({ name: '', icon: '📊', current: '', target: '', date: '' })

  // ── JOURNAL ─────────────────────────────────────────────────────────────────
  const [journal, setJournal]   = useState([])
  const [newEntry, setNewEntry] = useState({ type: 'decision', content: '', date: '' })

  // ── LIENS ───────────────────────────────────────────────────────────────────
  const [links, setLinks]   = useState([])
  const [newLink, setNewLink] = useState({ name: '', url: '' })

  // ════════════════════════════════════════════════════════════════════════════
  // CHARGEMENT INITIAL
  // Se déclenche à chaque fois qu'un nouveau nœud est sélectionné
  // ════════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!node) return
    setError(null)
    isTypingRef.current = false

    // Pré-remplir depuis les données React Flow (évite un flash vide)
    setTitle(node.data.title || '')
    setStatus(node.data.status || 'idea')
    setSector(node.data.sector || '')
    setDescription(node.data.description || '')
    setWebsite(node.data.website || '')
    setFoundedAt(node.data.founded_at || '')
    setLogoUrl(node.data.logo_url || '')
    setNotes(node.data.notes || '')

    // Charger les données depuis Supabase
    loadTasks()
    loadFinances()
    loadKpis()
    loadJournal()
    loadLinks()
  }, [node?.id])

  // Synchro realtime des champs généraux :
  // quand un autre utilisateur modifie, on met à jour — sauf si on tape
  useEffect(() => {
    if (!node || isTypingRef.current) return
    setTitle(node.data.title || '')
    setStatus(node.data.status || 'idea')
    setSector(node.data.sector || '')
    setDescription(node.data.description || '')
    setWebsite(node.data.website || '')
    setLogoUrl(node.data.logo_url || '')
    setNotes(node.data.notes || '')
  }, [
    node?.data?.title, node?.data?.status, node?.data?.sector,
    node?.data?.description, node?.data?.notes, node?.data?.logo_url,
  ])

  // ════════════════════════════════════════════════════════════════════════════
  // REALTIME
  // Un seul channel par nœud ouvert, couvrant toutes les tables
  // Sans filtre SQL (plus fiable, pas besoin de REPLICA IDENTITY FULL)
  // ════════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!node) return
    const nid = node.id

    // Crée un handler INSERT/UPDATE/DELETE générique pour un setter de liste
    function makeListHandler(setter) {
      return ({ eventType, new: n, old: o }) => {
        if ((n?.node_id || o?.node_id) !== nid) return
        if (eventType === 'INSERT') setter(list => list.find(x => x.id === n.id) ? list : [...list, n])
        else if (eventType === 'UPDATE') setter(list => list.map(x => x.id === n.id ? n : x))
        else if (eventType === 'DELETE') setter(list => list.filter(x => x.id !== o.id))
      }
    }

    // Finance : INSERT en tête de liste (chronologique décroissant)
    function makeFinanceHandler() {
      return ({ eventType, new: n, old: o }) => {
        if ((n?.node_id || o?.node_id) !== nid) return
        if (eventType === 'INSERT') setFinances(fs => fs.find(f => f.id === n.id) ? fs : [n, ...fs])
        else if (eventType === 'UPDATE') setFinances(fs => fs.map(f => f.id === n.id ? n : f))
        else if (eventType === 'DELETE') setFinances(fs => fs.filter(f => f.id !== o.id))
      }
    }

    // Journal : INSERT en tête, pas d'UPDATE (on ne modifie pas les entrées)
    function makeJournalHandler() {
      return ({ eventType, new: n, old: o }) => {
        if ((n?.node_id || o?.node_id) !== nid) return
        if (eventType === 'INSERT') setJournal(js => js.find(j => j.id === n.id) ? js : [n, ...js])
        else if (eventType === 'DELETE') setJournal(js => js.filter(j => j.id !== o.id))
      }
    }

    const channel = supabase
      .channel(`node-data-${nid}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' },          makeListHandler(setTasks))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finances' },        makeFinanceHandler())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpis' },            makeListHandler(setKpis))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries' }, makeJournalHandler())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'links' },           makeListHandler(setLinks))
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [node?.id])

  // ════════════════════════════════════════════════════════════════════════════
  // GÉNÉRAL : auto-sauvegarde avec debounce
  // ════════════════════════════════════════════════════════════════════════════

  function scheduleGeneralSave(overrides = {}) {
    setSaving(true)
    isTypingRef.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const update = {
        title:       overrides.title       ?? title,
        status:      overrides.status      ?? status,
        sector:      overrides.sector      ?? sector,
        description: overrides.description ?? description,
        website:     overrides.website     ?? website,
        founded_at:  (overrides.foundedAt  ?? foundedAt) || null,
        logo_url:    overrides.logoUrl     ?? logoUrl,
      }
      const { error } = await supabase.from('nodes').update(update).eq('id', node.id)
      if (error) setError('Erreur sauvegarde : ' + error.message)
      else if (onNodeUpdate) onNodeUpdate(node.id, update)
      isTypingRef.current = false
      setSaving(false)
    }, 800)
  }

  // Raccourci : modifie un champ local + planifie la sauvegarde
  function handleField(setter, key, value) {
    setter(value)
    scheduleGeneralSave({ [key]: value })
  }

  // Notes : sauvegardées séparément (champ textarea dédié)
  function scheduleNotesSave(value) {
    setNotes(value)
    setSaving(true)
    isTypingRef.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('nodes').update({ notes: value }).eq('id', node.id)
      if (onNodeUpdate) onNodeUpdate(node.id, { notes: value })
      isTypingRef.current = false
      setSaving(false)
    }, 800)
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    // Nettoyer le nom de fichier (espaces, accents) pour Supabase Storage
    const safeName = file.name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${session.user.id}/logos/${node.id}_${safeName}`
    const { error: uploadErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true })
    if (uploadErr) { setError('Erreur upload logo : ' + uploadErr.message); setUploading(false); return }
    // URL signée valable 10 ans (le bucket n'est pas public)
    const { data: signedData } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 315360000)
    const url = signedData?.signedUrl || ''
    setLogoUrl(url)
    scheduleGeneralSave({ logoUrl: url })
    setUploading(false)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TÂCHES
  // ════════════════════════════════════════════════════════════════════════════

  async function loadTasks() {
    const { data } = await supabase.from('tasks').select('*').eq('node_id', node.id).order('created_at')
    setTasks(data || [])
  }

  async function handleAddTask(e) {
    e.preventDefault()
    if (!newTask.trim()) return
    // Essai avec priority + due_date (schema phase 4)
    let { data, error } = await supabase.from('tasks')
      .insert({ node_id: node.id, content: newTask.trim(), priority: newTaskPriority, due_date: newTaskDate || null, assigned_to: newTaskAssignee || null })
      .select().single()
    // Fallback si les colonnes n'existent pas encore
    if (error?.code === '42703') {
      const fb = await supabase.from('tasks').insert({ node_id: node.id, content: newTask.trim() }).select().single()
      data = fb.data; error = fb.error
    }
    if (error) { setError('Erreur tâche : ' + error.message); return }
    setTasks(t => [...t, data])
    setNewTask(''); setNewTaskDate(''); setNewTaskAssignee('')
    onStatsChange?.(node.id)
  }

  async function handleToggleTask(task) {
    if (!canEdit) return
    const updated = { ...task, done: !task.done }
    setTasks(ts => ts.map(t => t.id === task.id ? updated : t))
    await supabase.from('tasks').update({ done: updated.done }).eq('id', task.id)
    onStatsChange?.(node.id)
  }

  async function handleDeleteTask(id) {
    if (!canEdit) return
    setTasks(ts => ts.filter(t => t.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
    onStatsChange?.(node.id)
  }

  async function handleSaveTaskName(taskId) {
    const trimmed = editingText.trim()
    if (trimmed) {
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, content: trimmed } : t))
      await supabase.from('tasks').update({ content: trimmed }).eq('id', taskId)
    }
    setEditingTaskId(null)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FINANCES
  // ════════════════════════════════════════════════════════════════════════════

  async function loadFinances() {
    const { data } = await supabase.from('finances').select('*').eq('node_id', node.id).order('entry_date', { ascending: false })
    if (data) {
      setFinances(data)
      const goal = data.find(f => f.monthly_goal > 0)?.monthly_goal
      if (goal) setMonthlyGoal(goal)
    }
  }

  async function handleAddFinance(e) {
    e.preventDefault()
    if (!newFinLabel.trim() || !newFinAmount) return
    const amount = newFinType === 'expense'
      ? -Math.abs(parseFloat(newFinAmount))
      :  Math.abs(parseFloat(newFinAmount))
    const { data, error } = await supabase.from('finances')
      .insert({ node_id: node.id, user_id: session.user.id, label: newFinLabel, amount,
        entry_date: newFinDate || new Date().toISOString().split('T')[0],
        monthly_goal: monthlyGoal })
      .select().single()
    if (error) { setError('Erreur finance : ' + error.message); return }
    setFinances(f => [data, ...f])
    setNewFinLabel(''); setNewFinAmount('')
    onStatsChange?.(node.id)
  }

  async function handleSaveGoal() {
    await supabase.from('finances').update({ monthly_goal: monthlyGoal }).eq('node_id', node.id)
    onStatsChange?.(node.id)
  }

  async function handleDeleteFinance(id) {
    setFinances(f => f.filter(fi => fi.id !== id))
    await supabase.from('finances').delete().eq('id', id)
    onStatsChange?.(node.id)
  }

  // Agrégats financiers recalculés à chaque changement de `finances`
  const totalRevenue = finances.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0)
  const totalExpense = finances.filter(f => f.amount < 0).reduce((s, f) => s + Math.abs(f.amount), 0)
  const netProfit    = totalRevenue - totalExpense
  const goalPercent  = monthlyGoal > 0 ? Math.min((totalRevenue / monthlyGoal) * 100, 100) : 0

  // ════════════════════════════════════════════════════════════════════════════
  // KPIs
  // ════════════════════════════════════════════════════════════════════════════

  async function loadKpis() {
    const { data } = await supabase.from('kpis').select('*').eq('node_id', node.id).order('created_at')
    setKpis(data || [])
  }

  async function handleAddKpi(e) {
    e.preventDefault()
    if (!newKpi.name || !newKpi.target) return
    const { data, error } = await supabase.from('kpis')
      .insert({ node_id: node.id, user_id: session.user.id, name: newKpi.name, icon: newKpi.icon || '📊',
        current_value: parseFloat(newKpi.current) || 0,
        target_value:  parseFloat(newKpi.target),
        target_date:   newKpi.date || null })
      .select().single()
    if (error) { setError('Erreur KPI : ' + error.message); return }
    setKpis(k => [...k, data])
    setNewKpi({ name: '', icon: '📊', current: '', target: '', date: '' })
    onStatsChange?.(node.id)
  }

  async function handleUpdateKpiValue(kpi, value) {
    const updated = { ...kpi, current_value: parseFloat(value) || 0 }
    setKpis(ks => ks.map(k => k.id === kpi.id ? updated : k))
    await supabase.from('kpis').update({ current_value: updated.current_value }).eq('id', kpi.id)
    onStatsChange?.(node.id)
  }

  async function handleDeleteKpi(id) {
    setKpis(ks => ks.filter(k => k.id !== id))
    await supabase.from('kpis').delete().eq('id', id)
    onStatsChange?.(node.id)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // JOURNAL
  // ════════════════════════════════════════════════════════════════════════════

  async function loadJournal() {
    const { data } = await supabase.from('journal_entries').select('*').eq('node_id', node.id).order('entry_date', { ascending: false })
    setJournal(data || [])
  }

  async function handleAddJournal(e) {
    e.preventDefault()
    if (!newEntry.content.trim()) return
    const { data, error } = await supabase.from('journal_entries')
      .insert({ node_id: node.id, user_id: session.user.id, type: newEntry.type,
        content: newEntry.content,
        entry_date: newEntry.date || new Date().toISOString().split('T')[0] })
      .select().single()
    if (error) { setError('Erreur journal : ' + error.message); return }
    setJournal(j => [data, ...j])
    setNewEntry({ type: 'decision', content: '', date: '' })
  }

  async function handleDeleteJournal(id) {
    setJournal(j => j.filter(e => e.id !== id))
    await supabase.from('journal_entries').delete().eq('id', id)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LIENS
  // ════════════════════════════════════════════════════════════════════════════

  async function loadLinks() {
    const { data } = await supabase.from('links').select('*').eq('node_id', node.id).order('created_at')
    setLinks(data || [])
  }

  async function handleAddLink(e) {
    e.preventDefault()
    if (!newLink.name || !newLink.url) return
    const url = newLink.url.startsWith('http') ? newLink.url : 'https://' + newLink.url
    const { data, error } = await supabase.from('links')
      .insert({ node_id: node.id, user_id: session.user.id, name: newLink.name, url })
      .select().single()
    if (error) { setError('Erreur lien : ' + error.message); return }
    setLinks(l => [...l, data])
    setNewLink({ name: '', url: '' })
  }

  async function handleDeleteLink(id) {
    setLinks(l => l.filter(li => li.id !== id))
    await supabase.from('links').delete().eq('id', id)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PUBLIQUE DU HOOK
  // ════════════════════════════════════════════════════════════════════════════

  return {
    // Général
    title, setTitle, status, setStatus, sector, setSector,
    description, setDescription, website, setWebsite,
    foundedAt, setFoundedAt, logoUrl, notes,
    saving, uploading, error, setError, logoInputRef,
    handleField, scheduleNotesSave, handleLogoUpload,

    // Tâches
    tasks, newTask, setNewTask, newTaskPriority, setNewTaskPriority,
    newTaskDate, setNewTaskDate, newTaskAssignee, setNewTaskAssignee,
    editingTaskId, setEditingTaskId,
    editingText, setEditingText,
    handleAddTask, handleToggleTask, handleDeleteTask, handleSaveTaskName,

    // Finances
    finances, monthlyGoal, setMonthlyGoal,
    newFinLabel, setNewFinLabel, newFinAmount, setNewFinAmount,
    newFinDate, setNewFinDate, newFinType, setNewFinType,
    handleAddFinance, handleDeleteFinance, handleSaveGoal,
    totalRevenue, totalExpense, netProfit, goalPercent,

    // KPIs
    kpis, newKpi, setNewKpi,
    handleAddKpi, handleUpdateKpiValue, handleDeleteKpi,

    // Journal
    journal, newEntry, setNewEntry,
    handleAddJournal, handleDeleteJournal,

    // Liens
    links, newLink, setNewLink,
    handleAddLink, handleDeleteLink,
  }
}
