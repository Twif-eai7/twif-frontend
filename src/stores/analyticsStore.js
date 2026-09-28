import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useAuthStore } from './authStore'
import { useProfileStore } from './profileStore'
import { supabase } from '../lib/supabase'
import { resolveMerchantMemberLinkIds, resolveSupplierOrgLinkIds, resolveBuyerOrgLinkIds } from '../lib/poQueries'

export { FY_CONFIG } from './dashboardStore'
import { FY_CONFIG } from './dashboardStore'

// Re-added specifically for the FY25 legacy-backend fallback below — Supabase's
// po_shipment_leg data is incomplete that far back, so FY25's own "previous
// year" figure (only relevant while viewing FY26) still has to come from the
// legacy route rather than a live RPC, unlike FY26/FY27 which are fully live now.
const BASE = import.meta.env.VITE_BACKEND_URL

const FY_DATES = {
  fy25: ['2024-04-01', '2025-03-31'],
  fy26: ['2025-04-01', '2026-03-31'],
  fy27: ['2026-04-01', '2027-03-31'],
  fy28: ['2027-04-01', '2028-03-31'],
}

function prevFy(fy) {
  const n = parseInt(fy.replace('fy', ''), 10)
  return `fy${n - 1}`
}

function toVolumeData(flatRows, cfg) {
  const labelToKey = {}
  cfg.openPoFiscal.forEach((label, i) => { labelToKey[label] = cfg.fiscalMonths[i] })

  const map           = {}
  const countryTotals = {}
  const clientTotals  = {}

  ;(flatRows || []).forEach(row => {
    const monthKey = labelToKey[row.month]
    if (!monthKey) return
    const k = `${row.buyer}||${row.vendor}`
    if (!map[k]) map[k] = { buyer: row.buyer, vendor: row.vendor }
    map[k][monthKey] = (map[k][monthKey] || 0) + Number(row.value || 0)

    const v       = Number(row.value || 0)
    const country = row.country || 'Unknown'
    countryTotals[country]  = (countryTotals[country]  || 0) + v
    clientTotals[row.buyer] = (clientTotals[row.buyer] || 0) + v
  })

  const originData = Object.entries(countryTotals)
    .map(([origin, value]) => ({ origin, value }))
    .sort((a, b) => b.value - a.value)

  const clientData = Object.entries(clientTotals)
    .map(([client, value]) => ({ client, value }))
    .sort((a, b) => b.value - a.value)

  return {
    headers: cfg.fiscalMonths,
    rows:    Object.values(map),
    originData,
    clientData,
  }
}

function toOpenData(flatRows, cfg) {
  const breakdown = {}
  const rowMap    = {}

  // Row values are keyed by the raw full month name (e.g. "April 2025"),
  // NOT a short fiscal key like "April" — dashboard_open_by_month is
  // unscoped by fiscal year (TYTD spans multiple FYs), and this single
  // openOrdersData object gets reused for both the FY26 and FY27 "By
  // Months" cards side by side. FY26 and FY27's own fiscalMonths arrays
  // both use "April".."December" for their first 9 entries, so a short key
  // would silently collide between years (e.g. "April" meaning April 2025
  // for one card's fyConfig and April 2026 for the other's) — the full
  // name is globally unique and immune to that.
  ;(flatRows || []).forEach(row => {
    const { buyer, vendor, month } = row
    const count = Number(row.count || 0)
    const value = Number(row.value || 0)

    if (!breakdown[buyer]) breakdown[buyer] = []
    const existing = breakdown[buyer].find(e => e.month === month)
    if (existing) { existing.count += count; existing.value += value }
    else breakdown[buyer].push({ month, count, value })

    const k = `${buyer}||${vendor}`
    if (!rowMap[k]) rowMap[k] = { buyer, vendor }
    rowMap[k][month] = (rowMap[k][month] || 0) + value
  })

  return {
    buyerBreakdown: breakdown,
    rows:           Object.values(rowMap),
    months:         cfg.fiscalMonths,
  }
}

