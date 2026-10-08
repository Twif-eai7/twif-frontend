import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { usePmStore, filterColumns } from '../../../stores/pmStore'
import BoardColumn from './BoardColumn'
import TaskCard from '../task/TaskCard'
import { PmIcon } from '../shared/PmUi'

// Fractional indexing: midpoint between two positions
function midPos(before, after) {
  if (before == null && after == null) return 65536
  if (before == null) return after / 2
  if (after == null) return before + 65536
  return (before + after) / 2
}

export default function ProjectBoard({ onTaskClick }) {
  const rawColumns    = usePmStore(s => s.columns)
  const filters       = usePmStore(s => s.filters)
  const columns       = useMemo(() => filterColumns(rawColumns, filters), [rawColumns, filters])
  const activeProject = usePmStore(s => s.activeProject)
  const activeBoardIdx = usePmStore(s => s.activeBoardIndex)
  const createColumn  = usePmStore(s => s.createColumn)
  const moveTask      = usePmStore(s => s.moveTask)

  // Raw (unfiltered) columns for DnD — we need to read/write the actual store columns
  const allColumns    = usePmStore(s => s.columns)
  const setColumns    = usePmStore(s => s.setColumnsLocal)

  const [activeId,   setActiveId]   = useState(null)
  const [activeTask, setActiveTask] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  // Loading/error handled by ProjectBoardSection — ProjectBoard only renders when ready
  const boards = activeProject?.boards || []
  const activeBoard = boards[activeBoardIdx]

  // Find which column a task belongs to
  function findColumnOfTask(taskId) {
    return allColumns.find(c => (c.tasks || []).some(t => t.id === taskId))
  }

  function handleDragStart({ active }) {
    setActiveId(active.id)
    const col = findColumnOfTask(active.id)
    const task = col?.tasks?.find(t => t.id === active.id)
    setActiveTask(task || null)
  }

  function handleDragOver({ active, over }) {
    if (!over || active.id === over.id) return

    const fromCol = findColumnOfTask(active.id)
    if (!fromCol) return

    // Dropping over a column (empty or its id)
    const overIsColumn = allColumns.some(c => c.id === over.id)
    const toCol = overIsColumn
      ? allColumns.find(c => c.id === over.id)
      : findColumnOfTask(over.id)

    if (!toCol || fromCol.id === toCol.id) return

    // Move task between columns optimistically (no position calc yet — done in dragEnd)
    const task = (fromCol.tasks || []).find(t => t.id === active.id)
    if (!task) return

    setColumns(cols =>
      cols.map(c => {
        if (c.id === fromCol.id) return { ...c, tasks: (c.tasks || []).filter(t => t.id !== active.id) }
        if (c.id === toCol.id)   return { ...c, tasks: [...(c.tasks || []), { ...task, column_id: toCol.id }] }
        return c
      })
    )
  }

  async function handleDragEnd({ active, over }) {
    setActiveId(null)
    setActiveTask(null)
    if (!over) return

    const fromCol = findColumnOfTask(active.id)
    if (!fromCol) return

    const overIsColumn = allColumns.some(c => c.id === over.id)
    const toCol = overIsColumn
      ? allColumns.find(c => c.id === over.id)
      : findColumnOfTask(over.id)

    if (!toCol) return

    const movingTask = (fromCol.tasks || []).find(t => t.id === active.id)
      || allColumns.flatMap(c => c.tasks || []).find(t => t.id === active.id)
    if (movingTask?.is_blocked && /done/i.test(toCol.name || '')) {
      const names = (movingTask.blocking || []).filter(b => !b.completed_at).map(b => b.title).join(', ')
      const ok = window.confirm(`This task is blocked by unfinished work${names ? ` (${names})` : ''}. Move to Done anyway?`)
      if (!ok) {
        const projectId = usePmStore.getState().activeProjectId
        if (projectId) await usePmStore.getState().fetchProject(projectId)
        return
      }
    }

    const isSameCol = fromCol.id === toCol.id
    const toTasks   = toCol.tasks || []

    if (isSameCol) {
      // Reorder within the same column
      const oldIdx = toTasks.findIndex(t => t.id === active.id)
      const newIdx = toTasks.findIndex(t => t.id === over.id)
      if (oldIdx === newIdx) return

      const reordered = arrayMove(toTasks, oldIdx, newIdx)
      const positionBefore = reordered[newIdx - 1]?.position ?? null
      const positionAfter  = reordered[newIdx + 1]?.position ?? null
      const newPosition    = midPos(positionBefore, positionAfter)

      setColumns(cols =>
        cols.map(c => c.id === toCol.id
          ? { ...c, tasks: reordered.map((t, i) => t.id === active.id ? { ...t, position: newPosition } : t) }
          : c
        )
      )

      await moveTask(active.id, fromCol.id, toCol.id, newPosition, positionBefore, positionAfter)
    } else {
      // Cross-column drop: insert after `over` task (or at end if over is the column)
      const overIdx = toTasks.findIndex(t => t.id === over.id)
      const insertIdx = overIsColumn ? toTasks.length - 1 : overIdx

      const positionBefore = toTasks[insertIdx]?.position   ?? null
      const positionAfter  = toTasks[insertIdx + 1]?.position ?? null
      const newPosition    = midPos(positionBefore, positionAfter)

      await moveTask(active.id, fromCol.id, toCol.id, newPosition, positionBefore, positionAfter)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 px-1 items-start">
        {columns.length === 0 && (
          <div className="w-full py-16 text-center text-sm text-stone-400">
            No columns yet. Add a column to start capturing tasks.
          </div>
        )}
        {columns.map(col => (
          <BoardColumn
            key={col.id}
            column={col}
            onTaskClick={onTaskClick}
            autoAdd={col.id === (columns.find(c => /to\s*do/i.test(c.name || '')) || columns[0])?.id}
          />
        ))}

        {/* Add column button */}
        {activeBoard && (
          <button
            onClick={async () => {
              const name = window.prompt('Column name:')
              if (!name?.trim()) return
              await createColumn(activeBoard.id, name.trim())
            }}
            className="flex-shrink-0 w-64 flex items-center justify-center gap-1.5 h-10 rounded-lg border border-dashed border-stone-200 text-stone-400 hover:border-stone-300 hover:text-stone-600 text-[12px] font-medium transition-colors bg-white/60"
          >
            <PmIcon icon={Plus} size={13} /> Add column
          </button>
        )}
      </div>

      {/* Drag overlay — ghost card while dragging */}
      <DragOverlay>
        {activeTask && (
          <div className="rotate-1 shadow-2xl scale-105 transition-transform">
            <TaskCard task={activeTask} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
