import { useState, useEffect, useRef } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useRole, useOrgDepartment, useProfileStore } from '../../../stores/profileStore'
import { useAuthStore } from '../../../stores/authStore'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { computeOtifMonthly, buildShippedPoBuyersParam, otifMonthKeysForFy, monthKeyToLabel } from '../../../utils/otifMonthly'
import { useDashboardStore, FY_CONFIG } from '../../../stores/dashboardStore'
import MerchantDashboard from '../../../components/dashboard/MerchantDashboard'
import { supabase } from '../../../lib/supabase'
import { useLakshitStore } from '../../../stores/lakshitStore'
import { resolveSupplierNamesForMember } from '../../../lib/poQueries'

const API_BASE = import.meta.env.VITE_BACKEND_URL

// ── Lakshit Bohra hardcoded case ──────────────────────────────────────────────
// When this merchant is selected, stats are computed from raw PO/line-item/leg
// data filtered by created_by instead of the shared link_id pool.

const LAKSHIT_FY_DATES = {
  fy26: { fyStart: '2025-04-01', fyEnd: '2026-03-31', prevStart: '2024-04-01', prevEnd: '2025-03-31' },
  fy27: { fyStart: '2026-04-01', fyEnd: '2027-03-31', prevStart: '2025-04-01', prevEnd: '2026-03-31' },
}

const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── NKUKU split-merchant case ─────────────────────────────────────────────
// NKUKU is a single real buyer org, but three merchants (Lalit Chopra, Sujata
// Soni, Suraj Prakash) each handle a different slice of its business. The
// backend performance/volume Excel has no way to express that split, so its
// buyer field was manually divided into three pseudo-buyers ("NKUKU Lalit"
// etc.) — those strings only exist in that Excel, not in real PO data, so
// passing them straight through to open-po/shipped-po summary (which read
// real PO rows keyed off the actual buyer org name) returns nothing.
// Substitute the real buyer name and scope rows instead to the supplier(s)
// that merchant has access to via member_organization_access.
const NKUKU_REAL_BUYER = 'NKUKU'
const NKUKU_SPLIT_MERCHANTS = {
  'NKUKU Lalit':  'Lalit Chopra',
  'NKUKU Sujata': 'Sujata Soni',
  'NKUKU Suraj':  'Suraj Prakash',
}

function dateToFiscalKey(dateStr, cfg) {
  const d = new Date(dateStr)
  const label = `${FULL_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  const idx = cfg.openPoFiscal.indexOf(label)
  return idx >= 0 ? cfg.fiscalMonths[idx] : null
}

function computeLakshitOpenData(poList, poBuyer, poSupplier, cfg) {
  const breakdown = {}
  const rowMap    = {}
  // The "Open POs By Months" table can show either the fiscal or calendar
  // 12-month window (openPoTableView toggle) — buyerBreakdown needs to cover
  // both, otherwise subtractOpenData has nothing to subtract for whichever
  // window isn't fiscal, and Lakshit's numbers leak through unsubtracted in
  // Shayni's view when she's on the calendar tab.
  const allowedMonths = new Set([...cfg.openPoFiscal, ...cfg.openPoCalendar])

  poList.forEach(po => {
    const buyer  = poBuyer[po.id] || 'Unknown'
    const vendor = poSupplier[po.id] || 'Unknown'
    ;(po.po_line_items || []).forEach(li => {
      if (li.status !== 'open' || !li.target_date) return
      const d = new Date(li.target_date)
      const label = `${FULL_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
      if (!allowedMonths.has(label)) return
      const fiscalIdx = cfg.openPoFiscal.indexOf(label)
      const monthKey  = fiscalIdx >= 0 ? cfg.fiscalMonths[fiscalIdx] : null

      if (!breakdown[buyer]) breakdown[buyer] = {}
      if (!breakdown[buyer][label]) breakdown[buyer][label] = { poIds: new Set(), value: 0 }
      breakdown[buyer][label].poIds.add(po.id)
      breakdown[buyer][label].value += li.balance_value_usd || 0

      const k = `${buyer}||${vendor}`
      if (!rowMap[k]) rowMap[k] = { buyer, vendor }
      if (monthKey) rowMap[k][monthKey] = (rowMap[k][monthKey] || 0) + (li.balance_value_usd || 0)
    })
  })

  const buyerBreakdown = {}
  Object.entries(breakdown).forEach(([buyer, months]) => {
    buyerBreakdown[buyer] = Object.entries(months).map(([month, { poIds, value }]) => ({
      month, count: poIds.size, value,
    }))
  })

  return { buyerBreakdown, rows: Object.values(rowMap), months: cfg.fiscalMonths }
}

