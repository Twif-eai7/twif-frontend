import { useEffect, useMemo, useRef, useState } from 'react'
import { groupReports } from './repositoryLayout'
import RepositoryPoDrawer from './RepositoryPoDrawer'
import { RESULT_LABEL } from './inspectionReport/stageStatus'
// A real stateful component (portaled popover, sticky-header-aware
// positioning), not a trivial one-liner - reused via import rather than
// duplicated, unlike this file's other small local copies below.
import { ExcelFilterHeader, FilterChecklistBody } from './PoInspectionComments'
import { FilterIcon, FilterField, FilterSheetShell } from './MobileFilterPrimitives'
import SearchableSelect from '../ui/SearchableSelect'
import { downloadSummaryXlsx } from '../../utils/xlsxExport'
import { downloadSummaryPdf } from '../../utils/pdfExport'

// RESULT_LABEL also carries the pre-decision workflow states (Making a
// Plan/Plan Ready) and Resubmit - not real outcomes to filter a
// completed-reports list by, so the Status filter only offers the ones a
// report actually gets submitted with. Feedback in Progress is included
// alongside Plan Aborted/On Hold - not a final verdict, but still a real,
// filterable submitted status.
const STATUS_FILTER_KEYS = ['plan_aborted', 'accepted', 'partially_accepted', 'accepted_with_deviations', 'rejected', 'on_hold', 'feedback_inprogress']

// Which date column Date From/To narrows by - a PO row shows three
// different dates (Target/Ex-Factory/Inspection), and leaving this
// unstated (always Target Date, silently) made it unclear which one a
// filled-in range was actually filtering by.
const DATE_COLUMN_OPTIONS = [
  { value: 'target',     label: 'Target Date' },
  { value: 'exFactory',  label: 'Ex-Factory Date' },
  { value: 'inspection', label: 'Inspection Date' },
]
const DATE_COLUMN_GETTERS = { target: g => g.targetDate, exFactory: g => g.exFactoryDate, inspection: g => g.lastInspectionDate }

