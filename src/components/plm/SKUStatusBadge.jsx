import { STATUS_LABELS, STATUS_COLORS } from '../../stores/plmStore'

export default function SKUStatusBadge({ sku }) {
  const rawStatus = sku.workspace_status || sku.status || 'inactive'
  const status    = sku.stage === 'sample' && rawStatus !== 'production' ? 'sample' : rawStatus
  const label     = STATUS_LABELS[status] || status.replace(/_/g, ' ')
  const cls       = STATUS_COLORS[status] || 'bg-black/[.07] text-[#1A1A18]'

  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-[.06em] ${cls}`}>
      {label}
    </span>
  )
}