function computeLakshitVolumeData(poList, legs, poBuyer, poSupplier, cfg) {
  const liToPo = {}
  poList.forEach(po => { (po.po_line_items || []).forEach(li => { liToPo[li.id] = po.id }) })

  const byRow = {}
  legs.forEach(leg => {
    if (!leg.shipped_date) return
    const monthKey = dateToFiscalKey(leg.shipped_date, cfg)
    if (!monthKey) return
    const poId   = liToPo[leg.po_line_item_id]
    if (!poId) return
    const buyer  = poBuyer[poId] || 'Unknown'
    const vendor = poSupplier[poId] || 'Unknown'
    const key = `${buyer}||${vendor}`
    if (!byRow[key]) byRow[key] = { buyer, vendor }
    byRow[key][monthKey] = (byRow[key][monthKey] || 0) + (leg.shipped_value_usd || 0)
  })

  const totalShipped = legs.reduce((s, leg) => s + (leg.shipped_value_usd || 0), 0)

  return {
    headers:    cfg.fiscalMonths,
    rows:       Object.values(byRow),
    originData: [{ origin: 'Denmark', value: totalShipped || 1 }],
    clientData: [{ client: 'House Doctor', value: totalShipped || 1 }],
  }
}

// Monthly OTIF breakdown for the modal — built from the same pos/legs already
// fetched for Lakshit, instead of the backend's shipped-po-summary endpoint
// (which doesn't recognize his POs, since they bypass the normal link_id pool).
// On-time is evaluated per shipment leg against its PO's target date, and a PO
// counts as on-time for a given month only if every leg it shipped that month
// was on time — mirrors computeOtifMonthly's per-row/per-PO-per-month logic.
function computeLakshitOtifMonthly(poList, legs, monthKeys) {
  const liToPo    = {}
  const poTarget  = {}
  const poBalance = {}
  poList.forEach(po => {
    let bal = 0
    ;(po.po_line_items || []).forEach(li => {
      liToPo[li.id] = po.id
      bal += li.balance_value_usd || 0
      if (li.target_date && !poTarget[po.id]) poTarget[po.id] = li.target_date
    })
    poBalance[po.id] = bal
  })

  const byMonth = Object.fromEntries(monthKeys.map(k => [k, { shippedValue: 0, poOnTime: new Map() }]))

  legs.forEach(leg => {
    if (!leg.shipped_date) return
    const monthKey = leg.shipped_date.slice(0, 7)
    const bucket = byMonth[monthKey]
    if (!bucket) return
    const poId = liToPo[leg.po_line_item_id]
    if (!poId) return

    bucket.shippedValue += leg.shipped_value_usd || 0

    const target = poTarget[poId]
    const onTime = target ? leg.shipped_date <= target : true
    if (!bucket.poOnTime.has(poId)) bucket.poOnTime.set(poId, onTime)
    else if (!onTime) bucket.poOnTime.set(poId, false)
  })

  const months = monthKeys.map(key => {
    const bucket = byMonth[key]
    const poIds = [...bucket.poOnTime.keys()]
    const shippedPos = poIds.length
    const onTimePos  = poIds.filter(id => bucket.poOnTime.get(id)).length
    const balanceValue = poIds.reduce((s, id) => s + (poBalance[id] || 0), 0)
    return {
      label: monthKeyToLabel(key),
      orderValue:   shippedPos ? bucket.shippedValue + balanceValue : null,
      shippedValue: shippedPos ? bucket.shippedValue : null,
      balanceValue: shippedPos ? balanceValue : null,
      percentage:   shippedPos ? (onTimePos / shippedPos) * 100 : null,
      shippedPos,
      onTimePos,
    }
  })

  const hasData = months.some(m => m.percentage != null)

  return {
    months,
    totalPercentage: hasData
      ? months.reduce((sum, m) => sum + (m.percentage != null ? Math.round(m.percentage) : 0), 0)
      : null,
  }
}

