import { Flag, ChevronsUp, Equal, ChevronsDown } from 'lucide-react'

export const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: '#ef4444', bg: 'bg-red-50',    text: 'text-red-600',    Icon: Flag },
  high:   { label: 'High',   color: '#f97316', bg: 'bg-orange-50', text: 'text-orange-600', Icon: ChevronsUp },
  normal: { label: 'Normal', color: '#3b82f6', bg: 'bg-blue-50',   text: 'text-blue-600',   Icon: Equal },
  low:    { label: 'Low',    color: '#94a3b8', bg: 'bg-slate-50',  text: 'text-slate-500',  Icon: ChevronsDown },
}

export function PriorityIcon({ priority, size = 14 }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal
  const Icon = cfg.Icon
  return <Icon size={size} strokeWidth={1.75} color={cfg.color} />
}

export function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      <PriorityIcon priority={priority} size={11} />
      {cfg.label}
    </span>
  )
}
