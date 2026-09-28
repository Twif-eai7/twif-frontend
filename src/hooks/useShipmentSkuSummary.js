import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { resolveMerchantMemberLinkIds, findMerchantMemberId } from '../lib/poQueries'
import { titleCaseName } from '../utils/formatters'

// Same visibility rule as usePendingWorkOverview.js / useBuyerOptions.js.
function canSeeAll(role, dept) {
  return role === 'admin' || role === 'owner' || dept === 'tech'
}

export const SKU_SUMMARY_PAGE_SIZE = 10 // POs per page, not SKU rows — see sql/sku_summary_rpc.sql

// Read-only, cross-buyer "sailed out summary" — the Logistics MIS landing
// page. Used to pull every po_line_items row this member can see (13k+ at
// once) and filter/paginate/group in JS, which froze the page on load.
// Filtering, pagination (by PO, so a PO's SKUs never split across pages) and
// the stat-card aggregates now all happen server-side via
// get_sku_summary_page / get_sku_summary_stats (sql/sku_summary_rpc.sql) —
// the client only ever holds one page's worth of rows.
export function useShipmentSkuSummary({ enabled = true, buyerOrgId, vendorOrgId, status, search, page, targetDateFrom, targetDateTo, shippedDateFrom, shippedDateTo, merchant, merchantExclude, merchantExact }) {
  const { orgMembership } = useProfileStore()
  const role = orgMembership?.role
  const dept = orgMembership?.department
  const memberId = orgMembership?.memberId

  const [rows, setRows] = useState([])
  const [stats, setStats] = useState({ skuCount: 0, ordered: 0, shipped: 0, balance: 0, orderedValue: 0, shippedValue: 0, balanceValue: 0 })
  const [totalPoCount, setTotalPoCount] = useState(0)
  // Starts true when the caller isn't ready to fetch yet (e.g. still
  // resolving a deep-linked buyer name to an org id) — keeps the skeleton
  // up instead of briefly showing an empty/unfiltered state.
  const [loading, setLoading] = useState(!enabled)

  // Deep-linking into MIS with filters (AnalyticsV2Section's KPI cards)
  // applies the filters a tick after mount, which fires a second fetch right
  // behind the initial unfiltered one — without this guard, whichever
  // request happens to resolve last wins, so the unfiltered mount fetch
  // could clobber the filtered one's results if it's slower.
  const requestIdRef = useRef(0)

  const fetchPage = useCallback(async () => {
    if (!role || !enabled) return
    const requestId = ++requestIdRef.current
    setLoading(true)

    let linkIds = canSeeAll(role, dept) ? null : await resolveMerchantMemberLinkIds(memberId)
    if (requestId !== requestIdRef.current) return

    // Merchant filter: prefer scoping to that merchant's own assigned buyer
    // access (resolveBuyerOrgsForMember's priority — buyer_supplier_link_id
    // they have direct access to, else buyer_org_id — same source
    // AnalyticsV2's merchant switcher uses) instead of ANDing a literal
    // purchase_orders.created_by match on top of the buyer/vendor filters.
    // That combination can zero out real data whenever the PO's recorded
    // creator text doesn't literally match the assigned merchandiser's
    // name, even though they legitimately have access to that buyer.
    let merchantText = merchant?.trim() || null
    if (merchantText) {
      const merchantMemberId = await findMerchantMemberId(merchantText)
      if (requestId !== requestIdRef.current) return
      if (merchantMemberId) {
        const merchantLinkIds = await resolveMerchantMemberLinkIds(merchantMemberId)
        if (requestId !== requestIdRef.current) return
        linkIds = linkIds ? linkIds.filter(id => merchantLinkIds.includes(id)) : merchantLinkIds
        merchantText = null
      }
    }

    if (linkIds && linkIds.length === 0) {
      setRows([])
      setStats({ skuCount: 0, ordered: 0, shipped: 0, balance: 0, orderedValue: 0, shippedValue: 0, balanceValue: 0 })
      setTotalPoCount(0)
      setLoading(false)
      return
    }

    const params = {
      p_link_ids: linkIds,
      p_buyer_org_id: buyerOrgId || null,
      p_vendor_org_id: vendorOrgId || null,
      p_status: status && status !== 'all' ? status : null,
      p_search: search?.trim() || null,
      p_target_date_from: targetDateFrom || null,
      p_target_date_to: targetDateTo || null,
      p_shipped_date_from: shippedDateFrom || null,
      p_shipped_date_to: shippedDateTo || null,
      // merchantExact wins if both are somehow set — it's a deliberate
      // caller override (AnalyticsV2Section's Lakshit case), not something
      // that should ever be silently dropped in favor of the smart match.
      // merchantExact bypasses the whole findMerchantMemberId/
      // resolveMerchantMemberLinkIds substitution above — a plain created_by
      // ILIKE match, straight through to the RPC. Needed for a merchant
      // whose real DB access is broader than just their own POs (Lakshit
      // Bohra's member_organization_access grant covers all of House Doctor,
      // not just his own slice — same reason his AnalyticsV2 numbers need a
      // raw created_by query instead of the normal RPC path), where the
      // "prefer their assigned buyer access" substitution above silently
      // widens the filter back out instead of narrowing it.
      p_merchant: merchantExact?.trim() || merchantText,
      // Unlike p_merchant above, this never goes through the
      // resolveMerchantMemberLinkIds shortcut either — it's a plain
      // created_by NOT ILIKE match (see sql/sku_summary_rpc.sql's header
      // comment), used for a merchant whose own POs aren't reliably tagged
      // with their own name (Shayni Sharma's House Doctor slice = everything
      // except Lakshit Bohra's POs, not a positive name match on her own).
      p_merchant_exclude: merchantExclude?.trim() || null,
    }

    const [pageResult, statsResult] = await Promise.all([
      supabase.rpc('get_sku_summary_page', {
        ...params,
        p_page: page || 1,
        p_page_size: SKU_SUMMARY_PAGE_SIZE,
      }),
      supabase.rpc('get_sku_summary_stats', params),
    ])

    if (requestId !== requestIdRef.current) return
    setLoading(false)

    if (pageResult.error) { console.error('[useShipmentSkuSummary] page fetch error:', pageResult.error.message); return }
    if (statsResult.error) console.error('[useShipmentSkuSummary] stats fetch error:', statsResult.error.message)

    const data = pageResult.data || []
    setTotalPoCount(data.length ? Number(data[0].total_po_count) : 0)
    setRows(data.map(r => ({
      id: r.li_id,
      poId: r.po_id,
      poNumber: r.po_number,
      buyerOrgId: r.buyer_org_id,
      buyerName: titleCaseName(r.buyer_name) ?? null,
      vendorName: titleCaseName(r.vendor_name) ?? null,
      skuRef: r.sku_ref,
      variant: r.sku_variant,
      ordered: r.ordered ?? 0,
      shipped: r.shipped ?? 0,
      balance: r.balance ?? 0,
      cancelled: r.cancelled ?? 0,
      orderedValue: r.ordered_value ?? 0,
      shippedValue: r.shipped_value ?? 0,
      balanceValue: r.balance_value ?? 0,
      orderDate: r.order_date,
      targetDate: r.target_date,
      shippedDate: r.shipped_date,
      status: r.status,
    })))

    if (!statsResult.error && statsResult.data) {
      setStats({
        skuCount: statsResult.data.skuCount ?? 0,
        ordered: statsResult.data.ordered ?? 0,
        shipped: statsResult.data.shipped ?? 0,
        balance: statsResult.data.balance ?? 0,
        orderedValue: statsResult.data.orderedValue ?? 0,
        shippedValue: statsResult.data.shippedValue ?? 0,
        balanceValue: statsResult.data.balanceValue ?? 0,
      })
    }
  }, [role, dept, memberId, enabled, buyerOrgId, vendorOrgId, status, search, page, targetDateFrom, targetDateTo, shippedDateFrom, shippedDateTo, merchant, merchantExclude, merchantExact])

  useEffect(() => { fetchPage() }, [fetchPage])

  const totalPages = Math.max(1, Math.ceil(totalPoCount / SKU_SUMMARY_PAGE_SIZE))

  return { rows, stats, loading, totalPoCount, totalPages, refetch: fetchPage }
}
