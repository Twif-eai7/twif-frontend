import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useOrgId, useProfileStore } from '../../stores/profileStore'
import { STAGE_LABEL, ACCEPTED_RESULTS, getStage, getStageRollup } from './inspectionReport/stageStatus'
import { fetchInspectionReportPdf, downloadBlob } from '../../lib/inspectionReportPdfApi'

// A small local copy, not imported from QcReportsSummary.jsx - that file is
// 3000+ lines and only ever meant to be lazy-loaded for the Merchant
// Portal; statically importing even one small piece of it from here would
// pull its whole chunk into this page's own load path. This page is
// supposed to be fully decoupled from it (see this file's own top comment).
function KpiTile({ label, value, accent, loading }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-600' : accent === 'red' ? 'text-red-500' : 'text-gray-900'
  if (loading) {
    return (
      <div className="border border-gray-200 rounded-xl shadow-sm p-2.5 sm:p-4">
        <div className="h-2.5 w-16 rounded bg-gray-200 animate-pulse" />
        <div className="h-6 w-10 rounded bg-gray-200 animate-pulse mt-2" />
      </div>
    )
  }
  return (
    <div className="border border-gray-200 rounded-xl shadow-sm p-2.5 sm:p-4 bg-white">
      <div className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</div>
      <div className="text-xl sm:text-2xl font-extrabold mt-1"><span className={accentClass}>{value}</span></div>
    </div>
  )
}

// Supplier-facing QC Reports - a read-only summary of this supplier's own
// inspection results. Deliberately NOT a supplier branch of
// QcReportsSummary.jsx (3000+ lines, full of merchant-only write actions -
// Accept/Reject/Reschedule, PPM Callouts, Send Mail, comments - and
// unscoped queries that see every buyer/vendor). This is a fresh, small,
// read-only component instead, so nothing here can regress that file or
// leak another supplier's data.
//
// Scoping follows the exact pattern InspectionRequestForm.jsx already
// proved for this same portal: buyer_supplier_links!inner(...).eq(
// 'buyer_supplier_links.supplier_org_id', orgId), waiting for orgId to
// resolve before querying so unscoped data is never even briefly shown.
//
// Deliberately excluded, per the approved plan: no Inspector name/identity
// anywhere (internal JNG QA staff aren't this supplier's business), no
// Vendor filter (always themselves), no Merchant filter (internal buying-
// office concept), no defects/photos/workmanship detail - status, result
// and dates only, plus a PDF download of what QA already generated.

const STAGE_ORDER = { inline: 0, midline: 1, final: 2 }

function fmtDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// One summary result per PO, rolled up from its SKUs' latest Final round:
// 'rejected' if any SKU's Final was rejected, 'accepted' if every SKU that's
// reached Final is accepted-ish and none are still short of their order,
// 'partial' if some SKUs are accepted and others aren't there yet,
// 'pending' if nothing has reached Final at all.
function poOverallResult(lineItems, reports) {
  let anyRejected = false, anyAccepted = false, anyPending = false
  for (const li of lineItems) {
    const finalReport = getStage(reports, li.id, 'final')
    if (!finalReport || finalReport.status !== 'submitted') { anyPending = true; continue }
    if (finalReport.inspection_result === 'rejected') { anyRejected = true; continue }
    if (ACCEPTED_RESULTS.includes(finalReport.inspection_result)) {
      // li.quantity_ordered == null defaults `covered >= 0` to always true
      // (any nonzero accepted quantity), silently reading an order of
      // UNKNOWN size as fully accepted - treat that as "can't tell yet"
      // instead of a false-positive "Accepted".
      if (li.quantity_ordered == null) { anyPending = true; continue }
      const rollup = getStageRollup(reports, li.id, 'final')
      const covered = rollup.cumulativeAccepted > 0 ? rollup.cumulativeAccepted : rollup.cumulativeAvailable
      if (covered >= li.quantity_ordered) anyAccepted = true
      else anyPending = true
    } else {
      anyPending = true
    }
  }
  if (anyRejected) return 'rejected'
  if (anyPending && anyAccepted) return 'partial'
  if (anyPending) return 'pending'
  if (anyAccepted) return 'accepted'
  return 'pending'
}

