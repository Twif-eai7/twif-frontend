import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'

// "Status", "CBM For Ready Goods" and "Comments" aren't tracked anywhere in
// the planning data — Status here means something else entirely (a QA/
// inspection status filled in after the fact, e.g. "Ready and Inspected"),
// not the Planned/Confirmed state this drawer already tracks. All three are
// exported blank on purpose, for whoever fills them in later in Excel.
const COLS = [
  { key: 'sno',       label: 'S. No.',              wch: 6  },
  { key: 'supplier',  label: 'Supplier',            wch: 22 },
  { key: 'po_number', label: 'PO No.',              wch: 14 },
  { key: 'cbm',       label: 'CBM',                 wch: 10 },
  { key: 'status',    label: 'Status',              wch: 16 },
  { key: 'ready_cbm', label: 'CBM For Ready Goods', wch: 20 },
  { key: 'comments',  label: 'Comments',            wch: 28 },
]

export function useMyPlanningExport() {
  const [exporting, setExporting] = useState(false)

  // rows: [{ supplier, po_number, cbm }] — already flattened by the caller
  // from whichever tab (Pending/Confirmed) is currently visible.
  const exportToExcel = useCallback((rows, { buyerName = '', tabLabel = '' } = {}) => {
    if (!rows?.length) return
    setExporting(true)
    try {
      const data = rows.map((r, i) => ({
        sno: i + 1,
        supplier: r.supplier || '',
        po_number: r.po_number || '',
        cbm: r.cbm ?? '',
        status: '',
        ready_cbm: '',
        comments: '',
      }))

      const headers = COLS.map(c => c.label)
      const aoa = [headers, ...data.map(r => COLS.map(c => r[c.key] ?? ''))]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = COLS.map(c => ({ wch: c.wch }))
      XLSX.utils.book_append_sheet(wb, ws, (tabLabel || 'Plannings').slice(0, 31))

      const date = new Date().toISOString().slice(0, 10)
      const buyer = buyerName ? `_${buyerName.replace(/\s+/g, '_')}` : ''
      const tab = tabLabel ? `_${tabLabel.replace(/\s+/g, '_')}` : ''
      XLSX.writeFile(wb, `Planned_Shipments${buyer}${tab}_${date}.xlsx`)
    } finally {
      setExporting(false)
    }
  }, [])

  return { exportToExcel, exporting }
}
