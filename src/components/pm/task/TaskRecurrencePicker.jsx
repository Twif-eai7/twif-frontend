import { useState } from 'react'
import { Repeat } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { FieldLabel, selectClass } from '../shared/PmUi'

const RULES = [
  { value: '', label: 'Does not repeat' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
]

export default function TaskRecurrencePicker({ task }) {
  const updateTask = usePmStore(s => s.updateTask)
  const [scope, setScope] = useState('this')
  const current = task.recurrence_rule || ''

  return (
    <div className="space-y-1">
      <FieldLabel icon={Repeat}>Repeats</FieldLabel>
      <select
        value={current}
        onChange={e => updateTask(task.id, { recurrence_rule: e.target.value || null, recurrence_scope: scope })}
        className={selectClass}
      >
        {RULES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      {(current || task.recurrence_parent_id) && (
        <div className="flex gap-1">
          {[
            { key: 'this', label: 'This task only' },
            { key: 'series', label: 'Whole series' },
          ].map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScope(s.key)}
              className={`text-[10px] px-2 py-1 rounded-md border ${scope === s.key ? 'border-[#4d68f0] text-[#4d68f0] bg-blue-50' : 'border-stone-200 text-stone-500'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
