import { useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { usePoStore, usePOFilters, PO_PAGE_SIZE } from '../stores/poStore'
import {
  resolveSupplierLinkIds,
  resolveBuyerLinkIds,
  resolveBuyerOrgLinkIds,
  resolveMerchantMemberLinkIds,
} from '../lib/poQueries'

export function useFetchPOs() {
  const filters = usePOFilters()
  const { orgMembership } = useProfileStore()

  const setRows       = usePoStore(s => s.setRows)
  const setStats      = usePoStore(s => s.setStats)
  const setTotal      = usePoStore(s => s.setTotal)
  const setPage       = usePoStore(s => s.setPage)
  const setTotalPages = usePoStore(s => s.setTotalPages)
  const setHasMore    = usePoStore(s => s.setHasMore)
  const setLoading    = usePoStore(s => s.setLoading)
  const setError      = usePoStore(s => s.setError)

  const filtersRef       = useRef(filters)
  const orgMembershipRef = useRef(orgMembership)
  filtersRef.current       = filters
  orgMembershipRef.current = orgMembership

  return useCallback(async (pg = 1, overrideFilters, refetchStats = true) => {
    const f           = overrideFilters ?? filtersRef.current
    const orgMembership = orgMembershipRef.current

    setLoading(true)
    setError(null)

    const pageNum = Math.max(1, pg)
    const from    = (pageNum - 1) * PO_PAGE_SIZE
    const to      = from + PO_PAGE_SIZE - 1

    try {
      const orgType     = orgMembership?.orgType
      const orgId       = orgMembership?.orgId
      const isAdminUser = orgMembership?.role === 'admin' || orgMembership?.role === 'owner'
      const isSeniorUser = isAdminUser

      // ── Resolve filter link IDs ──────────────────────────────────────────
      let [supplierLinkIds, buyerLinkIds] = await Promise.all([
        resolveSupplierLinkIds(f.supplier),
        resolveBuyerLinkIds(f.buyer),
      ])

      // Buyer org: lock to own links
      if (!isSeniorUser && orgType === 'buyer' && orgId) {
        buyerLinkIds = await resolveBuyerOrgLinkIds(orgId, orgMembership?.memberId)
      }

      // ── Merchant scoping ─────────────────────────────────────────────────
      if (orgType === 'merchant' && !isSeniorUser) {
        const memberLinkIds = await resolveMerchantMemberLinkIds(orgMembership?.memberId)
        supplierLinkIds = supplierLinkIds
          ? supplierLinkIds.filter(id => memberLinkIds.includes(id))
          : memberLinkIds
      }

      // supplierLinkIds and buyerLinkIds both filter the same buyer_supplier_link_id
      // column (one from the supplier/merchant-access scoping above, one from the
      // buyer filter/org lock). Applying two separate .in() calls on the same column
      // ANDs them together via PostgREST, which is the right semantics, but sending
      // two large id lists in the query string can blow past the URL length limit
      // and come back 400 — intersect client-side into one, much smaller list instead.
      let linkIds = null
      if (supplierLinkIds && buyerLinkIds) {
        const buyerSet = new Set(buyerLinkIds)
        linkIds = supplierLinkIds.filter(id => buyerSet.has(id))
      } else {
        linkIds = supplierLinkIds ?? buyerLinkIds ?? null
      }

      // Early-exit if the resolved link set is empty — an empty array means
      // genuinely no matches and must return zero rows; passing [] to Supabase's
      // .in() produces an invalid "in.()" filter and the request comes back 400
      // (this is what non-senior merchant users, e.g. erp — who often have no
      // member_organization_access rows — were hitting via the buyer filter).
      const EMPTY = { confirmed_count: 0, pending_count: 0, total_amount: 0 }
      if (linkIds?.length === 0) {
        setRows([]); setTotal(0); setTotalPages(1); setHasMore(false)
        if (refetchStats) setStats(EMPTY)
        return
      }

      const merchantFilter = isSeniorUser ? (f.merchant?.trim() || null) : null

      // ── Build PO query ───────────────────────────────────────────────────
      let q = supabase
        .from('purchase_orders')
        .select(
          `*,
          buyer_supplier_links!inner (
            buyer_org_id,
            buyer:organizations!buyer_supplier_links_buyer_org_id_fkey (display_name),
            supplier:organizations!buyer_supplier_links_supplier_org_id_fkey (display_name)
          ),
          po_line_items (
            id, buyer_sku_ref, sku_variant,
            quantity_ordered, unit_price, order_value_usd,
            shipped_quantity, shipped_value_usd,
            balance_quantity, balance_value_usd,
            cancelled_quantity, status, order_date, target_date, shipped_date
          ),
          onBehalf:organization_members!purchase_orders_on_behalf_of_fkey (
            id, full_name, department
          )`,
          { count: 'exact' }
        )
        .is('deleted_at', null)
        .is('delete_meta', null)
        .neq('status', 'closed')
        .gte('po_received_date', '2026-01-01')
        .is('erp_last_synced_at',null)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (orgMembership?.department !== 'tech') q = q.not('is_test', 'is', true)
      if (f.poNumber?.trim())         q = q.ilike('po_number',          `%${f.poNumber.trim()}%`)
      if (f.piStatus === 'confirmed') q = q.eq('pi_confirmed',           true)
      if (f.piStatus === 'pending')   q = q.not('pi_confirmed',          'is', true)
      if (f.erpStatus === 'synced')   q = q.eq('erp_synced',             true)
      if (f.erpStatus === 'pending')  q = q.eq('erp_synced',             false)
      if (f.dateFrom)                         q = q.gte('po_received_date',              f.dateFrom)
      if (f.dateTo)                           q = q.lte('po_received_date',              f.dateTo)
      if (f.exceptionStatus === 'exception')  q = q.not('exceptional_ex_factory_date',   'is', null)
      if (linkIds)                             q = q.in('buyer_supplier_link_id',          linkIds)
      if (merchantFilter)                     q = q.ilike('created_by',                  `%${merchantFilter}%`)

      // ── Stats RPC in parallel ────────────────────────────────────────────
      const promises = [q]
      if (refetchStats) {
        promises.push(
          supabase.rpc('get_po_stats', {
            p_supplier_link_ids: supplierLinkIds ?? null,
            p_buyer_link_ids:    buyerLinkIds    ?? null,
            p_po_number:         f.poNumber?.trim()  || null,
            p_pi_status:         f.piStatus          || null,
            p_date_from:         f.dateFrom          || null,
            p_date_to:           f.dateTo            || null,
            p_erp_status:        f.erpStatus         || null,
            p_merchant_name:     merchantFilter      || null,
            p_exception_status:  f.exceptionStatus   || null,
            p_exclude_test:      orgMembership?.department !== 'tech',
          })
        )
      }

      const results = await Promise.all(promises)

      const { data: pos, error: posErr, count } = results[0]
      if (posErr) throw posErr

      if (refetchStats && results[1]) {
        const { data: statsData, error: statsErr } = results[1]
        if (statsErr) console.warn('[useFetchPOs] get_po_stats failed:', statsErr.message)
        else setStats(statsData)
      }

      const normalized = (pos || []).map(po => ({
        ...po,
        buyer_name:        po.buyer_supplier_links?.buyer?.display_name    ?? null,
        supplier_name:     po.buyer_supplier_links?.supplier?.display_name ?? null,
        buyer_org_id:      po.buyer_supplier_links?.buyer_org_id           ?? null,
        on_behalf_of_name: po.onBehalf?.full_name                          ?? null,
        on_behalf_of_dept: po.onBehalf?.department                         ?? null,
      }))

      const totalCount = count || 0
      setRows(normalized)
      setTotal(totalCount)
      setPage(pageNum)
      setTotalPages(Math.ceil(totalCount / PO_PAGE_SIZE) || 1)
      setHasMore(to < totalCount - 1)

    } catch (err) {
      setError(err.message || 'Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }, [])
}
