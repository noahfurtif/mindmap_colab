/**
 * MindMap.jsx
 * -----------
 * Composant principal de la carte mentale.
 * Orchestre React Flow + les interactions utilisateur + la collaboration temps réel.
 *
 * Responsabilités :
 *  - Chargement initial des nœuds et connexions depuis Supabase
 *  - Abonnement realtime (via useRealtime) : sync multi-utilisateur
 *  - Gestion du nœud sélectionné → affichage de SidePanel
 *  - Renommage de la carte, menu contextuel, duplication, suppression
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges, addEdge,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { supabase } from '../lib/supabaseClient'
import { useRealtime } from '../hooks/useRealtime'
import BubbleNode from './BubbleNode'
import SidePanel from './SidePanel'
import ShareModal from './ShareModal'
import ContextMenu from './ContextMenu'
import AlertsPanel from './AlertsPanel'
import EmployeesPanel from './EmployeesPanel'

const nodeTypes = { bubble: BubbleNode }

export default function MindMap({ session, boardId, role }) {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [showShare, setShowShare] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [dbReady, setDbReady] = useState(true)
  const [boardTitle, setBoardTitle] = useState('Ma carte mentale')
  const [editingTitle, setEditingTitle] = useState(false)
  const [employees, setEmployees] = useState([])
  const [showEmployees, setShowEmployees] = useState(false)

  const canEdit = role === 'owner' || role === 'editor'

  // ---- Vérifier que les tables Phase 4 existent ----
  async function checkDbReady() {
    const { error } = await supabase.from('finances').select('id').limit(1)
    if (error && error.code === '42P01') setDbReady(false)
  }

  // ---- Charger les stats réelles pour les bulles (hover popup) ----
  async function loadNodeStats(nodeIds) {
    if (!nodeIds || nodeIds.length === 0) return {}
    const today = new Date().toISOString().split('T')[0]
    try {
      const [tasksRes, financesRes, kpisRes] = await Promise.all([
        supabase.from('tasks').select('node_id, priority, due_date').in('node_id', nodeIds).eq('done', false),
        supabase.from('finances').select('node_id, amount, monthly_goal').in('node_id', nodeIds),
        supabase.from('kpis').select('node_id, current_value, target_value').in('node_id', nodeIds),
      ])
      const stats = {}
      nodeIds.forEach(id => {
        const nodeTasks = (tasksRes.data || []).filter(t => t.node_id === id)
        const nodeFinances = (financesRes.data || []).filter(f => f.node_id === id)
        const nodeKpis = (kpisRes.data || []).filter(k => k.node_id === id)
        const urgent = nodeTasks.filter(t => t.priority === 'urgent' || (t.due_date && t.due_date < today)).length
        const revenue = nodeFinances.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0)
        const goal = nodeFinances.find(f => f.monthly_goal > 0)?.monthly_goal || 0
        const kpiAlert = nodeKpis.some(k => k.target_value > 0 && (k.current_value / k.target_value) * 100 < 30)
        stats[id] = { urgentTasks: urgent, goalPercent: goal > 0 ? (revenue / goal) * 100 : null, kpiAlert }
      })
      return stats
    } catch { return {} }
  }

  async function applyStats(currentNodes) {
    const ids = currentNodes.map(n => n.id)
    try {
      const stats = await loadNodeStats(ids)
      setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, ...(stats[n.id] || {}) } })))
    } catch {}
  }

  // ---- Chargement initial ----
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      await checkDbReady()

      // FIX BUG 1 : charger le titre de la board depuis la DB
      const { data: board } = await supabase
        .from('boards').select('title').eq('id', boardId).single()
      if (board?.title) setBoardTitle(board.title)

      // Charger les employés du board
      const { data: empData } = await supabase
        .from('employees').select('*').eq('board_id', boardId).order('created_at')
      if (empData) setEmployees(empData)

      let { data: dbNodes } = await supabase
        .from('nodes').select('*').eq('board_id', boardId)

      if (!dbNodes || dbNodes.length === 0) {
        const { data: root } = await supabase
          .from('nodes')
          .insert({ board_id: boardId, user_id: session.user.id, title: 'Idée principale', position_x: 400, position_y: 250, is_root: true })
          .select().single()
        dbNodes = root ? [root] : []
      }

      const { data: dbEdges } = await supabase
        .from('edges').select('*').eq('board_id', boardId)

      if (cancelled) return
      const flowNodes = dbNodes.map(toFlowNode)
      setNodes(flowNodes)
      setEdges((dbEdges || []).map(toFlowEdge))
      setLoading(false)
      applyStats(flowNodes)
    }
    load()
    return () => { cancelled = true }
  }, [boardId])

  // ---- Realtime titre de la board (sans filtre pour éviter besoin de REPLICA IDENTITY) ----
  useEffect(() => {
    const channel = supabase
      .channel(`board-title-${boardId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'boards' },
        ({ new: updated }) => {
          if (updated?.id === boardId && updated?.title) setBoardTitle(updated.title)
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [boardId])

  // ---- Realtime nodes + edges ----
  useRealtime({
    boardId,
    onNodeChange: ({ eventType, new: newRow, old }) => {
      if (eventType === 'INSERT') {
        setNodes(nds => nds.find(n => n.id === newRow.id) ? nds : [...nds, toFlowNode(newRow)])
      } else if (eventType === 'UPDATE') {
        setNodes(nds => nds.map(n =>
          n.id === newRow.id
            ? { ...n,
                position: { x: newRow.position_x, y: newRow.position_y },
                data: { ...n.data,
                  title: newRow.title,
                  notes: newRow.notes || '',
                  status: newRow.status || 'idea',
                  sector: newRow.sector || '',
                  description: newRow.description || '',
                  logo_url: newRow.logo_url || '',
                }
              }
            : n
        ))
      } else if (eventType === 'DELETE') {
        setNodes(nds => nds.filter(n => n.id !== old.id))
      }
    },
    onEdgeChange: ({ eventType, new: newRow, old }) => {
      if (eventType === 'INSERT') {
        setEdges(eds => eds.find(e => e.id === newRow.id) ? eds : [...eds, toFlowEdge(newRow)])
      } else if (eventType === 'DELETE') {
        setEdges(eds => eds.filter(e => e.id !== old.id))
      }
    },
  })

  // FIX BUG 2 : notes inclus dans toFlowNode
  function toFlowNode(n) {
    return {
      id: n.id,
      type: 'bubble',
      position: { x: n.position_x, y: n.position_y },
      data: {
        title: n.title,
        notes: n.notes || '',
        isRoot: n.is_root,
        status: n.status || 'idea',
        sector: n.sector || '',
        description: n.description || '',
        website: n.website || '',
        logo_url: n.logo_url || '',
        founded_at: n.founded_at || '',
        canEdit,
        selected: false,
        urgentTasks: 0,
        kpiAlert: false,
        goalPercent: null,
        onTitleChange: handleTitleChange,
        onAddChild: handleAddChild,
        onSelect: handleSelectNode,
        onContextMenu: handleContextMenu,
        onHoverChange: (nodeId, isHovered) => setHoveredNodeId(isHovered ? nodeId : null),
      },
    }
  }

  function toFlowEdge(e) {
    return { id: e.id, source: e.source_node_id, target: e.target_node_id, type: 'smoothstep' }
  }

  // ---- Actions ----
  function handleSelectNode(nodeId) {
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId)
  }

  function handleContextMenu(nodeId, x, y) {
    setContextMenu({ nodeId, x, y })
  }

  async function handleDuplicate(nodeId) {
    const source = nodes.find(n => n.id === nodeId)
    if (!source) return
    const { data: newNode, error } = await supabase.from('nodes')
      .insert({
        board_id: boardId,
        user_id: session.user.id,
        title: (source.data.title || 'Copie') + ' — copie',
        status: source.data.status,
        sector: source.data.sector,
        description: source.data.description,
        position_x: source.position.x + 120,
        position_y: source.position.y + 120,
      })
      .select().single()
    if (error) { console.error(error); return }
    setNodes(nds => [...nds, toFlowNode(newNode)])
  }

  function handleRenameStart(nodeId) {
    setSelectedNodeId(nodeId)
    setTimeout(() => {
      const input = document.querySelector('.panel-title-input')
      if (input) { input.focus(); input.select() }
    }, 150)
  }

  async function handleContextAction(action, nodeId) {
    switch (action) {
      case 'open':      handleSelectNode(nodeId); break
      case 'rename':    handleRenameStart(nodeId); break
      case 'duplicate': await handleDuplicate(nodeId); break
      case 'child':     await handleAddChild(nodeId); break
      case 'delete':
        if (window.confirm('Supprimer cette bulle et tout son contenu ?')) {
          await supabase.from('nodes').delete().eq('id', nodeId)
          setNodes(nds => nds.filter(n => n.id !== nodeId))
          if (selectedNodeId === nodeId) setSelectedNodeId(null)
        }
        break
    }
  }

  const onNodesChange = useCallback((changes) => {
    const removals = changes.filter(c => c.type === 'remove')
    if (removals.length > 0 && canEdit) {
      removals.forEach(async c => { await supabase.from('nodes').delete().eq('id', c.id) })
    }
    setNodes(nds => applyNodeChanges(changes, nds))
  }, [canEdit])

  const onEdgesChange = useCallback((changes) => {
    const removals = changes.filter(c => c.type === 'remove')
    if (removals.length > 0 && canEdit) {
      removals.forEach(async c => { await supabase.from('edges').delete().eq('id', c.id) })
    }
    setEdges(eds => applyEdgeChanges(changes, eds))
  }, [canEdit])

  const onNodeDragStop = useCallback(async (_evt, node) => {
    if (!canEdit) return
    await supabase.from('nodes').update({ position_x: node.position.x, position_y: node.position.y }).eq('id', node.id)
  }, [canEdit])

  const onConnect = useCallback(async (connection) => {
    if (!canEdit) return
    const { data, error } = await supabase.from('edges')
      .insert({ board_id: boardId, source_node_id: connection.source, target_node_id: connection.target })
      .select().single()
    if (error) return
    setEdges(eds => addEdge({ ...connection, id: data.id, type: 'smoothstep' }, eds))
  }, [boardId, canEdit])

  async function handleTitleChange(nodeId, newTitle) {
    if (!canEdit) return
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, title: newTitle } } : n))
    await supabase.from('nodes').update({ title: newTitle }).eq('id', nodeId)
  }

  async function handleAddChild(parentId) {
    if (!canEdit) return
    const parent = nodes.find(n => n.id === parentId)
    const offsetX = (Math.random() - 0.5) * 180
    const newX = (parent?.position.x ?? 400) + 220 + offsetX
    const newY = (parent?.position.y ?? 250) + 130

    const { data: newNode, error } = await supabase.from('nodes')
      .insert({ board_id: boardId, user_id: session.user.id, title: 'Nouvelle bulle', position_x: newX, position_y: newY })
      .select().single()
    if (error) return

    const { data: newEdge } = await supabase.from('edges')
      .insert({ board_id: boardId, source_node_id: parentId, target_node_id: newNode.id })
      .select().single()

    setNodes(nds => [...nds, toFlowNode(newNode)])
    if (newEdge) setEdges(eds => [...eds, toFlowEdge(newEdge)])
  }

  async function saveBoardTitle(newTitle) {
    const trimmed = newTitle.trim()
    setEditingTitle(false)
    if (!trimmed || trimmed === boardTitle) return
    setBoardTitle(trimmed)
    await supabase.from('boards').update({ title: trimmed }).eq('id', boardId)
  }

  async function refreshNodeStats(nodeId) {
    try {
      const stats = await loadNodeStats([nodeId])
      setNodes(nds => nds.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...(stats[nodeId] || {}) } } : n
      ))
    } catch {}
  }

  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  )

  const flowNodes = useMemo(
    () => nodes.map(n => ({
      ...n,
      zIndex: n.id === hoveredNodeId ? 9999 : 1,
      data: {
        ...n.data,
        selected: n.id === selectedNodeId,
        canEdit,
        onTitleChange: handleTitleChange,
        onAddChild: handleAddChild,
        onSelect: handleSelectNode,
        onContextMenu: handleContextMenu,
        onHoverChange: (nodeId, isHovered) => setHoveredNodeId(isHovered ? nodeId : null),
      },
    })),
    [nodes, selectedNodeId, boardId, canEdit, hoveredNodeId]
  )

  if (loading) return <div style={{ padding: 24, color: '#9aa4b2' }}>Chargement de la carte…</div>

  return (
    <>
      <div className="map-toolbar">
        <div className="board-title-wrap">
          {editingTitle && canEdit ? (
            <input
              className="board-title-input"
              defaultValue={boardTitle}
              autoFocus
              onBlur={e => saveBoardTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveBoardTitle(e.target.value)
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className={`board-title-text${canEdit ? ' editable' : ''}`}
              onClick={() => canEdit && setEditingTitle(true)}
              title={canEdit ? 'Cliquer pour renommer' : ''}
            >
              {boardTitle}
            </span>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {!dbReady && (
            <span className="db-warning">⚠️ Exécute schema_phase4.sql dans Supabase</span>
          )}
          {!canEdit && <span className="viewer-badge">👁️ Lecture seule</span>}
          <button className="team-btn" onClick={() => setShowEmployees(true)}>👥 Équipe{employees.length > 0 ? ` (${employees.length})` : ''}</button>
          {role === 'owner' && (
            <button className="share-btn" onClick={() => setShowShare(true)}>🔗 Partager</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 48px - 40px)', width: '100vw', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, pointerEvents: 'all' }}>
            <AlertsPanel boardId={boardId} onSelectNode={setSelectedNodeId} />
          </div>
          <ReactFlow
            nodes={flowNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={canEdit ? onConnect : undefined}
            nodeTypes={nodeTypes}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {selectedNode && (
          <SidePanel
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            session={session}
            canEdit={canEdit}
            onNodeUpdate={(nodeId, update) => {
              setNodes(nds => nds.map(n =>
                n.id === nodeId ? { ...n, data: { ...n.data, ...update } } : n
              ))
            }}
            onStatsChange={(nodeId) => refreshNodeStats(nodeId)}
            employees={employees}
          />
        )}
      </div>

      {showShare && (
        <ShareModal boardId={boardId} session={session} onClose={() => setShowShare(false)} />
      )}

      {showEmployees && (
        <EmployeesPanel
          boardId={boardId}
          session={session}
          canEdit={canEdit}
          onClose={() => setShowEmployees(false)}
          onEmployeesChange={async () => {
            const { data } = await supabase.from('employees').select('*').eq('board_id', boardId).order('created_at')
            if (data) setEmployees(data)
          }}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          canEdit={canEdit}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
