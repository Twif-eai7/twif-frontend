import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import RepositoryPanel from './RepositoryPanel'
import { ExportPicker } from './inspectionReport/InspectionReportEntry'
import { withSortedPhotos } from '../../lib/photoSequence'

// Repository/report-browser panel, shown inline in QcReportsSummary.jsx's
// calendar area (swapped in by that page's "View Repository" toggle)
// rather than navigating to a separate page. `rows` arrives already
// filtered by the shared Buyer/Vendor/Inspector/Merchant filter bar one
// level up - this panel used to keep its own separate, near-identical
// Customer/Vendor/Inspector/Merchant filter state (a second copy of the
// same controls shown right below the calendar's own), but that read as
// two filter bars doing the same job, so both views now share the one bar
// and this panel is just the SKU/report browser plus its own export
// plumbing below it (kept self-contained since it supports exporting a
// multi-SKU selection across POs, unlike the calendar's own single-SKU
// openExport).
export default function QcRepositoryPanel({ rows, loading, error, extraGroups, originalSkuStatsByPoId, scheduleAssignmentsByPoId, vendorRegionByName, userName, sharedFilters }) {
  const [exportTarget, setExportTarget] = useState(null) // { po, reports } | null
  const [exportError, setExportError] = useState(null)

  // lineItemIds: null/undefined = every SKU on the PO (default); a single
  // id or an array of ids narrows to just those SKUs (used by the
  // Repository panel's per-SKU checkboxes - export only what's selected).
  const openExport = async (poId, lineItemIds = null) => {
    setExportError(null)
    const { data, error: err } = await supabase
      .from('purchase_orders')
      .select(`
        id, po_number, inspection_level,
        buyer_supplier_links!inner(
          buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(display_name),
          supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(display_name, city, address, state, zip, country, phone_no)
        ),
        po_line_items(
          id, sku_id, buyer_sku_ref, sku_variant, quantity_ordered, balance_quantity, target_date,
          inspection_reports(*, inspection_report_defects(*), inspection_report_photos(*))
        )
      `)
      .eq('id', poId)
      .single()
    if (err) { setExportError(err.message); return }
    const po = {
      ...data,
      buyer_name:       data.buyer_supplier_links?.buyer?.display_name ?? null,
      supplier_name:    data.buyer_supplier_links?.supplier?.display_name ?? null,
      supplier_city:    data.buyer_supplier_links?.supplier?.city ?? null,
      supplier_address: data.buyer_supplier_links?.supplier?.address ?? null,
      supplier_state:   data.buyer_supplier_links?.supplier?.state ?? null,
      supplier_zip:     data.buyer_supplier_links?.supplier?.zip ?? null,
      supplier_country: data.buyer_supplier_links?.supplier?.country ?? null,
      supplier_phone:   data.buyer_supplier_links?.supplier?.phone_no ?? null,
    }
    let reports = (data.po_line_items || []).flatMap(li => li.inspection_reports || []).map(withSortedPhotos)
    if (lineItemIds) {
      const ids = Array.isArray(lineItemIds) ? lineItemIds : [lineItemIds]
      reports = reports.filter(r => ids.includes(r.po_line_item_id))
    }
    setExportTarget({ po, reports })
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm p-4 mb-5 min-h-[420px] flex flex-col">
      {error && <p className="text-xs text-red-500 mb-3 flex-shrink-0">{error}</p>}

      {/* The small "Loading…" text this used to show here is easy to miss
          next to the KPI tiles above already reading "0" and the table
          below already reading "No reports match." - both looked final,
          not in-progress, which is exactly what made this page feel stuck
          on a slow connection. RepositoryPanel's own skeleton rows (loading
          prop) now carry that signal instead, where it's actually visible. */}
      <div className="flex-1 min-h-[260px]">
        <RepositoryPanel rows={rows} loading={loading} extraGroups={extraGroups} originalSkuStatsByPoId={originalSkuStatsByPoId} scheduleAssignmentsByPoId={scheduleAssignmentsByPoId} vendorRegionByName={vendorRegionByName} onExport={openExport} sharedFilters={sharedFilters} />
      </div>

      {exportError && <p className="text-xs text-red-500 mt-3 flex-shrink-0">{exportError}</p>}
      {exportTarget && (
        <ExportPicker
          po={exportTarget.po}
          reports={exportTarget.reports}
          autoPreview
          userName={userName}
          onClose={() => setExportTarget(null)}
        />
      )}
    </div>
  )
}
