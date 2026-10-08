export const PCT_STAGE_LABELS = {
  po: 'PO Receipt',
  tech: 'Tech Pack',
  rm: 'Raw Material',
  pack: 'Packaging',
  pp: 'PP Meeting',
  bulk: 'Bulk Production',
  inline: 'Inline QC',
  midline: 'Midline QC',
  final: 'Final QC',
  ship: 'Dispatch',
}

export const PCT_STAGE_OPTIONS = Object.entries(PCT_STAGE_LABELS).map(([id, label]) => ({ id, label }))

export const DUE_PRESETS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today',   label: 'Due today' },
  { key: 'week',    label: 'Due this week' },
  { key: 'none',    label: 'No due date' },
]
