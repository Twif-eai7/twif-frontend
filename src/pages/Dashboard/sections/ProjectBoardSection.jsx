import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronRight, Users, LayoutGrid, List, CalendarDays, MoreHorizontal,
  Settings, Copy, Download, CircleCheck, Archive, TriangleAlert,
} from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import ProjectBoard from '../../../components/pm/board/ProjectBoard'
import ProjectListView from '../../../components/pm/views/ProjectListView'
import ProjectCalendarView from '../../../components/pm/views/ProjectCalendarView'
import ProjectFilters from '../../../components/pm/views/ProjectFilters'
import TaskDetailDrawer from '../../../components/pm/task/TaskDetailDrawer'
import ProjectMembersPanel from '../../../components/pm/project/ProjectMembersPanel'
import ProjectSettingsModal from '../../../components/pm/project/ProjectSettingsModal'
import { Spinner } from '../../../components/ui'
import { MemberAvatarGroup } from '../../../components/pm/shared/MemberAvatar'
import { ProjectGlyph, SegControl, IconButton, MenuRow, PmButton, PmEmpty, PmIcon } from '../../../components/pm/shared/PmUi'

const VIEW_MODES = [
  { key: 'board',    icon: LayoutGrid, label: 'Board' },
  { key: 'list',     icon: List,       label: 'List'  },
  { key: 'calendar', icon: CalendarDays, label: 'Calendar' },
]
const EMPTY_BOARDS = []

const STATUS_STYLES = {
  active:    'text-emerald-600 bg-emerald-50',
  completed: 'text-blue-600 bg-blue-50',
  archived:  'text-stone-400 bg-stone-100',
}

