import { useState } from 'react'
import { Clock, Trash2 } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { MemberAvatar } from '../shared/MemberAvatar'
import { FieldLabel, IconButton, PmButton, inputClass, selectClass } from '../shared/PmUi'

export default function TaskTimeLogSection({ task }) {
  const addTimeLog = usePmStore(s => s.addTimeLog)
  const deleteTimeLog = usePmStore(s => s.deleteTimeLog)
  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  const logs = task.time_logs || []
  const total = logs.reduce((sum, l) => sum + (Number(l.logged_hours) || 0), 0)

  const handleAdd = async () => {
    if (!hours || Number(hours) <= 0) return
    setSaving(true)
    try {
      await addTimeLog(task.id, { logged_hours: Number(hours), note, logged_at: date })
      setHours('')
      setNote('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <FieldLabel icon={Clock}>Time logged · {total.toFixed(1)}h</FieldLabel>

      <div className="grid grid-cols-3 gap-1.5">
        <input type="number" min="0.25" step="0.25" value={hours} onChange={e => setHours(e.target.value)} placeholder="Hours"
          className={inputClass} />
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={selectClass} />
        <PmButton variant="primary" onClick={handleAdd} disabled={saving || !hours}>
          {saving ? '…' : 'Log'}
        </PmButton>
      </div>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note"
        className={`${inputClass} bg-stone-50`} />

      <div className="space-y-1.5 max-h-36 overflow-y-auto">
        {logs.map(log => (
          <div key={log.id} className="flex items-center gap-2 text-[11px] group">
            <MemberAvatar member={log.organization_members} size="xs" />
            <span className="font-medium text-stone-700 w-10">{Number(log.logged_hours)}h</span>
            <span className="text-stone-400 w-20">{log.logged_at}</span>
            <span className="flex-1 truncate text-stone-500">{log.note}</span>
            <IconButton
              icon={Trash2}
              title="Remove"
              danger
              size={12}
              className="opacity-0 group-hover:opacity-100 w-6 h-6"
              onClick={() => deleteTimeLog(task.id, log.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