// ── Abort controller ──────────────────────────────────────────────────────────
let _abort = null

// ── Metadata cache — only invalidated when merchant changes ───────────────────
// Holds the resolved link IDs, buyer name map, merchant list.
// Skips 3 sequential DB round-trips on every buyer/FY filter switch.
let _meta = null  // { merchant, memberId, baseLinkIds, linkToBuyer, linkToSupplier, availableBuyers, merchantList, isAdmin }

function clearMeta() { _meta = null }

// ── Store ─────────────────────────────────────────────────────────────────────
export const useAnalyticsStore = create(
  devtools(
    (set, get) => ({
      summary:           null,
      volumeData:        null,
      openOrdersData:    null,
      openCurrentMonthSplit: [],
      // Only populated while viewing FY27 — a live dashboard_volume_by_month
      // RPC call scoped to FY26's own dates, fetched alongside everything
      // else so the "FY26 By Months" side-by-side card (and its Shipped KPI,
      // fy26ShippedTotal) reads from the same live Supabase data FY27's own
      // numbers do, instead of a legacy backend snapshot that can drift.
      fy26VolumeData:    null,
      fy26ShippedTotal:  0,
      // Stored, real per-buyer target (buyer_fy_targets — sql/buyer_fy_
      // targets.sql), summed over whichever buyers are in scope for the
      // current member/company-wide view. null until a fetch resolves one.
      storedFyTarget:    null,
      // FY25's shipped total, from the legacy backend (Supabase's
      // po_shipment_leg data is incomplete that far back) — only fetched
      // while viewing FY26 (FY25 is its "previous year"). null otherwise.
      fy25ShippedTotal:  null,

      otifMonthlyData:  null,
      otifLoading:      false,

      availableBuyers:   [],
      availableSuppliers: [],
      merchantList:      [],
      currentBuyer:      null,
      currentSupplier:   null,
      currentMerchant:   null,
      isAdmin:           false,
      fyYear:            'fy27',

      loading: true,
      error:   null,

      fetchAll: async ({ buyer: buyerArg, supplier: supplierArg, merchant: merchantEmail, fyYear, forceMeta = false } = {}) => {
        const session = useAuthStore.getState().session
        if (!session) {
          set({ loading: false, error: 'Session expired — please refresh the page.' }, false, 'analytics/noSession')
          return
        }

        const fy  = fyYear ?? get().fyYear
        const cfg = FY_CONFIG[fy] ?? FY_CONFIG.fy27

        if (_abort) _abort.abort()
        _abort = new AbortController()
        const signal = _abort.signal

        set({ loading: true, error: null }, false, 'analytics/fetchStart')

        try {
          const profile    = useProfileStore.getState()
          const memberId   = profile.orgMembership?.memberId
          const orgId      = profile.orgMembership?.orgId
          const orgType    = profile.orgMembership?.orgType
          const memberRole = profile.orgMembership?.role
          const memberDept = profile.orgMembership?.department
          const isAdmin    = memberRole === 'admin' || memberRole === 'owner'
          // A supplier or buyer org viewing its own dashboard, not a merchant
          // staff member looking up which buyers/suppliers they're assigned
          // to — no "view as this merchant colleague" concept applies to
          // them (merchant/targetMemberId/canSeeAllLinks below all stay
          // off), and their own scope is always exactly their own org's
          // links, admin or not — "company-wide" isn't a meaningful concept
          // for a non-merchant org the way it is for a merchant admin/tech
          // viewer.
          const isSupplierViewer = orgType === 'supplier'
          const isBuyerViewer    = orgType === 'buyer'
          const isScopedOrgViewer = isSupplierViewer || isBuyerViewer

          if (!memberId) {
            set({ loading: false, error: 'Profile not ready.' }, false, 'analytics/noProfile')
            return
          }

          const merchant = isScopedOrgViewer ? null : (merchantEmail ?? null)

          // Same canSeeAll(role, dept) rule the MIS/SKU-summary hooks already
          // use (useShipmentSkuSummary.js etc.) — an admin/owner/tech-dept
          // viewer sees every buyer_supplier_link company-wide instead of
          // only their own member_organization_access rows. Only applies with
          // no specific merchant selected: picking a merchant from the
          // dropdown is a deliberate "view as that merchant" narrowing, so it
          // still resolves that merchant's own scoped links below, same as
          // the MIS hooks do when a merchant filter narrows an unrestricted
          // canSeeAll scope.
          const canSeeAllLinks = !isScopedOrgViewer && !merchant && (isAdmin || memberDept === 'tech')

          // ── Metadata: only re-fetch when merchant changes ─────────────────
          const needsMeta = forceMeta || !_meta || _meta.merchant !== merchant || _meta.memberId !== memberId
          if (needsMeta) {
            let targetMemberId = memberId
            if (merchant) {
              // Use cached merchantList if available, otherwise it'll populate after
              const found = get().merchantList.find(m => m.email === merchant)
              if (found?.id) targetMemberId = found.id
            }

            let baseLinkIds = null
            if (isSupplierViewer) {
              baseLinkIds = await resolveSupplierOrgLinkIds(orgId, memberId)
            } else if (isBuyerViewer) {
              baseLinkIds = await resolveBuyerOrgLinkIds(orgId, memberId)
            } else if (!canSeeAllLinks) {
              baseLinkIds = await resolveMerchantMemberLinkIds(targetMemberId)
            }
            if (!canSeeAllLinks) {
              if (signal.aborted) return

              if (!baseLinkIds?.length) {
                _meta = null
                set({
                  loading: false, summary: null, volumeData: null,
                  openOrdersData: null, openCurrentMonthSplit: [], availableBuyers: ['Total'],
                  currentBuyer: null, currentMerchant: merchant, storedFyTarget: null,
                }, false, 'analytics/noLinks')
                return
              }
            }

            const [buyerLinksRes, merchantMembersRes] = await Promise.all([
              canSeeAllLinks
                ? supabase.from('buyer_supplier_links').select('id, buyer_org_id, supplier_org_id')
                : supabase.from('buyer_supplier_links').select('id, buyer_org_id, supplier_org_id').in('id', baseLinkIds),
              !isScopedOrgViewer && isAdmin && orgId
                ? supabase.from('organization_members').select('id, full_name, email')
                    .eq('organization_id', orgId).eq('department', 'merchandising').is('removed_at', null)
                : Promise.resolve({ data: [] }),
            ])
            if (signal.aborted) return

            // Company-wide for canSeeAllLinks — every link that came back
            // unrestricted above IS the full scope, same as resolveMerchant-
            // MemberLinkIds returning a member's own subset otherwise. Kept
            // as a real array (not null) so the buyer/vendor filtering below
            // — which does plain array methods on it — needs no special-casing.
            if (canSeeAllLinks) baseLinkIds = (buyerLinksRes.data || []).map(l => l.id)

            // Batch org name lookup for buyers + suppliers in one query
            const buyerOrgIds    = [...new Set((buyerLinksRes.data || []).map(l => l.buyer_org_id).filter(Boolean))]
            const supplierOrgIds = [...new Set((buyerLinksRes.data || []).map(l => l.supplier_org_id).filter(Boolean))]
            const allOrgIds      = [...new Set([...buyerOrgIds, ...supplierOrgIds])]
            let orgNameMap = {}
            if (allOrgIds.length) {
              const { data: orgs } = await supabase.from('organizations').select('id, display_name').in('id', allOrgIds)
              orgNameMap = Object.fromEntries((orgs || []).map(o => [o.id, o.display_name]))
            }
            if (signal.aborted) return

            const linkToBuyer    = Object.fromEntries(
              (buyerLinksRes.data || []).map(l => [l.id, orgNameMap[l.buyer_org_id]])
            )
            const linkToSupplier = Object.fromEntries(
              (buyerLinksRes.data || []).map(l => [l.id, orgNameMap[l.supplier_org_id] || 'Unknown'])
            )
            // For buyer_fy_targets — a link's own buyer_org_id (not its
            // display name), so baseLinkIds can be mapped straight to which
            // buyers' stored targets are actually relevant to this scope.
            const linkToBuyerOrgId = Object.fromEntries(
              (buyerLinksRes.data || []).map(l => [l.id, l.buyer_org_id])
            )
            const buyerNames      = [...new Set(Object.values(linkToBuyer).filter(Boolean))].sort()
            const availableBuyers = ['Total', ...buyerNames]
            const merchantList    = (merchantMembersRes.data || [])
              .filter(m => m.id && m.email)
              .map(m => ({ id: m.id, name: m.full_name || m.email, email: m.email }))

            _meta = { merchant, memberId, baseLinkIds, linkToBuyer, linkToSupplier, linkToBuyerOrgId, availableBuyers, merchantList, isAdmin }
          }

          const { baseLinkIds, linkToBuyer, linkToSupplier, linkToBuyerOrgId, availableBuyers, merchantList } = _meta

          // ── Filter link IDs by selected buyer ─────────────────────────────
          const buyer = buyerArg ?? null
          let buyerOnlyLinkIds = baseLinkIds
          if (buyer && buyer !== 'All' && buyer !== 'Total') {
            const subset = baseLinkIds.filter(id => linkToBuyer[id] === buyer)
            if (subset.length) buyerOnlyLinkIds = subset
          }

          // Suppliers available for the current buyer scope — works the same
          // regardless of how baseLinkIds was resolved (a broad org-wide
          // grant, or one or more specific buyer_supplier_link_id grants):
          // it's whatever distinct vendors buyerOnlyLinkIds' own links
          // actually point at, naturally collapsing to a single (or zero)
          // option when that's genuinely all there is, same as any other
          // narrowly-scoped viewer — no special-casing needed.
          const availableSuppliers = [
            ...new Set(buyerOnlyLinkIds.map(id => linkToSupplier[id]).filter(s => s && s !== 'Unknown'))
          ].sort()

          // ── Filter link IDs by selected supplier (KPI + table RPCs only) ────
          // Volume data stays buyer-scoped so the chart vendor dropdown is always
          // client-side and switching back to "All Vendors" is always consistent.
          const supplier = supplierArg ?? null
          let filteredLinkIds = buyerOnlyLinkIds
          if (supplier && supplier !== 'All') {
            const subset = buyerOnlyLinkIds.filter(id => linkToSupplier[id] === supplier)
            if (subset.length) filteredLinkIds = subset
          }

          // ── RPCs in parallel ─────────────────────────────────────────────
          const [fyStart, fyEnd]     = FY_DATES[fy]         || FY_DATES.fy27
          const [prevStart, prevEnd] = FY_DATES[prevFy(fy)] || FY_DATES.fy26
          const [fy26Start, fy26End] = FY_DATES.fy26

          // FY25 fallback (Supabase's po_shipment_leg is incomplete that far
          // back) — only needed while viewing FY26, whose "previous year" is
          // FY25. Same legacy route/response shape the old fy26ShippedVolume
          // fetch used (FY_CONFIG.fy26.perfRoute), just reading volumeLY25
          // (FY_CONFIG.fy26.fields.previousVolume) instead of ytdActual.
          const fy25PerfParams = new URLSearchParams()
          if (buyer && buyer !== 'All' && buyer !== 'Total') fy25PerfParams.set('buyer', buyer)
          if (merchant) fy25PerfParams.set('merchant', merchant)
          const fy25PerfQs = fy25PerfParams.toString()

          const [summaryRes, volumeRes, openRes, openSplitRes, fy26VolumeRes, fyTargetsRes, fy25PerfRes] = await Promise.all([
            supabase.rpc('dashboard_summary', {
              p_link_ids: filteredLinkIds,       // supplier-filtered → KPI numbers
              p_fy_start: fyStart,   p_fy_end:   fyEnd,
              p_prev_start: prevStart, p_prev_end: prevEnd,
            }),
            supabase.rpc('dashboard_volume_by_month', {
              p_link_ids: buyerOnlyLinkIds,      // buyer-only → chart data always complete
              p_fy_start: fyStart, p_fy_end: fyEnd,
            }),
            supabase.rpc('dashboard_open_by_month', {
              p_link_ids: buyerOnlyLinkIds,      // buyer-only → chart always has all vendors
            }),
            // Same source/filters as dashboard_open_by_month, scoped to just
            // the current calendar month and split by whether target_date
            // has already passed — lets Fy26ByMonthsChart render its current
            // month's Open bar as overdue (red) + upcoming (blue) instead of
            // one solid color. See sql/dashboard_rpcs.sql.
            supabase.rpc('dashboard_open_current_month_split', {
              p_link_ids: buyerOnlyLinkIds,
            }),
            // FY27's own dashboard_volume_by_month call above is scoped to
            // FY27's dates, so it has nothing for FY26's side-by-side "FY26
            // By Months" card — a second call, same RPC, just scoped to
            // FY26's dates instead. Replaces the old legacy-backend fetch
            // (fy26VolumeData/perfRoute) that could drift from live Supabase
            // data; skipped entirely (and left stale/unused) while FY26 is
            // itself the active view, since volumeRes above already covers
            // FY26 in that case.
            fy === 'fy27'
              ? supabase.rpc('dashboard_volume_by_month', {
                  p_link_ids: buyerOnlyLinkIds, p_fy_start: fy26Start, p_fy_end: fy26End,
                })
              : Promise.resolve({ data: null, error: null }),
            // Stored, real per-buyer targets (buyer_fy_targets — see
            // sql/buyer_fy_targets.sql). Fetched unfiltered for this fy, then
            // summed client-side over whichever buyer_org_ids baseLinkIds
            // resolves to below — that's already either one member's own
            // buyer scope or the full company-wide scope, exactly matching
            // "per member" vs "overall" without any separate branching here.
            supabase.from('buyer_fy_targets').select('buyer_org_id, target_value_usd').eq('fiscal_year', fy),
            fy === 'fy26'
              ? fetch(`${BASE}${FY_CONFIG.fy26.perfRoute}${fy25PerfQs ? `?${fy25PerfQs}` : ''}`, {
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  signal,
                }).then(r => r.ok ? r.json() : null).catch(() => null)
              : Promise.resolve(null),
          ])
          if (signal.aborted) return

          if (summaryRes.error) throw new Error(`Summary: ${summaryRes.error.message}`)
          if (volumeRes.error)  throw new Error(`Volume: ${volumeRes.error.message}`)
          if (openRes.error)    throw new Error(`Open POs: ${openRes.error.message}`)
          // Non-fatal — a missing/erroring RPC (e.g. not deployed yet) just
          // means the current month's bar falls back to its old solid color.
          if (openSplitRes.error) console.error('Open current month split:', openSplitRes.error.message)
          if (fy26VolumeRes.error) console.error('FY26 volume:', fy26VolumeRes.error.message)

          const sd = summaryRes.data || {}
          const summary = {
            currentFyVolume:  parseFloat(sd.currentFyVolume  || 0),
            previousFyVolume: parseFloat(sd.previousFyVolume || 0),
            totalOpenPos:     parseFloat(sd.totalOpenPos     || 0),
            openPosCount:     parseInt(sd.openPosCount       || 0, 10),
            totalOrders:      parseFloat(sd.currentFyVolume  || 0),
            onTimePos:        parseInt(sd.onTimePos          || 0, 10),
            latePos:          parseInt(sd.latePos            || 0, 10),
            // "Original" — same on-time/late question, but never consults
            // exceptional_ex_factory_date (see dashboard_rpcs.sql's own
            // v_on_time_original/v_late_original) — backs AnalyticsV2Section's
            // "OTIF (Original)" card; onTimePos/latePos above (exception-
            // aware) back the separate "OTIF (After Exception)" card.
            onTimePosOriginal: parseInt(sd.onTimePosOriginal  || 0, 10),
            latePosOriginal:  parseInt(sd.latePosOriginal     || 0, 10),
            partialPos:       parseInt(sd.partialPos         || 0, 10),
            // Fully-shipped POs with a final_date, regardless of on-time/
            // late — feeds the "Fully Shipped" tab specifically, which must
            // NOT grow now that onTimePos/latePos themselves also count
            // qualifying partial POs (see dashboard_rpcs.sql's own
            // v_shipped_fully comment).
            shippedFullyPos:  parseInt(sd.shippedFullyPos     || 0, 10),
            availableBuyers:  sd.availableBuyers || [],
            totalConvertedSKUs: parseInt(sd.totalConvertedSKUs || 0, 10),
            // Supplier/vendor dashboard's Avg. Lead Time / Avg. Delivery Delay
            // cards (AnalyticsV2Section.jsx) — null when there's no
            // qualifying data (e.g. no late POs at all) rather than 0, so the
            // UI can tell "no data" apart from "zero days".
            avgLeadTimeDays:  sd.avgLeadTimeDays != null ? parseFloat(sd.avgLeadTimeDays) : null,
            avgDelayDays:     sd.avgDelayDays    != null ? parseFloat(sd.avgDelayDays)    : null,
          }

          const volumeData     = toVolumeData(volumeRes.data || [], cfg)
          const openOrdersData = toOpenData(openRes.data    || [], cfg)
          const openCurrentMonthSplit = openSplitRes.error ? [] : (openSplitRes.data || [])

          // Only refreshed while viewing FY27 — see the fy26VolumeRes call
          // above. Left untouched (still last-computed-while-fy27 values, or
          // still the field's initial default) while FY26 is itself the
          // active view, since nothing on that view reads them.
          const fy26Rows = fy === 'fy27' && !fy26VolumeRes.error ? (fy26VolumeRes.data || []) : null
          const fy26VolumeData   = fy26Rows ? toVolumeData(fy26Rows, FY_CONFIG.fy26) : get().fy26VolumeData
          const fy26ShippedTotal = fy26Rows ? fy26Rows.reduce((s, r) => s + (Number(r.value) || 0), 0) : get().fy26ShippedTotal

          // Stored real target for whichever scope baseLinkIds represents —
          // one member's own buyers (a merchant is selected) or every buyer
          // company-wide (canSeeAllLinks, no merchant selected). null (not
          // 0) when no buyer in scope has a stored row yet, so the frontend
          // can tell "genuinely no target" apart from "not entered yet".
          let storedFyTarget = null
          if (fyTargetsRes.error) {
            console.error('FY targets:', fyTargetsRes.error.message)
          } else if (fyTargetsRes.data?.length) {
            const scopedBuyerOrgIds = new Set(
              baseLinkIds.map(id => linkToBuyerOrgId[id]).filter(Boolean)
            )
            const relevant = fyTargetsRes.data.filter(r => scopedBuyerOrgIds.has(r.buyer_org_id))
            if (relevant.length) {
              storedFyTarget = relevant.reduce((s, r) => s + (Number(r.target_value_usd) || 0), 0)
            }
          }

          // Only refreshed while viewing FY26 (its own "previous year").
          // Left untouched otherwise, same pattern as fy26VolumeData/
          // fy26ShippedTotal above.
          const fy25ShippedTotal = fy === 'fy26'
            ? parseFloat(fy25PerfRes?.data?.summary?.[FY_CONFIG.fy26.fields.previousVolume] || 0)
            : get().fy25ShippedTotal

          set({
            fyYear: fy,
            summary,
            availableBuyers,
            availableSuppliers,
            currentBuyer:    buyer,
            currentSupplier: supplier,
            isAdmin,
            merchantList,
            currentMerchant: merchant,
            volumeData,
            openOrdersData,
            openCurrentMonthSplit,
            fy26VolumeData,
            fy26ShippedTotal,
            storedFyTarget,
            fy25ShippedTotal,
            loading: false,
          }, false, 'analytics/fetchDone')
        } catch (err) {
          if (signal.aborted) return
          console.error('analyticsStore fetch error:', err)
          set({ error: err.message, loading: false }, false, 'analytics/fetchError')
        }
      },

      switchFyYear: (year) => {
        if (!FY_CONFIG[year] || get().fyYear === year) return
        set({
          fyYear: year,
          summary: null, volumeData: null, openOrdersData: null, openCurrentMonthSplit: [], loading: true,
          otifMonthlyData: null,
          ...(year === 'fy26' ? { fy26VolumeData: null, fy26ShippedTotal: 0 } : {}),
        }, false, 'analytics/fySwitch')
        get().fetchAll({ buyer: get().currentBuyer, supplier: get().currentSupplier, merchant: get().currentMerchant, fyYear: year })
      },

      switchBuyer: (buyer) => {
        set({ otifMonthlyData: null, currentSupplier: null }, false, 'analytics/buyerSwitch')
        get().fetchAll({ buyer, merchant: get().currentMerchant, fyYear: get().fyYear })
      },

      switchSupplier: (supplier) => {
        set({ otifMonthlyData: null }, false, 'analytics/supplierSwitch')
        get().fetchAll({ buyer: get().currentBuyer, supplier, merchant: get().currentMerchant, fyYear: get().fyYear })
      },

      switchMerchant: (email) => {
        clearMeta()  // merchant changed — force metadata re-fetch
        set({ otifMonthlyData: null, currentSupplier: null }, false, 'analytics/merchantSwitch')
        get().fetchAll({ merchant: email, fyYear: get().fyYear })
      },

      reload: () => {
        clearMeta()
        get().fetchAll({ buyer: get().currentBuyer, supplier: get().currentSupplier, merchant: get().currentMerchant, fyYear: get().fyYear })
      },

      fetchOtifMonthly: async () => {
        if (!_meta?.baseLinkIds) return
        const fy       = get().fyYear
        const buyer    = get().currentBuyer
        const supplier = get().currentSupplier
        const [fyStart, fyEnd] = FY_DATES[fy] || FY_DATES.fy27

        let filteredLinkIds = _meta.baseLinkIds
        if (buyer && buyer !== 'All' && buyer !== 'Total') {
          const subset = _meta.baseLinkIds.filter(id => _meta.linkToBuyer[id] === buyer)
          if (subset.length) filteredLinkIds = subset
        }
        if (supplier && supplier !== 'All' && _meta.linkToSupplier) {
          const subset = filteredLinkIds.filter(id => _meta.linkToSupplier[id] === supplier)
          if (subset.length) filteredLinkIds = subset
        }

        set({ otifLoading: true }, false, 'analytics/otifStart')
        try {
          const { data, error } = await supabase.rpc('dashboard_otif_monthly', {
            p_link_ids: filteredLinkIds,
            p_fy_start: fyStart,
            p_fy_end:   fyEnd,
          })
          if (error) throw new Error(error.message)
          set({ otifMonthlyData: data || [], otifLoading: false }, false, 'analytics/otifDone')
        } catch (err) {
          console.error('OTIF fetch error:', err)
          set({ otifMonthlyData: [], otifLoading: false }, false, 'analytics/otifError')
        }
      },
    }),
    { name: 'Analytics Store' }
  )
)
