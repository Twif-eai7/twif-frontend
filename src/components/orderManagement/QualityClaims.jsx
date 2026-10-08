import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useIsAdmin, useMemberId, useOrgDepartment } from '../../stores/profileStore'
import { publicUrl } from './poUtils'

// Same "control panel" visual language as OtifExceptions.jsx (its sibling
// tab under Order Management) — stat cards, segmented type filter, mono
// labels — kept consistent since a merchant clicking between the two tabs
// should feel like they're in the same screen family.

const STATUS_STYLE = {
  under_discussion: { label: 'Under Discussion', bg: '#FFF7ED', border: '#FBDCBA', fg: '#9A3412' },
  closed:           { label: 'Closed',           bg: '#ECFDF5', border: '#BBE9D4', fg: '#0F6B4F' },
}

const CLAIM_TYPE_LABELS = {
  defect:         'Defect',
  damaged:        'Damaged',
  wrong_item:     'Wrong Item',
  short_shipment: 'Short Shipment',
  other:          'Other',
}

const TYPE_FILTERS = [
  { key: 'all',            label: 'All types' },
  { key: 'defect',         label: 'Defect' },
  { key: 'damaged',        label: 'Damaged' },
  { key: 'wrong_item',     label: 'Wrong Item' },
  { key: 'short_shipment', label: 'Short Shipment' },
  { key: 'other',          label: 'Other' },
]

const CLAIM_SELECT = `
  *,
  purchase_orders(
    po_number,
    buyer_supplier_links(
      buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
      supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name)
    )
  ),
  po_line_items(buyer_sku_ref, sku_variant),
  submitted_by_member:organization_members!po_quality_claims_submitted_by_fkey(full_name),
  closed_by_member:organization_members!po_quality_claims_closed_by_fkey(full_name)
`

function isPdfProof(url) {
  return !!url && url.toLowerCase().split('?')[0].endsWith('.pdf')
}

