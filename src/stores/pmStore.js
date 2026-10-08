import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useAuthStore } from './authStore'
import { supabase } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, '') || ''

async function api(method, path, body) {
  const session = useAuthStore.getState().session
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  const res = await fetch(`${API_BASE}/pm${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

async function apiForm(path, form) {
  const session = useAuthStore.getState().session
  const res = await fetch(`${API_BASE}/pm${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}` },
    body: form,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyTaskUpdate(columns, taskId, updater) {
  return columns.map(col => ({
    ...col,
    tasks: (col.tasks || []).map(t => t.id === taskId ? updater(t) : t),
  }))
}

function removeTask(columns, taskId) {
  return columns.map(col => ({
    ...col,
    tasks: (col.tasks || []).filter(t => t.id !== taskId),
  }))
}

function matchesDuePreset(task, preset, now = new Date()) {
  if (!preset) return true
  if (preset === 'none') return !task.due_date
  if (!task.due_date) return false
  const due = new Date(task.due_date)
  if (preset === 'overdue') return due < now
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endToday = new Date(start.getTime() + 86400000)
  if (preset === 'today') return due >= start && due < endToday
  if (preset === 'week') return due >= start && due < new Date(start.getTime() + 7 * 86400000)
  return true
}

export function filterColumns(columns = [], filters = {}) {
  const noFilters = !filters.assignees?.length && !filters.priorities?.length &&
    !filters.labels?.length && !filters.search && !filters.priority && !filters.overdue && !filters.duePreset
  if (noFilters) return columns
  const now = new Date()
  return columns.map(col => ({
    ...col,
    tasks: (col.tasks || []).filter(t => {
      if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase())) return false
      if (filters.priority && t.priority !== filters.priority) return false
      if (filters.priorities?.length && !filters.priorities.includes(t.priority)) return false
      if (filters.overdue && !(t.due_date && new Date(t.due_date) < now)) return false
      if (!matchesDuePreset(t, filters.duePreset, now)) return false
      if (filters.assignees?.length && !(t.assignees || []).some(a => filters.assignees.includes(a.member_id))) return false
      if (filters.labels?.length && !filters.labels.some(l => (t.labels || []).includes(l))) return false
      return true
    }),
  }))
}

export function flattenTasks(columns = []) {
  return columns.flatMap(col => (col.tasks || []).map(t => ({ ...t, column_name: col.name, column_color: col.color })))
}

export const usePmStore = create(
  devtools(
    (set, get) => ({
      // ── Projects list ────────────────────────────────────────────────────────
      projects: [],
      projectsLoading: false,
      projectsError: null,

      // ── Active project / board ───────────────────────────────────────────────
      activeProject: null,
      activeProjectId: null,
      activeBoardIndex: 0,      // which board tab is selected
      columns: [],              // [{id, name, color, position, wip_limit, tasks:[...]}]
      projectMembers: [],
      boardLoading: true,   // true by default — prevents blank flash before first fetch
      boardError: null,

      // ── Active task (detail drawer) ──────────────────────────────────────────
      activeTask: null,
      taskDrawerOpen: false,
      taskLoading: false,

      // ── My tasks ─────────────────────────────────────────────────────────────
      myTasks: [],
      myTasksLoading: false,

      // ── Notifications ────────────────────────────────────────────────────────
      notifications: [],
      notificationsLoading: false,
      alertQueue: [],
      _notifChannel: null,

      // ── View mode ────────────────────────────────────────────────────────────
      viewMode: 'board',   // 'board' | 'list' | 'calendar'

      // ── Filters ──────────────────────────────────────────────────────────────
      // `priorities` = multi-select array (Phase 2 filter bar)
      // `priority`   = single-select from board filter bar (Phase 1)
      // `overdue`    = boolean to show only overdue tasks
      // `duePreset`  = 'overdue' | 'today' | 'week' | 'none' | null
      filters: { assignees: [], priorities: [], labels: [], search: '', priority: null, overdue: false, duePreset: null },
      savedFilters: [],
      savedFiltersLoading: false,
      addTaskNudge: 0,
      searchHits: { projects: [], tasks: [] },
      searchLoading: false,

      // ═════════════════════════════════════════════════════════════════════════
      // Projects
      // ═════════════════════════════════════════════════════════════════════════

      fetchProjects: async () => {
        set({ projectsLoading: true, projectsError: null }, false, 'pm/fetchProjects')
        try {
          const projects = await api('GET', '/projects')
          set({ projects, projectsLoading: false }, false, 'pm/fetchProjectsDone')
        } catch (err) {
          set({ projectsError: err.message, projectsLoading: false }, false, 'pm/fetchProjectsError')
        }
      },

      createProject: async (data) => {
        const project = await api('POST', '/projects', data)
        set(s => ({ projects: [project.project, ...s.projects] }), false, 'pm/createProject')
        return project
      },

      updateProject: async (projectId, data) => {
        const updated = await api('PATCH', `/projects/${projectId}`, data)
        set(s => ({
          projects: s.projects.map(p => p.id === projectId ? { ...p, ...updated } : p),
          activeProject: s.activeProject?.id === projectId ? { ...s.activeProject, ...updated } : s.activeProject,
        }), false, 'pm/updateProject')
        return updated
      },

      archiveProject: async (projectId) => {
        await api('DELETE', `/projects/${projectId}`)
        set(s => ({ projects: s.projects.filter(p => p.id !== projectId) }), false, 'pm/archiveProject')
      },

      // ═════════════════════════════════════════════════════════════════════════
      // Board (project detail)
      // ═════════════════════════════════════════════════════════════════════════

      fetchProject: async (projectId) => {
        set({ boardLoading: true, boardError: null, activeProjectId: projectId }, false, 'pm/fetchProject')
        try {
          const { project, boards, members } = await api('GET', `/projects/${projectId}`)
          const boardList = boards || []
          const boardIdx = boardList.length
            ? Math.min(Math.max(get().activeBoardIndex, 0), boardList.length - 1)
            : 0
          const activeBoard = boardList[boardIdx]
          const columns = (activeBoard?.columns || []).map(c => ({ ...c, tasks: c.tasks || [] }))

          set({
            activeProject: { ...project, boards: boardList },
            columns,
            projectMembers: (members || []).map(m => ({
              ...m,
              id: m.member_id || m.organization_members?.id || m.id,
              full_name: m.full_name || m.organization_members?.full_name,
              email: m.email || m.organization_members?.email,
            })),
            boardLoading: false,
            activeBoardIndex: boardIdx,
          }, false, 'pm/fetchProjectDone')
        } catch (err) {
          set({ boardError: err.message, boardLoading: false }, false, 'pm/fetchProjectError')
        }
      },

      setActiveBoardIndex: (idx) => {
        const boards = get().activeProject?.boards || []
        const board = boards[idx]
        if (!board) return
        set({ activeBoardIndex: idx, columns: board.columns || [] }, false, 'pm/setActiveBoard')
      },

      setViewMode: (mode, projectId) => {
        set({ viewMode: mode }, false, 'pm/setViewMode')
        if (projectId && typeof window !== 'undefined') {
          localStorage.setItem(`twif-pm-view-${projectId}`, mode)
        }
      },

      loadPersistedView: (projectId) => {
        if (!projectId || typeof window === 'undefined') return
        const saved = localStorage.getItem(`twif-pm-view-${projectId}`)
        if (saved && ['board', 'list', 'calendar'].includes(saved)) {
          set({ viewMode: saved }, false, 'pm/loadPersistedView')
        }
      },

      // Call when leaving a project page to clear stale board state
      resetBoard: () => set({
        activeProject: null, activeProjectId: null,
        columns: [], projectMembers: [],
        boardLoading: true, boardError: null,
        activeTask: null, taskDrawerOpen: false,
        activeBoardIndex: 0,
        savedFilters: [],
        filters: { assignees: [], priorities: [], labels: [], search: '', priority: null, overdue: false, duePreset: null },
      }, false, 'pm/resetBoard'),

      setFilters: (filters) => set(s => ({ filters: { ...s.filters, ...filters } }), false, 'pm/setFilters'),

      resetFilters: () => set({
        filters: { assignees: [], priorities: [], labels: [], search: '', priority: null, overdue: false, duePreset: null },
      }, false, 'pm/resetFilters'),

      fetchSavedFilters: async (projectId) => {
        if (!projectId) return
        set({ savedFiltersLoading: true }, false, 'pm/fetchSavedFilters')
        try {
          const rows = await api('GET', `/projects/${projectId}/saved-filters`)
          set({ savedFilters: rows || [], savedFiltersLoading: false }, false, 'pm/fetchSavedFiltersDone')
        } catch {
          set({ savedFiltersLoading: false }, false, 'pm/fetchSavedFiltersError')
        }
      },

      saveFilter: async (projectId, name, filters) => {
        const row = await api('POST', `/projects/${projectId}/saved-filters`, { name, filters })
        set(s => ({ savedFilters: [row, ...s.savedFilters] }), false, 'pm/saveFilter')
        return row
      },

      deleteSavedFilter: async (projectId, filterId) => {
        await api('DELETE', `/projects/${projectId}/saved-filters/${filterId}`)
        set(s => ({ savedFilters: s.savedFilters.filter(f => f.id !== filterId) }), false, 'pm/deleteSavedFilter')
      },

      applySavedFilter: (row) => {
        const next = row?.filters || {}
        set({
          filters: {
            assignees: next.assignees || [],
            priorities: next.priorities || [],
            labels: next.labels || [],
            search: next.search || '',
            priority: next.priority || null,
            overdue: !!next.overdue,
            duePreset: next.duePreset || null,
          },
        }, false, 'pm/applySavedFilter')
      },

      searchPos: (q) => api('GET', `/search/pos?q=${encodeURIComponent(q || '')}`),
      searchWorkspaces: (q) => api('GET', `/search/workspaces?q=${encodeURIComponent(q || '')}`),
      searchInspections: (q) => api('GET', `/search/inspections?q=${encodeURIComponent(q || '')}`),
      resolveLinks: (ids = {}) => {
        const params = new URLSearchParams()
        if (ids.po_id) params.set('po_id', ids.po_id)
        if (ids.workspace_id) params.set('workspace_id', ids.workspace_id)
        if (ids.inspection_id) params.set('inspection_id', ids.inspection_id)
        return api('GET', `/links/resolve?${params}`)
      },

      createTaskFromSource: async (payload) => {
        const task = await api('POST', '/tasks/from-source', payload)
        const projectId = get().activeProjectId
        if (projectId && task.project_id === projectId) {
          set(s => ({
            columns: s.columns.map(c =>
              c.id === task.column_id
                ? { ...c, tasks: [...(c.tasks || []), { ...task, assignees: [], checklist_total: 0, checklist_done: 0 }] }
                : c
            ),
          }), false, 'pm/createTaskFromSource')
        }
        return task
      },

      nudgeAddTask: () => set(s => ({ addTaskNudge: s.addTaskNudge + 1 }), false, 'pm/nudgeAddTask'),

      searchProjectTasks: (projectId, q) => api('GET', `/projects/${projectId}/tasks?search=${encodeURIComponent(q || '')}`),

      searchAll: async (q) => {
        set({ searchLoading: true }, false, 'pm/search')
        try {
          const data = await api('GET', `/search?q=${encodeURIComponent(q || '')}`)
          set({ searchHits: { projects: data.projects || [], tasks: data.tasks || [] }, searchLoading: false }, false, 'pm/searchDone')
          return data
        } catch {
          set({ searchHits: { projects: [], tasks: [] }, searchLoading: false }, false, 'pm/searchError')
          return { projects: [], tasks: [] }
        }
      },

      addDependency: async (taskId, payload) => {
        const row = await api('POST', `/tasks/${taskId}/dependencies`, payload)
        if (get().activeTask?.id === taskId) {
          await get().openTask(taskId)
        }
        const projectId = get().activeProjectId
        if (projectId) await get().fetchProject(projectId)
        return row
      },

      removeDependency: async (taskId, depId) => {
        await api('DELETE', `/tasks/${taskId}/dependencies/${depId}`)
        if (get().activeTask?.id === taskId) {
          await get().openTask(taskId)
        }
        const projectId = get().activeProjectId
        if (projectId) await get().fetchProject(projectId)
      },

      updateRecurrence: async (taskId, recurrence_rule, scope = 'this') => {
        return get().updateTask(taskId, { recurrence_rule, recurrence_scope: scope })
      },

      duplicateProject: async (projectId) => {
        const project = await api('POST', `/projects/${projectId}/duplicate`)
        set(s => ({ projects: [project, ...s.projects] }), false, 'pm/duplicateProject')
        return project
      },

      exportProjectCsv: async (projectId) => {
        const session = useAuthStore.getState().session
        const res = await fetch(`${API_BASE}/pm/projects/${projectId}/export.csv`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        if (!res.ok) throw new Error('Export failed')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'project-tasks.csv'
        a.click()
        URL.revokeObjectURL(url)
      },

      fetchAdminProjects: (params = {}) => {
        const qs = new URLSearchParams()
        if (params.q) qs.set('q', params.q)
        if (params.status) qs.set('status', params.status)
        return api('GET', `/admin/projects${qs.toString() ? `?${qs}` : ''}`)
      },

      archiveAdminProjects: (ids) => api('POST', '/admin/projects/archive', { ids }),

      createTaskFromPctStage: async (payload) => {
        const task = await api('POST', '/tasks/from-pct-stage', payload)
        const projectId = get().activeProjectId
        if (projectId && task.project_id === projectId) {
          set(s => ({
            columns: s.columns.map(c =>
              c.id === task.column_id
                ? { ...c, tasks: [...(c.tasks || []), { ...task, assignees: [], checklist_total: 0, checklist_done: 0 }] }
                : c
            ),
          }), false, 'pm/createTaskFromPctStage')
        }
        return task
      },

      // Used by ProjectBoard DnD for optimistic column mutations
      setColumnsLocal: (updater) => set(s => ({ columns: typeof updater === 'function' ? updater(s.columns) : updater }), false, 'pm/setColumnsLocal'),

      // ═════════════════════════════════════════════════════════════════════════
      // Columns
      // ═════════════════════════════════════════════════════════════════════════

      createColumn: async (boardId, name) => {
        const col = await api('POST', `/boards/${boardId}/columns`, { name })
        set(s => ({ columns: [...s.columns, { ...col, tasks: [] }] }), false, 'pm/createColumn')
        return col
      },

      updateColumn: async (boardId, colId, updates) => {
        const col = await api('PATCH', `/boards/${boardId}/columns/${colId}`, updates)
        set(s => ({
          columns: s.columns.map(c => c.id === colId ? { ...c, ...col } : c),
        }), false, 'pm/updateColumn')
        return col
      },

      deleteColumn: async (boardId, colId, force = false) => {
        await api('DELETE', `/boards/${boardId}/columns/${colId}${force ? '?force=true' : ''}`)
        set(s => ({ columns: s.columns.filter(c => c.id !== colId) }), false, 'pm/deleteColumn')
      },

      // ═════════════════════════════════════════════════════════════════════════
      // Tasks
      // ═════════════════════════════════════════════════════════════════════════

      createTask: async (colId, data) => {
        const task = await api('POST', `/columns/${colId}/tasks`, data)
        set(s => ({
          columns: s.columns.map(c =>
            c.id === colId ? { ...c, tasks: [...(c.tasks || []), { ...task, assignees: [], checklist_total: 0, checklist_done: 0 }] } : c
          ),
        }), false, 'pm/createTask')
        return task
      },

      updateTask: async (taskId, data) => {
        const updated = await api('PATCH', `/tasks/${taskId}`, data)
        set(s => ({ columns: applyTaskUpdate(s.columns, taskId, t => ({ ...t, ...updated })) }), false, 'pm/updateTask')
        if (get().activeTask?.id === taskId) {
          set(s => ({ activeTask: { ...s.activeTask, ...updated } }), false, 'pm/updateActiveTask')
        }
        return updated
      },

      moveTask: async (taskId, fromColId, toColId, newPosition, positionBefore, positionAfter) => {
        // Optimistic update first
        const task = get().columns.flatMap(c => c.tasks || []).find(t => t.id === taskId)
        if (!task) return

        set(s => {
          const withoutTask = removeTask(s.columns, taskId)
          return {
            columns: withoutTask.map(c =>
              c.id === toColId
                ? { ...c, tasks: [...(c.tasks || []), { ...task, column_id: toColId, position: newPosition }].sort((a, b) => a.position - b.position) }
                : c
            ),
          }
        }, false, 'pm/moveTaskOptimistic')

        try {
          await api('PATCH', `/tasks/${taskId}/move`, {
            column_id: toColId,
            position_before: positionBefore,
            position_after:  positionAfter,
          })
        } catch (err) {
          // Revert on failure: refetch the project
          console.error('moveTask failed, reverting:', err.message)
          await get().fetchProject(get().activeProjectId)
        }
      },

      deleteTask: async (taskId) => {
        await api('DELETE', `/tasks/${taskId}`)
        set(s => ({ columns: removeTask(s.columns, taskId) }), false, 'pm/deleteTask')
        if (get().activeTask?.id === taskId) {
          set({ activeTask: null, taskDrawerOpen: false }, false, 'pm/closeDeletedTask')
        }
      },

      // ═════════════════════════════════════════════════════════════════════════
      // Task Drawer
      // ═════════════════════════════════════════════════════════════════════════

      openTask: async (taskId) => {
        set({ taskDrawerOpen: true, taskLoading: true, activeTask: null }, false, 'pm/openTask')
        try {
          const task = await api('GET', `/tasks/${taskId}`)
          set({ activeTask: task, taskLoading: false }, false, 'pm/openTaskDone')
        } catch (err) {
          set({ taskLoading: false }, false, 'pm/openTaskError')
          console.error('openTask:', err.message)
        }
      },

      closeTask: () => set({ taskDrawerOpen: false, activeTask: null }, false, 'pm/closeTask'),

      // ═════════════════════════════════════════════════════════════════════════
      // Assignees
      // ═════════════════════════════════════════════════════════════════════════

      addAssignees: async (taskId, memberIds) => {
        const assignees = await api('POST', `/tasks/${taskId}/assignees`, { member_ids: memberIds })
        set(s => ({
          columns: applyTaskUpdate(s.columns, taskId, t => ({
            ...t,
            assignees: [...(t.assignees || []), ...assignees],
          })),
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, assignees: [...(s.activeTask.assignees || []), ...assignees] }
            : s.activeTask,
        }), false, 'pm/addAssignees')
        return assignees
      },

      removeAssignee: async (taskId, memberId) => {
        await api('DELETE', `/tasks/${taskId}/assignees/${memberId}`)
        set(s => ({
          columns: applyTaskUpdate(s.columns, taskId, t => ({
            ...t,
            assignees: (t.assignees || []).filter(a => a.member_id !== memberId),
          })),
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, assignees: (s.activeTask.assignees || []).filter(a => a.member_id !== memberId) }
            : s.activeTask,
        }), false, 'pm/removeAssignee')
      },

      // ═════════════════════════════════════════════════════════════════════════
      // Checklists
      // ═════════════════════════════════════════════════════════════════════════

      addChecklistItem: async (taskId, title) => {
        const item = await api('POST', `/tasks/${taskId}/checklists`, { title })
        set(s => ({
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, checklists: [...(s.activeTask.checklists || []), item] }
            : s.activeTask,
        }), false, 'pm/addChecklist')
        return item
      },

      updateChecklistItem: async (taskId, itemId, updates) => {
        const item = await api('PATCH', `/tasks/${taskId}/checklists/${itemId}`, updates)
        set(s => {
          if (s.activeTask?.id !== taskId) return {}
          const checklists = (s.activeTask.checklists || []).map(c => c.id === itemId ? { ...c, ...item } : c)
          const done = checklists.filter(c => c.checked).length
          return {
            activeTask: { ...s.activeTask, checklists, checklist_done: done, checklist_total: checklists.length },
            columns: applyTaskUpdate(s.columns, taskId, t => ({ ...t, checklist_done: done, checklist_total: checklists.length })),
          }
        }, false, 'pm/updateChecklist')
        return item
      },

      deleteChecklistItem: async (taskId, itemId) => {
        await api('DELETE', `/tasks/${taskId}/checklists/${itemId}`)
        set(s => ({
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, checklists: (s.activeTask.checklists || []).filter(c => c.id !== itemId) }
            : s.activeTask,
        }), false, 'pm/deleteChecklist')
      },

      // ═════════════════════════════════════════════════════════════════════════
      // Project Members
      // ═════════════════════════════════════════════════════════════════════════

      inviteMember: async (projectId, memberId, role = 'editor') => {
        const row = await api('POST', `/projects/${projectId}/members`, { member_id: memberId, role })
        set(s => ({ projectMembers: [...s.projectMembers, row] }), false, 'pm/inviteMember')
        return row
      },

      updateMemberRole: async (projectId, memberId, role) => {
        const row = await api('PATCH', `/projects/${projectId}/members/${memberId}`, { role })
        set(s => ({
          projectMembers: s.projectMembers.map(m => m.member_id === memberId ? { ...m, role } : m),
        }), false, 'pm/updateMemberRole')
        return row
      },

      removeMember: async (projectId, memberId) => {
        await api('DELETE', `/projects/${projectId}/members/${memberId}`)
        set(s => ({ projectMembers: s.projectMembers.filter(m => m.member_id !== memberId) }), false, 'pm/removeMember')
      },

      // ═════════════════════════════════════════════════════════════════════════
      // My Tasks
      // ═════════════════════════════════════════════════════════════════════════

      fetchMyTasks: async (filters = {}) => {
        set({ myTasksLoading: true }, false, 'pm/fetchMyTasks')
        try {
          const params = new URLSearchParams()
          if (filters.overdue)   params.set('overdue', 'true')
          if (filters.due_today) params.set('due_today', 'true')
          if (filters.priority)  params.set('priority', filters.priority)
          const tasks = await api('GET', `/my-tasks${params.toString() ? `?${params}` : ''}`)
          set({ myTasks: tasks, myTasksLoading: false }, false, 'pm/fetchMyTasksDone')
        } catch (err) {
          set({ myTasksLoading: false }, false, 'pm/fetchMyTasksError')
        }
      },

      // ═════════════════════════════════════════════════════════════════════════
      // Computed selectors (stable refs)
      // ═════════════════════════════════════════════════════════════════════════

      getFilteredColumns: () => filterColumns(get().columns, get().filters),

      // ═════════════════════════════════════════════════════════════════════════
      // Comments / attachments / time / reminders
      // ═════════════════════════════════════════════════════════════════════════

      addComment: async (taskId, { html, mentions = [], files = [] }) => {
        const form = new FormData()
        form.append('body', html || '')
        form.append('format', 'html')
        form.append('mentions', JSON.stringify(mentions))
        for (const f of files) form.append('files', f)
        const comment = await apiForm(`/tasks/${taskId}/comments`, form)
        set(s => ({
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, comments: [...(s.activeTask.comments || []), comment] }
            : s.activeTask,
        }), false, 'pm/addComment')
        return comment
      },

      deleteComment: async (taskId, commentId) => {
        await api('DELETE', `/tasks/${taskId}/comments/${commentId}`)
        set(s => ({
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, comments: (s.activeTask.comments || []).filter(c => c.id !== commentId) }
            : s.activeTask,
        }), false, 'pm/deleteComment')
      },

      uploadInlineImage: async (taskId, file) => {
        const form = new FormData()
        form.append('file', file)
        return apiForm(`/tasks/${taskId}/inline-image`, form)
      },

      addAttachments: async (taskId, files) => {
        const form = new FormData()
        for (const f of files) form.append('files', f)
        const rows = await apiForm(`/tasks/${taskId}/attachments`, form)
        set(s => ({
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, attachments: [...(s.activeTask.attachments || []), ...rows] }
            : s.activeTask,
        }), false, 'pm/addAttachments')
        return rows
      },

      deleteAttachment: async (taskId, attId) => {
        await api('DELETE', `/tasks/${taskId}/attachments/${attId}`)
        set(s => ({
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, attachments: (s.activeTask.attachments || []).filter(a => a.id !== attId) }
            : s.activeTask,
        }), false, 'pm/deleteAttachment')
      },

      addTimeLog: async (taskId, payload) => {
        const row = await api('POST', `/tasks/${taskId}/time-logs`, payload)
        set(s => ({
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, time_logs: [row, ...(s.activeTask.time_logs || [])] }
            : s.activeTask,
        }), false, 'pm/addTimeLog')
        return row
      },

      deleteTimeLog: async (taskId, logId) => {
        await api('DELETE', `/tasks/${taskId}/time-logs/${logId}`)
        set(s => ({
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, time_logs: (s.activeTask.time_logs || []).filter(l => l.id !== logId) }
            : s.activeTask,
        }), false, 'pm/deleteTimeLog')
      },

      addReminder: async (taskId, payload) => {
        const row = await api('POST', `/tasks/${taskId}/reminders`, payload)
        set(s => ({
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, reminders: [...(s.activeTask.reminders || []).filter(r => r.id !== row.id), row] }
            : s.activeTask,
        }), false, 'pm/addReminder')
        return row
      },

      deleteReminder: async (taskId, reminderId) => {
        await api('DELETE', `/tasks/${taskId}/reminders/${reminderId}`)
        set(s => ({
          activeTask: s.activeTask?.id === taskId
            ? { ...s.activeTask, reminders: (s.activeTask.reminders || []).filter(r => r.id !== reminderId) }
            : s.activeTask,
        }), false, 'pm/deleteReminder')
      },

      fetchNotifications: async () => {
        set({ notificationsLoading: true }, false, 'pm/fetchNotifications')
        try {
          const rows = await api('GET', '/notifications')
          const now = Date.now()
          const visible = (rows || []).filter(n => !n.snoozed_until || new Date(n.snoozed_until).getTime() <= now)
          set({
            notifications: rows || [],
            alertQueue: visible.filter(n => !n.read && n.type === 'reminder').slice(0, 5),
            notificationsLoading: false,
          }, false, 'pm/fetchNotificationsDone')
        } catch {
          set({ notificationsLoading: false }, false, 'pm/fetchNotificationsError')
        }
      },

      markNotificationRead: async (id) => {
        await api('PATCH', `/notifications/${id}/read`)
        set(s => ({
          notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n),
          alertQueue: s.alertQueue.filter(n => n.id !== id),
        }), false, 'pm/markRead')
      },

      markAllNotificationsRead: async () => {
        await api('POST', '/notifications/read-all')
        set(s => ({
          notifications: s.notifications.map(n => ({ ...n, read: true })),
          alertQueue: [],
        }), false, 'pm/markAllRead')
      },

      snoozeNotification: async (id, minutes = 10) => {
        const updated = await api('PATCH', `/notifications/${id}/snooze`, { minutes })
        set(s => ({
          notifications: s.notifications.map(n => n.id === id ? { ...n, ...updated } : n),
          alertQueue: s.alertQueue.filter(n => n.id !== id),
        }), false, 'pm/snooze')
      },

      pushNotification: (row) => {
        if (!row?.id) return
        set(s => {
          if (s.notifications.some(n => n.id === row.id)) return {}
          return {
            notifications: [row, ...s.notifications],
            alertQueue: row.type === 'reminder' && !row.read
              ? [row, ...s.alertQueue].slice(0, 5)
              : s.alertQueue,
          }
        }, false, 'pm/pushNotification')
      },

      dismissAlert: (id) => set(s => ({
        alertQueue: s.alertQueue.filter(n => n.id !== id),
      }), false, 'pm/dismissAlert'),

      subscribeToNotifications: (memberId) => {
        if (!memberId) return () => {}
        if (!supabase) return () => {}
        const existing = get()._notifChannel
        if (existing) {
          supabase.removeChannel(existing)
        }
        const channel = supabase
          .channel(`pm-notifications-${memberId}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'pm_notifications',
            filter: `member_id=eq.${memberId}`,
          }, (payload) => {
            get().pushNotification(payload.new)
          })
          .subscribe()
        set({ _notifChannel: channel }, false, 'pm/subscribe')
        return () => {
          supabase.removeChannel(channel)
          set({ _notifChannel: null }, false, 'pm/unsubscribe')
        }
      },
    }),
    { name: 'PM Store' }
  )
)