// Same small labeled-filter shape PoRecord.jsx's own FilterDate/FilterSelect
// use, kept as local copies here rather than an import across feature-
// module boundaries.
function FilterDate({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
    </div>
  )
}
function FilterSelect({ label, value, onChange, children }) {
  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
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

// Same helper PoRecord.jsx's own poUtils.jsx exports, kept as a small local
// copy here rather than an import across feature-module boundaries.
function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function ExportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

// The bulk Export (CSV/Excel/PDF) button + dropdown - its own component
// (own ref/state) so it can be mounted twice (desktop's Date/Status row,
// mobile's search row) without two instances fighting over one outside-
// click ref, matching the "keep box two just an Export button" mobile ask.
function ExportMenuButton({ count, disabled, onExport }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        title={`Export all ${count} matching PO${count === 1 ? '' : 's'}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
      >
        <ExportIcon />
        Export
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {[
            { key: 'csv', label: 'CSV' },
            { key: 'excel', label: 'Excel (.xlsx)' },
            { key: 'pdf', label: 'PDF' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => { onExport(key); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Same 0=inline/1=midline/2=final ordering repositoryLayout.js's own
// STAGE_ORDER/highestPoStage already use.
const STAGE_ORDER_LABEL = ['Inline', 'Midline', 'Final']
function stageCell(highestPoStage) {
  if (highestPoStage == null || highestPoStage < 0) return <span className="text-gray-300">-</span>
  return <span className="text-gray-700">{STAGE_ORDER_LABEL[highestPoStage]}</span>
}

// SKU count with its total ordered quantity in parens, e.g. "6 (15)" -
// shared by the Ordered SKUs and Submitted SKUs cells below.
function countWithQty(count, qty) {
  if (count == null) return '-'
  return qty ? `${count} (${qty.toLocaleString()})` : count
}

// Same "YYYY-MM-DD"-vs-full-timestamp handling QcReportsSummary.jsx's own
// fmtDisplayDate uses, kept as a small local copy here rather than an
// export neither file currently has.
function fmtDisplayDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`)
  return isNaN(d) ? dateStr : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// One row per PO, matching the table's own columns (split into separate
// count/qty columns here rather than the table's combined "6 (15)" cell -
// more useful in a spreadsheet than in one text field). Built from
// `groups` directly (the full filtered list, never just the current page),
// so exporting always reflects every PO the current filters/search match,
// not only whatever's visible on screen.
function buildExportRows(groups) {
  const headers = ['PO', 'Customer', 'Vendor', 'Target Date', 'Ex-Factory Date', 'Ordered SKUs', 'Ordered Qty', 'Submitted SKUs', 'Submitted Qty', 'Assigned QA', 'Inspection Date', 'Stage']
  const rows = groups.map(g => [
    g.poNumber || '-',
    g.buyerName || '-',
    g.vendorName || '-',
    fmtDisplayDate(g.targetDate),
    fmtDisplayDate(g.exFactoryDate),
    g.orderedSkuCount ?? '-',
    g.orderedQty ?? '-',
    g.submittedAtHighestStageCount,
    g.submittedAtHighestStageQty || '-',
    qaLabel(g.qaNames),
    fmtDisplayDate(g.lastInspectionDate),
    g.highestPoStage == null || g.highestPoStage < 0 ? '-' : STAGE_ORDER_LABEL[g.highestPoStage],
  ])
  return { headers, rows }
}

// No CSV library already in this codebase to reuse (unlike xlsx/PDF, which
// already have downloadSummaryXlsx/downloadSummaryPdf) - plain enough to
// build inline rather than adding one for a single call site.
function downloadCsv(headers, rows, filename) {
  const escape = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// g.qaNames is every distinct QA who touched any SKU on this PO - usually
// just one. Shows the first plus a "+N" count when there's more than one,
// rather than a name list that could run arbitrarily long in a single cell.
function qaLabel(qaNames) {
  if (!qaNames.length) return '-'
  return qaNames.length === 1 ? qaNames[0] : `${qaNames[0]} +${qaNames.length - 1}`
}

// Shown instead of "No reports match." while the underlying trend data is
// still loading - an empty table with that message reads as "there's
// genuinely nothing here," not "still coming," which is exactly what made
// this page feel stuck on a slow connection. A handful of pulsing bars
// (rough column layout, not exact) signals "in progress" the way a bare
// empty state can't.
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      {Array.from({ length: 11 }, (_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div className="h-3 rounded bg-gray-200 animate-pulse" style={{ width: `${50 + (i % 4) * 12}%` }} />
        </td>
      ))}
    </tr>
  )
}
function SkeletonCard() {
  return (
    <div className="border border-gray-200 rounded-lg bg-white p-3 space-y-2">
      <div className="h-3 w-1/3 rounded bg-gray-200 animate-pulse" />
      <div className="h-3 w-2/3 rounded bg-gray-200 animate-pulse" />
      <div className="h-3 w-1/2 rounded bg-gray-200 animate-pulse" />
    </div>
  )
}

// One line per PO, matching PoRecord.jsx's "Daily PO and PI records" row
// style exactly - clicking the row (anywhere but its own quick-export icon)
// opens RepositoryPoDrawer with that PO's SKU-level detail, same as
// PoRecord.jsx's rows opening PoDrawer.
function PoRow({ g, selectedSkuKeys, onOpenDrawer, onExportPo, vendorRegionByName }) {
  const selectedCount = g.skuGroups.filter(sg => selectedSkuKeys.has(String(sg.skuKey))).length
  return (
    <tr
      onClick={() => onOpenDrawer(g)}
      className="border-b border-gray-200 odd:bg-sky-50 even:bg-blue-50/40 hover:bg-sky-100 cursor-pointer transition-colors"
    >
      <td className="px-3 py-1.5 text-left whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-900">
          {g.poNumber || '-'}
          {g.hasRejected && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="Has a rejected SKU" />}
        </span>
      </td>
      <td className="px-3 py-1.5 text-xs text-gray-700 text-left whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
            {initials(g.buyerName)}
          </span>
          {g.buyerName || '-'}
        </span>
      </td>
      <td className="px-3 py-1.5 text-xs text-gray-700 text-left whitespace-nowrap">{g.vendorName || '-'}</td>
      <td className="px-3 py-1.5 text-xs text-gray-700 text-left whitespace-nowrap">{vendorRegionByName?.get(g.vendorName) || '-'}</td>
      <td className="px-3 py-1.5 text-xs text-gray-600 text-left whitespace-nowrap">{fmtDisplayDate(g.targetDate)}</td>
      <td className="px-3 py-1.5 text-xs text-gray-600 text-left whitespace-nowrap">{fmtDisplayDate(g.exFactoryDate)}</td>
      <td className="px-3 py-1.5 text-xs text-gray-700 text-left whitespace-nowrap">{countWithQty(g.orderedSkuCount, g.orderedQty)}</td>
      <td className="px-3 py-1.5 text-xs text-gray-700 text-left whitespace-nowrap">
        {/* Scoped to SKUs that reached the PO's furthest stage specifically
            (submittedAtHighestStageCount/Qty) - NOT every SKU with any
            submitted report regardless of stage (skuGroups.length/orderQty,
            still used below for export enablement). Otherwise this number
            could count SKUs still sitting at an earlier stage as if they
            were part of what "Stage" says, e.g. showing "5" next to "Final"
            when only 3 SKUs have actually submitted a Final report. */}
        {countWithQty(g.submittedAtHighestStageCount, g.submittedAtHighestStageQty)}
        {selectedCount > 0 && <span className="text-gray-900 font-semibold"> · {selectedCount} selected</span>}
      </td>
      <td className="px-3 py-1.5 text-xs text-gray-700 text-left whitespace-nowrap">{qaLabel(g.qaNames)}</td>
      <td className="px-3 py-1.5 text-xs text-gray-600 text-left whitespace-nowrap">{fmtDisplayDate(g.lastInspectionDate)}</td>
      <td className="px-3 py-1.5 text-xs text-left whitespace-nowrap">{stageCell(g.highestPoStage)}</td>
      <td className="px-3 py-1.5 text-left whitespace-nowrap">
        <button
          type="button"
          disabled={g.skuGroups.length === 0}
          aria-label={`Export PO ${g.poNumber || ''}${selectedCount > 0 ? ' (selected SKUs)' : ''}`}
          title={g.skuGroups.length === 0 ? 'No submitted reports yet' : selectedCount > 0 ? `Export ${selectedCount} selected SKU${selectedCount === 1 ? '' : 's'}` : 'Export all SKUs'}
          onClick={(e) => { e.stopPropagation(); onExportPo(g.poId) }}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
        >
          <ExportIcon />
        </button>
      </td>
    </tr>
  )
}

// Mobile counterpart to PoRow - same data, same tap-opens-drawer/tap-
// export-stops-propagation behavior, just stacked into a card instead of
// table cells (a plain <table> with 11 whitespace-nowrap columns has no way
// to not force horizontal scroll on a phone). Reuses every formatter PoRow
// itself uses (initials/stageCell/countWithQty/qaLabel/fmtDisplayDate) so
// the two stay in sync rather than drifting into their own formatting.
function PoCard({ g, selectedSkuKeys, onOpenDrawer, onExportPo, vendorRegionByName }) {
  const selectedCount = g.skuGroups.filter(sg => selectedSkuKeys.has(String(sg.skuKey))).length
  const region = vendorRegionByName?.get(g.vendorName)
  return (
    <div
      onClick={() => onOpenDrawer(g)}
      className="border border-gray-200 rounded-lg bg-white p-2.5 space-y-1.5 active:bg-gray-50 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-900 min-w-0">
            <span className="truncate">{g.poNumber || '-'}</span>
            {g.hasRejected && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="Has a rejected SKU" />}
          </span>
          <span className="text-gray-300 flex-shrink-0">·</span>
          <span className="w-4 h-4 rounded-full bg-slate-700 text-white text-[7px] font-bold flex items-center justify-center flex-shrink-0">
            {initials(g.buyerName)}
          </span>
          <span className="truncate text-[11px] text-gray-600">{g.buyerName || '-'}</span>
        </div>
        <button
          type="button"
          disabled={g.skuGroups.length === 0}
          aria-label={`Export PO ${g.poNumber || ''}${selectedCount > 0 ? ' (selected SKUs)' : ''}`}
          title={g.skuGroups.length === 0 ? 'No submitted reports yet' : selectedCount > 0 ? `Export ${selectedCount} selected SKU${selectedCount === 1 ? '' : 's'}` : 'Export all SKUs'}
          onClick={(e) => { e.stopPropagation(); onExportPo(g.poId) }}
          className="flex-shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ExportIcon />
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 min-w-0">
        <span className="truncate">{g.vendorName || '-'}</span>
        {region && <><span className="flex-shrink-0">·</span><span className="truncate">{region}</span></>}
      </div>
      {/* One compact row instead of a 6-cell stat grid - Assigned QA/Stage/
          dates/SKU counts all fit on one line at this size, same info as
          before, far less vertical space per card. */}
      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[10px] pt-1.5 border-t border-gray-100 text-gray-500">
        <span>{fmtDisplayDate(g.targetDate)}</span>
        <span>EF {fmtDisplayDate(g.exFactoryDate)}</span>
        <span>
          {countWithQty(g.submittedAtHighestStageCount, g.submittedAtHighestStageQty)} / {countWithQty(g.orderedSkuCount, g.orderedQty)}
          {selectedCount > 0 && <span className="text-gray-900 font-semibold"> · {selectedCount} sel.</span>}
        </span>
        <span className="font-medium text-gray-700 truncate max-w-[45%]">{qaLabel(g.qaNames)}</span>
        <span>{stageCell(g.highestPoStage)}</span>
      </div>
    </div>
  )
}

// Mobile-only combined filters sheet - everything on the page in one place:
// Buyer/Vendor/Region/Inspector/Merchant (owned by QcReportsSummary.jsx,
// passed down as `sharedFilters` - optional, since a stub/loading state can
// render this panel before that prop is ready), then this panel's own
// Date/Status, then Vendor/Assigned QA/Stage as inline checklists
// (FilterChecklistBody - same body ExcelFilterHeader's desktop popover
// uses, just without the popover shell, since there's no <th> to anchor to
// once the table's cards on mobile).
function MobileCombinedFiltersSheet({
  sharedFilters, dateColumn, setDateColumn, dateFrom, setDateFrom, dateTo, setDateTo, statusFilter, setStatusFilter,
  vendorOptions, qaOptions, stageOptions, columnFilters, setColumnFilter, onClearColumnFilters,
  resultCount, onClose,
}) {
  const activeColumnFilterCount = ['vendor', 'qa', 'stage'].filter(k => columnFilters[k] !== null).length
  return (
    <FilterSheetShell
      title="Filters"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClearColumnFilters}
            disabled={activeColumnFilterCount === 0}
            className="text-xs font-semibold text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:hover:text-gray-500 transition-colors cursor-pointer"
          >
            Clear Vendor/QA/Stage
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Show {resultCount} PO{resultCount === 1 ? '' : 's'}
          </button>
        </div>
      }
    >
      {sharedFilters && (
        <>
          <FilterField label="Buyer">
            <SearchableSelect
              options={[{ value: '', label: 'All Buyers' }, ...sharedFilters.buyerOptions]}
              value={sharedFilters.buyerFilter} onChange={sharedFilters.setBuyerFilter} placeholder="All Buyers"
              triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
              dropdownClassName="rounded-lg border border-gray-200"
            />
          </FilterField>
          <FilterField label="Vendor">
            <SearchableSelect
              options={[{ value: '', label: 'All Vendors' }, ...sharedFilters.vendorOptions]}
              value={sharedFilters.vendorFilter} onChange={sharedFilters.setVendorFilter} placeholder="All Vendors"
              triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
              dropdownClassName="rounded-lg border border-gray-200"
            />
          </FilterField>
          <FilterField label="Vendor's Region">
            <SearchableSelect
              options={[{ value: '', label: 'All Regions' }, ...sharedFilters.regionOptions]}
              value={sharedFilters.regionFilter} onChange={sharedFilters.setRegionFilter} placeholder="All Regions"
              triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
              dropdownClassName="rounded-lg border border-gray-200"
            />
          </FilterField>
          <FilterField label="Inspector">
            <SearchableSelect
              options={[{ value: '', label: 'All Inspectors' }, ...sharedFilters.qaOptions]}
              value={sharedFilters.inspectorFilter} onChange={sharedFilters.setInspectorFilter} placeholder="All Inspectors"
              triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
              dropdownClassName="rounded-lg border border-gray-200"
            />
          </FilterField>
          {sharedFilters.isAdmin && (
            <FilterField label="Merchant">
              <SearchableSelect
                options={[{ value: '', label: 'All Merchants' }, ...sharedFilters.merchantOptions]}
                value={sharedFilters.merchantFilter} onChange={sharedFilters.setMerchantFilter} placeholder="All Merchants"
                triggerClassName="h-9 px-3 text-xs border border-gray-200 rounded-lg bg-white hover:border-gray-400"
                dropdownClassName="rounded-lg border border-gray-200"
              />
            </FilterField>
          )}
        </>
      )}

      <FilterField label="Filter By">
        <div className="relative">
          <select value={dateColumn} onChange={e => setDateColumn(e.target.value)}
            className="w-full h-9 pl-2.5 pr-8 border border-gray-200 rounded-lg text-xs text-gray-900 appearance-none bg-white focus:outline-none focus:border-gray-900 cursor-pointer">
            {DATE_COLUMN_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 stroke-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </FilterField>
      <div className="grid grid-cols-2 gap-3">
        <FilterField label="Date From">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="w-full h-9 px-2.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
        </FilterField>
        <FilterField label="Date To">
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="w-full h-9 px-2.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
        </FilterField>
      </div>
      <FilterField label="Status">
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="w-full h-9 pl-2.5 pr-8 border border-gray-200 rounded-lg text-xs text-gray-900 appearance-none bg-white focus:outline-none focus:border-gray-900 cursor-pointer">
            <option value="">All Status</option>
            {STATUS_FILTER_KEYS.map(key => (
              <option key={key} value={key}>{RESULT_LABEL[key]}</option>
            ))}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 stroke-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </FilterField>

      <div className="border-t border-gray-100 pt-3 space-y-3">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vendor / Assigned QA / Stage</div>
        <FilterField label="Vendor">
          {vendorOptions.length === 0
            ? <p className="text-[11px] text-gray-400 italic">No values to filter on yet.</p>
            : <FilterChecklistBody options={vendorOptions} selected={columnFilters.vendor} onChange={v => setColumnFilter('vendor', v)} />}
        </FilterField>
        <FilterField label="Assigned QA">
          {qaOptions.length === 0
            ? <p className="text-[11px] text-gray-400 italic">No values to filter on yet.</p>
            : <FilterChecklistBody options={qaOptions} selected={columnFilters.qa} onChange={v => setColumnFilter('qa', v)} />}
        </FilterField>
        <FilterField label="Stage">
          {stageOptions.length === 0
            ? <p className="text-[11px] text-gray-400 italic">No values to filter on yet.</p>
            : <FilterChecklistBody options={stageOptions} selected={columnFilters.stage} onChange={v => setColumnFilter('stage', v)} formatLabel={n => STAGE_ORDER_LABEL[n]} />}
        </FilterField>
      </div>
    </FilterSheetShell>
  )
}

