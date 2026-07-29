import { useState, useCallback, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

function etdYearMonth(etd) {
  if (!etd) return null
  return etd.slice(0, 7) // "2026-07"
}

function formatMonth(ym) {
  if (!ym) return ''
  const [year, month] = ym.split('-')
  return new Date(Number(year), Number(month) - 1).toLocaleString('en-GB', { month: 'short', year: 'numeric' })
}

// Containers for a specific buyer. BL is uploaded against an invoice, so
// search matches container/AWB numbers OR invoice numbers, client-side.
// Month filter is derived from the loaded data (no extra round-trip).
export function useShipmentContainers(buyerOrgId) {
  const [allContainers, setAllContainers] = useState([])
  const [loading, setLoading]             = useState(false)
  const [search, setSearch]               = useState('')
  const [selectedMonth, setSelectedMonth] = useState('') // "YYYY-MM" | ""

  const fetchContainers = useCallback(async () => {
    if (!buyerOrgId) { setAllContainers([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('shipment_containers')
      .select(`
        id, container_number, flight_vessel, etd, eta, forwarder,
        invoices:shipment_invoices ( id, invoice_number, bl_number, delete_meta )
      `)
      .eq('buyer_org_id', buyerOrgId)
      .is('delete_meta', null)
      .order('etd', { ascending: false })
      .limit(200)

    setLoading(false)
    if (error) { console.error('[useShipmentContainers] fetch error:', error.message); return }
    setAllContainers((data || []).map(c => ({
      ...c,
      invoices: (c.invoices || []).filter(inv => !inv.delete_meta),
    })))
  }, [buyerOrgId])

  useEffect(() => { fetchContainers() }, [fetchContainers])

  // Distinct ETD months sorted descending, for the dropdown
  const monthOptions = useMemo(() => {
    const seen = new Set()
    allContainers.forEach(c => {
      const ym = etdYearMonth(c.etd)
      if (ym) seen.add(ym)
    })
    return [...seen].sort((a, b) => b.localeCompare(a))
      .map(ym => ({ value: ym, label: formatMonth(ym) }))
  }, [allContainers])

  const containers = useMemo(() => {
    let result = allContainers

    if (selectedMonth) {
      result = result.filter(c => etdYearMonth(c.etd) === selectedMonth)
    }

    const term = search.trim().toLowerCase()
    if (term) {
      result = result.filter(c =>
        c.container_number?.toLowerCase().includes(term) ||
        (c.invoices || []).some(i => i.invoice_number?.toLowerCase().includes(term))
      )
    }

    return result
  }, [allContainers, search, selectedMonth])

  const clearFilters = () => { setSearch(''); setSelectedMonth('') }

  return {
    containers, loading,
    search, onSearchChange: setSearch,
    selectedMonth, onMonthChange: setSelectedMonth,
    monthOptions,
    hasFilters: !!search || !!selectedMonth,
    clearFilters,
    refetch: fetchContainers,
  }
}
