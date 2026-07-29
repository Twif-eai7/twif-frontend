import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Invoices with an invoice number set (even a Save'd placeholder — booking
// eligibility deliberately does NOT require a formal Raise, so a container
// can be used as an ongoing tracker before every invoice on it is finalized)
// but not yet booked into a container — feeds the invoice picker in
// NewContainerForm.jsx and AttachInvoicesModal.jsx.
export function useRaisedUnbookedInvoices(buyerOrgId) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchInvoices = useCallback(async () => {
    if (!buyerOrgId) { setInvoices([]); return }
    setLoading(true)

    const { data, error } = await supabase
      .from('shipment_invoices')
      .select(`
        id, invoice_number, invoice_date, invoice_value, invoice_currency, cbm,
        primary_vendor:organizations!shipment_invoices_primary_vendor_org_id_fkey ( display_name ),
        shipment_invoice_pos ( po:purchase_orders ( po_number ) )
      `)
      .eq('buyer_org_id', buyerOrgId)
      .is('delete_meta', null)
      .is('container_id', null)
      .not('invoice_number', 'is', null)
      .order('invoice_date', { ascending: false })

    setLoading(false)
    if (error) { console.error('[useRaisedUnbookedInvoices] fetch error:', error.message); return }

    setInvoices((data || []).map(inv => ({
      ...inv,
      vendor_name: inv.primary_vendor?.display_name ?? null,
      po_numbers: (inv.shipment_invoice_pos || []).map(sip => sip.po?.po_number).filter(Boolean),
    })))
  }, [buyerOrgId])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  return { invoices, loading, refetch: fetchInvoices }
}
