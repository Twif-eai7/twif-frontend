import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useMemberId } from '../../stores/profileStore'
import { useSkuImport } from '../../hooks/useSkuImport'
import { useSkuCache } from '../../hooks/useSkuCache'
import SkuImportUploadModal from './SkuImportUploadModal'
import SkuCreateModal from './SkuCreateModal'
import SkuReviewDrawer from './SkuReviewDrawer'
import PiRowReviewDrawer from './PiRowReviewDrawer'
import { publicUrl } from './poUtils'

const PREFILL_PARAM_KEYS = ['prefillBuyer', 'prefillVendor', 'prefillBuyerName', 'prefillVendorName', 'prefillFile', 'prefillPo', 'prefillPoId', 'prefillBatch']

// Batches only ever have a PO once this feature shipped — older ones stay
// po_id = NULL forever (no backfill), so they collect into one trailing
// "No PO (legacy)" group instead of being scattered/unlabeled.
function groupBatchesByPo(batches) {
  const groups = new Map()
  for (const b of batches) {
    const key = b.poNumber || null
    if (!groups.has(key)) groups.set(key, { poNumber: key, batches: [] })
    groups.get(key).batches.push(b)
  }
  const withPo = [...groups.values()].filter(g => g.poNumber)
  const noPo = groups.get(null)
  return noPo ? [...withPo, noPo] : withPo
}

function StatusChip({ status }) {
  if (status === 'confirmed' || status === 'completed') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium">
      {status === 'completed' ? 'Completed' : 'Confirmed'}
    </span>
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium">
    {status === 'in_progress' ? 'In progress' : 'Pending review'}
  </span>
}

// Distinguishes a PI-derived batch (line items — qty/price, reviewed to
// create/link a SKU and its po_line_item) from a product-sheet batch
// (physical/logistics fields, enriches a SKU already in the catalog).
function ImportTypeBadge({ type }) {
  if (type === 'pi') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">PI</span>
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">Product Sheet</span>
}

function outstandingCount(row) {
  return Object.keys(row.needsConfirm || {}).length + Object.keys(row.needsInput || {}).length
}

// Small pill for "X fields to review" — matches the amber accent used for
// pending-review status elsewhere instead of reading as plain gray caption text.
function OutstandingBadge({ count }) {
  if (!count) return null
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold whitespace-nowrap">
      {count} field{count === 1 ? '' : 's'} to review
    </span>
  )
}

// Flags a row the parse already matched to an existing SKU by ref+variant —
// a product-sheet row enriches that SKU on confirm; a PI row only ever
// links its line item to it (never writes to the SKU's fields) — so the
// wording differs by batch type, but either way the reviewer shouldn't
// mistake it for a fresh "pending review"/"will create a new SKU" row.
function LinkedExistingBadge({ show, importType }) {
  if (!show) return null
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold whitespace-nowrap">
      {importType === 'pi' ? 'Links to existing SKU' : 'Updates existing SKU'}
    </span>
  )
}

// Compact progress bar for the batch list's "Progress" column — same shape
// as PoDrawer's ShipProgress, so batch/row completion reads consistently
// with shipment progress elsewhere in the app.
function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-gray-500 whitespace-nowrap flex-shrink-0">{done}/{total} skus</span>
    </div>
  )
}

// Small solid pill for row-level actions ("Review"/"Edit"/"View"/"Resume") —
// matches the weight of the Edit button in PoDrawer's line items table
// rather than a plain underlined text link.
function RowActionButton({ onClick, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="px-2.5 py-1 rounded-md bg-gray-900 text-white text-[11px] font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed">
      {children}
    </button>
  )
}

// "Create SKUs" is primary now — most SKUs get created without a vendor
// sheet at all. Uploading a sheet is the secondary, faster-when-available path.
function CreateButton({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 transition-colors cursor-pointer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      Create SKUs
    </button>
  )
}

function UploadButton({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      Upload Product Sheet
    </button>
  )
}