function subtractSummary(base, sub) {
  if (!base || !sub) return base
  return {
    ...base,
    currentFyVolume:  Math.max(0, (base.currentFyVolume  || 0) - (sub.currentFyVolume  || 0)),
    previousFyVolume: Math.max(0, (base.previousFyVolume || 0) - (sub.previousFyVolume || 0)),
    totalOpenPos:     Math.max(0, (base.totalOpenPos     || 0) - (sub.totalOpenPos     || 0)),
    openPosCount:     Math.max(0, (base.openPosCount     || 0) - (sub.openPosCount     || 0)),
    totalOrders:      Math.max(0, (base.totalOrders      || 0) - (sub.currentFyVolume  || 0)),
    onTimePos:        Math.max(0, (base.onTimePos        || 0) - (sub.onTimePos        || 0)),
    latePos:          Math.max(0, (base.latePos          || 0) - (sub.latePos          || 0)),
    partialPos:       Math.max(0, (base.partialPos       || 0) - (sub.partialPos       || 0)),
  }
}

function subtractVolumeData(base, sub) {
  if (!base || !sub) return base
  const headers = base.headers || []
  const subMap  = Object.fromEntries(sub.rows.map(r => [`${r.buyer}||${r.vendor}`, r]))
  return {
    ...base,
    rows: base.rows.map(row => {
      const s = subMap[`${row.buyer}||${row.vendor}`]
      if (!s) return row
      const patched = { ...row }
      headers.forEach(m => { patched[m] = Math.max(0, (row[m] || 0) - (s[m] || 0)) })
      return patched
    }),
  }
}

function subtractOpenData(base, sub) {
  if (!base || !sub) return base
  const newBreakdown = {}
  Object.entries(base.buyerBreakdown || {}).forEach(([buyer, entries]) => {
    const subEntries = sub.buyerBreakdown[buyer] || []
    newBreakdown[buyer] = entries.map(e => {
      const s = subEntries.find(x => x.month === e.month)
      if (!s) return e
      return {
        ...e,
        count: Math.max(0, (e.count || 0) - (s.count || 0)),
        value: Math.max(0, (e.value || 0) - (s.value || 0)),
      }
    })
  })
  return { ...base, buyerBreakdown: newBreakdown }
}

function subtractOtifMonthly(base, sub) {
  if (!base || !sub) return base
  const subByLabel = Object.fromEntries(sub.months.map(m => [m.label, m]))
  const months = base.months.map(m => {
    const s = subByLabel[m.label]
    if (!s || s.shippedPos == null) return m
    const shippedPos = Math.max(0, (m.shippedPos || 0) - (s.shippedPos || 0))
    const onTimePos  = Math.max(0, (m.onTimePos  || 0) - (s.onTimePos  || 0))
    return {
      ...m,
      orderValue:   shippedPos ? Math.max(0, (m.orderValue   || 0) - (s.orderValue   || 0)) : null,
      shippedValue: shippedPos ? Math.max(0, (m.shippedValue || 0) - (s.shippedValue || 0)) : null,
      balanceValue: shippedPos ? Math.max(0, (m.balanceValue || 0) - (s.balanceValue || 0)) : null,
      percentage:   shippedPos ? (onTimePos / shippedPos) * 100 : null,
      shippedPos,
      onTimePos,
    }
  })
  const hasData = months.some(m => m.percentage != null)
  return {
    months,
    totalPercentage: hasData
      ? months.reduce((sum, m) => sum + (m.percentage != null ? Math.round(m.percentage) : 0), 0)
      : null,
  }
}

