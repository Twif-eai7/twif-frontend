import { createPortal } from 'react-dom'
import { usePLMActivity, formatTime } from '../../hooks/usePLMActivity'
import SKUStatusBadge from './SKUStatusBadge'

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV = [
  { type: 'section', label: 'Overview' },
  { type: 'filter', filter: 'all',       label: 'All Activity', countKey: 'all' },
  { type: 'filter', filter: 'unread',    label: 'Unread',       countKey: 'unread', unread: true },
  { type: 'filter', filter: 'read',      label: 'Read',         countKey: 'read' },
  { type: 'section', label: 'By Type' },
  { type: 'filter', filter: 'message',      label: 'Messages',       countKey: 'message',      dot: '#2563eb' },
  { type: 'filter', filter: 'milestone',    label: 'Status Updates', countKey: 'milestone',    dot: '#7c3aed' },
  { type: 'filter', filter: 'field_change', label: 'Details Update', countKey: 'field_change', dot: '#059669' },
]

const TYPE_STYLE = {
  comment:      { tagBg: '#dbeafe', tagText: '#1e40af', tagBorder: '#bfdbfe', label: 'Message' },
  milestone:    { tagBg: '#ede9fe', tagText: '#5b21b6', tagBorder: '#ddd6fe', label: 'Update' },
  field_change: { tagBg: '#d1fae5', tagText: '#065f46', tagBorder: '#a7f3d0', label: 'Details Update' },
}

const ORG_STYLE = {
  buyer:    { bg: '#fef3c7', text: '#92400e', border: '#fde68a', label: 'Buyer' },
  supplier: { bg: '#ccfbf1', text: '#0f766e', border: '#99f6e4', label: 'Supplier' },
}

function TypeTag({ type }) {
  const s = TYPE_STYLE[type] || TYPE_STYLE.comment
  return (
    <span
      className="inline-flex items-center px-1.5 py-px rounded-sm text-[9px] font-bold uppercase tracking-wide border flex-shrink-0"
      style={{ background: s.tagBg, color: s.tagText, borderColor: s.tagBorder }}
    >
      {s.label}
    </span>
  )
}

function OrgChip({ role, name }) {
  const s = ORG_STYLE[role]
  return (
    <span
      className="inline-flex items-center px-1.5 py-px rounded-sm text-[9px] font-bold uppercase tracking-wide border flex-shrink-0"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      {s.label}: {name || '—'}
    </span>
  )
}

function ActivityEntry({ entry }) {
  return (
    <div className="p-1.5 bg-white rounded border border-black/25 mb-1 last:mb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0 flex-wrap">
          <TypeTag type={entry.type} />
          {entry.thumbUrl && (
            <img src={entry.thumbUrl} alt="" className="w-8 h-8 rounded object-cover border border-black/20 flex-shrink-0" />
          )}
          <span className="text-[10px] text-[#1A1A18]/95">
            <strong className="font-semibold text-[#1A1A18]">{entry.author_name || 'Someone'}</strong> {entry.body}
            {entry.metadata?.edited_at && <span className="italic text-[#1A1A18]/60"> (edited)</span>}
          </span>
        </div>
        <span className="text-[9px] font-semibold text-[#1A1A18]/90 whitespace-nowrap flex-shrink-0">{formatTime(entry.created_at)}</span>
      </div>
    </div>
  )
}

function RefField({ label, value }) {
  return (
    <span className="text-[9px] text-[#1A1A18]/85">
      <span className="uppercase tracking-[.05em] font-semibold">{label}:</span>{' '}
      <span className="font-bold text-[#1A1A18]/95">{value || '—'}</span>
    </span>
  )
}