export default function ProjectBoardSection() {
  const { projectId }  = useParams()
  const navigate       = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const fetchProject        = usePmStore(s => s.fetchProject)
  const activeProject       = usePmStore(s => s.activeProject)
  const boards              = usePmStore(s => s.activeProject?.boards)
  const activeBoardIndex    = usePmStore(s => s.activeBoardIndex)
  const setActiveBoardIndex = usePmStore(s => s.setActiveBoardIndex)
  const boardLoading        = usePmStore(s => s.boardLoading)
  const boardError          = usePmStore(s => s.boardError)
  const openTask            = usePmStore(s => s.openTask)
  const viewMode            = usePmStore(s => s.viewMode)
  const setViewMode         = usePmStore(s => s.setViewMode)
  const updateProject       = usePmStore(s => s.updateProject)
  const archiveProject      = usePmStore(s => s.archiveProject)
  const projectMembers      = usePmStore(s => s.projectMembers)
  const fetchSavedFilters   = usePmStore(s => s.fetchSavedFilters)
  const loadPersistedView   = usePmStore(s => s.loadPersistedView)
  const nudgeAddTask        = usePmStore(s => s.nudgeAddTask)
  const exportProjectCsv    = usePmStore(s => s.exportProjectCsv)
  const duplicateProject    = usePmStore(s => s.duplicateProject)
  const resetBoard          = usePmStore(s => s.resetBoard)

  const boardList = boards || EMPTY_BOARDS
  const memberList = projectMembers || EMPTY_BOARDS

  const [showMenu,     setShowMenu]     = useState(false)
  const [showMembers,  setShowMembers]  = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (projectId) {
      loadPersistedView(projectId)
      fetchProject(projectId)
      fetchSavedFilters(projectId)
    }
    return () => resetBoard()
  }, [projectId])

  useEffect(() => {
    const taskId = searchParams.get('task')
    if (taskId && !boardLoading) {
      openTask(taskId)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, boardLoading])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'n' && e.key !== 'N') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) return
      if (viewMode !== 'board') return
      e.preventDefault()
      nudgeAddTask()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewMode, nudgeAddTask])

  const handleTaskClick = (task) => {
    openTask(task.id)
  }

  return (
    <div className="flex flex-col h-full bg-[#fafafa]">
      <div className="flex items-center justify-between px-3 sm:px-5 pt-3.5 pb-3 border-b border-stone-200/80 flex-shrink-0 gap-2 flex-wrap bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/dashboard/projects')} className="text-[12px] text-stone-400 hover:text-stone-700 transition-colors flex-shrink-0">
            Projects
          </button>
          <PmIcon icon={ChevronRight} size={12} className="text-stone-300 flex-shrink-0" />
          {activeProject ? (
            <div className="flex items-center gap-2 min-w-0">
              <ProjectGlyph name={activeProject.emoji} color={activeProject.color} size={22} />
              <h1 className="text-[13px] font-semibold text-stone-900 truncate max-w-[220px]">{activeProject.title}</h1>
              <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md capitalize ${STATUS_STYLES[activeProject.status] || STATUS_STYLES.active}`}>
                {activeProject.status}
              </span>
            </div>
          ) : (
            <div className="h-4 w-32 bg-stone-100 animate-pulse rounded" />
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {memberList.length > 0 && (
            <button type="button" onClick={() => setShowMembers(true)} title="Manage members" className="mr-0.5">
              <MemberAvatarGroup members={memberList} max={4} size="xs" />
            </button>
          )}
          <PmButton icon={Users} onClick={() => setShowMembers(true)} className="hidden sm:inline-flex">
            Members
          </PmButton>

          {boardList.length > 1 && (
            <SegControl
              value={boardList[activeBoardIndex]?.id}
              onChange={(id) => setActiveBoardIndex(boardList.findIndex(b => b.id === id))}
              options={boardList.map(b => ({ key: b.id, label: b.name }))}
            />
          )}

          <SegControl
            value={viewMode}
            onChange={(key) => setViewMode(key, projectId)}
            options={VIEW_MODES.map(v => ({ ...v, hideLabelOnMobile: true }))}
          />

          <div className="relative">
            <IconButton icon={MoreHorizontal} title="More" onClick={() => setShowMenu(m => !m)} />
            {showMenu && activeProject && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-9 z-30 w-48 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden py-1">
                  <MenuRow icon={Settings} onClick={() => { setShowMenu(false); setShowSettings(true) }}>Settings</MenuRow>
                  <MenuRow icon={Users} onClick={() => { setShowMenu(false); setShowMembers(true) }}>Members</MenuRow>
                  <MenuRow icon={Copy} onClick={async () => {
                    setShowMenu(false)
                    const copy = await duplicateProject(activeProject.id)
                    if (copy?.id) navigate(`/dashboard/projects/${copy.id}`)
                  }}>Duplicate board</MenuRow>
                  <MenuRow icon={Download} onClick={async () => { setShowMenu(false); await exportProjectCsv(activeProject.id) }}>Export CSV</MenuRow>
                  <div className="my-1 border-t border-stone-100" />
                  {activeProject.status !== 'completed' && (
                    <MenuRow icon={CircleCheck} onClick={async () => { setShowMenu(false); await updateProject(activeProject.id, { status: 'completed' }) }}>
                      Mark completed
                    </MenuRow>
                  )}
                  {activeProject.status !== 'archived' && (
                    <MenuRow icon={Archive} danger onClick={async () => { setShowMenu(false); if (window.confirm('Archive project?')) await archiveProject(activeProject.id) }}>
                      Archive
                    </MenuRow>
                  )}
                  {activeProject.due_date && (
                    <div className="px-3 py-2 border-t border-stone-100 text-[11px] text-stone-400">
                      Due {new Date(activeProject.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-5 py-2 border-b border-stone-200/80 flex-shrink-0 overflow-x-auto bg-white">
        <ProjectFilters projectId={projectId} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
        {boardLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Spinner light={false} size="w-6 h-6" />
            <p className="text-[12px] text-stone-400">Loading board…</p>
          </div>
        ) : boardError ? (
          <PmEmpty
            icon={TriangleAlert}
            title="Failed to load project"
            subtitle={boardError}
            action={<PmButton variant="primary" onClick={() => fetchProject(projectId)}>Retry</PmButton>}
          />
        ) : viewMode === 'board' ? (
          <ProjectBoard onTaskClick={handleTaskClick} />
        ) : viewMode === 'calendar' ? (
          <ProjectCalendarView onTaskClick={handleTaskClick} />
        ) : (
          <ProjectListView onTaskClick={handleTaskClick} />
        )}
      </div>

      <TaskDetailDrawer />
      {showMembers  && <ProjectMembersPanel  onClose={() => setShowMembers(false)}  />}
      {showSettings && <ProjectSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
