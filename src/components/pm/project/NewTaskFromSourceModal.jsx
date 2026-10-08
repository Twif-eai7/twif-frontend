import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { PRIORITY_CONFIG } from '../shared/PriorityIcon'
import { IconButton, PmButton, FieldLabel, inputClass, selectClass, modalShell } from '../shared/PmUi'

export default function NewTaskFromSourceModal({
  onClose,
  defaults = {},
  source = 'manual',
}) {
  const navigate = useNavigate()
  const fetchProjects = usePmStore(s => s.fetchProjects)
  const projects = usePmStore(s => s.projects)
  const createTaskFromSource = usePmStore(s => s.createTaskFromSource)
  const createTaskFromPctStage = usePmStore(s => s.createTaskFromPctStage)

  const [projectId, setProjectId] = useState(defaults.project_id || '')
  const [title, setTitle] = useState(defaults.title || '')
  const [description, setDescription] = useState(defaults.description || '')
  const [priority, setPriority] = useState(defaults.priority || 'normal')
  const [dueDate, setDueDate] = useState(defaults.due_date || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!projects.length) fetchProjects()
  }, [projects.length, fetchProjects])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!projectId) { setError('Pick a project'); return }
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
        labels: defaults.labels || [],
        linked_po_id: defaults.linked_po_id || null,
        linked_workspace_id: defaults.linked_workspace_id || null,
        linked_inspection_id: defaults.linked_inspection_id || null,
        linked_pct_stage: defaults.linked_pct_stage || null,
        po_number: defaults.po_number || null,
      }
      const task = source === 'pct' && defaults.linked_pct_stage
        ? await createTaskFromPctStage({ ...payload, stage: defaults.linked_pct_stage })
        : await createTaskFromSource(payload)
      onClose?.()
      navigate(`/dashboard/projects/${task.project_id}?task=${task.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const modal = (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <form onSubmit={handleSubmit} className={`${modalShell} p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-stone-900">Create task</h2>
            <IconButton icon={X} title="Close" onClick={onClose} />
          </div>

          <label className="block space-y-1">
            <FieldLabel>Project</FieldLabel>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className={selectClass}
            >
              <option value="">Select a project…</option>
              {projects.filter(p => p.status !== 'archived').map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <FieldLabel>Title</FieldLabel>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="block space-y-1">
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <FieldLabel>Priority</FieldLabel>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className={selectClass}
              >
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <FieldLabel>Due</FieldLabel>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className={selectClass}
              />
            </label>
          </div>

          {error && <p className="text-[11px] text-red-500 bg-red-50 px-2.5 py-1.5 rounded-lg">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <PmButton onClick={onClose}>Cancel</PmButton>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-md bg-[#4d68f0] text-white hover:bg-[#3d56e0] disabled:opacity-40 disabled:pointer-events-none"
            >
              {saving ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </>
  )

  return createPortal(modal, document.body)
}
