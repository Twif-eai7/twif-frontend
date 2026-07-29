import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

// Excel column spec — matches the original logistics spreadsheet layout
const COLS = [
  { key: 'awb',            label: 'AWB/CONTR#',         wch: 24 },
  { key: 'vessel',         label: 'FLIGHT/VESSEL DETAILS', wch: 28 },
  { key: 'po_numbers',     label: 'PO#',                 wch: 40 },
  { key: 'cbm',            label: 'CBM',                 wch: 8  },
  { key: 'etd',            label: 'ETD',                 wch: 12 },
  { key: 'eta',            label: 'ETA',                 wch: 12 },
  { key: 'vendor',         label: 'VENDOR',              wch: 22 },
  { key: 'invoice_number', label: 'INVOICE NUMBER',      wch: 20 },
  { key: 'invoice_date',   label: 'INVOICE DATE',        wch: 14 },
  { key: 'invoice_value',  label: 'INVOICE PO VALUE',    wch: 18 },
  { key: 'other_charges',  label: 'OTHER CHARGES',       wch: 14 },
  { key: 'final_value',    label: 'FINAL INVOICE VALUE', wch: 18 },
  { key: 'payment_status', label: 'PAYMENT STATUS',      wch: 16 },
  { key: 'tracking',       label: 'TRACKING DETAILS',    wch: 20 },
  { key: 'forwarder',      label: 'FORWARDER',           wch: 14 },
  { key: 'erp',            label: 'ERP',                 wch: 8  },
  { key: 'payment_term',   label: 'PAYMENTS TERM',       wch: 22 },
]

// Columns that hold container-level (not per-invoice) data — already left
// blank on every row but the first within a container's block; merged into
// one cell spanning that block so Excel shows them as genuinely shared.
const MERGE_KEYS = ['awb', 'vessel', 'etd', 'eta', 'forwarder']
const MERGE_COLS = MERGE_KEYS.map(key => COLS.findIndex(c => c.key === key))

function fmtValue(amount, currency) {
  if (!amount) return ''
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'INR' ? '₹' : '$'
  return `${sym}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function useShipmentExport() {
  const [exporting, setExporting] = useState(false)

  const exportToExcel = useCallback(async (containers, buyerName = '') => {
    if (!containers?.length) return
    setExporting(true)

    try {
      const containerIds = containers.map(c => c.id)

      // Fetch full invoice data for the visible containers
      const { data: invoices, error } = await supabase
        .from('shipment_invoices')
        .select(`
          id, container_id,
          invoice_number, invoice_date, invoice_value, invoice_currency, invoice_value_usd,
          cbm, payment_status, payment_term, tracking_details,
          primary_vendor:organizations!shipment_invoices_primary_vendor_org_id_fkey ( display_name ),
          shipment_invoice_pos (
            po:purchase_orders ( po_number )
          )
        `)
        .in('container_id', containerIds)
        .is('delete_meta', null)
        .order('container_id')

      if (error) throw error

      // Group invoices by container preserving original container order
      const byContainer = {}
      ;(invoices || []).forEach(inv => {
        if (!byContainer[inv.container_id]) byContainer[inv.container_id] = []
        byContainer[inv.container_id].push(inv)
      })

      const rows = []
      const merges = []
      containers.forEach(c => {
        const cInvoices = byContainer[c.id] ?? []
        const blockStart = rows.length // 0-based index into `rows`, before this container's rows are pushed

        if (!cInvoices.length) {
          // Container with no invoices — still export one row with container fields
          rows.push({
            awb: c.container_number || '',
            vessel: c.flight_vessel || '',
            po_numbers: '',
            cbm: '',
            etd: c.etd || '',
            eta: c.eta || '',
            vendor: '',
            invoice_number: '',
            invoice_date: '',
            invoice_value: '',
            other_charges: '',
            final_value: '',
            payment_status: '',
            tracking: '',
            forwarder: c.forwarder || '',
            erp: '',
            payment_term: '',
          })
          return
        }

        cInvoices.forEach((inv, i) => {
          const isFirst = i === 0
          const poNums = (inv.shipment_invoice_pos || [])
            .map(sip => sip.po?.po_number)
            .filter(Boolean)
            .join('+')

          rows.push({
            awb:            isFirst ? (c.container_number || '') : '',
            vessel:         isFirst ? (c.flight_vessel   || '') : '',
            po_numbers:     poNums,
            cbm:            inv.cbm ?? '',
            etd:            isFirst ? (c.etd || '') : '',
            eta:            isFirst ? (c.eta || '') : '',
            vendor:         inv.primary_vendor?.display_name || '',
            invoice_number: inv.invoice_number || '',
            invoice_date:   inv.invoice_date   || '',
            invoice_value:  fmtValue(inv.invoice_value, inv.invoice_currency),
            other_charges:  '',
            final_value:    inv.invoice_value_usd != null
                              ? fmtValue(inv.invoice_value_usd, 'USD')
                              : fmtValue(inv.invoice_value, inv.invoice_currency),
            payment_status: inv.payment_status  || '',
            tracking:       inv.tracking_details || '',
            forwarder:      isFirst ? (c.forwarder || '') : '',
            erp:            '',
            payment_term:   inv.payment_term || '',
          })
        })

        // Merge the container-level columns across this container's block of
        // invoice rows — they're already blanked on every row but the first,
        // this just makes Excel render that as one shared cell instead of
        // looking like blank data. +1 on both ends: row 0 in the sheet is
        // the header, so `rows` index N sits at sheet row N+1.
        if (cInvoices.length > 1) {
          MERGE_COLS.forEach(c => {
            merges.push({ s: { r: blockStart + 1, c }, e: { r: blockStart + cInvoices.length, c } })
          })
        }
      })

      const headers = COLS.map(c => c.label)
      const data = rows.map(r => COLS.map(c => r[c.key] ?? ''))

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
      ws['!cols'] = COLS.map(c => ({ wch: c.wch }))
      ws['!merges'] = merges

      const sheetName = buyerName ? buyerName.slice(0, 31) : 'Shipments'
      XLSX.utils.book_append_sheet(wb, ws, sheetName)

      const date = new Date().toISOString().slice(0, 10)
      const buyer = buyerName ? `_${buyerName.replace(/\s+/g, '_')}` : ''
      XLSX.writeFile(wb, `Shipments${buyer}_${date}.xlsx`)
    } catch (err) {
      console.error('[useShipmentExport] export error:', err?.message)
    } finally {
      setExporting(false)
    }
  }, [])

  return { exportToExcel, exporting }
}
