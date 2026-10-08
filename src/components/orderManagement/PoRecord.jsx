import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useIsAdmin, useOrgDepartment, useRole } from '../../stores/profileStore'
import { usePoStore, usePORows, usePOStats, usePOLoading, usePOError,
  usePOFilters, usePOMerchants, usePOBuyers, usePOSuppliers,
  usePOTotal, usePOPage, usePOTotalPages, usePOHasMore,
  EMPTY_FILTERS, PO_PAGE_SIZE,
} from '../../stores/poStore'
import { useFetchPOs }           from '../../hooks/useFetchPOs'
import { usePOActions }          from '../../hooks/usePOActions'
import { usePODropdowns }        from '../../hooks/usePODropdowns'
import { usePendingOtifIds }     from '../../hooks/usePendingOtifIds'
import { usePendingShipmentPlanIds } from '../../hooks/usePoShipmentPlans'
import { fetchCommittedPlanQuantities } from '../../utils/committedPlanQuantity'
import PoUploadModal          from './PoUploadModal'
import PiUploadModal          from './PiUploadModal'
import UploadProductSheetModal from './UploadProductSheetModal'
import PiDelayModal           from './PiDelayModal'
import AdvancePaymentModal    from './AdvancePaymentModal'
import CancelOrderModal       from './CancelOrderModal'
import { usePendingLineItemCancellations } from '../../hooks/usePoLineItemCancellations'
import DeletePoModal          from './DeletePoModal'
import RevisePOModal          from './RevisePOModal'
import OtifExceptionModal     from './OtifExceptionModal'
import QualityClaimModal      from './QualityClaimModal'
import PoInstructionsModal    from './PoInstructionsModal'
import PlanShipmentModal      from './PlanShipmentModal'
import MyShipmentPlansDrawer  from './MyShipmentPlansDrawer'
import PoDrawer               from './PoDrawer'
import { fmt$, fmtOriginalAmount, fmtQty, initials, PiBadge, ErpBadge } from './poUtils'

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, accent, icon, pct }) {
  return (
    <div className={`relative bg-white border border-gray-200 rounded-xl p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3 shadow-sm overflow-hidden before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 ${accent}`}>
      <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-200 text-gray-600 [&_svg]:w-3.5 [&_svg]:h-3.5 sm:[&_svg]:w-4 sm:[&_svg]:h-4">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] sm:text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5 truncate">{label}</div>
        <div className="text-base sm:text-2xl font-bold text-gray-900 leading-tight truncate" title={value ?? undefined}>{value ?? '—'}</div>
      </div>
      {pct != null && (
        <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-300 px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0">{pct}</span>
      )}
    </div>
  )
}


function FilterSelect({ label, value, onChange, children }) {
  return (
    <div className="flex flex-col gap-1 min-w-[130px] flex-1">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full pl-2.5 pr-8 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 appearance-none bg-white focus:outline-none focus:border-gray-900 cursor-pointer">
          {children}
        </select>
        <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 stroke-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </div>
    </div>
  )
}
function FilterInput({ label, value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1 min-w-[130px] flex-1">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
    </div>
  )
}

function FilterDate({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1 min-w-[120px] flex-1">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
    </div>
  )
}

function SkeletonRows({ cols }) {
  const widths = [40, 80, 100, 120, 90, 90, 70, 80, 90, 80, 80]
  return Array.from({ length: 8 }, (_, i) => (
    <tr key={i}>
      {Array.from({ length: cols }, (_, j) => (
        <td key={j} className="px-3 py-2">
          <div className="h-3 rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse"
            style={{ width: widths[j % widths.length] }} />
        </td>
      ))}
    </tr>
  ))
}