// Report-browsing/download panel, rendered inside QcRepositoryPanel.jsx.
// `rows` is already-filtered inspection_reports rows (submitted, 24-month
// window, scoped by QcReportsSummary.jsx's shared Buyer/Vendor/Inspector/
// Merchant filter bar) - no separate fetch or filtering here.
// `onExport(poId, lineItemId?)` triggers the same download/preview flow the
// calendar page's Generated Reports modal uses. Plain rows-and-columns
// table, one row per PO, matching PoRecord.jsx's "Daily PO and PI records"
// row style - clicking a row opens RepositoryPoDrawer with that PO's SKU
// detail (mirrors PoRecord.jsx's row-click-opens-PoDrawer pattern), rather
// than packing every SKU inline into the row itself.
export default function RepositoryPanel({ rows, loading, extraGroups, originalSkuStatsByPoId, scheduleAssignmentsByPoId, vendorRegionByName, onExport, sharedFilters }) {
  const [search, setSearch] = useState('')
  // Which SKUs the user has checked for download. A PO's own Export button
  // (row icon or drawer) downloads only these when non-empty for that PO,
  // otherwise every SKU on the PO (the default). Kept here rather than in
  // the drawer so the row's own quick-export icon reflects selections made
  // inside the drawer even after it's closed - one shared source of truth,
  // nothing to reconcile on open/close.
  const [selectedSkuKeys, setSelectedSkuKeys] = useState(() => new Set())
  // The PO group currently shown in the right-side drawer, or null.
  const [drawerGroup, setDrawerGroup] = useState(null)
  // Date range narrows by each PO's rolled-up Inspection Date column
  // (lastInspectionDate); Status narrows to POs with at least one SKU whose
  // current result matches (mirrors the same "PO row summarizes multiple
  // SKUs" reasoning the Assigned QA/Inspection Date columns already use).
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Which date column Date From/To actually filters by - defaults to Target
  // Date (previously the only option, hardcoded), but a PO row surfaces
  // three different dates (Target/Ex-Factory/Inspection) and it wasn't
  // obvious which one a filled-in range was even narrowing by.
  const [dateColumn, setDateColumn] = useState('target')
  const [statusFilter, setStatusFilter] = useState('')
  // Excel-style column filters on Vendor/Assigned QA/Stage - same shape as
  // PoInspectionComments.jsx's own overviewColumnFilters/openFilterCol: null
  // per column means no filter, a Set means only those values pass.
  const [columnFilters, setColumnFilters] = useState({ vendor: null, qa: null, stage: null })
  const setColumnFilter = (key, value) => setColumnFilters(prev => ({ ...prev, [key]: value }))
  const [openFilterCol, setOpenFilterCol] = useState(null)
  const toggleFilterCol = (col) => setOpenFilterCol(prev => prev === col ? null : col)
  // Mobile-only: ONE combined sheet (this panel's own Date/Status/Vendor/
  // Assigned QA/Stage, PLUS QcReportsSummary.jsx's own Buyer/Vendor/Region/
  // Inspector/Merchant, passed down as `sharedFilters`) behind a single
  // filter-icon trigger - not two separate "Filters" boxes/toggles. Vendor/
  // Assigned QA/Stage live as ExcelFilterHeader popovers anchored to <th>
  // elements on desktop (no <th> once the table becomes cards on mobile),
  // so their checklist body renders directly in this sheet instead.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // extraGroups: stub PO groups for scheduled-but-not-yet-inspected POs
  // (see repositoryLayout.js's groupSchedulesOnly, built by QcReportsSummary.jsx)
  // - merged in here so "Scheduled POs" can show every scheduled PO, not
  // just the ones groupReports() itself can build from real report rows.
  const groups = useMemo(() => {
    const merged = [...groupReports(rows), ...(extraGroups || [])]
    // Ordered SKUs - how many SKUs the PO originally has (+ their total
    // ordered quantity), not the report-derived skuGroups.length/orderQty
    // (which only counts/sums SKUs that have actually had something
    // submitted) - see QcReportsSummary.jsx's originalSkuStatsByPoId for
    // where this comes from.
    return merged.map(g => {
      const stats = originalSkuStatsByPoId?.get(g.poId)
      // targetDate falls back to this map's own roll-up only when the
      // group's own is null - groupSchedulesOnly()'s stub groups always
      // hardcode null (no line-item data available to compute one from),
      // and groupOpenPosOnly()'s own roll-up can still legitimately come up
      // null when none of a PO's line items have one set - it's not
      // silently discarding a real, non-null targetDate the group already
      // had.
      return {
        ...g,
        orderedSkuCount: stats?.count ?? null,
        orderedQty: stats?.qty ?? null,
        targetDate: g.targetDate ?? stats?.targetDate ?? null,
        exFactoryDate: g.exFactoryDate ?? stats?.exFactoryDate ?? null,
      }
    })
  }, [rows, extraGroups, originalSkuStatsByPoId])

  // Every distinct value actually present, so a filter never offers an
  // option with zero matching rows (same reasoning PoInspectionComments.jsx's
  // own overview-table filter options already document).
  const vendorOptions = useMemo(() => [...new Set(groups.map(g => g.vendorName).filter(Boolean))].sort(), [groups])
  // A PO can have more than one QA (g.qaNames is already a distinct list
  // per PO - see repositoryLayout.js) - flatten across every PO, not per-row.
  const qaOptions = useMemo(() => [...new Set(groups.flatMap(g => g.qaNames))].sort(), [groups])
  const stageOptions = useMemo(() => [...new Set(groups.map(g => g.highestPoStage).filter(s => s >= 0))].sort((a, b) => a - b), [groups])

  const toggleSkuSelected = (skuKey) => setSelectedSkuKeys(prev => {
    const key = String(skuKey)
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const toggleSelectAllForPo = (po) => setSelectedSkuKeys(prev => {
    const keys = po.skuGroups.map(sg => String(sg.skuKey))
    const allSelected = keys.every(k => prev.has(k))
    const next = new Set(prev)
    keys.forEach(k => (allSelected ? next.delete(k) : next.add(k)))
    return next
  })

  // A PO's own Export (not a per-SKU one) narrows to whatever's checked for
  // it, or every SKU if nothing is checked.
  const exportPo = (poId) => {
    const po = groups.find(g => g.poId === poId)
    const selected = po ? po.skuGroups.filter(sg => selectedSkuKeys.has(String(sg.skuKey))) : []
    onExport(poId, selected.length ? selected.map(sg => sg.skuKey) : undefined)
  }

  // Date range + Status narrow which PO rows show at all, before search
  // layers on top (same order QcReportsSummary.jsx's own stage-tab-then-
  // search does elsewhere on this page). Which date the range applies to is
  // explicit (dateColumn) rather than silently always Target Date - a PO
  // row shows three different dates (Target/Ex-Factory/Inspection), and it
  // wasn't obvious which one a filled-in range was actually narrowing by.
  const dateFilteredGroups = useMemo(() => {
    if (!dateFrom && !dateTo && !statusFilter) return groups
    const getDate = DATE_COLUMN_GETTERS[dateColumn] || DATE_COLUMN_GETTERS.target
    return groups.filter(g => {
      const d = getDate(g)
      if (dateFrom && (!d || d < dateFrom)) return false
      if (dateTo && (!d || d > dateTo)) return false
      if (statusFilter && !g.skuGroups.some(sg => sg.reports[0]?.inspection_result === statusFilter)) return false
      return true
    })
  }, [groups, dateFrom, dateTo, dateColumn, statusFilter])

  // Column-header filters (Vendor/Assigned QA/Stage) - a separate, purely
  // client-side narrowing layered after Date/Status, before search (same
  // relationship PoInspectionComments.jsx's own page search vs. column
  // filters already have).
  const columnFilteredGroups = useMemo(() => {
    const matchesSet = (set, value) => !set || set.has(value)
    // QA is multi-value per PO - a PO matches if ANY of its QAs is
    // checked, not requiring every one of them to be.
    const matchesAny = (set, values) => !set || values.some(v => set.has(v))
    return dateFilteredGroups.filter(g =>
      matchesSet(columnFilters.vendor, g.vendorName) &&
      matchesAny(columnFilters.qa, g.qaNames) &&
      matchesSet(columnFilters.stage, g.highestPoStage)
    )
  }, [dateFilteredGroups, columnFilters])

  // Same search semantics as GeneratedReportsModal: a PO-number/buyer match
  // keeps every SKU; a SKU-only match narrows that PO down to just the
  // matching SKU rows - and since the drawer opens with the exact group
  // object its row was rendered from, a SKU-only match opens the drawer
  // pre-scoped to just that SKU too (what's visible in the row is what
  // opens in the drawer, no surprise expansion back to the full list). A
  // batch-number match (TWFCMB..., see
  // supabase/migrations/20260917_create_inspection_report_batches.sql)
  // behaves like a PO-number match - it identifies the whole document/PO,
  // not one SKU, so it keeps every SKU too rather than trying to narrow to
  // "the ones in that batch." g.batchNos comes straight off the same
  // embedded purchase_orders relation groupReports() already reads
  // everything else from (see qcReportReaders.js's getBatchNos) - no
  // separate po_id-keyed fetch, so there's nothing here to race or go
  // stale against the rest of the search.
  // Relevance rank for one field against the query - lower is more relevant.
  // An exact match beats a prefix match beats a plain substring match, same
  // ordering a user scanning results would expect (typing a PO number in
  // full should surface that PO first, not wherever it happens to sit in
  // the underlying data).
  const fieldRank = (value, q) => {
    const v = (value || '').toLowerCase()
    if (!v.includes(q)) return null
    if (v === q) return 0
    if (v.startsWith(q)) return 1
    return 2
  }

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return columnFilteredGroups
    const scored = []
    for (const g of columnFilteredGroups) {
      // PO number match ranks highest (0-2), then batch number (3-5), then
      // buyer/vendor (6-8) - all of these keep every SKU on the group. A
      // SKU-only match ranks lowest (9-11) and narrows the group down to
      // just the matching SKU rows.
      const poRank = fieldRank(g.poNumber, q)
      const batchRank = (g.batchNos || []).reduce((best, b) => {
        const r = fieldRank(b, q)
        return r === null ? best : (best === null ? r + 3 : Math.min(best, r + 3))
      }, null)
      const buyerVendorRank = [fieldRank(g.buyerName, q), fieldRank(g.vendorName, q)]
        .filter(r => r !== null)
        .map(r => r + 6)
        .reduce((best, r) => (best === null ? r : Math.min(best, r)), null)

      const bestGroupRank = [poRank, batchRank, buyerVendorRank].filter(r => r !== null)
        .reduce((best, r) => (best === null ? r : Math.min(best, r)), null)

      if (bestGroupRank !== null) { scored.push({ g, rank: bestGroupRank }); continue }

      const skuRanks = g.skuGroups
        .map(sg => ({ sg, rank: fieldRank(sg.skuRef, q) }))
        .filter(({ rank }) => rank !== null)
      if (!skuRanks.length) continue
      const bestSkuRank = Math.min(...skuRanks.map(({ rank }) => rank)) + 9
      scored.push({ g: { ...g, skuGroups: skuRanks.map(({ sg }) => sg) }, rank: bestSkuRank })
    }
    // Array.prototype.sort is stable (spec-guaranteed since ES2019), so
    // groups tied on rank keep their original relative order instead of
    // shuffling on every keystroke.
    return scored.sort((a, b) => a.rank - b.rank).map(({ g }) => g)
  }, [columnFilteredGroups, search])

  // 15 rows per page. `currentPage` clamps to whatever `pageCount` actually
  // is, so narrowing the results via a filter never strands you on a
  // now-empty later page - no effect needed just to reset it back to 1.
  const PAGE_SIZE = 15
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageGroups = useMemo(
    () => filteredGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredGroups, currentPage]
  )

  // Bulk export (CSV/Excel/PDF) of every PO the current filters/search
  // match - deliberately built from `filteredGroups`, not `pageGroups`, so
  // it's never limited to whatever page happens to be showing. The
  // button/dropdown itself is ExportMenuButton above (own state/ref, so it
  // can mount twice - desktop's Date/Status row and mobile's search row -
  // without one instance's outside-click handler fighting the other's).
  const runExport = (format) => {
    const { headers, rows } = buildExportRows(filteredGroups)
    const filename = `qc-reports-repository-${new Date().toISOString().slice(0, 10)}`
    if (format === 'csv') downloadCsv(headers, rows, filename)
    else if (format === 'excel') downloadSummaryXlsx([headers, ...rows], 'QC Reports', filename)
    else if (format === 'pdf') downloadSummaryPdf({ headers, dataRows: rows, title: 'QC Reports - Repository', subtitle: `${rows.length} PO${rows.length === 1 ? '' : 's'}`, filename })
  }

  const activeColumnFilterCount = ['vendor', 'qa', 'stage'].filter(k => columnFilters[k] !== null).length

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex-shrink-0">
        {/* Desktop - unchanged Date/Status filters + Export, plus the new
            "Filter By" column picker right before the date range so it
            reads as "which date these two boxes apply to". */}
        <div className="hidden sm:flex flex-wrap items-end gap-3">
          <FilterSelect label="Filter By" value={dateColumn} onChange={setDateColumn}>
            {DATE_COLUMN_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </FilterSelect>
          <FilterDate label="Date From" value={dateFrom} onChange={setDateFrom} />
          <FilterDate label="Date To" value={dateTo} onChange={setDateTo} />
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}>
            <option value="">All Status</option>
            {STATUS_FILTER_KEYS.map(key => (
              <option key={key} value={key}>{RESULT_LABEL[key]}</option>
            ))}
          </FilterSelect>
          <div className="ml-auto">
            <ExportMenuButton count={filteredGroups.length} disabled={filteredGroups.length === 0} onExport={runExport} />
          </div>
        </div>
        {/* Mobile - ONE combined trigger for every filter on the page
            (this panel's own Date/Status/Vendor/Assigned QA/Stage, plus
            QcReportsSummary.jsx's own Buyer/Vendor/Region/Inspector/
            Merchant via `sharedFilters`) instead of two separate boxes. */}
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="sm:hidden w-full flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer"
        >
          <FilterIcon />
          <span>
            Filters
            {(activeColumnFilterCount + [dateFrom, dateTo, statusFilter].filter(Boolean).length) > 0
              && ` (${activeColumnFilterCount + [dateFrom, dateTo, statusFilter].filter(Boolean).length})`}
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="relative flex-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by PO number, SKU, or TWFCMB batch no…"
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
          />
        </div>
        {/* Mobile - "box two" is just Search + Export (desktop keeps its
            own Export button up in the Date/Status row instead). */}
        <div className="sm:hidden">
          <ExportMenuButton count={filteredGroups.length} disabled={filteredGroups.length === 0} onExport={runExport} />
        </div>
      </div>

      {/* Desktop - unchanged table, its own column-header filters. */}
      <div className="hidden md:block flex-1 min-h-[220px] overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-200 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
              <th className="px-3 py-1.5 text-left whitespace-nowrap">PO</th>
              <th className="px-3 py-1.5 text-left whitespace-nowrap">Customer</th>
              <ExcelFilterHeader
                label="Vendor" options={vendorOptions} align="left"
                selected={columnFilters.vendor} onChange={v => setColumnFilter('vendor', v)}
                isOpen={openFilterCol === 'vendor'} onToggle={() => toggleFilterCol('vendor')} onClose={() => setOpenFilterCol(null)}
              />
              <th className="px-3 py-1.5 text-left whitespace-nowrap">Vendor's Region</th>
              <th className="px-3 py-1.5 text-left whitespace-nowrap">Target Date</th>
              <th className="px-3 py-1.5 text-left whitespace-nowrap">Ex-Factory Date</th>
              <th className="px-3 py-1.5 text-left whitespace-nowrap" title="Total SKUs originally on this PO">Ordered SKUs</th>
              <th className="px-3 py-1.5 text-left whitespace-nowrap">Submitted SKUs</th>
              <ExcelFilterHeader
                label="Assig. QA" options={qaOptions} align="left"
                selected={columnFilters.qa} onChange={v => setColumnFilter('qa', v)}
                isOpen={openFilterCol === 'qa'} onToggle={() => toggleFilterCol('qa')} onClose={() => setOpenFilterCol(null)}
              />
              <th className="px-3 py-1.5 text-left whitespace-nowrap">Inspection Date</th>
              <ExcelFilterHeader
                label="Stage" options={stageOptions} align="left"
                selected={columnFilters.stage} onChange={v => setColumnFilter('stage', v)}
                formatLabel={n => STAGE_ORDER_LABEL[n]}
                isOpen={openFilterCol === 'stage'} onToggle={() => toggleFilterCol('stage')} onClose={() => setOpenFilterCol(null)}
              />
              <th className="px-3 py-1.5 text-left whitespace-nowrap">Export</th>
            </tr>
          </thead>
          <tbody>
            {loading && filteredGroups.length === 0 && (
              <>
                {Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)}
              </>
            )}
            {!loading && filteredGroups.length === 0 && (
              <tr>
                <td colSpan={12} className="text-xs text-gray-400 italic py-6 text-center">No reports match.</td>
              </tr>
            )}
            {pageGroups.map(g => (
              <PoRow
                key={g.poId}
                g={g}
                selectedSkuKeys={selectedSkuKeys}
                onOpenDrawer={setDrawerGroup}
                onExportPo={exportPo}
                vendorRegionByName={vendorRegionByName}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile - one card per PO instead of an 11-column table, which would
          otherwise force horizontal scroll on a phone no matter how tightly
          the columns were sized. */}
      <div className="md:hidden flex-1 min-h-[220px] overflow-y-auto space-y-2">
        {loading && filteredGroups.length === 0 && (
          <>
            {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
          </>
        )}
        {!loading && filteredGroups.length === 0 && (
          <p className="text-xs text-gray-400 italic py-6 text-center">No reports match.</p>
        )}
        {pageGroups.map(g => (
          <PoCard
            key={g.poId}
            g={g}
            selectedSkuKeys={selectedSkuKeys}
            onOpenDrawer={setDrawerGroup}
            onExportPo={exportPo}
            vendorRegionByName={vendorRegionByName}
          />
        ))}
      </div>

      {filteredGroups.length > 0 && (
        <div className="flex items-center justify-between flex-shrink-0 px-1 text-xs text-gray-500">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredGroups.length)} of {filteredGroups.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-md border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Prev
            </button>
            <span>Page {currentPage} of {pageCount}</span>
            <button
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              className="px-2.5 py-1 rounded-md border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <RepositoryPoDrawer
        key={drawerGroup?.poId || 'closed'}
        group={drawerGroup}
        selectedSkuKeys={selectedSkuKeys}
        onToggleSelect={toggleSkuSelected}
        onToggleSelectAllForPo={toggleSelectAllForPo}
        onExportSku={onExport}
        onExportPo={exportPo}
        scheduleAssignments={drawerGroup ? scheduleAssignmentsByPoId?.get(drawerGroup.poId) : null}
        onClose={() => setDrawerGroup(null)}
      />

      {mobileFiltersOpen && (
        <MobileCombinedFiltersSheet
          sharedFilters={sharedFilters}
          dateColumn={dateColumn} setDateColumn={setDateColumn}
          dateFrom={dateFrom} setDateFrom={setDateFrom}
          dateTo={dateTo} setDateTo={setDateTo}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          vendorOptions={vendorOptions} qaOptions={qaOptions} stageOptions={stageOptions}
          columnFilters={columnFilters} setColumnFilter={setColumnFilter}
          onClearColumnFilters={() => setColumnFilters({ vendor: null, qa: null, stage: null })}
          resultCount={filteredGroups.length}
          onClose={() => setMobileFiltersOpen(false)}
        />
      )}
    </div>
  )
}
