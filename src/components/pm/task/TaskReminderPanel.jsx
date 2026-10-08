import { useState } from 'react'
import { Bell, Trash2 } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { FieldLabel, IconButton, PmButton, PmIcon, selectClass } from '../shared/PmUi'

const PRESETS = [
  { label: '1 day before', minutes: 1440 },
  { label: '2 hours before', minutes: 120 },
  { label: '30 min before', minutes: 30 },
  { label: '10 min before', minutes: 10 },
]

function offsetLabel(mins) {
  if (mins >= 1440 && mins % 1440 === 0) return `${mins / 1440} day${mins === 1440 ? '' : 's'} before`
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60} hour${mins === 60 ? '' : 's'} before`
  return `${mins} min before`
}

export default function TaskReminderPanel({ task }) {
  const addReminder = usePmStore(s => s.addReminder)
  const deleteReminder = usePmStore(s => s.deleteReminder)
  const [offset, setOffset] = useState(1440)
  const [channel, setChannel] = useState('both')

  const reminders = task.reminders || []

  return (
    <div className="space-y-2">
      <FieldLabel icon={Bell}>Reminders · {reminders.length}</FieldLabel>
      {!task.due_date && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          Set a due date first — reminders fire relative to it.
        </p>
      )}

      <div className="space-y-1.5">
        {reminders.map(r => (
          <div key={r.id} className="flex items-center gap-2 text-[11px] bg-stone-50 border border-stone-100 rounded-md px-2.5 py-1.5">
            <PmIcon icon={Bell} size={11} className="text-stone-400" />
            <span className="flex-1 text-stone-700">{offsetLabel(r.offset_minutes)}</span>
            <span className="text-stone-400 capitalize">{r.channel}</span>
            {r.sent_at && <span className="text-emerald-500">sent</span>}
            <IconButton icon={Trash2} title="Remove" danger size={12} className="w-6 h-6" onClick={() => deleteReminder(task.id, r.id)} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <select value={offset} onChange={e => setOffset(Number(e.target.value))} className={`flex-1 ${selectClass}`}>
          {PRESETS.map(p => <option key={p.minutes} value={p.minutes}>{p.label}</option>)}
        </select>
        <select value={channel} onChange={e => setChannel(e.target.value)} className={`${selectClass} w-auto`}>
          <option value="both">In-app + email</option>
          <option value="inapp">In-app only</option>
          <option value="email">Email only</option>
        </select>
        <PmButton
          variant="primary"
          disabled={!task.due_date}
          onClick={() => addReminder(task.id, { offset_minutes: offset, channel })}
        >
          Add
        </PmButton>
      </div>
    </div>
  )
}
