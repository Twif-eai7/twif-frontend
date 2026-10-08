import { useEffect, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import SortableTaskCard from '../task/SortableTaskCard'
import { usePmStore } from '../../../stores/pmStore'
import { IconButton, PmButton, PmIcon } from '../shared/PmUi'

export default function BoardColumn({ column, onTaskClick, autoAdd = false }) {
  const createTask = usePmStore(s => s.createTask)
  const addTaskNudge = usePmStore(s => s.addTaskNudge)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', column },
  })

  const taskIds = (column.tasks || []).map(t => t.id)
  const taskCount = column.tasks?.length || 0
  const isOverWip = column.wip_limit && taskCount > column.wip_limit

  useEffect(() => {
    if (autoAdd && addTaskNudge > 0) setAdding(true)
  }, [addTaskNudge, autoAdd])

  const handleAddTask = async () => {
    const title = newTitle.trim()
    if (!title) { setAdding(false); return }
    setSaving(true)
    try {
      await createTask(column.id, { title })
      setNewTitle('')
      setAdding(false)
    } catch (err) {
      console.error('createTask:', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`flex-shrink-0 w-64 flex flex-col rounded-lg overflow-hidden border transition-colors ${
      isOver ? 'border-[#4d68f0] bg-[#4d68f0]/5' : 'border-stone-200 bg-stone-50/80'
    }`}>
      <div className="px-2.5 pt-2.5 pb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: column.color || '#94a3b8' }} />
          <span className="text-[12px] font-medium text-stone-700 truncate max-w-[130px]">{column.name}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
            isOverWip ? 'bg-red-100 text-red-600' : 'bg-white text-stone-400 border border-stone-200'
          }`}>
            {taskCount}{column.wip_limit ? `/${column.wip_limit}` : ''}
          </span>
        </div>
        <IconButton icon={Plus} title="Add task" onClick={() => setAdding(true)} className="w-6 h-6" size={13} />
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5 min-h-[60px] max-h-[calc(100vh-220px)]"
        >
          {(column.tasks || []).map(task => (
            <SortableTaskCard key={task.id} task={task} onTaskClick={onTaskClick} />
          ))}

          {adding && (
            <div className="bg-white rounded-lg border border-stone-200 p-2 space-y-2">
              <textarea
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTask() }
                  if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
                }}
                placeholder="Task title…"
                rows={2}
                className="w-full text-[12px] text-stone-800 placeholder-stone-400 resize-none outline-none leading-snug"
              />
              <div className="flex items-center gap-1.5">
                <PmButton variant="primary" onClick={handleAddTask} disabled={saving || !newTitle.trim()} className="h-7 px-2.5 text-[11px]">
                  {saving ? '…' : 'Add'}
                </PmButton>
                <PmButton variant="ghost" onClick={() => { setAdding(false); setNewTitle('') }} className="h-7">
                  Cancel
                </PmButton>
              </div>
            </div>
          )}

          {taskCount === 0 && !adding && (
            <div className={`text-center py-8 text-[11px] rounded-lg border border-dashed ${
              isOver ? 'border-[#4d68f0] text-[#4d68f0]' : 'border-stone-200 text-stone-300'
            }`}>
              Drop here
            </div>
          )}
        </div>
      </SortableContext>

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="mx-2 mb-2 py-1.5 text-[11px] text-stone-400 hover:text-stone-600 hover:bg-white rounded-md transition-colors flex items-center justify-center gap-1"
        >
          <PmIcon icon={Plus} size={12} /> Add task
        </button>
      )}
    </div>
  )
}
