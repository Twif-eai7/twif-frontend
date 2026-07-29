import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlerts, getCategory, resolvePO, hasUpdates, formatTime, formatChanges } from '../../hooks/useAlerts'
import { usePoStore, EMPTY_FILTERS } from '../../stores/poStore'

// ── Nav config ────────────────────────────────────────────────────────────────

const ADMIN_NAV = [
  { type: 'section', label: 'Overview' },
  { type: 'filter', filter: 'all',          label: 'All Alerts',   countKey: 'all' },
  { type: 'filter', filter: 'unread',       label: 'Unread',       countKey: 'unread',      unread: true },
  { type: 'section', label: 'PO Alerts' },
  { type: 'filter', filter: 'po_all',       label: 'All POs',      countKey: 'poAll' },
  { type: 'filter', filter: 'po_confirmed', label: 'PI Confirmed',  countKey: 'poConfirmed', dot: '#059669' },
  { type: 'filter', filter: 'po_pending',   label: 'PI Pending',   countKey: 'poPending',   dot: '#d97706' },
  { type: 'filter', filter: 'po_updated',   label: 'Updated',      countKey: 'poUpdated',   dot: '#2563eb' },
  { type: 'filter', filter: 'po_revision',  label: 'Revisions',    countKey: 'poRevision',  dot: '#0891b2' },
  { type: 'filter', filter: 'po_deleted',   label: 'Deleted',      countKey: 'poDeleted',   dot: '#ef4444' },
  { type: 'section', label: 'PI Alerts' },
  { type: 'filter', filter: 'pi_all',       label: 'All PI',       countKey: 'piAll' },
  { type: 'filter', filter: 'pi_confirmed', label: 'Confirmed',    countKey: 'piConfirmed', dot: '#059669' },
  { type: 'filter', filter: 'pi_overdue',   label: 'Overdue',      countKey: 'piOverdue',   dot: '#dc2626' },
  { type: 'filter', filter: 'pi_delay',     label: 'Delay Reason', countKey: 'piDelay',     dot: '#7c3aed' },
  { type: 'filter', filter: 'pi_reminder',  label: 'Reminders',    countKey: 'piReminder',  dot: '#ca8a04' },
  { type: 'section', label: 'Inspections' },
  { type: 'filter', filter: 'inspection',   label: 'All Inspections', countKey: 'inspection', dot: '#2563eb' },
]

const NON_ADMIN_NAV = [
  { type: 'section', label: 'Overview' },
  { type: 'filter', filter: 'all',      label: 'All Alerts',    countKey: 'all' },
  { type: 'filter', filter: 'unread',   label: 'Unread',        countKey: 'unread',   unread: true },
  { type: 'section', label: 'By Type' },
  { type: 'filter', filter: 'reminder', label: 'Reminders',     countKey: 'reminder', dot: '#ca8a04' },
  { type: 'filter', filter: 'overdue',  label: 'Overdues',      countKey: 'overdue',  dot: '#dc2626' },
  { type: 'filter', filter: 'delay',       label: 'Delay Reasons', countKey: 'delay',      dot: '#7c3aed' },
  { type: 'filter', filter: 'inspection',  label: 'Inspections',   countKey: 'inspection', dot: '#2563eb' },
]

// ── Category styles ───────────────────────────────────────────────────────────

const CAT_STYLE = {
  confirmed:  { icon: '#059669', border: '#059669', tagBg: '#d1fae5', tagText: '#065f46', tagBorder: '#a7f3d0' },
  overdue:    { icon: '#dc2626', border: '#dc2626', tagBg: '#fee2e2', tagText: '#991b1b', tagBorder: '#fecaca' },
  delay:      { icon: '#7c3aed', border: '#7c3aed', tagBg: '#ede9fe', tagText: '#5b21b6', tagBorder: '#ddd6fe' },
  reminder:   { icon: '#ca8a04', border: '#ca8a04', tagBg: '#fef9c3', tagText: '#854d0e', tagBorder: '#fde68a' },
  updated:    { icon: '#2563eb', border: '#2563eb', tagBg: '#dbeafe', tagText: '#1e40af', tagBorder: '#bfdbfe' },
  deleted:    { icon: '#ef4444', border: '#ef4444', tagBg: '#fee2e2', tagText: '#991b1b', tagBorder: '#fecaca' },
  revision:   { icon: '#0891b2', border: '#0891b2', tagBg: '#cffafe', tagText: '#164e63', tagBorder: '#a5f3fc' },
  inspection: { icon: '#2563eb', border: '#2563eb', tagBg: '#dbeafe', tagText: '#1e40af', tagBorder: '#bfdbfe' },
  po:         { icon: '#0f172a', border: null,      tagBg: '#f1f5f9', tagText: '#475569', tagBorder: '#e2e8f0' },
}

