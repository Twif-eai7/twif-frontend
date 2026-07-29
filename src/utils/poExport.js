import * as XLSX from 'xlsx'
import 'jspdf-autotable'
import { jsPDF } from 'jspdf'

const COLS = [
  { key: 'customer',      label: 'Customer',     num: false },
  { key: 'vendor',        label: 'Vendor',        num: false },
  { key: 'poNo',          label: 'PO No.',        num: false },
  { key: 'item',          label: 'Item',          num: false },
  { key: 'orderQty',      label: 'Ord Qty',       num: true  },
  { key: 'orderPrice',    label: 'Unit Price',    num: true,  cur: true },
  { key: 'orderValue',    label: 'Order Value',   num: true,  cur: true },
  { key: 'orderDate',     label: 'Order Date',    num: false },
  { key: 'shippedQty',    label: 'Shp Qty',       num: true  },
  { key: 'shippedValue',  label: 'Shipped $',     num: true,  cur: true },
  { key: 'shippedDate',   label: 'Shp Date',      num: false },
  { key: 'balanceQty',    label: 'Bal Qty',       num: true  },
  { key: 'balanceValue',  label: 'Balance $',     num: true,  cur: true },
  { key: 'target',        label: 'Target',        num: false },
  { key: 'totalBusiness', label: 'Total Biz $',   num: true,  cur: true },
  { key: 'status',        label: 'Status',        num: false },
]

const $usd = n =>
  !n ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const $qty = n => (!n ? '' : Number(n).toLocaleString('en-US'))

function getExportData(rows) {
  const headers = COLS.map(c => c.label)
  const data = rows.map(r =>
    COLS.map(c => {
      const v = r[c.key]
      if (v === undefined || v === null || v === '') return ''
      if (c.cur) return $usd(v)
      if (c.num) return $qty(v)
      return v
    })
  )
  return { headers, data }
}

export function exportToXLSX(rows, sheetName = 'Open PO', filename = 'Open_PO_Export') {
  if (!rows?.length) { alert('No data to export.'); return }
  const { headers, data } = getExportData(rows)
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
  ws['!cols'] = COLS.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${filename}_${date}.xlsx`)
}

export async function exportToPDF(rows, title = 'Purchase Orders', filename = 'PO_Export') {
  if (!rows?.length) { alert('No data to export.'); return }

  const { default: JsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const { headers, data } = getExportData(rows)
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const totOrd = rows.reduce((s, r) => s + (r.orderValue   || 0), 0)
  const totShp = rows.reduce((s, r) => s + (r.shippedValue || 0), 0)
  const totBal = rows.reduce((s, r) => s + (r.balanceValue || 0), 0)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(26, 26, 26)
  doc.text(title, 14, 16)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(142, 142, 142)
  doc.text(`Exported ${date}  ·  ${rows.length.toLocaleString()} line items`, 14, 22)

  doc.setFontSize(8)
  doc.setTextColor(26, 26, 26)
  doc.text(
    `Order Value: ${$usd(totOrd)}   |   Shipped: ${$usd(totShp)}   |   Balance: ${$usd(totBal)}`,
    14, 28
  )

  autoTable(doc, {
    startY: 32,
    head: [headers],
    body: data,
    styles: { fontSize: 7, cellPadding: 2, overflow: 'ellipsize', halign: 'left' },
    headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      4:  { halign: 'right' },
      5:  { halign: 'right' },
      6:  { halign: 'right' },
      8:  { halign: 'right' },
      9:  { halign: 'right' },
      11: { halign: 'right' },
      12: { halign: 'right' },
      14: { halign: 'right' },
    },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    margin: { left: 14, right: 14 },
  })

  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(142, 142, 142)
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - 14,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' }
    )
  }

  doc.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`)
}