const RESULT_TILE_LABEL = { accepted: 'Accepted', rejected: 'Rejected', partial: 'Partially Accepted', pending: 'In Progress' }
const RESULT_TILE_CLASS = {
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-gray-50 text-gray-500 border-gray-200',
}

// Furthest-along stage across a PO's SKUs (Final beats Midline beats
// Inline) - same "what does this PO's Stage column say" convention the
// Merchant Scheduled POs table already uses.
function poFurthestStage(lineItems, reports) {
  let best = null
  for (const li of lineItems) {
    for (const stageKey of ['inline', 'midline', 'final']) {
      if (getStage(reports, li.id, stageKey)) {
        if (best === null || STAGE_ORDER[stageKey] > STAGE_ORDER[best]) best = stageKey
      }
    }
  }
  return best
}

// Per-SKU-per-stage badge, for the expanded PO detail - reads the SAME
// getStage()-latest-round result every rollup above already uses, just
// rendered raw instead of collapsed into one PO-level summary.
function resultBadgeClass(result) {
  if (!result) return 'bg-gray-50 text-gray-400 border-gray-200'
  if (result === 'rejected') return 'bg-red-50 text-red-700 border-red-200'
  if (ACCEPTED_RESULTS.includes(result)) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
}
function resultLabel(result) {
  if (!result) return 'Not started'
  return result.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function poLatestInspectionDate(lineItems, reports) {
  let latest = null
  for (const li of lineItems) {
    for (const stageKey of ['inline', 'midline', 'final']) {
      const r = getStage(reports, li.id, stageKey)
      const d = r?.inspection_date || r?.submitted_at
      if (d && (!latest || d > latest)) latest = d
    }
  }
  return latest
}

export default function SupplierQcReports() {
  const orgId = useOrgId()
  const orgType = useProfileStore(s => s.orgMembership?.orgType)
  const isSupplier = orgType === 'supplier'

  const [pos, setPos] = useState([])
  const [batchesByPo, setBatchesByPo] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [buyerFilter, setBuyerFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [downloadingPoId, setDownloadingPoId] = useState(null)
  const [downloadError, setDownloadError] = useState(null)
  const [expandedPoId, setExpandedPoId] = useState(null)

  useEffect(() => {
    // Waiting for orgId (rather than querying unscoped and re-filtering
    // client-side) means this supplier never briefly sees every PO in the
    // system, even for one render - same reasoning InspectionRequestForm.jsx
    // already uses for its own PO picker.
    if (isSupplier && !orgId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .from('purchase_orders')
      .select(`
        id, po_number, ex_factory_date, exceptional_ex_factory_date, quantity_ordered,
        buyer_supplier_links!inner(
          supplier_org_id,
          buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name, state, country)
        ),
        po_line_items(
          id, buyer_sku_ref, quantity_ordered, target_date,
          inspection_reports(id, inspection_type, round, status, inspection_result, inspection_date, submitted_at, accepted_quantity, available_quantity, po_line_item_id)
        )
      `)
      .eq('buyer_supplier_links.supplier_org_id', orgId)
      .is('deleted_at', null)
      .is('delete_meta', null)
      .neq('status', 'closed')
      .order('po_received_date', { ascending: false })
      .then(async ({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }
        const mapped = (data || []).map(po => ({
          ...po,
          buyer_name: po.buyer_supplier_links?.buyer?.display_name ?? null,
          region: [po.buyer_supplier_links?.buyer?.state, po.buyer_supplier_links?.buyer?.country].filter(Boolean).join(', '),
        }))
        setPos(mapped)

        // Combined-report batches for these POs (see supabase/migrations/
        // 20260917_create_inspection_report_batches.sql) - lets Download
        // reuse an already-generated combined PDF instead of re-bundling
        // every report from scratch.
        const poIds = mapped.map(p => p.id)
        if (poIds.length) {
          const { data: batches } = await supabase
            .from('inspection_report_batches')
            .select('po_id, report_ids, created_at')
            .in('po_id', poIds)
            .order('created_at', { ascending: false })
          if (cancelled) return
          const byPo = {}
          for (const b of batches || []) if (!byPo[b.po_id]) byPo[b.po_id] = b
          setBatchesByPo(byPo)
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [orgId, isSupplier])

  const buyerOptions = useMemo(() => [...new Set(pos.map(p => p.buyer_name).filter(Boolean))].sort(), [pos])
  const regionOptions = useMemo(() => [...new Set(pos.map(p => p.region).filter(Boolean))].sort(), [pos])

  const rows = useMemo(() => pos.map(po => {
    const lineItems = po.po_line_items || []
    const reports = lineItems.flatMap(li => (li.inspection_reports || []).map(r => ({ ...r, po_line_item_id: li.id })))
    return {
      po,
      lineItems,
      reports,
      orderedSkus: lineItems.length,
      submittedSkus: lineItems.filter(li => getStage(reports, li.id, 'final')?.status === 'submitted').length,
      stage: poFurthestStage(lineItems, reports),
      result: poOverallResult(lineItems, reports),
      inspectionDate: poLatestInspectionDate(lineItems, reports),
    }
  }), [pos])

  const filteredRows = useMemo(() => rows.filter(r => {
    if (buyerFilter && r.po.buyer_name !== buyerFilter) return false
    if (regionFilter && r.po.region !== regionFilter) return false
    if (statusFilter && r.result !== statusFilter) return false
    if (dateFrom && (!r.inspectionDate || r.inspectionDate < dateFrom)) return false
    if (dateTo && (!r.inspectionDate || r.inspectionDate > dateTo)) return false
    return true
  }), [rows, buyerFilter, regionFilter, statusFilter, dateFrom, dateTo])

  const kpis = useMemo(() => {
    const totalReports = rows.reduce((sum, r) => sum + r.reports.filter(x => x.status === 'submitted').length, 0)
    const inspectedPos = rows.filter(r => r.stage).length
    const acceptedPos = rows.filter(r => r.result === 'accepted').length
    const rejectedPos = rows.filter(r => r.result === 'rejected').length
    return { totalReports, inspectedPos, acceptedPos, rejectedPos }
  }, [rows])

  const handleDownload = async (row) => {
    setDownloadError(null)
    setDownloadingPoId(row.po.id)
    try {
      const batch = batchesByPo[row.po.id]
      const reportIds = batch?.report_ids?.length
        ? batch.report_ids
        : row.reports.filter(r => r.status === 'submitted').map(r => r.id)
      if (!reportIds.length) throw new Error('No submitted reports yet for this PO.')
      const { blob, filename } = await fetchInspectionReportPdf(row.po.id, reportIds, { mode: 'final' })
      downloadBlob(blob, filename)
    } catch (err) {
      setDownloadError(err.message || 'Failed to download report')
    } finally {
      setDownloadingPoId(null)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-extrabold text-gray-900 tracking-tight">QC Reports</h1>
        <p className="text-xs text-gray-500 mt-0.5">Your inspection results</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiTile label="Total Reports" value={kpis.totalReports} loading={loading} />
        <KpiTile label="Inspected POs" value={kpis.inspectedPos} loading={loading} />
        <KpiTile label="Accepted POs" value={kpis.acceptedPos} accent="emerald" loading={loading} />
        <KpiTile label="Rejected POs" value={kpis.rejectedPos} accent="red" loading={loading} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={buyerFilter} onChange={e => setBuyerFilter(e.target.value)}
          className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="">All Buyers</option>
          {buyerOptions.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
          className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="">All Regions</option>
          {regionOptions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="">All Statuses</option>
          {Object.entries(RESULT_TILE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white" />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white" />
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {downloadError && <p className="text-xs text-red-500 mb-3">{downloadError}</p>}

      <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-400 uppercase tracking-wide">
              <th className="px-3.5 py-2.5">PO</th>
              <th className="px-3.5 py-2.5">Buyer</th>
              <th className="px-3.5 py-2.5">Ex-Factory</th>
              <th className="px-3.5 py-2.5">Ordered SKUs</th>
              <th className="px-3.5 py-2.5">Submitted SKUs</th>
              <th className="px-3.5 py-2.5">Stage</th>
              <th className="px-3.5 py-2.5">Result</th>
              <th className="px-3.5 py-2.5">Inspection Date</th>
              <th className="px-3.5 py-2.5">Download</th>
              <th className="px-3.5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td colSpan={10} className="px-3.5 py-3">
                    <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                  </td>
                </tr>
              ))
            )}
            {!loading && filteredRows.length === 0 && (
              <tr><td colSpan={10} className="px-3.5 py-8 text-center text-gray-400">No reports match.</td></tr>
            )}
            {!loading && filteredRows.map(row => {
              const isExpanded = expandedPoId === row.po.id
              return (
                <Fragment key={row.po.id}>
                  <tr
                    onClick={() => setExpandedPoId(isExpanded ? null : row.po.id)}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer ${isExpanded ? 'bg-gray-50/80' : ''}`}
                  >
                    <td className="px-3.5 py-2.5 font-semibold text-gray-800">{row.po.po_number || '-'}</td>
                    <td className="px-3.5 py-2.5 text-gray-600">{row.po.buyer_name || '-'}</td>
                    <td className="px-3.5 py-2.5 text-gray-600">{fmtDate(row.po.ex_factory_date)}</td>
                    <td className="px-3.5 py-2.5 text-gray-600">{row.orderedSkus}</td>
                    <td className="px-3.5 py-2.5 text-gray-600">{row.submittedSkus}</td>
                    <td className="px-3.5 py-2.5">
                      {row.stage
                        ? <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold">{STAGE_LABEL[row.stage]}</span>
                        : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${RESULT_TILE_CLASS[row.result]}`}>
                        {RESULT_TILE_LABEL[row.result]}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-gray-600">{fmtDate(row.inspectionDate)}</td>
                    <td className="px-3.5 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDownload(row) }}
                        disabled={downloadingPoId === row.po.id || row.submittedSkus === 0}
                        className="px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 font-semibold hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {downloadingPoId === row.po.id ? 'Preparing…' : 'Download'}
                      </button>
                    </td>
                    <td className="px-3.5 py-2.5 text-gray-300">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} className="px-3.5 pb-3 pt-0 bg-gray-50/50">
                        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="border-b border-gray-100 text-left text-gray-400 uppercase tracking-wide">
                                <th className="px-3 py-2">SKU</th>
                                <th className="px-3 py-2">Inline</th>
                                <th className="px-3 py-2">Midline</th>
                                <th className="px-3 py-2">Final</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.lineItems.map(li => (
                                <tr key={li.id} className="border-b border-gray-50 last:border-0">
                                  <td className="px-3 py-2 font-semibold text-gray-700">{li.buyer_sku_ref || '-'}</td>
                                  {['inline', 'midline', 'final'].map(stageKey => {
                                    const r = getStage(row.reports, li.id, stageKey)
                                    const isDraft = r && r.status !== 'submitted'
                                    return (
                                      <td key={stageKey} className="px-3 py-2">
                                        {r ? (
                                          <div className="flex flex-col gap-0.5">
                                            <span className={`inline-flex w-fit items-center px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${isDraft ? 'bg-gray-50 text-gray-400 border-gray-200' : resultBadgeClass(r.inspection_result)}`}>
                                              {isDraft ? 'In Progress' : resultLabel(r.inspection_result)}
                                            </span>
                                            <span className="text-gray-400">{fmtDate(r.inspection_date || r.submitted_at)}</span>
                                          </div>
                                        ) : <span className="text-gray-300">-</span>}
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
