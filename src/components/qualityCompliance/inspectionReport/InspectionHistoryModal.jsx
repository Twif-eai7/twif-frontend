import { useInspectionReportLogsForLineItem } from '../../../hooks/useInspectionReports'
import { STAGE_LABEL } from './stageStatus'

const EVENT_LABEL = {
  draft_saved: 'Draft saved',
  submitted: 'Submitted',
  edited: 'Edited',
  reinspection_started: 'Re-inspection started',
}
const VERSIONABLE_TYPES = ['submitted', 'edited']

function fmtDateTime(d) {
  if (!d) return '-'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Full chronological history for a SKU across all stages and rounds — every
// draft save, submission, edit (with reason), and re-inspection start, newest
// first. This is the audit trail InspectionActivityLog.jsx used to render
// inline; it now lives here, on demand, behind the History button, while the
// inline panel shows only the current live status per stage.
export default function InspectionHistoryModal({ lineItem, onClose }) {
  const { logs, loading } = useInspectionReportLogsForLineItem(lineItem.id)

  // One shared version counter for the whole SKU, oldest = Version 0,
  // incrementing only on 'submitted'/'edited' events — draft saves and
  // re-inspection starts mark the beginning of work, not a completed
  // version of the record, so they don't consume a version number.
  const versionNumberByLogId = new Map(
    logs
      .filter(l => VERSIONABLE_TYPES.includes(l.event_type))
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((l, i) => [l.id, i])
  )

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="text-sm font-bold text-gray-900">Inspection History</div>
            <div className="text-xs text-gray-500">{lineItem.buyer_sku_ref}</div>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 space-y-1.5">
          {loading && <p className="text-xs text-gray-400">Loading…</p>}
          {!loading && logs.length === 0 && <p className="text-xs text-gray-400">No activity recorded yet.</p>}
          {logs.map(log => {
            const version = versionNumberByLogId.get(log.id)
            return (
              <div key={log.id} className="flex items-start justify-between gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg text-[11px]">
                <div className="min-w-0">
                  <span className="font-semibold text-gray-700">
                    {STAGE_LABEL[log.inspection_type] || log.inspection_type}
                    {log.round > 1 ? ` · Round ${log.round}` : ''}
                  </span>
                  {version != null && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-semibold">Version {version}</span>
                  )}
                  {' · '}
                  <span className="text-gray-600">
                    {(log.event_type === 'edited' || log.event_type === 'reinspection_started') && log.reason
                      ? `${EVENT_LABEL[log.event_type] || log.event_type}: ${log.reason}`
                      : EVENT_LABEL[log.event_type] || log.event_type}
                  </span>
                </div>
                <div className="flex-shrink-0 text-right text-gray-400">
                  <div>{log.actor_name || '—'}</div>
                  <div>{fmtDateTime(log.created_at)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
