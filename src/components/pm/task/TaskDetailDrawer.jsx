import { createPortal } from 'react-dom'
import { useEffect, useState, useRef } from 'react'
import {
  X, Trash2, Flag, CalendarClock, Columns3, Timer, Users, Tag,
  AlignLeft, ClipboardCheck, Plus,
} from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { PRIORITY_CONFIG, PriorityBadge } from '../shared/PriorityIcon'
import { MemberAvatar } from '../shared/MemberAvatar'
import { Spinner } from '../../ui'
import { FieldLabel, IconButton, PmButton, PmIcon, inputClass, selectClass } from '../shared/PmUi'
import TaskAssigneeSelector from './TaskAssigneeSelector'
import TaskLabelSelector from './TaskLabelSelector'
import TaskLinkedEntity from '../shared/TaskLinkedEntity'
import TaskLinkPicker from './TaskLinkPicker'
import TaskDependencySection from './TaskDependencySection'
import TaskRecurrencePicker from './TaskRecurrencePicker'
import TaskCommentThread from './TaskCommentThread'
import TaskAttachmentSection from './TaskAttachmentSection'
import TaskTimeLogSection from './TaskTimeLogSection'
import TaskReminderPanel from './TaskReminderPanel'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Checklist ──────────────────────────────────────────────────────────────────
function ChecklistSection({ task }) {
  const addChecklistItem    = usePmStore(s => s.addChecklistItem)
  const updateChecklistItem = usePmStore(s => s.updateChecklistItem)
  const deleteChecklistItem = usePmStore(s => s.deleteChecklistItem)

  const [adding, setAdding]     = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const items = task.checklists || []
  const done  = items.filter(i => i.checked).length
  const pct   = items.length ? Math.round((done / items.length) * 100) : 0

  const handleAdd = async () => {
    if (!newTitle.trim()) { setAdding(false); return }
    await addChecklistItem(task.id, newTitle.trim())
    setNewTitle('')
    setAdding(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel icon={ClipboardCheck}>Checklist · {done}/{items.length}</FieldLabel>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[11px] text-[#4d68f0] hover:underline">
          <PmIcon icon={Plus} size={11} /> Add item
        </button>
      </div>

      {items.length > 0 && (
        <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="space-y-1">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 group">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={e => updateChecklistItem(task.id, item.id, { checked: e.target.checked })}
              className="w-3.5 h-3.5 rounded accent-[#4d68f0] flex-shrink-0"
            />
            <span className={`flex-1 text-xs ${item.checked ? 'line-through text-stone-400' : 'text-stone-700'}`}>
              {item.title}
            </span>
            <IconButton
              icon={Trash2}
              title="Remove"
              danger
              size={12}
              className="opacity-0 group-hover:opacity-100 w-6 h-6"
              onClick={() => deleteChecklistItem(task.id, item.id)}
            />
          </div>
        ))}
      </div>

      {adding && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
            }}
            placeholder="Add checklist item…"
            className={`flex-1 ${inputClass}`}
          />
          <PmButton variant="primary" onClick={handleAdd} className="h-7">Add</PmButton>
          <IconButton icon={X} title="Cancel" onClick={() => { setAdding(false); setNewTitle('') }} />
        </div>
      )}
    </div>
  )
}