// Three-dots action menu for a single row
function KebabMenu({ poId, isConfirmed, isErpSynced, canUpload, canSyncERP, canExplainDelay, canDelete, canReportOtif, canSubmitQualityClaim, canUploadProductSheet, hasProductSheet, canSubmitAdvancePayment, canCancelOrder,
  onUpload, onUpdatePo, onRevise, onErpSync, onPiDelay, onDelete, onReportOtif, onSubmitQualityClaim, onUploadProductSheet, onSubmitAdvancePayment, onCancelOrder, actionLoading, open, onOpen, onClose }) {

  const buttonRef = useRef(null)
  const [menuStyle, setMenuStyle] = useState({})

  const hasItems = canUpload || (canSyncERP && !isErpSynced) || (canExplainDelay && !isConfirmed) || (canDelete && !isConfirmed) || (canReportOtif && isConfirmed) || (canSubmitQualityClaim && isConfirmed) || canUploadProductSheet || canSubmitAdvancePayment || canCancelOrder
  if (!hasItems) return null

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const menuHeight = 200
      const openUpward = window.innerHeight - rect.bottom < menuHeight
      setMenuStyle({
        position: 'fixed',
        right: window.innerWidth - rect.right,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
        zIndex: 9999,
        minWidth: 160,
      })
    }
    onOpen()
  }

  const menuContent = open && (
    <div style={menuStyle} className="bg-white border border-gray-200 rounded-lg shadow-lg py-1">

      {/* Update PO — unconfirmed only */}
      {canUpload && !isConfirmed && (
        <button type="button" onClick={() => { onUpdatePo(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200 hover:text-black transition-colors cursor-pointer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Update PO
        </button>
      )}

      {/* Upload PI — unconfirmed only */}
      {canUpload && !isConfirmed && (
        <button type="button" onClick={() => { onUpload(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200 hover:text-black transition-colors cursor-pointer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload PI
        </button>
      )}

      {/* Upload/Update Product Sheet — merch/tech only. Optional at
          PI-upload time; this covers both attaching it later if it wasn't
          provided then, and replacing it afterward. Not gated on
          isConfirmed — the product sheet is independent of PI confirmation
          status. */}
      {canUploadProductSheet && (
        <button type="button" onClick={() => { onUploadProductSheet(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200 hover:text-black transition-colors cursor-pointer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          {hasProductSheet ? 'Update Product Sheet' : 'Upload Product Sheet'}
        </button>
      )}

      {/* Submit Advance Payment — merch/erp/tech write access (everyone else
          in the merchant org gets read-only visibility via PoDrawer.jsx's own
          display, see sql/po_advance_payments.sql's SELECT policy). Available
          regardless of PI confirmation status since an advance can be
          received before or after the PI is confirmed. */}
      {canSubmitAdvancePayment && (
        <button type="button" onClick={() => { onSubmitAdvancePayment(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200 hover:text-black transition-colors cursor-pointer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" /><path d="M9.5 9a2.5 2.5 0 0 1 2.5-2c1.5 0 2.5 1 2.5 2s-1 1.5-2.5 2-2.5 1-2.5 2 1 2 2.5 2a2.5 2.5 0 0 0 2.5-2" />
            <line x1="12" y1="6" x2="12" y2="7.2" /><line x1="12" y1="16.8" x2="12" y2="18" />
          </svg>
          Submit Advance Payment
        </button>
      )}

      {/* Explain PI Delay — unconfirmed, merch only */}
      {canExplainDelay && !isConfirmed && (
        <button type="button" onClick={() => { onPiDelay(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          Explain PI Delay
        </button>
      )}

      {/* Revise PO — confirmed only */}
      {canUpload && isConfirmed && (
        <button type="button" onClick={() => { onRevise(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200 hover:text-black transition-colors cursor-pointer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Revise PO
        </button>
      )}

      {/* Report OTIF Exception — confirmed POs, merch only */}
      {canReportOtif && isConfirmed && (
        <button type="button" onClick={() => { onReportOtif(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Report OTIF Exception
        </button>
      )}

      {canSubmitQualityClaim && isConfirmed && (
        <button type="button" onClick={() => { onSubmitQualityClaim(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Submit Quality Claim
        </button>
      )}

      {canSyncERP && !isErpSynced && (
        <button type="button" disabled={actionLoading[`${poId}-erp`]}
          onClick={() => { onErpSync(poId); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50 cursor-pointer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {actionLoading[`${poId}-erp`] ? 'Syncing…' : 'ERP Sync'}
        </button>
      )}

      {/* Cancel Order — requests cancelling every remaining SKU/quantity on
          the PO at once (goes through the same otif_exceptions review flow
          as the per-SKU Cancel Qty action in PoDrawer.jsx, not an immediate
          delete) */}
      {canCancelOrder && (
        <>
          <div className="my-1 border-t border-gray-100" />
          <button type="button" onClick={() => { onCancelOrder(); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            Cancel Order
          </button>
        </>
      )}

      {/* Delete PO — danger, always last; unconfirmed only. Once the PI is
          confirmed the PO is in real use downstream (line items, shipments,
          etc.) so deleting it outright is no longer safe — Cancel Order
          above is the reviewed way to back out of a confirmed PO instead. */}
      {canDelete && !isConfirmed && (
        <>
          <div className="my-1 border-t border-gray-100" />
          <button type="button" onClick={() => { onDelete(); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Delete PO
          </button>
        </>
      )}
    </div>
  )

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button ref={buttonRef} type="button" onClick={open ? onClose : handleOpen}
        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-200 hover:text-black transition-colors text-gray-500 hover:text-gray-800 cursor-pointer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {menuContent && createPortal(menuContent, document.body)}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PoRecord() {
  const isAdmin = useIsAdmin()
  const dept    = useOrgDepartment()
  const role    = useRole()
  const navigate = useNavigate()

  // Department identity booleans
  const isSenior = isAdmin && !dept          // null dept → cross-org view-only
  const isMerch  = dept === 'merchandising'
  const isErp    = dept === 'erp'
  const isTech   = dept === 'it' || dept === 'tech'

  // Write permissions scoped by department
  const canUpload       = isMerch || isTech || isErp
  const canSyncERP      = isErp   || isTech
  const canReportOtif   = isMerch || isTech
  const canSubmitQualityClaim = isMerch || isTech
  // Merchandising + tech specifically (not the broader isTech, which also
  // covers 'it') — so they can attach the product details sheet later if it
  // wasn't provided during the original PI upload.
  const canUploadProductSheet = isMerch || dept === 'tech'
  // Open to every JNG merchant-org user regardless of department. Narrow
  // this later (by dept / role) if planning needs to be limited to a
  // specific team.
  const canPlanShipment = role === 'Merchant'
  const hasAnyAction    = canUpload || canSyncERP || canReportOtif || canSubmitQualityClaim

  // Column visibility
  const showCheckbox    = isErp || canPlanShipment
  const showMerchantCol = isTech || isSenior
  const showErpStatusCol = isErp       // ERP dept sees ERP status in main row
  const showActionCol   = hasAnyAction

  // Drawer visibility flags (passed to PoDrawer)
  const showReceivedBy = isMerch || isErp   // show received_by field in drawer
  const showErpStatus  = true               // all roles see ERP status in drawer

  // Filter bar: all admins/owners get the merchant dropdown regardless of dept
  const showMerchantFilter = isAdmin

  // Store data
  const rows       = usePORows()
  const stats      = usePOStats()
  const total      = usePOTotal()
  const page       = usePOPage()
  const totalPages = usePOTotalPages()
  const hasMore    = usePOHasMore()
  const loading    = usePOLoading()
  const error      = usePOError()
  const filters    = usePOFilters()
  const merchants  = usePOMerchants()
  const buyers     = usePOBuyers()
  const suppliers  = usePOSuppliers()

  // Store actions
  const setFilters = usePoStore(s => s.setFilters)
  const clearFilters      = usePoStore(s => s.clearFilters)
  


  const fetchPOs                                      = useFetchPOs()
  const { fetchMerchants, fetchDropdowns }            = usePODropdowns()
  const { markErpSynced, bulkMarkErpSynced, addPiDelayComment, deletePO, reportOtifException, uploadProductDetails, submitAdvancePayment, submitQualityClaim } = usePOActions()
  const { pendingIds: pendingOtifIds, fetchPendingOtifIds } = usePendingOtifIds()
  const { pendingPoIds: plannedPoIds, fetchPendingShipmentPlanIds } = usePendingShipmentPlanIds()


    const setFilter = (key, value) => {
    const next = { ...filters, [key]: value }
    setFilters(next)
    fetchPOs(1, next, true)
  }

  const setMerchantFilter = (value) => {
    const next = { ...filters, merchant: value, buyer: '', supplier: '' }
    setFilters(next)
    fetchDropdowns({ merchantName: value })
    fetchPOs(1, next, true)
  }

  const setBuyerFilter = (value) => {
    const next = { ...filters, buyer: value, supplier: '' }
    setFilters(next)
    fetchDropdowns({ merchantName: filters.merchant, buyerName: value })
    fetchPOs(1, next, true)
  }

  const handleClearFilters = () => {
    clearFilters()
    fetchDropdowns()
    fetchPOs(1, EMPTY_FILTERS, true)  // pass explicitly — closure may have stale filters
  }

  const reload = () => fetchPOs(page, filters, true)

  // Local UI state
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [editModalPo, setEditModalPo]     = useState(null)
  const [piModalPo, setPiModalPo]         = useState(null)
  const [piDelayPo, setPiDelayPo]         = useState(null)
  const [advancePaymentPo, setAdvancePaymentPo] = useState(null)
  const [cancelOrderPo, setCancelOrderPo]       = useState(null)
  const [cancelOrderPending, setCancelOrderPending] = useState({}) // po_line_item id -> pending otif_exceptions row, for cancelOrderPo only
  const { fetchPendingCancellations } = usePendingLineItemCancellations()
  const [productSheetPo, setProductSheetPo] = useState(null)
  const [deleteModalPo, setDeleteModalPo] = useState(null)
  const [reviseModalPo, setReviseModalPo]         = useState(null)
  const [otifExceptionPo, setOtifExceptionPo]     = useState(null)
  const [qualityClaimPo, setQualityClaimPo]       = useState(null)
  const [instructionsOpen, setInstructionsOpen]   = useState(false)
  const [planModalOpen, setPlanModalOpen]         = useState(false)
  const [myPlansOpen, setMyPlansOpen]             = useState(false)
  const [drawerPo, setDrawerPo]                 = useState(null)   // PO object shown in right drawer
  const [openMenuId, setOpenMenuId]     = useState(null)   // kebab menu open for which row
  const [actionLoading, setActionLoading] = useState({})
  const [selectedIds, setSelectedIds]   = useState([])     // ERP bulk select
  // id -> full row object, cached at the moment a row is selected — `rows`
  // only ever holds the CURRENT page (it's paginated), so once the user
  // pages away, a row selected on an earlier page would otherwise vanish
  // from `rows.filter(...)`, silently dropping it from a cross-page
  // multi-PO selection. Cleared in lockstep with selectedIds everywhere.
  const [selectedRowsById, setSelectedRowsById] = useState({})
  const [bulkLoading, setBulkLoading]   = useState(false)
  const [filtersOpen, setFiltersOpen]   = useState(false)  // mobile-only filter panel toggle
  const [committedByLineItem, setCommittedByLineItem] = useState({}) // po_line_item id -> qty already sitting in another draft/pending plan

  // Close kebab when clicking outside
  useEffect(() => {
    if (!openMenuId) return
    const close = () => setOpenMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenuId])

  // Init on mount
  useEffect(() => {
    if (isAdmin) fetchMerchants()
    fetchDropdowns()
    fetchPOs(1, undefined, true)
    if (canReportOtif) fetchPendingOtifIds()
    if (canPlanShipment) fetchPendingShipmentPlanIds()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A PO's checkbox is only worth showing for planning once at least one of
  // its SKUs still has quantity left to plan — otherwise every line in
  // PlanShipmentModal would come up "0 left" and there'd be nothing to do.
  // Refetched whenever the visible page of rows changes.
  useEffect(() => {
    if (!canPlanShipment) return
    const lineItemIds = rows.flatMap(po => (po.po_line_items || []).map(li => li.id))
    if (!lineItemIds.length) { setCommittedByLineItem({}); return }
    fetchCommittedPlanQuantities(lineItemIds).then(setCommittedByLineItem)
  }, [rows, canPlanShipment])

  // ── Row actions ───────────────────────────────────────────────────────────
  // Fetches pending cancellations for this PO's own line items right before
  // opening the modal — PoRecord's row list doesn't otherwise track this,
  // unlike PoDrawer.jsx which keeps it live for whichever PO is open.
  const openCancelOrder = (po) => {
    setCancelOrderPo(po)
    setCancelOrderPending({})
    fetchPendingCancellations((po.po_line_items || []).map(li => li.id))
      .then(map => setCancelOrderPending(Object.fromEntries(map)))
  }

  const handleErpSync = useCallback(async (poId) => {
    const key = `${poId}-erp`
    setActionLoading(prev => ({ ...prev, [key]: true }))
    try { await markErpSynced(poId) }
    catch (err) { console.error('ERP sync failed:', err.message) }
    finally { setActionLoading(prev => ({ ...prev, [key]: false })) }
  }, [markErpSynced])

  const clearSelection = () => { setSelectedIds([]); setSelectedRowsById({}) }

  // ── Bulk ERP sync ─────────────────────────────────────────────────────────
  const handleBulkErpSync = async () => {
    if (!selectedIds.length) return
    setBulkLoading(true)
    try { await bulkMarkErpSynced(selectedIds); clearSelection() }
    catch (err) { console.error('Bulk ERP sync failed:', err.message) }
    finally { setBulkLoading(false) }
  }

  const toggleSelectRow = (id) => {
    const isSelected = selectedIds.includes(id)
    setSelectedIds(prev => isSelected ? prev.filter(x => x !== id) : [...prev, id])
    setSelectedRowsById(prev => {
      if (isSelected) {
        const { [id]: _omit, ...rest } = prev
        return rest
      }
      const row = rows.find(r => r.id === id)
      return row ? { ...prev, [id]: row } : prev
    })
  }

  // A PO can now hold more than one simultaneously-active plan (shipped in
  // batches), so already having a plan no longer excludes a PO from being
  // selected/planned again — plannedPoIds is purely informational (the
  // "Planned" badge) from here on. What DOES exclude it is having nothing
  // left to plan at all (every SKU's balance is already fully committed to
  // other draft/pending plans) — the checkbox is dual-purpose (ERP bulk
  // sync + plan-for-shipment), so ERP dept keeps it regardless.
  const isFullyCommittedForPlanning = (po) => {
    const lines = po.po_line_items || []
    if (!lines.length) return false
    return lines.every(li => Math.max(0, (Number(li.balance_quantity) || 0) - (committedByLineItem[li.id] || 0)) <= 0)
  }
  const showRowCheckbox = (po) => isErp || (canPlanShipment && !isFullyCommittedForPlanning(po))
  const selectableRows = rows.filter(showRowCheckbox)
  const allPageSelected = selectableRows.length > 0 && selectableRows.every(r => selectedIds.includes(r.id))
  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds(prev => prev.filter(id => !selectableRows.find(r => r.id === id)))
      setSelectedRowsById(prev => {
        const next = { ...prev }
        selectableRows.forEach(r => { delete next[r.id] })
        return next
      })
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...selectableRows.map(r => r.id)])])
      setSelectedRowsById(prev => {
        const next = { ...prev }
        selectableRows.forEach(r => { next[r.id] = r })
        return next
      })
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasActiveFilters = Object.values(filters).some(Boolean)
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const confirmed  = stats?.confirmed_count ?? 0
  const pending    = stats?.pending_count   ?? 0
  const statsTotal = confirmed + pending
  const pctOf = (n) => statsTotal ? `${Math.round(n / statsTotal * 100)}%` : null

  // ── Table rows ────────────────────────────────────────────────────────────
  const tableRows = rows.map(po => {
    const isConfirmed = po.pi_confirmed === true || !!po.pi_file_url
    const isErpSynced = po.erp_synced === true
    const isSelected  = selectedIds.includes(po.id)

    return (
      <tr key={po.id} onClick={() => setDrawerPo(po)}
        className={`border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-50' : ''}`}>

        {/* Checkbox — ERP (bulk ERP sync) or merchandising/admin (plan for shipment).
            Omitted for a row with nothing left to plan, unless ERP still needs it for sync. */}
        {showCheckbox && (
          <td className="px-3 py-1.5 w-8" onClick={e => e.stopPropagation()}>
            {showRowCheckbox(po) && (
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelectRow(po.id)}
                className="w-3.5 h-3.5 rounded border-gray-300 accent-blue-600 cursor-pointer" />
            )}
          </td>
        )}

        {/* Merchant — tech / senior only */}
        {showMerchantCol && (
          <td className="px-3 py-1.5 text-xs text-gray-700">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                {initials(po.on_behalf_of_name || po.created_by)}
              </span>
              {po.on_behalf_of_name || po.created_by || '—'}
            </span>
          </td>
        )}

        {/* Buyer */}
        <td className="px-3 py-1.5 text-xs text-gray-700">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
              {initials(po.buyer_name)}
            </span>
            {po.buyer_name || '—'}
          </span>
        </td>

        <td className="px-3 py-1.5 text-xs font-semibold text-gray-900">
          <span className="inline-flex items-center gap-1.5">
            {po.po_number || '—'}
            {canPlanShipment && plannedPoIds.has(po.id) && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 whitespace-nowrap"
                title="Has an active shipment plan — can still be planned again for another batch">
                Planned
              </span>
            )}
          </span>
        </td>
        <td className="px-3 py-1.5 text-xs text-gray-700">{po.supplier_name || '—'}</td>
        <td className="px-3 py-1.5 text-xs text-gray-600">{po.po_received_date || '—'}</td>
        <td className="px-3 py-1.5 text-xs text-gray-600">
          {po.exceptional_ex_factory_date ? (
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1">
                <span className="font-medium text-amber-700">{po.exceptional_ex_factory_date}</span>
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 leading-none">EXC</span>
              </span>
              <span className="text-[10px] text-gray-400 line-through">{po.ex_factory_date || '—'}</span>
            </span>
          ) : (po.ex_factory_date || '—')}
        </td>
        <td className="px-3 py-1.5 text-xs text-gray-700">{fmtQty(po.quantity_ordered)}</td>
        <td className="px-3 py-1.5 text-xs text-gray-700">
          {fmtQty((po.po_line_items || []).reduce((s, li) => s + (li.cancelled_quantity || 0), 0))}
        </td>
        <td className="px-3 py-1.5 text-xs font-semibold text-emerald-700">
          {(isTech || isAdmin) ? (po.amount_usd != null ? fmt$(po.amount_usd) : fmtOriginalAmount(po)) : fmtOriginalAmount(po)}
        </td>

        {/* PI Status — all */}
        <td className="px-3 py-1.5"><PiBadge confirmed={isConfirmed} /></td>

        {/* ERP Status in main row — ERP dept only */}
        {showErpStatusCol && (
          <td className="px-3 py-1.5"><ErpBadge synced={isErpSynced} /></td>
        )}

        {/* Three-dots action menu */}
        {showActionCol && (
          <td className="px-3 py-1.5 text-right">
            <KebabMenu
              poId={po.id}
              isConfirmed={isConfirmed}
              isErpSynced={isErpSynced}
              canUpload={canUpload}
              canSyncERP={canSyncERP}
              canExplainDelay={isMerch}
              canDelete={canUpload}
              canReportOtif={canReportOtif && !pendingOtifIds.has(po.id)}
              canSubmitQualityClaim={canSubmitQualityClaim}
              canUploadProductSheet={canUploadProductSheet}
              hasProductSheet={!!po.product_details_file_url}
              canSubmitAdvancePayment={isMerch || isTech || isErp}
              canCancelOrder={isMerch || isTech}
              onUpload={() => setPiModalPo(po)}
              onUpdatePo={() => setEditModalPo(po)}
              onRevise={() => setReviseModalPo(po)}
              onPiDelay={() => setPiDelayPo(po)}
              onDelete={() => setDeleteModalPo(po)}
              onReportOtif={() => setOtifExceptionPo(po)}
              onSubmitQualityClaim={() => setQualityClaimPo(po)}
              onUploadProductSheet={() => setProductSheetPo(po)}
              onSubmitAdvancePayment={() => setAdvancePaymentPo(po)}
              onCancelOrder={() => openCancelOrder(po)}
              onErpSync={handleErpSync}
              actionLoading={actionLoading}
              open={openMenuId === po.id}
              onOpen={() => setOpenMenuId(po.id)}
              onClose={() => setOpenMenuId(null)}
            />
          </td>
        )}
      </tr>
    )
  })

  // ── Card rows (mobile — sm:hidden) ───────────────────────────────────────
  const cardRows = rows.map(po => {
    const isConfirmed = po.pi_confirmed === true || !!po.pi_file_url
    const isErpSynced = po.erp_synced === true
    const isSelected  = selectedIds.includes(po.id)

    return (
      <div key={po.id} onClick={() => setDrawerPo(po)}
        className={`bg-white border rounded-xl p-3.5 shadow-sm flex flex-col gap-2.5 cursor-pointer transition-colors ${isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>

        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {showCheckbox && showRowCheckbox(po) && (
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelectRow(po.id)}
                onClick={e => e.stopPropagation()}
                className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer flex-shrink-0" />
            )}
            <span className="w-7 h-7 rounded-full bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {initials(po.buyer_name)}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate flex items-center gap-1.5">
                {po.po_number || '—'}
                {canPlanShipment && plannedPoIds.has(po.id) && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 whitespace-nowrap"
                title="Has an active shipment plan — can still be planned again for another batch">
                Planned
              </span>
                )}
              </div>
              <div className="text-xs text-gray-500 truncate">{po.buyer_name || '—'} → {po.supplier_name || '—'}</div>
            </div>
          </div>
          {showActionCol && (
            <KebabMenu
              poId={po.id}
              isConfirmed={isConfirmed}
              isErpSynced={isErpSynced}
              canUpload={canUpload}
              canSyncERP={canSyncERP}
              canExplainDelay={isMerch}
              canDelete={canUpload}
              canReportOtif={canReportOtif && !pendingOtifIds.has(po.id)}
              canSubmitQualityClaim={canSubmitQualityClaim}
              canUploadProductSheet={canUploadProductSheet}
              hasProductSheet={!!po.product_details_file_url}
              canSubmitAdvancePayment={isMerch || isTech || isErp}
              canCancelOrder={isMerch || isTech}
              onUpload={() => setPiModalPo(po)}
              onUpdatePo={() => setEditModalPo(po)}
              onRevise={() => setReviseModalPo(po)}
              onPiDelay={() => setPiDelayPo(po)}
              onDelete={() => setDeleteModalPo(po)}
              onReportOtif={() => setOtifExceptionPo(po)}
              onSubmitQualityClaim={() => setQualityClaimPo(po)}
              onUploadProductSheet={() => setProductSheetPo(po)}
              onSubmitAdvancePayment={() => setAdvancePaymentPo(po)}
              onCancelOrder={() => openCancelOrder(po)}
              onErpSync={handleErpSync}
              actionLoading={actionLoading}
              open={openMenuId === po.id}
              onOpen={() => setOpenMenuId(po.id)}
              onClose={() => setOpenMenuId(null)}
            />
          )}
        </div>

        {showMerchantCol && (
          <div className="text-xs text-gray-500">
            Merchant: <span className="text-gray-700 font-medium">{po.on_behalf_of_name || po.created_by || '—'}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div>
            <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">PO Date</div>
            <div className="text-xs text-gray-700 mt-0.5">{po.po_received_date || '—'}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Ex-Factory</div>
            <div className="text-xs text-gray-700 mt-0.5">
              {po.exceptional_ex_factory_date ? (
                <span className="flex items-center gap-1 flex-wrap">
                  <span className="font-medium text-amber-700">{po.exceptional_ex_factory_date}</span>
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 leading-none">EXC</span>
                </span>
              ) : (po.ex_factory_date || '—')}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Qty</div>
            <div className="text-xs text-gray-700 mt-0.5">{fmtQty(po.quantity_ordered)}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Cancelled Qty</div>
            <div className="text-xs text-gray-700 mt-0.5">{fmtQty((po.po_line_items || []).reduce((s, li) => s + (li.cancelled_quantity || 0), 0))}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Amount</div>
            <div className="text-xs font-semibold text-emerald-700 mt-0.5">
              {(isTech || isAdmin) ? (po.amount_usd != null ? fmt$(po.amount_usd) : fmtOriginalAmount(po)) : fmtOriginalAmount(po)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 mt-0.5 border-t border-gray-100">
          <PiBadge confirmed={isConfirmed} />
          {showErpStatusCol && <ErpBadge synced={isErpSynced} />}
        </div>
      </div>
    )
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="py-4 px-4 space-y-4 text-sm">

      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mt-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center text-white flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-tight">PO Summary Dashboard</h2>
            <p className="text-xs text-gray-500">Overview of all purchase orders</p>
          </div>
        </div>
        <div className="flex flex-nowrap items-center gap-3 sm:gap-4">
          {canUpload &&
          <button type="button" onClick={() => setUploadModalOpen(true)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-lg border border-gray-200 bg-black text-xs font-medium text-white hover:bg-neutral-800 transition-colors cursor-pointer whitespace-nowrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          Upload PO
        </button>}
        {/* Downgraded to plain icon+label on mobile — no border/bg, so they don't compete for width with the real buttons */}
        <button type="button" onClick={reload}
          className="flex-shrink-0 inline-flex items-center gap-1 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:rounded-lg sm:border sm:border-gray-200 sm:bg-white text-xs font-medium text-gray-500 hover:text-gray-800 sm:text-gray-600 sm:hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Refresh
        </button>
        <button type="button" onClick={() => setInstructionsOpen(true)}
          className="flex-shrink-0 inline-flex items-center gap-1 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:rounded-lg sm:border sm:border-gray-200 sm:bg-white text-xs font-medium text-gray-500 hover:text-gray-800 sm:text-gray-600 sm:hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          Instructions
        </button>
        {canPlanShipment &&
        <button type="button" onClick={() => setMyPlansOpen(true)}
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="sm:hidden">Planned Shipments</span>
          <span className="hidden sm:inline">My Planned Shipments</span>
        </button>}
        {/* Distinct indigo treatment (vs. the plain white utility buttons
            around it) — this one navigates away to a different page
            entirely, not an in-page action. */}
        <button type="button" onClick={() => navigate('/dashboard/logistics?tab=shipment-containers')}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer whitespace-nowrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          Shipment &amp; Planning
        </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        {/* Mobile-only toggle — filters stay collapsed by default so the stats/table aren't pushed below the fold */}
        <button type="button" onClick={() => setFiltersOpen(o => !o)}
          className="sm:hidden w-full flex items-center justify-between px-4 py-3 cursor-pointer">
          <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="text-[10px] font-bold text-white bg-gray-900 w-4 h-4 rounded-full flex items-center justify-center">{activeFilterCount}</span>
            )}
          </span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <div className={`${filtersOpen ? 'flex' : 'hidden'} sm:flex flex-wrap gap-3 items-end px-4 pb-3 pt-0 sm:py-3 border-t border-gray-100 sm:border-t-0`}>
        <FilterDate label="Date From" value={filters.dateFrom} onChange={v => setFilter('dateFrom', v)} />
        <FilterDate label="Date To"   value={filters.dateTo}   onChange={v => setFilter('dateTo', v)} />
        {showMerchantFilter && (
          <FilterSelect label="Merchant" value={filters.merchant} onChange={setMerchantFilter}>
            <option value="">All Merchants</option>
            {merchants.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
          </FilterSelect>
        )}
        {buyers.length > 1 && (
          <FilterSelect label="Buyer" value={filters.buyer} onChange={setBuyerFilter}>
            <option value="">All Buyers</option>
            {buyers.map(b => <option key={b.display_name} value={b.display_name}>{b.display_name}</option>)}
          </FilterSelect>
        )}
        <FilterSelect label="Supplier" value={filters.supplier} onChange={v => setFilter('supplier', v)}>
          <option value="">All Suppliers</option>
          {suppliers.map(s => <option key={s.display_name} value={s.display_name}>{s.display_name}</option>)}
        </FilterSelect>
        <FilterInput label="PO Number" value={filters.poNumber} onChange={v => setFilter('poNumber', v)} placeholder="Search PO…" />
        <FilterSelect label="PI Status" value={filters.piStatus} onChange={v => setFilter('piStatus', v)}>
          <option value="">All PI Status</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending PI</option>
        </FilterSelect>
        <FilterSelect label="Exception" value={filters.exceptionStatus} onChange={v => setFilter('exceptionStatus', v)}>
          <option value="">All</option>
          <option value="exception">With Exception</option>
        </FilterSelect>
        {(showErpStatusCol || isSenior || isTech) && (
          <FilterSelect label="ERP Status" value={filters.erpStatus} onChange={v => setFilter('erpStatus', v)}>
            <option value="">All ERP Status</option>
            <option value="synced">ERP Synced</option>
            <option value="pending">Not Synced</option>
          </FilterSelect>
        )}
        {hasActiveFilters && (
          <button type="button" onClick={handleClearFilters}
            className="inline-flex items-center gap-1 self-end px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-500 hover:bg-red-100 transition-colors whitespace-nowrap">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Clear
          </button>
        )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Total POs" value={statsTotal} accent="before:bg-gray-900"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>} />
        <StatCard label="PI Confirmed" value={confirmed} accent="before:bg-emerald-500" pct={pctOf(confirmed)}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>} />
        <StatCard label="PI Pending" value={pending} accent="before:bg-amber-400" pct={pctOf(pending)}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>} />
      </div>

      {/* Bulk ERP sync action bar — ERP dept only */}
      {isErp && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-1.5 bg-blue-50 border border-blue-200 rounded-xl shadow-sm">
          <span className="text-xs font-semibold text-blue-800">{selectedIds.length} row{selectedIds.length > 1 ? 's' : ''} selected</span>
          <button type="button" onClick={handleBulkErpSync} disabled={bulkLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {bulkLoading
              ? <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            }
            {bulkLoading ? 'Syncing…' : 'Sync Selected'}
          </button>
          <button type="button" onClick={clearSelection}
            className="text-[11px] text-blue-600 hover:underline ml-1">
            Clear selection
          </button>
        </div>
      )}

      {/* Bulk "Plan for Shipment" action bar — merchandising/admin only.
          Sticky so it stays reachable while scrolling further down the
          table to select more POs, instead of having to scroll back up. */}
      {canPlanShipment && selectedIds.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 px-4 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl shadow-sm">
          <span className="text-xs font-semibold text-indigo-800">{selectedIds.length} PO{selectedIds.length > 1 ? 's' : ''} selected</span>
          <button type="button" onClick={() => setPlanModalOpen(true)}
            className="inline-flex items-center cursor-pointer gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Plan for Shipment
          </button>
          <button type="button" onClick={clearSelection}
            className="text-[11px] cursor-pointer text-indigo-600 hover:underline ml-1">
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">

        {loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs"><tbody><SkeletonRows cols={8 + (showCheckbox ? 1 : 0) + (showMerchantCol ? 1 : 0) + (showErpStatusCol ? 1 : 0) + (showActionCol ? 1 : 0)} /></tbody></table>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-gray-500">{error}</p>
            <button type="button" onClick={reload}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50">Retry</button>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-sm text-gray-500">
              {hasActiveFilters ? 'No results match your filters' : 'No purchase orders found'}
            </p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-[11px] text-gray-500">
                Showing {(page - 1) * PO_PAGE_SIZE + 1}–{(page - 1) * PO_PAGE_SIZE + rows.length} of {total}
              </span>
            </div>
            {/* Table — sm and up */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {showCheckbox && (
                      <th className="w-8 px-3 py-1.5">
                        <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll}
                          className="w-3.5 h-3.5 rounded border-gray-300 accent-blue-600 cursor-pointer" />
                      </th>
                    )}
                    {showMerchantCol && <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Merchant</th>}
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Buyer</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">PO Number</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Supplier</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">PO Date</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Ex-Factory</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Qty</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Cancelled Qty</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">PI Status</th>
                    {showErpStatusCol && <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">ERP</th>}
                    {showActionCol && <th className="px-3 py-1.5 w-10" />}
                  </tr>
                </thead>
                <tbody>{tableRows}</tbody>
              </table>
            </div>

            {/* Cards — below sm, one card per PO instead of horizontal scroll */}
            <div className="sm:hidden flex flex-col gap-2.5 p-3">
              {cardRows}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-3 px-4 py-1.5 border-t border-gray-100 bg-gray-50">
                <button type="button" disabled={page <= 1} onClick={() => fetchPOs(page - 1, undefined, false)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-medium text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                  Prev
                </button>
                <span className="text-[11px] text-gray-500">Page {page} of {totalPages}</span>
                <button type="button" disabled={!hasMore} onClick={() => fetchPOs(page + 1, undefined, false)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-medium text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  Next
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* PI upload modal */}
      <PiUploadModal
        po={piModalPo}
        onClose={() => setPiModalPo(null)}
        onSuccess={reload}
      />

      {/* PI delay reason modal */}
      <PiDelayModal
        po={piDelayPo}
        onClose={() => setPiDelayPo(null)}
        onSubmit={(comment) => addPiDelayComment(piDelayPo.id, comment)}
      />

      {/* Advance payment modal */}
      <AdvancePaymentModal
        po={advancePaymentPo}
        onClose={() => setAdvancePaymentPo(null)}
        onSubmit={(payload) => submitAdvancePayment(advancePaymentPo, payload)}
      />

      <CancelOrderModal
        key={cancelOrderPo?.id}
        po={cancelOrderPo}
        pendingCancellations={cancelOrderPending}
        onClose={() => setCancelOrderPo(null)}
        onSubmitted={() => {
          fetchPendingCancellations((cancelOrderPo.po_line_items || []).map(li => li.id))
            .then(map => setCancelOrderPending(Object.fromEntries(map)))
        }}
      />

      {/* Standalone product sheet upload — catch-up path for when it wasn't
          attached during the original PI upload */}
      <UploadProductSheetModal
        po={productSheetPo}
        onClose={() => setProductSheetPo(null)}
        onUpload={(file) => uploadProductDetails(productSheetPo.id, file)}
        onSuccess={reload}
      />

      {/* Delete PO modal */}
      <DeletePoModal
        po={deleteModalPo}
        onClose={() => setDeleteModalPo(null)}
        onConfirm={async (reason) => { await deletePO(deleteModalPo.id, reason); reload() }}
      />

      {/* Revise PO modal — confirmed POs only */}
      <RevisePOModal
        po={reviseModalPo}
        onClose={() => setReviseModalPo(null)}
        onSuccess={reload}
      />

      {/* Quality Claim modal — confirmed POs, merch/tech only */}
      <QualityClaimModal
        key={qualityClaimPo?.id}
        po={qualityClaimPo}
        onClose={() => setQualityClaimPo(null)}
        onSubmit={({ claimType, lineItemId, description, proofImage, status, resolutionNote }) =>
          submitQualityClaim(qualityClaimPo.id, { claimType, lineItemId, description, proofImage, status, resolutionNote })
        }
      />

      {/* OTIF Exception modal — confirmed POs, merch only */}
      <OtifExceptionModal
        key={otifExceptionPo?.id}
        po={otifExceptionPo}
        onClose={() => setOtifExceptionPo(null)}
        onSubmit={async ({ reason, comment, proofImage, proposedExFactoryDate }) => {
          await reportOtifException(otifExceptionPo.id, { reason, comment, proofImage, proposedExFactoryDate })
          fetchPendingOtifIds()
        }}
      />

      {/* Upload modal — create mode */}
      <PoUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={reload}
      />

      {/* Upload modal — edit/update mode */}
      <PoUploadModal
        open={!!editModalPo}
        editPo={editModalPo}
        onClose={() => setEditModalPo(null)}
        onSuccess={reload}
      />

      {/* Instructions modal */}
      <PoInstructionsModal
        open={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
      />

      {/* Plan for Shipment modal — merchandising/admin only */}
      <PlanShipmentModal
        open={planModalOpen}
        pos={selectedIds.map(id => selectedRowsById[id]).filter(Boolean)}
        onClose={() => setPlanModalOpen(false)}
        onSuccess={() => { clearSelection(); fetchPendingShipmentPlanIds() }}
      />

      {/* My Planned Shipments drawer — merchandising/admin only */}
      <MyShipmentPlansDrawer
        open={myPlansOpen}
        onClose={() => setMyPlansOpen(false)}
        onChanged={fetchPendingShipmentPlanIds}
      />

      {/* Right drawer */}
      <PoDrawer
        po={drawerPo}
        onClose={() => setDrawerPo(null)}
        showReceivedBy={showReceivedBy}
        showErpStatus={showErpStatus}
      />
    </div>
  )
}