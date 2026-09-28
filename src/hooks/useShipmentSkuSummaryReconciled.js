import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { resolveMerchantMemberLinkIds, findMerchantMemberId } from '../lib/poQueries'
import { titleCaseName } from '../utils/formatters'
import { dateFieldForStatus } from '../utils/misFilters'

// Same visibility rule as useShipmentSkuSummary.js.
function canSeeAll(role, dept) {
  return role === 'admin' || role === 'owner' || dept === 'tech'
}

export const SKU_SUMMARY_RECONCILED_PAGE_SIZE = 10 // POs per page, not SKU rows

// Calls get_sku_summary_page_reconciled/get_sku_summary_stats_reconciled
// (sql/sku_summary_rpc_reconciled.sql) — separate RPCs from the ones MIS and
// its Excel export use (useShipmentSkuSummary.js / useSkuSummaryExport.js),
// so nothing here can change a number those already show. The one behavior
// difference: for status 'all' (or unset), this hook forwards BOTH the
// target-date and shipped-date windows to the RPC, which OR-matches them
// there — a row counts if its target_date falls in the window OR it has a
// shipment leg in the window, so "All" for a given year reconciles with
// AnalyticsV2Section's header stats (currentFyVolume/totalOpenPos) instead of
// only ever looking at target_date the way MIS's own "All" does. For every
// other status, only the ONE field dateFieldForStatus implies is forwarded
// (the other forced null) — identical to how MIS/AnalyticsV2Section already
// call the original RPC, so those statuses behave exactly as they do there.
export function useShipmentSkuSummaryReconciled({ enabled = true, buyerOrgId, vendorOrgId, status, search, page, targetDateFrom, targetDateTo, shippedDateFrom, shippedDateTo, merchant, merchantExclude, merchantExact }) {
  const { orgMembership } = useProfileStore()
  const role = orgMembership?.role
  const dept = orgMembership?.department
  const memberId = orgMembership?.memberId
  const orgType = orgMembership?.orgType
  const orgId = orgMembership?.orgId
  // A supplier or buyer org viewing its own dashboard, not a merchant staff
  // member — member_organization_access (what resolveMerchantMemberLinkIds/
  // canSeeAll below are about) has nothing to do with them, so forcing
  // p_vendor_org_id (supplier) / p_buyer_org_id (buyer) to their own org id
  // is what actually scopes their results.
  const isSupplierViewer = orgType === 'supplier'
  const isBuyerViewer    = orgType === 'buyer'
  const isScopedOrgViewer = isSupplierViewer || isBuyerViewer

  const [rows, setRows] = useState([])
  const [stats, setStats] = useState({ skuCount: 0, ordered: 0, shipped: 0, balance: 0, orderedValue: 0, shippedValue: 0, balanceValue: 0, shippedPoCount: null, shippedContributingPoCount: null })
  const [totalPoCount, setTotalPoCount] = useState(0)
  const [loading, setLoading] = useState(!enabled)

  const requestIdRef = useRef(0)

  const fetchPage = useCallback(async () => {
    if (!role || !enabled) return
    const requestId = ++requestIdRef.current
    setLoading(true)

    let linkIds = isScopedOrgViewer ? null : (canSeeAll(role, dept) ? null : await resolveMerchantMemberLinkIds(memberId))
    if (requestId !== requestIdRef.current) return

    let merchantText = isScopedOrgViewer ? null : (merchant?.trim() || null)
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
      setStats({ skuCount: 0, ordered: 0, shipped: 0, balance: 0, orderedValue: 0, shippedValue: 0, balanceValue: 0, shippedPoCount: null, shippedContributingPoCount: null })
      setTotalPoCount(0)
      setLoading(false)
      return
    }

    // 'all'/unset forwards both windows (the RPC OR-matches them); every
    // other status forwards only the field it's bound to, same as
    // useShipmentSkuSummary.js — otherwise, e.g., an 'open' PO with no
    // shipped leg at all would fail an unintended shipped-date requirement.
    const isAllStatus = !status || status === 'all'
    const dateField = isAllStatus ? null : dateFieldForStatus(status)
    const useTarget  = isAllStatus || dateField === 'target'
    const useShipped = isAllStatus || dateField === 'shipped'

    const params = {
      p_link_ids: linkIds,
      p_buyer_org_id: isBuyerViewer ? orgId : (buyerOrgId || null),
      p_vendor_org_id: isSupplierViewer ? orgId : (vendorOrgId || null),
      p_status: status && status !== 'all' ? status : null,
      p_search: search?.trim() || null,
      p_target_date_from: useTarget ? (targetDateFrom || null) : null,
      p_target_date_to: useTarget ? (targetDateTo || null) : null,
      p_shipped_date_from: useShipped ? (shippedDateFrom || null) : null,
      p_shipped_date_to: useShipped ? (shippedDateTo || null) : null,
      p_merchant: merchantExact?.trim() || merchantText,
      p_merchant_exclude: merchantExclude?.trim() || null,
    }

    const [pageResult, statsResult] = await Promise.all([
      supabase.rpc('get_sku_summary_page_reconciled', {
        ...params,
        p_page: page || 1,
        p_page_size: SKU_SUMMARY_RECONCILED_PAGE_SIZE,
      }),
      supabase.rpc('get_sku_summary_stats_reconciled', params),
    ])

    if (requestId !== requestIdRef.current) return
    setLoading(false)

    if (pageResult.error) { console.error('[useShipmentSkuSummaryReconciled] page fetch error:', pageResult.error.message); return }
    if (statsResult.error) console.error('[useShipmentSkuSummaryReconciled] stats fetch error:', statsResult.error.message)

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
        shippedPoCount: statsResult.data.shippedPoCount ?? null,
        shippedContributingPoCount: statsResult.data.shippedContributingPoCount ?? null,
      })
    }
  }, [role, dept, memberId, orgId, isSupplierViewer, isBuyerViewer, isScopedOrgViewer, enabled, buyerOrgId, vendorOrgId, status, search, page, targetDateFrom, targetDateTo, shippedDateFrom, shippedDateTo, merchant, merchantExclude, merchantExact])

  useEffect(() => { fetchPage() }, [fetchPage])

  const totalPages = Math.max(1, Math.ceil(totalPoCount / SKU_SUMMARY_RECONCILED_PAGE_SIZE))

  return { rows, stats, loading, totalPoCount, totalPages, refetch: fetchPage }
}