// ── Activity ──────────────────────────────────────────────────────────────────
function ActivityLog({ task }) {
  const activity = task.activity || []
  if (!activity.length) return null

  const ACTION_LABELS = {
    task_created:        'created this task',
    status_changed:      m => `moved to ${m.to}`,
    priority_changed:    m => `changed priority to ${m.to}`,
    due_date_changed:    m => `set due date to ${m.to ? new Date(m.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'none'}`,
    assigned:            'assigned a member',
    unassigned:          'unassigned a member',
    checklist_checked:   m => `checked "${m.title}"`,
    checklist_unchecked: m => `unchecked "${m.title}"`,
    task_completed:      'marked as complete',
    title_changed:       m => `renamed to "${m.to}"`,
    commented:           'added a comment',
    attachment_added:    'added an attachment',
  }

  return (
    <div className="space-y-2">
      <FieldLabel>Activity</FieldLabel>
      <div className="space-y-2.5">
        {activity.map(a => {
          const name = a.organization_members?.full_name || 'Someone'
          const raw  = ACTION_LABELS[a.action]
          const desc = typeof raw === 'function' ? raw(a.meta || {}) : (raw || a.action)
          return (
            <div key={a.id} className="flex items-start gap-2">
              <MemberAvatar member={a.organization_members} size="xs" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-stone-600 leading-snug">
                  <span className="font-semibold text-stone-800">{name}</span> {desc}
                </p>
                <p className="text-[10px] text-stone-400 mt-0.5">{fmtDate(a.created_at)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Drawer ────────────────────────────────────────────────────────────────
export default function TaskDetailDrawer() {
  const activeTask     = usePmStore(s => s.activeTask)
  const taskDrawerOpen = usePmStore(s => s.taskDrawerOpen)
  const taskLoading    = usePmStore(s => s.taskLoading)
  const closeTask      = usePmStore(s => s.closeTask)
  const updateTask     = usePmStore(s => s.updateTask)
  const deleteTask     = usePmStore(s => s.deleteTask)
  const columns        = usePmStore(s => s.columns)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft]     = useState('')
  const titleRef = useRef()

  useEffect(() => {
    if (activeTask) setTitleDraft(activeTask.title)
  }, [activeTask?.id])

  useEffect(() => {
    if (!taskDrawerOpen) return
    const handler = e => { if (e.key === 'Escape') closeTask() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [taskDrawerOpen, closeTask])

  if (!taskDrawerOpen) return null

  // Build column name map for the "Move to column" selector
  const colOptions = columns.map(c => ({ id: c.id, name: c.name }))

  const drawer = (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={closeTask} />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl border-l border-stone-200 flex flex-col">

        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {activeTask && <PriorityBadge priority={activeTask.priority} />}
            {activeTask && <TaskLinkedEntity task={activeTask} editable />}
          </div>
          <div className="flex items-center gap-1">
            {activeTask && (
              <IconButton
                icon={Trash2}
                title="Delete task"
                danger
                onClick={async () => {
                  if (!window.confirm('Delete this task?')) return
                  await deleteTask(activeTask.id)
                }}
              />
            )}
            <IconButton icon={X} title="Close" onClick={closeTask} />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {taskLoading && (
            <div className="flex justify-center py-10"><Spinner light={false} size="w-5 h-5" /></div>
          )}

          {!taskLoading && activeTask && (
            <div className="space-y-5">

              {/* Title (inline edit) */}
              <div>
                {editingTitle ? (
                  <input
                    ref={titleRef}
                    autoFocus
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onBlur={async () => {
                      setEditingTitle(false)
                      if (titleDraft.trim() && titleDraft.trim() !== activeTask.title) {
                        await updateTask(activeTask.id, { title: titleDraft.trim() })
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') titleRef.current?.blur()
                      if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(activeTask.title) }
                    }}
                    className="w-full text-base font-semibold text-stone-900 border-0 border-b-2 border-[#4d68f0] outline-none pb-1 bg-transparent"
                  />
                ) : (
                  <h2
                    onClick={() => { setEditingTitle(true); setTitleDraft(activeTask.title) }}
                    className="text-base font-semibold text-stone-900 cursor-text hover:text-[#4d68f0] transition-colors leading-snug"
                    title="Click to edit"
                  >
                    {activeTask.title}
                  </h2>
                )}
              </div>

              {/* ── Meta grid ── */}
              <div className="grid grid-cols-2 gap-3 text-xs">

                <div className="space-y-1.5">
                  <FieldLabel icon={Flag}>Priority</FieldLabel>
                  <select
                    value={activeTask.priority}
                    onChange={e => updateTask(activeTask.id, { priority: e.target.value })}
                    className={selectClass}
                  >
                    {Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
                      <option key={v} value={v}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <FieldLabel icon={CalendarClock}>Due date</FieldLabel>
                  <input
                    type="datetime-local"
                    value={activeTask.due_date ? activeTask.due_date.slice(0, 16) : ''}
                    onChange={e => updateTask(activeTask.id, { due_date: e.target.value || null })}
                    className={selectClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel icon={Columns3}>Column</FieldLabel>
                  <select
                    value={activeTask.column_id}
                    onChange={async e => {
                      const toColId = e.target.value
                      if (toColId === activeTask.column_id) return
                      const toCol = columns.find(c => c.id === toColId)
                      if (activeTask.is_blocked && /done/i.test(toCol?.name || '')) {
                        const names = (activeTask.blocking || []).filter(b => !b.completed_at).map(b => b.title).join(', ')
                        if (!window.confirm(`This task is blocked by unfinished work${names ? ` (${names})` : ''}. Move to Done anyway?`)) {
                          e.target.value = activeTask.column_id
                          return
                        }
                      }
                      const lastPos = toCol?.tasks?.[toCol.tasks.length - 1]?.position ?? null
                      const newPos = lastPos != null ? lastPos + 65536 : 65536
                      const { moveTask } = usePmStore.getState()
                      await moveTask(activeTask.id, activeTask.column_id, toColId, newPos, lastPos, null)
                      await usePmStore.getState().openTask(activeTask.id)
                    }}
                    className={selectClass}
                  >
                    {colOptions.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <FieldLabel icon={Timer}>Estimate (hrs)</FieldLabel>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={activeTask.estimate_hours ?? ''}
                    onChange={e => updateTask(activeTask.id, { estimate_hours: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="—"
                    className={inputClass}
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <FieldLabel icon={Users}>Assignees</FieldLabel>
                  <TaskAssigneeSelector task={activeTask} />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <FieldLabel icon={Tag}>Labels</FieldLabel>
                  <TaskLabelSelector task={activeTask} />
                </div>

                <div className="col-span-2">
                  <TaskRecurrencePicker task={activeTask} />
                </div>

                <div className="col-span-2">
                  <TaskDependencySection task={activeTask} />
                </div>

                <div className="col-span-2">
                  <TaskLinkPicker task={activeTask} />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <FieldLabel icon={AlignLeft}>Description</FieldLabel>
                <textarea
                  key={activeTask.id}
                  defaultValue={activeTask.description || ''}
                  onBlur={e => {
                    if (e.target.value !== (activeTask.description || '')) {
                      updateTask(activeTask.id, { description: e.target.value || null })
                    }
                  }}
                  placeholder="Add a description…"
                  rows={3}
                  className={`${inputClass} resize-none bg-stone-50`}
                />
              </div>

              {/* Checklist */}
              <ChecklistSection task={activeTask} />

              <TaskReminderPanel task={activeTask} />
              <TaskAttachmentSection task={activeTask} />
              <TaskTimeLogSection task={activeTask} />
              <TaskCommentThread task={activeTask} />

              {/* Activity */}
              <ActivityLog task={activeTask} />

              {/* Timestamps */}
              <div className="text-[10px] text-stone-300 space-y-0.5 pt-2 border-t border-stone-100">
                <p>Created {fmtDate(activeTask.created_at)}</p>
                <p>Updated {fmtDate(activeTask.updated_at)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return createPortal(drawer, document.body)
}