function computeLakshitStats(pos, legs, { fyStart, fyEnd, prevStart, prevEnd }) {
  const liToPo     = {}
  const poFinal    = {}
  const poTarget   = {}

  pos.forEach(po => {
    poFinal[po.id] = po.final_date ?? null
    ;(po.po_line_items || []).forEach(li => {
      liToPo[li.id] = po.id
      if (li.target_date && !poTarget[po.id]) poTarget[po.id] = li.target_date
    })
  })

  let currentFyVolume = 0
  const posWithLegInFy = new Set()

  legs.forEach(leg => {
    if (leg.shipped_date >= fyStart && leg.shipped_date <= fyEnd) {
      currentFyVolume += leg.shipped_value_usd || 0
      const poId = liToPo[leg.po_line_item_id]
      if (poId) posWithLegInFy.add(poId)
    }
  })

  let previousFyVolume = 0
  let totalOpenPos     = 0
  const openPoIds      = new Set()

  pos.forEach(po => {
    ;(po.po_line_items || []).forEach(li => {
      if (li.shipped_date && li.shipped_date >= prevStart && li.shipped_date <= prevEnd)
        previousFyVolume += li.shipped_value_usd || 0

      if (li.status === 'open') {
        totalOpenPos += li.balance_value_usd || 0
        openPoIds.add(po.id)
      }
    })
  })

  let onTimePos = 0, latePos = 0, partialPos = 0
  posWithLegInFy.forEach(poId => {
    const finalDate  = poFinal[poId]
    const targetDate = poTarget[poId]
    if (!finalDate)                                   partialPos++
    else if (!targetDate || finalDate <= targetDate)  onTimePos++
    else                                              latePos++
  })

  const totalLineItems = pos.reduce((s, po) => s + (po.po_line_items || []).length, 0)

  // OTIF = % of shipped POs (on time + late) that shipped on time. No separate
  // exception-adjusted tracking exists for this hardcoded path, so both header
  // fields use the same figure.
  const shippedPosCount = onTimePos + latePos
  const otifPct = shippedPosCount > 0 ? `${((onTimePos / shippedPosCount) * 100).toFixed(2)}%` : '0.00%'

  return {
    currentFyVolume,
    previousFyVolume,
    totalOpenPos,
    openPosCount:       openPoIds.size,
    totalOrders:        currentFyVolume,
    onTimePos,
    latePos,
    partialPos,
    totalConvertedSKUs: totalLineItems,
    otifRate:           otifPct,
    otifLatest:         otifPct,
  }
}

