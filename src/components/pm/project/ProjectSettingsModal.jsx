import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { GlyphPicker, IconButton, PmButton, FieldLabel, inputClass, selectClass, modalShell, resolveGlyphKey } from '../shared/PmUi'

const COLORS = ['#4d68f0', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b']
const STATUSES = [
  { value: 'active',    label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived',  label: 'Archived' },
]
const TYPES = [
  { value: 'general',    label: 'General' },
  { value: 'po_linked',  label: 'PO Linked' },
  { value: 'sku_linked', label: 'SKU / NPD' },
  { value: 'qc_linked',  label: 'QC / Inspection' },
]

export default function ProjectSettingsModal({ onClose }) {
  const activeProject  = usePmStore(s => s.activeProject)
  const updateProject  = usePmStore(s => s.updateProject)
  const archiveProject = usePmStore(s => s.archiveProject)
  const duplicateProject = usePmStore(s => s.duplicateProject)

  const [title, setTitle]     = useState('')
  const [desc, setDesc]       = useState('')
  const [status, setStatus]   = useState('active')
  const [type, setType]       = useState('general')
  const [dueDate, setDueDate] = useState('')
  const [color, setColor]     = useState('#4d68f0')
  const [emoji, setEmoji]     = useState('layout')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!activeProject) return
    setTitle(activeProject.title || '')
    setDesc(activeProject.description || '')
    setStatus(activeProject.status || 'active')
    setType(activeProject.type || 'general')
    setDueDate(activeProject.due_date ? activeProject.due_date.slice(0, 10) : '')
    setColor(activeProject.color || '#4d68f0')
    setEmoji(resolveGlyphKey(activeProject.emoji))
  }, [activeProject?.id])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    try {
      await updateProject(activeProject.id, {
        title: title.trim(),
        description: desc.trim() || null,
        status,
        type,
        due_date: dueDate || null,
        color,
        emoji,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!activeProject) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`${modalShell} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100">
          <h2 className="text-[13px] font-semibold text-stone-900">Project settings</h2>
          <IconButton icon={X} title="Close" onClick={onClose} />
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          {error && <p className="text-[12px] text-red-500 bg-red-50 px-3 py-2 rounded-md">{error}</p>}

          <div className="flex items-start gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Icon</FieldLabel>
              <GlyphPicker value={emoji} color={color} onChange={setEmoji} />
            </div>
            <div className="space-y-1.5 flex-1">
              <FieldLabel>Color</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={`w-5 h-5 rounded-full ${color === c ? 'ring-2 ring-offset-1 ring-stone-400' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Title</FieldLabel>
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputClass} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Description</FieldLabel>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Optional…"
              className={`${inputClass} resize-none`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel>Type</FieldLabel>
              <select value={type} onChange={e => setType(e.target.value)} className={selectClass}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Status</FieldLabel>
              <select value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Due date</FieldLabel>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={selectClass} />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <PmButton className="flex-1" onClick={onClose}>Cancel</PmButton>
            <button type="submit" disabled={saving || !title.trim()}
              className="flex-1 h-8 text-[12px] font-medium text-white rounded-md disabled:opacity-50"
              style={{ backgroundColor: color }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>

          <PmButton
            className="w-full"
            onClick={async () => {
              const copy = await duplicateProject(activeProject.id)
              onClose()
              if (copy?.id) window.location.assign(`/dashboard/projects/${copy.id}`)
            }}
          >
            Duplicate board structure
          </PmButton>

          <div className="border-t border-stone-100 pt-3">
            <PmButton
              variant="danger"
              className="w-full"
              onClick={async () => {
                if (!window.confirm('Archive this project? It will no longer appear in active projects.')) return
                await archiveProject(activeProject.id)
                onClose()
              }}
            >
              Archive project
            </PmButton>
          </div>
        </form>
      </div>
    </div>
  )
}
