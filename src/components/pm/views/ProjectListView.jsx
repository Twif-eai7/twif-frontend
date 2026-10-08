import { useMemo, useState } from 'react'
import { TableVirtuoso } from 'react-virtuoso'
import { ArrowUp, ArrowDown, Lock, Repeat, TriangleAlert, ListTodo } from 'lucide-react'
import { usePmStore, filterColumns, flattenTasks } from '../../../stores/pmStore'
import { PriorityBadge } from '../shared/PriorityIcon'
import { MemberAvatarGroup } from '../shared/MemberAvatar'
import { PCT_STAGE_LABELS } from '../shared/pmConstants'
import { PmEmpty, PmIcon } from '../shared/PmUi'

const COLUMNS = [
  { key: 'title',    label: 'Task' },
  { key: 'column',   label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'due_date', label: 'Due' },
  { key: 'assignees',label: 'Assignees' },
  { key: 'labels',   label: 'Labels' },
  { key: 'links',    label: 'Links' },
]

function linkSummary(task) {
  const bits = []
  if (task.linked_pct_stage) bits.push(PCT_STAGE_LABELS[task.linked_pct_stage] || task.linked_pct_stage)
  if (task.linked_po_id) bits.push('PO')
  if (task.linked_workspace_id) bits.push('SKU')
  if (task.linked_inspection_id) bits.push('QC')
  return bits.join(' · ')
}

function compare(a, b, key, dir) {
  const mul = dir === 'desc' ? -1 : 1
  const av = key === 'column' ? a.column_name : a[key]
  const bv = key === 'column' ? b.column_name : b[key]
  if (key === 'due_date') {
    const at = av ? new Date(av).getTime() : Infinity
    const bt = bv ? new Date(bv).getTime() : Infinity
    return (at - bt) * mul
  }
  if (key === 'assignees') return (((av?.length || 0) - (bv?.length || 0)) * mul)
  if (key === 'labels') return (((av?.length || 0) - (bv?.length || 0)) * mul)
  if (key === 'links') return (linkSummary(a).localeCompare(linkSummary(b)) * mul)
  return String(av || '').localeCompare(String(bv || '')) * mul
}

export default function ProjectListView({ onTaskClick }) {
  const rawColumns = usePmStore(s => s.columns)
  const filters = usePmStore(s => s.filters)
  const [sortKey, setSortKey] = useState('due_date')
  const [sortDir, setSortDir] = useState('asc')

  const rows = useMemo(() => {
    const list = flattenTasks(filterColumns(rawColumns, filters))
    return [...list].sort((a, b) => compare(a, b, sortKey, sortDir))
  }, [rawColumns, filters, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'due_date' ? 'asc' : 'asc') }
  }

  if (!rows.length) {
    return <PmEmpty icon={ListTodo} title="No matching tasks" subtitle="Adjust filters to see work on this board." />
  }

  return (
    <TableVirtuoso
      style={{ height: '100%', minHeight: 360 }}
      data={rows}
      fixedHeaderContent={() => (
        <tr className="bg-white">
          {COLUMNS.map(col => (
            <th
              key={col.key}
              onClick={() => toggleSort(col.key)}
              className="text-left text-[11px] font-medium text-stone-400 px-3 py-2 border-b border-stone-200 cursor-pointer select-none whitespace-nowrap"
            >
              <span className="inline-flex items-center gap-1">
                {col.label}
                {sortKey === col.key && (
                  <PmIcon icon={sortDir === 'asc' ? ArrowUp : ArrowDown} size={11} className="text-[#4d68f0]" />
                )}
              </span>
            </th>
          ))}
        </tr>
      )}
      itemContent={(_i, task) => {
        const due = task.due_date ? new Date(task.due_date) : null
        const overdue = due && due < new Date()
        const links = linkSummary(task)
        return (
          <>
            <td className="px-3 py-2.5 border-b border-stone-100 bg-white">
              <button type="button" onClick={() => onTaskClick?.(task)} className="inline-flex items-center gap-1.5 text-left text-[12px] font-medium text-stone-800 hover:text-[#4d68f0] line-clamp-2">
                {task.is_blocked && <PmIcon icon={Lock} size={11} className="text-amber-500 flex-shrink-0" />}
                {task.recurrence_rule && <PmIcon icon={Repeat} size={11} className="text-stone-400 flex-shrink-0" />}
                {task.title}
              </button>
            </td>
            <td className="px-3 py-2.5 border-b border-stone-100 bg-white">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-600">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: task.column_color }} />
                {task.column_name}
              </span>
            </td>
            <td className="px-3 py-2.5 border-b border-stone-100 bg-white">
              <PriorityBadge priority={task.priority || 'normal'} />
            </td>
            <td className={`px-3 py-2.5 border-b border-stone-100 bg-white text-[11px] ${overdue ? 'text-red-500 font-medium' : 'text-stone-500'}`}>
              <span className="inline-flex items-center gap-1">
                {overdue && <PmIcon icon={TriangleAlert} size={11} />}
                {due ? due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
              </span>
            </td>
            <td className="px-3 py-2.5 border-b border-stone-100 bg-white">
              <MemberAvatarGroup members={task.assignees || []} max={3} size="xs" />
            </td>
            <td className="px-3 py-2.5 border-b border-stone-100 bg-white">
              <div className="flex flex-wrap gap-1">
                {(task.labels || []).slice(0, 3).map(l => (
                  <span key={l} className="px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded text-[10px]">{l}</span>
                ))}
              </div>
            </td>
            <td className="px-3 py-2.5 border-b border-stone-100 bg-white text-[10px] text-stone-400 whitespace-nowrap">
              {links || '—'}
            </td>
          </>
        )
      }}
    />
  )
}