function fmt$(n) {
  return '$' + parseFloat(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function summaryToStatItems(s, buyer) {
  if (!s) return []
  return [
    { id: 'buyer',      label: 'Buyer',                  value: buyer || 'All' },
    { id: 'total_pos',  label: 'Total PO Value',         value: fmt$((s.currentFyVolume || 0) + (s.totalOpenPos || 0)) },
    { id: 'pos_count',  label: 'Total POs',              value: (s.onTimePos || 0) + (s.latePos || 0) + (s.openPosCount || 0) },
    { id: 'total_skus', label: 'Converted SKUs',         value: s.totalConvertedSKUs || 0 },
    { id: 'otif',       label: 'OTIF (Original)',        value: s.otifRate },
    { id: 'otifLatest', label: 'OTIF (After Exception)', value: s.otifLatest },
  ]
}

function fmtOtifPct(n) {
  return n == null ? '—' : `${n.toFixed(0)}%`
}

function fmtShippedValue(n) {
  return n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default function AnalyticsSection() {
  const role = useRole() ?? 'Merchant'
  const dept = useOrgDepartment()
  const navigate = useNavigate()
  const showDemoToggle = !dept || dept.toLowerCase() === 'tech'
  const [otifModalOpen, setOtifModalOpen] = useState(false)
  const [otifData, setOtifData] = useState(null)
  const [otifLoading, setOtifLoading] = useState(false)
  const {
    summary, volumeData, openOrdersData,
    kpiCards, spendOverTime, recentOrders,
    availableBuyers, currentBuyer, currentMerchant,
    isAdmin, merchantList,
    loading, error, reload,
    switchBuyer, switchMerchant,
    headerStats,
  } = useDashboardData()
  const fyYear = useDashboardStore(s => s.fyYear)
  const switchFyYear = useDashboardStore(s => s.switchFyYear)
  const fy = fyYear === 'fy26' ? '26' : '27'

  // ── Lakshit Bohra special case ────────────────────────────────────────────
  const selfFullName   = useProfileStore(s => s.orgMembership?.fullName)
  const orgId          = useProfileStore(s => s.orgMembership?.orgId)
  const lakshitMember  = merchantList?.find(m => m.name === 'Lakshit Bohra')
  const shayniMember   = merchantList?.find(m => m.name === 'Shayni Sharma')
  const isLakshit      = selfFullName === 'Lakshit Bohra'
                      || (!!currentMerchant && currentMerchant === lakshitMember?.email)
  const isShayni       = !isLakshit
                      && (selfFullName === 'Shayni Sharma'
                          || (!!currentMerchant && currentMerchant === shayniMember?.email))

  // Lakshit only started running POs from FY27 — FY26 has no meaningful data
  // for his view, so it's hidden from the year dropdown; this guards against
  // landing on his view with FY26 already selected (e.g. carried over from
  // switching merchants) by snapping back to FY27.
  useEffect(() => {
    if (isLakshit && fyYear === 'fy26') switchFyYear('fy27')
  }, [isLakshit, fyYear, switchFyYear])

  const [lakshitSummary,     setLakshitSummary]     = useState(null)
  const [lakshitVolumeData,  setLakshitVolumeData]  = useState(null)
  const [lakshitOpenData,    setLakshitOpenData]    = useState(null)
  const [lakshitOtifMonthly, setLakshitOtifMonthly] = useState(null)
  const [lakshitLoading,     setLakshitLoading]     = useState(false)
  const lakshitAbortRef = useRef(null)
  useEffect(() => {
    if (!isLakshit && !isShayni) {
      setLakshitSummary(null)
      setLakshitVolumeData(null)
      setLakshitOpenData(null)
      setLakshitOtifMonthly(null)
      useLakshitStore.getState().setPoNos(null)
      return
    }

    const dates = LAKSHIT_FY_DATES[fyYear] ?? LAKSHIT_FY_DATES.fy27
    const cfg   = FY_CONFIG[fyYear]         ?? FY_CONFIG.fy27
    if (lakshitAbortRef.current) lakshitAbortRef.current.abort()
    const ctrl = new AbortController()
    lakshitAbortRef.current = ctrl

    setLakshitLoading(true)
    ;(async () => {
      try {
        const { data: pos, error: posErr } = await supabase
          .from('purchase_orders')
          .select('id, po_number, final_date, buyer_supplier_link_id, po_line_items(id, status, target_date, balance_value_usd, shipped_value_usd, shipped_date)')
          .eq('created_by', 'Lakshit Bohra')
          .is('deleted_at', null)
          .is('delete_meta', null)
          .neq('is_test', true)
        if (ctrl.signal.aborted) return
        if (posErr) throw new Error(posErr.message)

        const poList = pos || []

        // Resolve link IDs → buyer + supplier display names
        const linkIds = [...new Set(poList.map(po => po.buyer_supplier_link_id).filter(Boolean))]
        let poBuyer = {}
        let poSupplier = {}
        if (linkIds.length) {
          const { data: links } = await supabase
            .from('buyer_supplier_links')
            .select('id, buyer_org_id, supplier_org_id')
            .in('id', linkIds)
          if (!ctrl.signal.aborted && links?.length) {
            const orgIds = [...new Set([
              ...links.map(l => l.buyer_org_id),
              ...links.map(l => l.supplier_org_id),
            ].filter(Boolean))]
            if (orgIds.length) {
              const { data: orgs } = await supabase
                .from('organizations')
                .select('id, display_name')
                .in('id', orgIds)
              if (!ctrl.signal.aborted && orgs) {
                const orgMap        = Object.fromEntries(orgs.map(o => [o.id, o.display_name]))
                const linkBuyerMap    = Object.fromEntries(links.map(l => [l.id, orgMap[l.buyer_org_id] || 'Unknown']))
                const linkSupplierMap = Object.fromEntries(links.map(l => [l.id, orgMap[l.supplier_org_id] || 'Unknown']))
                poList.forEach(po => {
                  poBuyer[po.id]    = linkBuyerMap[po.buyer_supplier_link_id] || 'Unknown'
                  poSupplier[po.id] = linkSupplierMap[po.buyer_supplier_link_id] || 'Unknown'
                })
              }
            }
          }
        }
        if (ctrl.signal.aborted) return

        // Fetch shipment legs
        const lineItemIds = poList.flatMap(po => (po.po_line_items || []).map(li => li.id))
        let legs = []
        if (lineItemIds.length) {
          const { data: legData, error: legErr } = await supabase
            .from('po_shipment_leg')
            .select('po_line_item_id, shipped_date, shipped_value_usd')
            .in('po_line_item_id', lineItemIds)
            .gte('shipped_date', dates.prevStart)
            .lte('shipped_date', dates.fyEnd)
          if (ctrl.signal.aborted) return
          if (legErr) throw new Error(legErr.message)
          legs = legData || []
        }

        const computed    = computeLakshitStats(poList, legs, dates)
        const volData     = computeLakshitVolumeData(poList, legs, poBuyer, poSupplier, cfg)
        const openData    = computeLakshitOpenData(poList, poBuyer, poSupplier, cfg)
        const otifMonthly = computeLakshitOtifMonthly(poList, legs, otifMonthKeysForFy(fy))
        if (!ctrl.signal.aborted) {
          setLakshitSummary(computed)
          setLakshitVolumeData(volData)
          setLakshitOpenData(openData)
          setLakshitOtifMonthly(otifMonthly)
          useLakshitStore.getState().setPoNos(
            new Set(poList.map(po => po.po_number).filter(Boolean)),
            isShayni ? 'exclude' : 'include'
          )
        }
      } catch (err) {
        if (!ctrl.signal.aborted) console.error('Lakshit fetch error:', err)
      } finally {
        if (!ctrl.signal.aborted) setLakshitLoading(false)
      }
    })()

    return () => ctrl.abort()
  }, [isLakshit, isShayni, fyYear])

  // Merge: open PO table gets Lakshit's FY27 months; FY26 chart keeps store's FY26 months.
  const mergedOpenData = (() => {
    if (!isLakshit || !lakshitOpenData) return openOrdersData
    const fy26Months = new Set(FY_CONFIG.fy26.openPoFiscal)
    const merged = {}
    Object.entries(openOrdersData?.buyerBreakdown ?? {}).forEach(([buyer, entries]) => {
      const fy26 = entries.filter(e => fy26Months.has(e.month))
      if (fy26.length) merged[buyer] = fy26
    })
    Object.entries(lakshitOpenData.buyerBreakdown).forEach(([buyer, entries]) => {
      merged[buyer] = [...(merged[buyer] ?? []), ...entries]
    })
    return { ...lakshitOpenData, buyerBreakdown: merged }
  })()
  // ─────────────────────────────────────────────────────────────────────────

  // ── NKUKU split-merchant supplier resolution ──────────────────────────────
  const nkukuMerchantName = NKUKU_SPLIT_MERCHANTS[currentBuyer]
  const [nkukuVendors, setNkukuVendors] = useState(null)
  useEffect(() => {
    if (!nkukuMerchantName || !orgId) { setNkukuVendors(null); return }
    let cancelled = false
    ;(async () => {
      const { data: member } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('full_name', nkukuMerchantName)
        .maybeSingle()
      if (cancelled) return
      if (!member?.id) { setNkukuVendors([]); return }
      const suppliers = await resolveSupplierNamesForMember(member.id)
      if (!cancelled) setNkukuVendors(suppliers.map(s => s.name))
    })()
    return () => { cancelled = true }
  }, [nkukuMerchantName, orgId])

  const baseStatItems = headerStats?.statItems ?? []
  const statItems = (() => {
    if (isLakshit && lakshitSummary)
      return summaryToStatItems(lakshitSummary, currentBuyer)
    if (isShayni && lakshitSummary)
      return summaryToStatItems(subtractSummary(summary, lakshitSummary), currentBuyer)
    return baseStatItems
  })()

  useEffect(() => {
    if (!otifModalOpen || loading) return

    // Lakshit's POs aren't discoverable through the backend's shipped-po-summary
    // endpoint (same link_id-pool gap as everywhere else) — reuse the monthly
    // breakdown already computed locally instead of hitting that endpoint.
    if (isLakshit) {
      setOtifLoading(lakshitLoading)
      setOtifData(lakshitOtifMonthly)
      return
    }

    let cancelled = false
    setOtifLoading(true)
    ;(async () => {
      try {
        const session = useAuthStore.getState().session
        // NKUKU split case: shipped-po-summary only knows the real buyer name,
        // never the pseudo per-merchant ones — same substitution as
        // onOpenPoSummary/onShippedPoSummary, applied here too since this
        // fetch bypasses those callbacks entirely.
        const isNkukuSplit = !!NKUKU_SPLIT_MERCHANTS[currentBuyer]
        const buyerForRequest = isNkukuSplit ? NKUKU_REAL_BUYER : currentBuyer
        const p = new URLSearchParams({ fy, page: '1', pageSize: '99999', allRows: 'true' })
        const buyers = buildShippedPoBuyersParam(buyerForRequest, availableBuyers)
        if (buyers) p.set('buyers', buyers)
        if (isAdmin && currentMerchant) p.set('merchant', currentMerchant)
        const res = await fetch(`${API_BASE}/dashboard/shipped-po-summary?${p}`, {
          credentials: 'include',
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        })
        const j = await res.json()
        let rows = j.data?.rows ?? []
        if (isNkukuSplit && nkukuVendors?.length) {
          const allowedVendors = new Set(nkukuVendors.map(v => v.trim()))
          rows = rows.filter(r => allowedVendors.has((r.vendor || '').trim()))
        }
        if (!cancelled) {
          const orgData = computeOtifMonthly(rows, otifMonthKeysForFy(fy))
          setOtifData(isShayni && lakshitOtifMonthly ? subtractOtifMonthly(orgData, lakshitOtifMonthly) : orgData)
        }
      } catch {
        if (!cancelled) setOtifData(computeOtifMonthly([], otifMonthKeysForFy(fy)))
      } finally {
        if (!cancelled) setOtifLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [
    otifModalOpen, loading, currentBuyer, currentMerchant, availableBuyers, isAdmin, fy,
    isLakshit, isShayni, lakshitOtifMonthly, lakshitLoading, nkukuVendors,
  ])

  const statsBar = loading && statItems.length === 0 ? (
    <div className="flex flex-wrap gap-6 sm:gap-8 px-4 py-4 mb-2 border-b border-gray-100 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="relative pr-6">
          <div className="h-6 w-20 bg-gray-200 rounded mb-1.5" />
          <div className="h-2.5 w-14 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  ) : statItems.length > 0 ? (
    <div className="flex flex-wrap gap-6 sm:gap-8 px-4 py-4 mb-2 border-b border-gray-100">
      {statItems.map((s, i) => {
        const cls = 'relative pr-6 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-gray-200 last:after:hidden'
        if (s.id === 'otif') {
          return (
            <button key={s.id ?? i} type="button" onClick={() => setOtifModalOpen(true)}
              className={`${cls} text-left cursor-pointer hover:opacity-80 transition-opacity`}>
              <div className="text-lg sm:text-xl font-bold text-gray-900">{s.value}</div>
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{s.label}</div>
            </button>
          )
        }
        return (
          <div key={s.id ?? i} className={cls}>
            <div className="text-lg sm:text-xl font-bold text-gray-900">{s.value}</div>
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{s.label}</div>
          </div>
        )
      })}
      <div className="ml-auto flex items-center gap-4">
        {showDemoToggle && (
          <button type="button" onClick={() => navigate('/dashboard/analytics-demo')}
            className="self-center px-2.5 py-1 rounded-md border border-purple-200 bg-purple-50 text-xs font-semibold text-purple-600 hover:bg-purple-600 hover:text-white transition-colors">
            Demo
          </button>
        )}
        <button type="button" onClick={reload}
          className="self-center text-xs text-gray-400 hover:text-gray-600 underline">
          Refresh
        </button>
      </div>
    </div>
  ) : null

  if (role === 'Merchant') {
    return (
      <>
        {statsBar}
        {otifModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={() => setOtifModalOpen(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto relative p-5 pt-10"
              onClick={e => e.stopPropagation()}>
              <button type="button" onClick={() => setOtifModalOpen(false)}
                className="absolute top-3 right-3 p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              <div className="mb-3">
                <h2 className="font-semibold text-base m-0 text-gray-900">OTIF(Original) Monthly View</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[0.8em]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 font-semibold text-[11px] sm:text-xs">
                      <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">Month</th>
                      <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">POs VAL</th>
                      <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">SHPD POs VAL</th>
                      <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">SHPD ON-TIME %</th>
                      <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">BAL POs VAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otifLoading ? (
                      <tr>
                        <td colSpan={5} className="px-2 py-4 text-center text-gray-400">Loading…</td>
                      </tr>
                    ) : (
                      otifData?.months.map(m => (
                        <tr key={m.label} className="border-b border-gray-100 hover:bg-[#f5f7ff]">
                          <td className="px-2 py-1.5 whitespace-nowrap text-center">{m.label}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-center">{fmtShippedValue(m.orderValue)}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-center">{fmtShippedValue(m.shippedValue)}</td>
                          <td className={`px-2 py-1.5 whitespace-nowrap text-center font-semibold ${m.percentage != null ? 'text-black' : 'text-gray-300'}`}>
                            {fmtOtifPct(m.percentage)}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-center">{fmtShippedValue(m.balanceValue)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <MerchantDashboard
          onMerchantChange={switchMerchant}
          onOpenPoSummary={({ buyer = '', month = '' , year = '27'} = {}) => {
            const isNkukuSplit = !!NKUKU_SPLIT_MERCHANTS[buyer]
            const p = new URLSearchParams({ tab: 'open-po-summary' })
            if (month) p.set('month', month)
            if (buyer) p.set('buyer', isNkukuSplit ? NKUKU_REAL_BUYER : buyer)
            if (isNkukuSplit && nkukuVendors?.length) p.set('vendors', nkukuVendors.join('||'))
            if (year)  p.set('year',  year)
            navigate(`/dashboard/orders?${p}`)
          }}
          onShippedPoSummary={({ buyer = '', year = '27', timing = '' } = {}) => {
            const isNkukuSplit = !!NKUKU_SPLIT_MERCHANTS[buyer]
            const p = new URLSearchParams({ tab: 'shipped-po-summary' })
            if (buyer)  p.set('buyer',  isNkukuSplit ? NKUKU_REAL_BUYER : buyer)
            if (isNkukuSplit && nkukuVendors?.length) p.set('vendors', nkukuVendors.join('||'))
            if (year)   p.set('year',   year)
            if (timing && timing !== 'Total') p.set('timing', timing)
            navigate(`/dashboard/orders?${p}`)
          }}
          summary={
            isLakshit ? (lakshitSummary ? { ...lakshitSummary, ytdTarget: summary?.ytdTarget, growth: summary?.growth } : summary)
            : isShayni && lakshitSummary ? subtractSummary(summary, lakshitSummary)
            : summary
          }
          volumeData={
            isLakshit ? (lakshitVolumeData ?? volumeData)
            : isShayni && lakshitVolumeData ? subtractVolumeData(volumeData, lakshitVolumeData)
            : volumeData
          }
          openOrdersData={
            isLakshit ? (mergedOpenData ?? openOrdersData)
            : isShayni && lakshitOpenData ? subtractOpenData(openOrdersData, lakshitOpenData)
            : openOrdersData
          }
          availableBuyers={availableBuyers}
          currentBuyer={currentBuyer}
          currentMerchant={currentMerchant}
          isAdmin={isAdmin}
          merchantList={merchantList}
          hideFy26={isLakshit}
          loading={loading || ((isLakshit || isShayni) && lakshitLoading)}
          error={error}
          reload={reload}
          switchBuyer={switchBuyer}
          switchMerchant={switchMerchant}
        />
      </>
    )
  }

  if (role === 'Buyer' || role === 'Supplier') {
    return <Navigate to="/plm" replace />
  }

  return null
}