const TAG_LABELS = {
  confirmed: 'PI Confirmed', overdue: 'Overdue', delay: 'PI Delay',
  inspection: 'Inspection',  reminder: 'Reminder', revision: 'PO Revision',
  deleted: 'Deleted', updated: 'Updated', po: 'PO Upload',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IconPath({ cat }) {
  if (cat === 'confirmed')  return <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></>
  if (cat === 'overdue')    return <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></>
  if (cat === 'delay')      return <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
  if (cat === 'reminder')   return <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>
  if (cat === 'updated')    return <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
  if (cat === 'deleted')    return <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></>
  if (cat === 'revision')   return <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>
  if (cat === 'inspection') return <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>
  return <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>
}

function AlertItem({ alert, markAsRead, onInspectionClick }) {
  const [changesOpen, setChangesOpen] = useState(false)

  const cat       = getCategory(alert)
  const po        = resolvePO(alert)
  const isUpd     = hasUpdates(alert)
  const isDeleted = po?.deleted === true
  const piConf    = po?.pi_confirmed === true
  const isInspection = cat === 'inspection'

  const styleCat  = isUpd ? 'updated' : cat
  const colors    = CAT_STYLE[styleCat] || CAT_STYLE.po
  const leftColor = !alert.is_read ? '#0f172a' : colors.border

  const tagCat   = isDeleted ? 'deleted' : isUpd ? 'updated' : cat
  const isPoBase = tagCat === 'po'
  const tagStyle = isPoBase && !piConf
    ? { tagBg: '#fef3c7', tagText: '#92400e', tagBorder: '#fde68a' }
    : (CAT_STYLE[tagCat] || CAT_STYLE.po)
  const tagLabel = isPoBase
    ? (piConf ? 'PO Upload' : 'PI Pending')
    : (TAG_LABELS[tagCat] ?? 'Alert')

  const handleInspectionClick = () => {
    if (!isInspection || !po?.po_number) return
    if (!alert.is_read) markAsRead(alert.id)
    onInspectionClick(po.po_number)
  }

  return (
    <div
      onClick={isInspection ? handleInspectionClick : undefined}
      className={`px-4 py-3 border-b border-gray-100 transition-colors
        ${!alert.is_read ? 'bg-blue-50/30' : ''}
        ${isInspection ? 'hover:bg-blue-50 cursor-pointer' : 'hover:bg-gray-50/60'}`}
      style={leftColor ? { borderLeft: `3px solid ${leftColor}`, paddingLeft: 13 } : {}}
    >
      <div className="flex gap-2.5">
        <div
          className="w-[30px] h-[30px] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: colors.icon }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <IconPath cat={styleCat} />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-[12px] font-medium text-gray-900 leading-snug flex-1">{alert.message}</p>
            <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5 flex-shrink-0">{formatTime(alert.created_at)}</span>
          </div>

          <div className="mb-1.5">
            <span
              className="inline-flex items-center px-1.5 py-px rounded-sm text-[9px] font-bold uppercase tracking-wide border"
              style={{ background: tagStyle.tagBg, color: tagStyle.tagText, borderColor: tagStyle.tagBorder }}
            >
              {tagLabel}
            </span>
          </div>

          {po && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1.5 text-[10px] text-gray-500">
              {po.buyer_name       && <span>Buyer: <strong className="text-gray-800 font-semibold">{po.buyer_name}</strong></span>}
              {po.po_number        && <span>PO# <strong className="text-gray-800 font-semibold">{po.po_number}</strong></span>}
              {po.po_received_date && <span>{po.po_received_date}</span>}
              {po.amount           && <span>${po.amount}</span>}
            </div>
          )}

          {isUpd && po?.last_updated_at && (
            <div className="flex items-center gap-1 mb-1.5 text-[10px]" style={{ color: '#2563eb' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Updated {formatTime(po.last_updated_at)}{po.last_updated_by ? ` by ${po.last_updated_by}` : ''}
            </div>
          )}

          {cat === 'delay' && po?.delay_comment && (
            <div className="mb-1.5 p-2 rounded-md" style={{ background: '#faf5ff', border: '1px solid #e9d5ff' }}>
              <div className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: '#7c3aed' }}>Delay Reason</div>
              <div className="text-[10px] leading-snug" style={{ color: '#4c1d95' }}>{po.delay_comment}</div>
              {po.delay_comment_by && <div className="text-[10px] mt-0.5" style={{ color: '#7c3aed' }}>— {po.delay_comment_by}</div>}
            </div>
          )}

          {isDeleted && po?.reason && (
            <div className="mb-1.5 p-2 rounded-md text-[10px] leading-snug" style={{ background: '#fff5f5', border: '1px solid #fecaca', color: '#991b1b' }}>
              <strong>Reason:</strong> {po.reason}
            </div>
          )}

          {isInspection && po?.comment_text && (
            <div className="mb-1.5 p-2 rounded-md" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: '#2563eb' }}>
                {po.comment_by ? `${po.comment_by} commented` : 'Inspection Comment'}
              </div>
              <div className="text-[10px] leading-snug" style={{ color: '#1e3a8a' }}>
                {po.comment_text.length > 120 ? `${po.comment_text.slice(0, 120)}…` : po.comment_text}
              </div>
            </div>
          )}

          {isInspection && po?.po_number && (
            <div className="flex items-center gap-1 text-[10px] font-semibold mb-1" style={{ color: '#2563eb' }}>
              View in Order Management
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {!alert.is_read && (
              <button
                onClick={() => markAsRead(alert.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-gray-900 text-white hover:bg-gray-700"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Mark read
              </button>
            )}
            {!isDeleted && po?.po_file_url && (
              <a href={po.po_file_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                PO
              </a>
            )}
            {!isDeleted && po?.pi_file_url && (
              <a href={po.pi_file_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border hover:opacity-80"
                style={{ background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                PI
              </a>
            )}
            {isUpd && po?.changes && (
              <button
                onClick={() => setChangesOpen(o => !o)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border hover:opacity-80"
                style={{ background: '#eff6ff', color: '#1e40af', borderColor: '#bfdbfe' }}
              >
                {changesOpen ? 'Hide' : 'Changes'}
              </button>
            )}
          </div>

          {changesOpen && po?.changes && (
            <div className="mt-2 p-2.5 rounded-md" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Change History</div>
              {formatChanges(po.changes).map((c, i) => (
                <div key={i} className="p-1.5 bg-white rounded border border-gray-100 mb-1 last:mb-0">
                  {c.field && <div className="text-[9px] font-bold uppercase text-gray-400 mb-0.5">{c.field}</div>}
                  <div className="text-[10px] text-gray-800 font-mono">{c.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, trend }) {
  const styles = {
    po:        { bg: '#f1f5f9', color: '#475569' },
    confirmed: { bg: '#d1fae5', color: '#059669' },
    pending:   { bg: '#fef3c7', color: '#d97706' },
  }
  return (
    <div className="flex items-center gap-2 bg-[#f8f9fb] border border-[#e8eaed] rounded-lg p-2.5">
      <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={styles[icon]}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {icon === 'confirmed' ? <polyline points="20 6 9 17 4 12"/> :
           icon === 'pending'   ? <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> :
                                  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[17px] font-bold text-gray-900 leading-none tracking-tight">{value}</div>
        <div className="text-[9px] text-gray-500 mt-0.5 truncate">{label}</div>
      </div>
      {trend != null && trend !== 0 && (
        <span className={`text-[10px] font-semibold flex-shrink-0 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend > 0 ? `+${trend}` : trend}
        </span>
      )}
    </div>
  )
}

function SummaryPanel({ summary, open, onToggle }) {
  return (
    <div className="border-b border-[#e8eaed] flex-shrink-0">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 select-none text-left">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          Weekly Summary
          <span className="font-normal normal-case tracking-normal text-gray-400 ml-0.5">{summary.weekLabel}</span>
        </div>
        <svg className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          <SummaryCard icon="po"        label="POs Received" value={summary.poReceived}  trend={summary.poTrend} />
          <SummaryCard icon="confirmed" label="PI Confirmed" value={summary.piConfirmed} />
          <SummaryCard icon="pending"   label="PI Pending"   value={summary.piPending} />
        </div>
      )}
    </div>
  )
}

function AlertsSidebar({ isAdmin, counts, activeFilter, setFilter, searchQuery, setSearch }) {
  const nav = isAdmin ? ADMIN_NAV : NON_ADMIN_NAV
  return (
    <aside className="w-[190px] min-w-[190px] bg-[#f8f9fb] border-r border-[#e8eaed] flex flex-col overflow-y-auto p-2">
      <div className="relative mb-2.5">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full pl-7 pr-6 py-1.5 text-[10px] border border-[#e8eaed] rounded-md bg-white outline-none focus:border-gray-800 placeholder:text-gray-400"
        />
        {searchQuery && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-px">
        {nav.map((item, i) =>
          item.type === 'section' ? (
            <div key={i} className="text-[9px] font-bold uppercase tracking-wider text-gray-400 px-2 pt-3 pb-1 mt-1 first:mt-0">
              {item.label}
            </div>
          ) : (
            <button
              key={item.filter}
              onClick={() => setFilter(item.filter)}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left transition-all ${
                activeFilter === item.filter
                  ? 'bg-white shadow-sm'
                  : 'hover:bg-[#eef0f3]'
              }`}
            >
              <span className={`flex items-center gap-1.5 text-[10px] ${activeFilter === item.filter ? 'text-gray-900 font-semibold' : 'text-gray-500 font-medium'}`}>
                {item.dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.dot }} />}
                {item.label}
              </span>
              <span className={`text-[9px] font-semibold rounded-full px-1.5 py-px min-w-[18px] text-center ${
                item.unread
                  ? 'bg-red-600 text-white'
                  : activeFilter === item.filter
                    ? 'bg-gray-900 text-white'
                    : 'bg-[#e8eaed] text-gray-500'
              }`}>
                {counts[item.countKey] ?? 0}
              </span>
            </button>
          )
        )}
      </nav>
    </aside>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AlertsDrawer() {
  const {
    alerts, loading, drawerOpen, activeFilter, searchQuery,
    summaryOpen, isAdmin, counts, summary, unreadCount,
    closeDrawer, setFilter, setSearch, toggleSummary, markAsRead, markAllRead,
  } = useAlerts()

  const navigate   = useNavigate()
  const setFilters = usePoStore(s => s.setFilters)

  const handleInspectionClick = useCallback((poNumber) => {
    setFilters({ ...EMPTY_FILTERS, poNumber })
    closeDrawer()
    navigate('/dashboard/orders?tab=po-table')
  }, [setFilters, closeDrawer, navigate])

  const subtitle = unreadCount > 0
    ? `${unreadCount} unread · ${alerts.length} total`
    : `${alerts.length} alert${alerts.length !== 1 ? 's' : ''}`

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/45 backdrop-blur-sm z-[9998] transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
        }`}
        onClick={closeDrawer}
      />

      <div
        className={`fixed top-0 right-0 h-screen w-full max-w-[800px] bg-white z-[9999] flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8eaed] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center flex-shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900 leading-tight">Alerts</h2>
              <p className="text-[10px] text-gray-500">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-gray-100 border border-[#e8eaed] text-[10px] font-medium text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              Mark all read
            </button>
            <button
              onClick={closeDrawer}
              className="w-8 h-8 rounded-md border border-[#e8eaed] flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <SummaryPanel summary={summary} open={summaryOpen} onToggle={toggleSummary} />

        <div className="flex-1 flex overflow-hidden min-h-0">
          <AlertsSidebar
            isAdmin={isAdmin}
            counts={counts}
            activeFilter={activeFilter}
            setFilter={setFilter}
            searchQuery={searchQuery}
            setSearch={setSearch}
          />

          <div className="flex-1 overflow-y-auto bg-white">
            {loading && alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <div className="w-6 h-6 border-2 border-gray-100 border-t-gray-900 rounded-full animate-spin" />
                <p className="text-[11px]">Loading alerts…</p>
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    {searchQuery
                      ? <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>
                      : <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>
                    }
                  </svg>
                </div>
                <p className="text-[13px] font-semibold text-gray-700">{searchQuery ? 'No results' : 'No alerts here'}</p>
                <p className="text-[10px]">{searchQuery ? 'Try a different term' : 'Check back later'}</p>
              </div>
            ) : (
              alerts.map(alert => (
                <AlertItem key={alert.id} alert={alert} markAsRead={markAsRead} onInspectionClick={handleInspectionClick} />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}