function WorkspaceItem({ w, expanded, onToggleExpand, onOpen }) {
  const title = w.skuCode || w.buyerRef || 'Workspace'

  return (
    <div
      onClick={() => onOpen(w.workspaceId)}
      className={`px-4 py-3 border-b border-black/25 transition-colors cursor-pointer
        ${w.unreadCount > 0 ? 'bg-[#fdf6e8]' : ''} hover:bg-black/[.03]`}
    >
      <div className="flex gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-[12px] font-bold text-[#1A1A18] leading-snug flex-1 flex items-center gap-1.5 flex-wrap">
              {title}
              {w.status && <SKUStatusBadge sku={{ workspace_status: w.status }} />}
            </p>
            <span className="text-[10px] font-semibold text-[#1A1A18]/90 whitespace-nowrap mt-0.5 flex-shrink-0">{formatTime(w.latest?.created_at)}</span>
          </div>

          {w.description && (
            <div className="mb-1 text-[10px] text-[#1A1A18]/90 truncate">{w.description}</div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1.5">
            <RefField label="Vendor Ref" value={w.vendorRef} />
            <RefField label="Buyer Ref" value={w.buyerRef} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <TypeTag type={w.latest?.type} />
            <OrgChip role="buyer" name={w.buyerOrgName} />
            <OrgChip role="supplier" name={w.supplierOrgName} />
          </div>

          <div className="mb-1.5 flex items-center gap-1.5">
            {w.latest?.thumbUrl && (
              <img src={w.latest.thumbUrl} alt="" className="w-8 h-8 rounded object-cover border border-black/20 flex-shrink-0" />
            )}
            <div className="text-[11px] text-[#1A1A18]/95 leading-snug min-w-0">
              <strong className="text-[#1A1A18] font-semibold">{w.latest?.author_name || 'Someone'}:</strong> {w.latest?.body}
              {w.latest?.metadata?.edited_at && <span className="italic text-[#1A1A18]/60"> (edited)</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {w.unreadCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#1A1A18] text-[#F5F3EF]">
                {w.unreadCount} unread
              </span>
            )}
            {w.recent.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleExpand(w.workspaceId) }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border hover:opacity-80"
                style={{ background: '#eff6ff', color: '#1e40af', borderColor: '#bfdbfe' }}
              >
                {expanded ? 'Hide' : `${w.recent.length} recent`}
              </button>
            )}
          </div>

          {expanded && (
            <div className="mt-2 p-2.5 rounded-md bg-black/[.03] border border-black/25">
              <div className="text-[9px] font-bold uppercase tracking-wide text-[#1A1A18]/90 mb-1.5">Recent Activity</div>
              {w.recent.map(entry => <ActivityEntry key={entry.id} entry={entry} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ContactSelect({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[9px] font-semibold uppercase tracking-wide text-[#1A1A18]/75 px-0.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full text-[10px] border border-black/25 rounded-md bg-white px-1.5 py-1.5 outline-none focus:border-[#1A1A18] text-[#1A1A18]"
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  )
}

function TimeRangeToggle({ timeRange, setTimeRange }) {
  return (
    <div className="flex rounded-md border border-black/25 bg-white p-0.5 mb-2.5">
      {[
        { key: 'recent', label: 'Recent' },
        { key: 'all',    label: 'All time' },
      ].map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => setTimeRange(opt.key)}
          title={opt.key === 'recent' ? 'Last 90 days — fast, everyday view' : 'Full history — every workspace with any activity, ever'}
          className={`flex-1 text-[9px] font-bold uppercase tracking-wide py-1 rounded transition-colors ${
            timeRange === opt.key ? 'bg-[#1A1A18] text-white' : 'text-[#1A1A18]/70 hover:bg-black/[.05]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ActivitySidebar({
  counts, activeFilter, setFilter, searchQuery, setSearch,
  canFilterByContact, contactFilters, setContactFilter, contactOptions,
  timeRange, setTimeRange,
}) {
  return (
    <aside className="w-[190px] min-w-[190px] bg-[#f3efe6] border-r border-black/25 flex flex-col overflow-y-auto p-2">
      <TimeRangeToggle timeRange={timeRange} setTimeRange={setTimeRange} />

      <div className="relative mb-2.5">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-black/55 pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full pl-7 pr-6 py-1.5 text-[10px] border border-black/25 rounded-md bg-white outline-none focus:border-[#1A1A18] placeholder:text-black/55"
        />
        {searchQuery && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-black/55 hover:text-[#1A1A18]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-px">
        {NAV.map((item, i) =>
          item.type === 'section' ? (
            <div key={i} className="text-[9px] font-bold uppercase tracking-wider text-[#1A1A18]/85 px-2 pt-3 pb-1 mt-1 first:mt-0">
              {item.label}
            </div>
          ) : (
            <button
              key={item.filter}
              onClick={() => setFilter(item.filter)}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left transition-all ${
                activeFilter === item.filter ? 'bg-white shadow-sm' : 'hover:bg-black/[.05]'
              }`}
            >
              <span className={`flex items-center gap-1.5 text-[10px] ${activeFilter === item.filter ? 'text-[#1A1A18] font-semibold' : 'text-[#1A1A18]/90 font-medium'}`}>
                {item.dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.dot }} />}
                {item.label}
              </span>
              <span className={`text-[9px] font-semibold rounded-full px-1.5 py-px min-w-[18px] text-center ${
                item.unread
                  ? 'bg-red-600 text-white'
                  : activeFilter === item.filter
                    ? 'bg-[#1A1A18] text-white'
                    : 'bg-white text-[#1A1A18]/90'
              }`}>
                {counts[item.countKey] ?? 0}
              </span>
            </button>
          )
        )}
      </nav>

      {canFilterByContact && (
        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-black/15">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#1A1A18]/85 px-2">By Contact</div>
          <div className="flex flex-col gap-2 px-2">
            <ContactSelect label="Merchant" value={contactFilters.merchant} onChange={v => setContactFilter('merchant', v)} options={contactOptions.merchant} />
            <ContactSelect label="Buyer"    value={contactFilters.buyer}    onChange={v => setContactFilter('buyer', v)}    options={contactOptions.buyer} />
            <ContactSelect label="Vendor"   value={contactFilters.vendor}   onChange={v => setContactFilter('vendor', v)}   options={contactOptions.vendor} />
          </div>
        </div>
      )}

      {canFilterByContact && (
        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-black/15">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#1A1A18]/85 px-2">By Conversation</div>
          <div className="flex flex-col gap-2 px-2">
            <ContactSelect label="Person" value={contactFilters.conversation} onChange={v => setContactFilter('conversation', v)} options={contactOptions.conversation} />
          </div>
        </div>
      )}
    </aside>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PLMActivityDrawer() {
  const {
    workspaces, loading, drawerOpen, searchQuery, expandedId, unreadTotal, activityFilter, counts, totalWorkspaces,
    closeDrawer, setSearch, setActivityFilter, toggleExpanded, markAllSeen, openWorkspaceFromDrawer,
    contactFilters, setContactFilter, contactOptions, canFilterByContact,
    timeRange, setTimeRange,
  } = usePLMActivity()

  if (!drawerOpen) return null

  // Contact/conversation + search narrow counts.all below totalWorkspaces (the sidebar's
  // Overview/By Type numbers already reflect that scope) — surface how many of the grand
  // total actually match here too, rather than just the total.
  const anyContactOrSearchActive = !!contactFilters.merchant || !!contactFilters.buyer
    || !!contactFilters.vendor || !!contactFilters.conversation || !!searchQuery

  const subtitle = anyContactOrSearchActive
    ? `${counts.all} of ${totalWorkspaces} workspace${totalWorkspaces === 1 ? '' : 's'} match`
    : unreadTotal > 0
      ? `${unreadTotal} unread message${unreadTotal === 1 ? '' : 's'} · ${counts.all} workspace${counts.all === 1 ? '' : 's'}`
      : `${counts.all} workspace${counts.all === 1 ? '' : 's'}`

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[600] transition-opacity duration-300"
        onClick={closeDrawer}
      />

      <div className="fixed top-0 right-0 h-screen w-full max-w-[800px] bg-[#fbf9f5] border-l border-black/25 z-[601] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/25 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1A1A18] text-[#F5F3EF] flex items-center justify-center flex-shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-black uppercase tracking-tight text-[#1A1A18] leading-tight">Activity Log</h2>
              <p className="text-[10px] text-black/75">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={markAllSeen}
              disabled={unreadTotal === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/[.05] border border-black/25 text-[10px] font-bold uppercase tracking-[.04em] text-black/80 hover:bg-black/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              Mark all read
            </button>
            <button
              onClick={closeDrawer}
              className="w-8 h-8 rounded-md border border-black/25 flex items-center justify-center text-black/75 hover:bg-black/5 hover:text-[#1A1A18]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          <ActivitySidebar
            counts={counts}
            activeFilter={activityFilter}
            setFilter={setActivityFilter}
            searchQuery={searchQuery}
            setSearch={setSearch}
            canFilterByContact={canFilterByContact}
            contactFilters={contactFilters}
            setContactFilter={setContactFilter}
            contactOptions={contactOptions}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
          />

          <div className="flex-1 overflow-y-auto bg-[#fbf9f5]">
            {loading && workspaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-black/65">
                <div className="w-6 h-6 border-2 border-black/15 border-t-[#1A1A18] rounded-full animate-spin" />
                <p className="text-[11px]">Loading activity…</p>
              </div>
            ) : workspaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-black/65">
                <div className="w-11 h-11 rounded-full bg-black/[.06] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    {searchQuery
                      ? <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>
                      : <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>
                    }
                  </svg>
                </div>
                <p className="text-[13px] font-semibold text-[#1A1A18]/95">{searchQuery ? 'No results' : 'No activity here'}</p>
                <p className="text-[10px]">{searchQuery ? 'Try a different term' : 'Messages and workspace changes will show up here'}</p>
              </div>
            ) : (
              workspaces.map(w => (
                <WorkspaceItem
                  key={w.workspaceId}
                  w={w}
                  expanded={expandedId === w.workspaceId}
                  onToggleExpand={toggleExpanded}
                  onOpen={openWorkspaceFromDrawer}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