function ProofThumb({ url, className }) {
  const href = publicUrl(url)
  if (isPdfProof(url)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title="View PDF proof"
        className={`${className} flex items-center justify-center rounded-lg border border-gray-200 bg-red-50 text-red-600 hover:opacity-80 transition-opacity`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
      </a>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <img src={href} alt="Proof" className={`${className} object-cover cursor-pointer hover:opacity-80 transition-opacity`} />
    </a>
  )
}

function ProofPreview({ url }) {
  const href = publicUrl(url)
  if (isPdfProof(url)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-red-50 text-red-700 hover:opacity-80 transition-opacity">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="text-xs font-semibold">View PDF proof</span>
      </a>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <img src={href} alt="Proof" className="w-full max-h-36 object-contain rounded-lg border border-gray-200 bg-gray-50" />
    </a>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function daysAgo(d) {
  if (!d) return null
  const ms = Date.now() - new Date(d).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}
function ageColor(days) {
  if (days >= 7) return '#B42318'
  if (days >= 3) return '#B0350F'
  return '#8E8E98'
}

// One row's worth of derived display strings — shared by the desktop table
// and mobile cards, and by the close modal.
function deriveRow(claim) {
  const po = claim.purchase_orders
  const li = claim.po_line_items
  const st = STATUS_STYLE[claim.status] || STATUS_STYLE.under_discussion
  const age = daysAgo(claim.created_on)

  return {
    claim, status: claim.status, statusLabel: st.label, badgeBg: st.bg, badgeBorder: st.border, badgeFg: st.fg,
    poNumber: po?.po_number || '—',
    parties: `${po?.buyer_supplier_links?.buyer?.display_name || '—'} · ${po?.buyer_supplier_links?.supplier?.display_name || '—'}`,
    typeLabel: CLAIM_TYPE_LABELS[claim.claim_type] || claim.claim_type,
    sku: li?.buyer_sku_ref || null,
    skuVariant: li?.sku_variant || null,
    description: claim.description || '—',
    submittedBy: claim.submitted_by_member?.full_name || '—',
    submittedAt: fmtDate(claim.created_on),
    showAge: claim.status === 'under_discussion' && age != null,
    ageLabel: `${age}d open`,
    ageFg: ageColor(age ?? 0),
    hasProof: !!claim.proof_url,
    closedBy: claim.closed_by_member?.full_name || '—',
    closedAt: fmtDate(claim.closed_at),
    resolutionNote: claim.resolution_note || '—',
  }
}

function CloseClaimModal({ claim: c, closerId, onClose, onDone }) {
  const [note, setNote]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (!c) return null
  const row = deriveRow(c)

  const handleClose = async () => {
    if (!note.trim()) { setError('A resolution note is required to close a claim.'); return }
    setLoading(true)
    setError('')
    try {
      const { error: e1 } = await supabase
        .from('po_quality_claims')
        .update({ status: 'closed', closed_by: closerId, closed_at: new Date().toISOString(), resolution_note: note.trim() })
        .eq('id', c.id)
      if (e1) throw e1
      onDone(`${row.poNumber} claim closed.`)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to close claim')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={loading ? undefined : onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="text-sm font-bold text-gray-900">Close Quality Claim</div>
            <div className="text-xs text-gray-500 mt-0.5">
              PO#{row.poNumber} · {row.typeLabel}{row.sku && ` · SKU ${row.sku}`}
            </div>
          </div>
          <button type="button" onClick={loading ? undefined : onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 flex flex-col gap-3 overflow-y-auto">
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</div>
            <p className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">{row.description}</p>
          </div>

          {row.hasProof && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Proof</div>
              <ProofPreview url={c.proof_url} />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-xs text-red-600">{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Resolution note <span className="text-red-400">*</span>
            </label>
            <textarea rows={3} value={note} onChange={e => { setNote(e.target.value); setError('') }}
              placeholder="How was this resolved?"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 resize-none focus:outline-none focus:border-gray-900" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={loading ? undefined : onClose} disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-40">
            Cancel
          </button>
          <button type="button" disabled={loading} onClick={handleClose}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer">
            {loading ? 'Closing…' : 'Close Claim'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function QualityClaims() {
  const dept     = useOrgDepartment()
  const memberId = useMemberId()
  const isAdmin  = useIsAdmin()
  // Tech department (any role) or a null-department admin manages every
  // claim; merchandising manages only their own — enforced for real at the
  // RLS layer (see sql/quality_claims_review_gate.sql), since merchandising
  // could otherwise hit the update API directly on a claim that isn't
  // theirs. This flat boolean is safe for the button here specifically
  // because the fetch below already scopes merchandising to their own rows
  // — they never see a claim to render the button on that isn't theirs.
  const canViewAll = dept === 'tech' || (isAdmin && dept === null)
  const canManage  = canViewAll || dept === 'merchandising'

  const [activeTab, setActiveTab]   = useState('under_discussion')
  const [typeFilter, setTypeFilter] = useState('all')
  const [query, setQuery]           = useState('')
  const [openRows, setOpenRows]     = useState([])
  const [closedRows, setClosedRows] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [closing, setClosing]       = useState(null)
  const [toast, setToast]           = useState('')

  const fetchData = async () => {
    setLoading(true)
    setError('')
    let openQ   = supabase.from('po_quality_claims').select(CLAIM_SELECT).eq('status', 'under_discussion').order('created_on', { ascending: false })
    let closedQ = supabase.from('po_quality_claims').select(CLAIM_SELECT).eq('status', 'closed').order('created_on', { ascending: false })
    if (!canViewAll && memberId) {
      openQ   = openQ.eq('submitted_by', memberId)
      closedQ = closedQ.eq('submitted_by', memberId)
    }
    const [openRes, closedRes] = await Promise.all([openQ, closedQ])
    if (openRes.error || closedRes.error) {
      setError((openRes.error || closedRes.error).message)
      setLoading(false)
      return
    }
    setOpenRows(openRes.data || [])
    setClosedRows(closedRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3200) }

  const base = activeTab === 'under_discussion' ? openRows : closedRows
  const q = query.trim().toLowerCase()
  const visible = base.filter(c => {
    if (typeFilter !== 'all' && c.claim_type !== typeFilter) return false
    if (!q) return true
    const li = c.po_line_items
    const po = c.purchase_orders
    return [po?.po_number, po?.buyer_supplier_links?.buyer?.display_name, po?.buyer_supplier_links?.supplier?.display_name,
      c.description, li?.buyer_sku_ref].filter(Boolean).join(' ').toLowerCase().includes(q)
  })
  const display = visible.map(deriveRow)

  const tabs = [
    { key: 'under_discussion', label: 'Under Discussion', count: openRows.length },
    { key: 'closed',           label: 'Closed',           count: closedRows.length },
  ]

  const statOpen = openRows.length
  const statOldest = openRows.length ? `${Math.max(...openRows.map(c => daysAgo(c.created_on) ?? 0))}d` : '—'
  const statClosed30 = closedRows.filter(c => c.closed_at && daysAgo(c.closed_at) <= 30).length

  const isFiltering = !!q || typeFilter !== 'all'
  const emptyKicker = isFiltering ? 'No matches' : activeTab === 'under_discussion' ? 'Queue clear' : 'No history'
  const emptyBody = isFiltering
    ? 'Nothing matches this search and filter. Clear them to see the full queue.'
    : activeTab === 'under_discussion' ? 'No open quality claims right now.' : 'Closed claims will appear here.'

  const renderActionCell = (row) => {
    if (row.status !== 'under_discussion' || !canManage) return null
    return (
      <button type="button" onClick={() => setClosing(row.claim)}
        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors cursor-pointer">
        Close
      </button>
    )
  }

  return (
    <div className="py-4 px-4 space-y-4">

      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap mt-4">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight leading-tight">Quality Claims</h1>
          <p className="text-[13.5px] text-gray-700">Track quality issues reported against purchase orders.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { fetchData(); showToast('Queue refreshed.') }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </button>
          <Link to="/dashboard/orders?tab=po-table"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-700 transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Submit claim
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="flex gap-2.5 flex-wrap">
        <div className="flex-1 min-w-[160px] bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700">Under discussion</div>
          <div className="font-mono text-2xl font-semibold text-gray-900 tracking-tight">{statOpen}</div>
        </div>
        <div className="flex-1 min-w-[160px] bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700">Oldest open</div>
          <div className="font-mono text-2xl font-semibold tracking-tight" style={{ color: '#B0350F' }}>{statOldest}</div>
        </div>
        <div className="flex-1 min-w-[160px] bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700">Closed · 30 days</div>
          <div className="font-mono text-2xl font-semibold text-gray-900 tracking-tight">{statClosed30}</div>
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

        <div className="flex items-center justify-between gap-4 px-4 border-b border-gray-100 flex-wrap">
          <div className="flex gap-1 -mb-px">
            {tabs.map(t => (
              <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
                className="inline-flex items-center gap-2 px-3.5 py-3.5 border-b-2 text-[13px] font-semibold transition-colors cursor-pointer"
                style={{ borderColor: activeTab === t.key ? '#DC2626' : 'transparent', color: activeTab === t.key ? '#18181B' : '#71717A' }}>
                {t.label}
                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: activeTab === t.key ? '#DC2626' : '#F2F2F5', color: activeTab === t.key ? '#FFFFFF' : '#71717A' }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 py-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto flex-nowrap -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap w-full sm:w-auto p-0.5 bg-gray-100 rounded-lg">
              {TYPE_FILTERS.map(f => (
                <button key={f.key} type="button" onClick={() => setTypeFilter(f.key)}
                  className="flex-shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  style={{
                    background: typeFilter === f.key ? '#FFFFFF' : 'transparent',
                    boxShadow: typeFilter === f.key ? '0 1px 2px rgba(24,24,27,.12)' : 'none',
                    color: typeFilter === f.key ? '#18181B' : '#71717A',
                  }}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 h-[34px] border border-gray-200 rounded-lg bg-white min-w-[210px] focus-within:border-gray-900 transition-colors">
              <span className="font-mono text-xs text-gray-500">/</span>
              <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="PO, supplier, SKU, description…"
                className="flex-1 min-w-0 border-0 outline-none bg-transparent text-xs text-gray-900 placeholder:text-gray-400" />
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <svg className="w-5 h-5 animate-spin text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <p className="text-sm text-gray-700">{error}</p>
            <button type="button" onClick={fetchData}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">Retry</button>
          </div>
        )}

        {!loading && !error && display.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-16 text-center">
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-gray-500">{emptyKicker}</span>
            <p className="text-sm text-gray-700 max-w-xs">{emptyBody}</p>
          </div>
        )}

        {!loading && !error && display.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Order</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Claim</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Description</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Reported</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Proof</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-700 border-b border-gray-100 whitespace-nowrap">Status</th>
                    <th className="text-right px-4 py-2.5 border-b border-gray-100">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {display.map(row => (
                    <Fragment key={row.claim.id}>
                      <tr className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-baseline gap-1 whitespace-nowrap">
                            <span className="text-[8.5px] font-bold text-gray-600 uppercase tracking-widest">PO</span>
                            <span className="font-mono text-[13px] font-semibold text-gray-900">{row.poNumber}</span>
                          </div>
                          <div className="text-[11.5px] text-gray-700 mt-0.5 whitespace-nowrap">{row.parties}</div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-800">{row.typeLabel}</div>
                          {row.sku && (
                            <div className="flex items-baseline gap-1 mt-1">
                              <span className="text-[8.5px] font-bold text-gray-600 uppercase tracking-widest">SKU</span>
                              <span className="font-mono text-[10.5px] font-semibold text-indigo-700">{row.sku}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top max-w-[260px]">
                          <div className="text-[12.5px] text-gray-800 leading-snug">{row.description}</div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="text-[12.5px] text-gray-800 whitespace-nowrap">{row.submittedBy}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[11px] text-gray-700 whitespace-nowrap">{row.submittedAt}</span>
                            {row.showAge && (
                              <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold whitespace-nowrap" style={{ color: row.ageFg }}>
                                <span className="w-1 h-1 rounded-full inline-block" style={{ background: row.ageFg }} />{row.ageLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          {row.hasProof ? (
                            <ProofThumb url={row.claim.proof_url} className="w-9 h-9 rounded-lg border border-gray-200" />
                          ) : <span className="text-xs text-gray-500">—</span>}
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                            style={{ background: row.badgeBg, border: `1px solid ${row.badgeBorder}`, color: row.badgeFg }}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: row.badgeFg }} />
                            {row.statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                          {renderActionCell(row)}
                        </td>
                      </tr>
                      {row.status === 'closed' && (
                        <tr className="border-b border-gray-50">
                          <td colSpan={7} className="px-4 pb-3 bg-gray-50/60">
                            <div className="border border-gray-200 rounded-xl bg-white px-4 py-3 flex flex-wrap gap-6">
                              <div className="flex flex-col gap-0.5 min-w-[120px]">
                                <span className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700">Closed by</span>
                                <span className="text-[12.5px] text-gray-800">{row.closedBy}</span>
                                <span className="font-mono text-[11px] text-gray-700">{row.closedAt}</span>
                              </div>
                              <div className="flex flex-col gap-0.5 flex-1 min-w-[180px]">
                                <span className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700">Resolution note</span>
                                <span className="text-[12.5px] text-gray-800 leading-relaxed">{row.resolutionNote}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden flex flex-col gap-2.5 p-3">
              {display.map(row => (
                <div key={row.claim.id} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1">
                        <span className="text-[8.5px] font-bold text-gray-600 uppercase tracking-widest">PO</span>
                        <span className="font-mono text-sm font-bold text-gray-900 truncate">{row.poNumber}</span>
                      </div>
                      <div className="text-xs text-gray-700 truncate mt-0.5">{row.parties}</div>
                    </div>
                    <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                      style={{ background: row.badgeBg, border: `1px solid ${row.badgeBorder}`, color: row.badgeFg }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: row.badgeFg }} />
                      {row.statusLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-gray-800">{row.typeLabel}</span>
                    {row.sku && (
                      <span className="inline-flex items-baseline gap-1">
                        <span className="text-[8.5px] font-bold text-gray-600 uppercase tracking-widest">SKU</span>
                        <span className="font-mono text-[10.5px] font-semibold text-indigo-700">{row.sku}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-800">{row.description}</div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-800 truncate">{row.submittedBy}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[11px] text-gray-700">{row.submittedAt}</span>
                        {row.showAge && <span className="font-mono text-[10.5px] font-semibold" style={{ color: row.ageFg }}>{row.ageLabel}</span>}
                      </div>
                    </div>
                    {row.hasProof && (
                      <div className="flex-shrink-0">
                        <ProofThumb url={row.claim.proof_url} className="w-9 h-9 rounded-lg border border-gray-200" />
                      </div>
                    )}
                  </div>
                  {row.status === 'closed' ? (
                    <div className="pt-2 border-t border-gray-100 flex flex-col gap-0.5">
                      <span className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-gray-700">Resolution note</span>
                      <span className="text-xs text-gray-800 leading-relaxed">{row.resolutionNote}</span>
                    </div>
                  ) : (
                    <div className="[&>button]:w-full">{renderActionCell(row)}</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <CloseClaimModal
        claim={closing}
        closerId={memberId}
        onClose={() => setClosing(null)}
        onDone={(msg) => { fetchData(); if (msg) showToast(msg) }}
      />

      {toast && (
        <div className="fixed left-1/2 bottom-7 z-[400] -translate-x-1/2 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-[12.5px] font-medium shadow-2xl">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}
    </div>
  )
}