// Self-contained trash icon -> inline "confirm?" swap -> calls onConfirm.
// Used for both row deletes and batch deletes — one clear confirm step,
// no separate modal.
function ConfirmDeleteButton({ onConfirm, confirmLabel = 'Delete this?' }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
        <span className="text-[11px] font-medium text-red-600 whitespace-nowrap">{error || confirmLabel}</span>
        <button type="button" disabled={loading} onClick={async () => {
          setLoading(true); setError(null)
          try { await onConfirm() }
          catch (err) { setError(err.message || 'Failed'); setLoading(false); return }
          setLoading(false); setConfirming(false)
        }} className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
          {loading ? '…' : 'Yes'}
        </button>
        <button type="button" disabled={loading} onClick={() => { setConfirming(false); setError(null) }}
          className="text-[11px] text-gray-400 hover:text-gray-700 cursor-pointer disabled:cursor-not-allowed">
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button type="button" onClick={e => { e.stopPropagation(); setConfirming(true) }} title="Delete"
      className="w-6 h-6 inline-flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0 cursor-pointer">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  )
}

export default function SkuImportTab() {
  const memberId = useMemberId()
  const navigate = useNavigate()
  const { listBatches, getBatch, addManualRow, deleteRow, deleteBatch, deletePiRow } = useSkuImport()
  const { invalidate: invalidateSkuCache } = useSkuCache()
  const [searchParams, setSearchParams] = useSearchParams()

  const [batches, setBatches]       = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError]   = useState(null)

  const [batch, setBatch]           = useState(null) // detail view
  const [loadingBatch, setLoadingBatch] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [_createOpen, setCreateOpen] = useState(false) // unused while manual creation is commented out — see below
  const [activeRow, setActiveRow]   = useState(null)
  const [prefill, setPrefill]       = useState(null) // from PoDrawer's "Create SKUs" callout
  const [addingRow, setAddingRow]   = useState(false)
  const [addRowError, setAddRowError] = useState(null)

  const [filters, setFilters] = useState({ search: '', status: '', buyerName: '' })
  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  const refreshList = useCallback(() => {
    setLoadingList(true)
    listBatches()
      .then(setBatches)
      .catch(err => setListError(err.message))
      .finally(() => setLoadingList(false))
  }, [listBatches])

  useEffect(() => { refreshList() }, [refreshList])

  // One-time consume of ?prefillBuyer=... etc, set by PoDrawer's "Create
  // SKUs" entry points. The PO already tells us the buyer/vendor either way,
  // so this alone is enough to skip the manual buyer/vendor picker in
  // *either* modal (both read `prefill` — see below) — it doesn't assume
  // they want to upload a sheet. Only auto-opens the Upload modal when there's
  // an actual file to fetch; otherwise it just lands on the list with the
  // buyer/vendor context ready for whichever of "Upload"/"Create manually"
  // they pick. Params are stripped right after so a reload/back-nav won't
  // reopen it.
  useEffect(() => {
    const buyerOrgId = searchParams.get('prefillBuyer')
    if (!buyerOrgId) return
    const fileUrl = searchParams.get('prefillFile') || ''
    setPrefill({
      buyerOrgId,
      buyerName:  searchParams.get('prefillBuyerName') || '',
      vendorId:   searchParams.get('prefillVendor') || '',
      vendorName: searchParams.get('prefillVendorName') || '',
      poNumber:   searchParams.get('prefillPo') || '',
      poId:       searchParams.get('prefillPoId') || null,
      fileUrl,
    })
    if (fileUrl) setUploadOpen(true)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      PREFILL_PARAM_KEYS.forEach(k => next.delete(k))
      return next
    }, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openBatch = (batchId) => {
    setLoadingBatch(true)
    getBatch(batchId)
      .then(b => setBatch({
        ...b,
        rows: b.rows.map(r => ({
          rowId:        r.id,
          status:       r.status,
          confirmed:    r.confirmed,
          needsConfirm: r.needs_confirm,
          needsInput:   r.needs_input,
          skuId:        r.sku_id,
        })),
      }))
      .finally(() => setLoadingBatch(false))
  }

  // Deep link from PO Drawer once the product-details-uploaded webhook has
  // already parsed a PO's sheet and created a batch — jumps straight into
  // reviewing it, skipping the buyer/vendor prefill banner and upload modal
  // entirely (there's nothing left to upload, the batch already exists).
  useEffect(() => {
    const batchId = searchParams.get('prefillBatch')
    if (!batchId) return
    openBatch(batchId)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('prefillBatch')
      return next
    }, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUploaded = (newBatch) => {
    setBatch(newBatch)
    setUploadOpen(false)
    setPrefill(null)
    refreshList()
  }

  // Jumps straight into editing the first (blank) row — no batch-detail
  // pit-stop, since the whole point of "Create SKUs" is starting from nothing.
  // Unused while manual creation is commented out — see SkuCreateModal below.
  const _handleCreated = (newBatch) => {
    setBatch(newBatch)
    setCreateOpen(false)
    setPrefill(null)
    setActiveRow(newBatch.rows[0])
    refreshList()
  }

  const handleSaved = (rowId, skuId, fields, categoryId) => {
    setBatch(prev => {
      // PO Drawer's line-item SKU autocomplete caches this buyer's SKU list
      // for the whole tab session (see useSkuCache.js) — without dropping it
      // here, a SKU confirmed through this review flow stays invisible there
      // until the cache's own TTL/next invalidation elsewhere.
      if (prev?.buyerOrgId) invalidateSkuCache(prev.buyerOrgId)
      return {
        ...prev,
        rows: prev.rows.map(r => r.rowId === rowId ? {
          ...r,
          status: 'confirmed',
          skuId,
          // Refresh the snapshot to the just-saved values so reopening this row
          // (to edit again) shows the live data, not the original parsed values.
          confirmed: { ...fields, category_id: categoryId },
          needsConfirm: {},
          needsInput: {},
        } : r),
      }
    })
    setActiveRow(null)
  }

  // PI rows have no category — confirm_pi_import_row returns the
  // po_line_items id (not a sku id), which this row doesn't otherwise track.
  const handlePiSaved = (rowId, fields) => {
    setBatch(prev => {
      if (prev?.buyerOrgId) invalidateSkuCache(prev.buyerOrgId)
      return {
        ...prev,
        rows: prev.rows.map(r => r.rowId === rowId ? {
          ...r,
          status: 'confirmed',
          confirmed: fields,
          needsConfirm: {},
          needsInput: {},
        } : r),
      }
    })
    setActiveRow(null)
  }

  const backToList = () => {
    setBatch(null)
    refreshList()
  }

  // For sheets (or formats) the parser couldn't extract anything useful
  // from — e.g. a batch that lands "0 of 0 confirmed" — there's otherwise no
  // row to click into, so this adds a blank one to fill in by hand.
  const handleAddManualRow = async () => {
    if (addingRow) return
    setAddingRow(true)
    setAddRowError(null)
    try {
      const row = await addManualRow(batch.batchId, batch.rows.length)
      const newRow = {
        rowId:        row.id,
        status:       row.status,
        confirmed:    row.confirmed,
        needsConfirm: row.needs_confirm,
        needsInput:   row.needs_input,
      }
      setBatch(prev => ({ ...prev, rows: [...prev.rows, newRow] }))
      setActiveRow(newRow)
    } catch (err) {
      setAddRowError(err.message || 'Could not add a new row. Please try again.')
    } finally {
      setAddingRow(false)
    }
  }

  // Deletes the staging row outright; if it was already confirmed, the RPC
  // soft-deletes the linked `skus` record instead of touching it directly.
  const handleDeleteRow = async (rowId) => {
    if (batch.importType === 'pi') {
      await deletePiRow(rowId, { poId: batch.poId, deletedBy: memberId })
    } else {
      await deleteRow(rowId, { deletedBy: memberId })
    }
    setBatch(prev => ({ ...prev, rows: prev.rows.filter(r => r.rowId !== rowId) }))
  }

  // Deletes the batch (its staging rows cascade away); any already-confirmed
  // SKUs in it stay untouched in `skus`.
  const handleDeleteBatch = async (batchId) => {
    await deleteBatch(batchId)
    if (batch?.batchId === batchId) setBatch(null)
    refreshList()
  }

  const confirmedCount = batch ? batch.rows.filter(r => r.status === 'confirmed').length : 0
  // Rows the parse already matched to an existing SKU (by buyer_sku_ref +
  // variant) before anyone's reviewed them — confirming one of these will
  // enrich that SKU rather than create a new one (see the per-row "Updates
  // existing SKU" badge below).
  const linkedExistingCount = batch ? batch.rows.filter(r => r.skuId && r.status !== 'confirmed').length : 0

  const buyerOptions = useMemo(
    () => [...new Set(batches.map(b => b.buyerName).filter(Boolean))].sort(),
    [batches]
  )

  const filteredBatches = useMemo(() => {
    const term = filters.search.trim().toLowerCase()
    return batches.filter(b => {
      if (filters.status && b.status !== filters.status) return false
      if (filters.buyerName && b.buyerName !== filters.buyerName) return false
      if (term) {
        const haystack = `${b.fileName || ''} ${b.buyerName || ''} ${b.vendorName || ''} ${b.poNumber || ''}`.toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [batches, filters])

  const groupedBatches = useMemo(() => groupBatchesByPo(filteredBatches), [filteredBatches])

  return (
    <div className="p-4 sm:p-6">

      {/* SKU Import is no longer nav-exposed directly — only reachable via
          Item Master's "Import SKU" button — so this is the only way back. */}
      <button type="button" onClick={() => navigate('/dashboard/npd?tab=style-library')}
        className="inline-flex items-center gap-1.5 mb-4 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Item Master
      </button>

      {/* ── Batch detail view ─────────────────────────────────────────────── */}
      {batch && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-gray-50 to-white border border-gray-200 rounded-xl px-5 py-3.5 shadow-sm">
            <div className="min-w-0 flex items-center gap-3">
              <button type="button" onClick={backToList} title="Back to all batches"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-900 truncate flex items-center gap-2">
                  {batch.poNumber && (
                    <span>PO {batch.poNumber}</span>
                  )}
                  <ImportTypeBadge type={batch.importType} />
                   <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 whitespace-nowrap">{batch.fileName || 'Manual Entry'}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{batch.buyerName} → {batch.vendorName}{batch.sheetUsed && ` · sheet "${batch.sheetUsed}"`}</span>
                  <ProgressBar done={confirmedCount} total={batch.rows.length} />
                  {linkedExistingCount > 0 && (
                    <span className="text-gray-400">· {linkedExistingCount} will {batch.importType === 'pi' ? 'link to' : 'update'} an existing SKU</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0">
              {batch.importType !== 'pi' && (
                <>
                  <button type="button" onClick={handleAddManualRow} disabled={addingRow}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed">
                    {addingRow ? 'Adding…' : '+ Add SKU manually'}
                  </button>
                  <UploadButton onClick={() => setUploadOpen(true)} />
                </>
              )}
              <ConfirmDeleteButton onConfirm={() => handleDeleteBatch(batch.batchId)} confirmLabel="Delete this batch?" />
            </div>
          </div>

          {addRowError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{addRowError}</div>
          )}

          {batch.rows.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 text-center">
              <p className="text-sm text-gray-500">
                {batch.importType === 'pi'
                  ? 'No line items could be extracted from this PI.'
                  : "This sheet's format couldn't be auto-parsed — no rows were extracted."}
              </p>
              {batch.importType !== 'pi' && (
                <p className="text-xs text-gray-400">Use "Add SKU manually" above to fill them in by hand.</p>
              )}
            </div>
          )}

          {batch.rows.length > 0 && (
          <>
          {/* Table — sm and up */}
          <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-2.5 w-20"></th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Buyer SKU Ref</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  {batch.importType === 'pi' ? (
                    <>
                      <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Unit Price</th>
                    </>
                  ) : (
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Base Price</th>
                  )}
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {batch.rows.map(row => {
                  const outstanding = outstandingCount(row)
                  const imageUrl = row.confirmed?.image_url ? publicUrl(row.confirmed.image_url) : null
                  return (
                    <tr key={row.rowId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5">
                        {imageUrl ? (
                          <img src={imageUrl} alt="" className="w-14 h-14 rounded-md object-cover border border-gray-200" />
                        ) : (
                          <div className="w-14 h-14 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-900 font-semibold">{row.confirmed?.buyer_sku_ref || row.needsConfirm?.buyer_sku_ref || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">{row.confirmed?.description || row.needsConfirm?.description || '—'}</td>
                      {batch.importType === 'pi' ? (
                        <>
                          <td className="px-4 py-2.5 text-gray-700">{row.confirmed?.quantity_ordered ?? '—'}</td>
                          <td className="px-4 py-2.5 text-gray-700">{row.confirmed?.unit_price ?? '—'} {row.confirmed?.currency || ''}</td>
                        </>
                      ) : (
                        <td className="px-4 py-2.5 text-gray-700">{row.confirmed?.base_price ?? '—'}</td>
                      )}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusChip status={row.status} />
                          {row.status !== 'confirmed' && <OutstandingBadge count={outstanding} />}
                          <LinkedExistingBadge show={!!row.skuId && row.status !== 'confirmed'} importType={batch.importType} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <RowActionButton onClick={() => setActiveRow(row)}>
                            {row.status === 'confirmed' ? 'Edit' : 'Review'}
                          </RowActionButton>
                          <ConfirmDeleteButton onConfirm={() => handleDeleteRow(row.rowId)}
                            confirmLabel={row.status === 'confirmed' ? 'Delete SKU?' : 'Delete row?'} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Cards — below sm, one row per card instead of horizontal scroll */}
          <div className="sm:hidden flex flex-col gap-3">
            {batch.rows.map(row => {
              const outstanding = outstandingCount(row)
              const imageUrl = row.confirmed?.image_url ? publicUrl(row.confirmed.image_url) : null
              // Same fallback CategorySelectField/SkuReviewDrawer's own header
              // already uses — never show a bare "—" as the card's bolded
              // title when the ref just hasn't been filled in yet; fall back
              // to the description instead, and only show it a second time
              // below if it wasn't already promoted to the title slot.
              const ref = row.confirmed?.buyer_sku_ref || row.needsConfirm?.buyer_sku_ref || null
              const desc = row.confirmed?.description || row.needsConfirm?.description || null
              const title = ref || desc || 'Unreviewed row'
              const subtitle = ref ? desc : null
              return (
                <div key={row.rowId} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex gap-3">
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="w-20 h-20 rounded-md object-cover border border-gray-200 flex-shrink-0 self-start" />
                  ) : (
                    <div className="w-20 h-20 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 flex-shrink-0 self-start">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
                        {subtitle && <div className="text-xs text-gray-600 truncate mt-0.5">{subtitle}</div>}
                      </div>
                      <ConfirmDeleteButton onConfirm={() => handleDeleteRow(row.rowId)}
                        confirmLabel={row.status === 'confirmed' ? 'Delete SKU?' : 'Delete row?'} />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {batch.importType === 'pi' ? (
                        <span className="text-xs font-medium text-gray-700">{row.confirmed?.quantity_ordered ?? '—'} × {row.confirmed?.unit_price ?? '—'} {row.confirmed?.currency || ''}</span>
                      ) : (
                        <span className="text-xs font-medium text-gray-700">{row.confirmed?.base_price ?? '—'}</span>
                      )}
                      <StatusChip status={row.status} />
                      {row.status !== 'confirmed' && <OutstandingBadge count={outstanding} />}
                      <LinkedExistingBadge show={!!row.skuId && row.status !== 'confirmed'} importType={batch.importType} />
                    </div>
                    <div className="mt-0.5">
                      <RowActionButton onClick={() => setActiveRow(row)}>
                        {row.status === 'confirmed' ? 'Edit' : 'Review'}
                      </RowActionButton>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </>
          )}
        </div>
      )}

      {/* ── Batch list view ────────────────────────────────────────────────── */}
      {!batch && (
        <div className="flex flex-col gap-4">
          {/* Buyer/vendor known from a PO drawer entry point — carries into
              whichever of Upload/Create the user picks below (see `prefill`
              prop on both modals); dismissable in case it's stale/unwanted. */}
          {prefill && (
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-800">
              <span>
                Creating SKUs for PO {prefill.poNumber || '—'} — <span className="font-semibold">{prefill.buyerName || '—'} → {prefill.vendorName || '—'}</span>
              </span>
              <button type="button" onClick={() => setPrefill(null)} title="Clear"
                className="flex-shrink-0 text-indigo-400 hover:text-indigo-700 transition-colors cursor-pointer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {batches.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-sm font-bold text-gray-900">SKU Import Batches</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <UploadButton onClick={() => setUploadOpen(true)} />
                {/* Manual/no-file creation now happens inline from PO Drawer's
                    line items table — commented out, not deleted. */}
                {/* <CreateButton onClick={() => setCreateOpen(true)} /> */}
              </div>
            </div>
          )}

          {batches.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center shadow-sm">
              <input type="text" value={filters.search} onChange={e => setFilter('search', e.target.value)}
                placeholder="Search file, buyer, vendor or PO…"
                className="flex-1 min-w-[180px] px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
              <select value={filters.status} onChange={e => setFilter('status', e.target.value)}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:border-gray-900 cursor-pointer">
                <option value="">All Statuses</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
              <select value={filters.buyerName} onChange={e => setFilter('buyerName', e.target.value)}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:border-gray-900 cursor-pointer">
                <option value="">All Buyers</option>
                {buyerOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          )}

          {listError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{listError}</div>
          )}

          {loadingList && (
            <div className="py-24 text-center text-sm text-gray-400">Loading…</div>
          )}

          {!loadingList && batches.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-24 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50">
              <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <h2 className="text-sm font-bold text-gray-900">No SKUs started yet</h2>
              <p className="text-xs text-gray-500 max-w-sm text-center">
                Upload a vendor's Excel sheet to auto-extract details — you'll review and confirm before anything is saved. Creating SKUs by hand now happens inline from a PO's line items table.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <UploadButton onClick={() => setUploadOpen(true)} />
                {/* <CreateButton onClick={() => setCreateOpen(true)} /> */}
              </div>
            </div>
          )}

          {!loadingList && batches.length > 0 && filteredBatches.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-24 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 text-center">
              <p className="text-sm text-gray-500">No batches match these filters</p>
            </div>
          )}

          {!loadingList && filteredBatches.length > 0 && (
          <>
          {/* Table — sm and up */}
          <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">File</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Buyer → Vendor</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Progress</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groupedBatches.map(group => (
                    <Fragment key={group.poNumber ?? '__no_po__'}>
                      <tr className="bg-gray-50">
                        <td colSpan={5} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                          {group.fileName ? group.fileName : 'Manual Entry'}
                        </td>
                      </tr>
                      {group.batches.map(b => (
                        <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 text-gray-900 font-semibold max-w-xs truncate">
                            <div className="flex items-center gap-2">
                              {b.poNumber}
                              <ImportTypeBadge type={b.importType} />
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-700">{b.buyerName} → {b.vendorName}</td>
                          <td className="px-4 py-2.5"><ProgressBar done={b.confirmedRows} total={b.totalRows} /></td>
                          <td className="px-4 py-2.5"><StatusChip status={b.status} /></td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <RowActionButton onClick={() => openBatch(b.id)} disabled={loadingBatch}>
                                {b.status === 'completed' ? 'View' : 'Resume'}
                              </RowActionButton>
                              <ConfirmDeleteButton onConfirm={() => handleDeleteBatch(b.id)} confirmLabel="Delete this batch?" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              </div>
          </div>

          {/* Cards — below sm, one card per batch instead of horizontal scroll */}
          <div className="sm:hidden flex flex-col gap-5">
            {groupedBatches.map(group => (
              <div key={group.poNumber ?? '__no_po__'} className="flex flex-col gap-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 px-0.5">
                  {group.poNumber ? `PO ${group.poNumber}` : 'No PO (legacy)'}
                </div>
                {group.batches.map(b => (
                  <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                          {b.fileName || 'Manual Entry'}
                          <ImportTypeBadge type={b.importType} />
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{b.buyerName} → {b.vendorName}</div>
                      </div>
                      <StatusChip status={b.status} />
                    </div>
                    <ProgressBar done={b.confirmedRows} total={b.totalRows} />
                    <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-gray-100">
                      <RowActionButton onClick={() => openBatch(b.id)} disabled={loadingBatch}>
                        {b.status === 'completed' ? 'View' : 'Resume'}
                      </RowActionButton>
                      <ConfirmDeleteButton onConfirm={() => handleDeleteBatch(b.id)} confirmLabel="Delete this batch?" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          </>
          )}
        </div>
      )}

      <SkuImportUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploaded}
        prefill={prefill}
      />

      {/* Manual/no-file creation now happens inline from PO Drawer's line
          items table — commented out, not deleted. */}
      {/* <SkuCreateModal
        open={_createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={_handleCreated}
        prefill={prefill}
      /> */}

      {activeRow && batch && batch.importType === 'pi' && (
        <PiRowReviewDrawer
          row={activeRow}
          poId={batch.poId}
          poAmount={batch.poAmount}
          poAmountUsd={batch.poAmountUsd}
          poCurrency={batch.poCurrency}
          buyerOrgId={batch.buyerOrgId}
          vendorId={batch.vendorId}
          memberId={memberId}
          piFileUrl={batch.piFileUrl}
          poFileUrl={batch.poFileUrl}
          onClose={() => setActiveRow(null)}
          onSaved={handlePiSaved}
        />
      )}

      {activeRow && batch && batch.importType !== 'pi' && (
        <SkuReviewDrawer
          row={activeRow}
          buyerOrgId={batch.buyerOrgId}
          vendorId={batch.vendorId}
          memberId={memberId}
          piFileUrl={batch.piFileUrl}
          productDetailsFileUrl={batch.productDetailsFileUrl}
          poFileUrl={batch.poFileUrl}
          onClose={() => setActiveRow(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
