import { useMemo, useState, useEffect } from 'react' // useEffect used for onTotals callback

const FISCAL_MONTHS_FY26 = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'forjan26', 'forfeb26', 'formar26']

const BASE_MONTH_LABELS = {
  forjan26: 'Jan26', forfeb26: 'Feb26', formar26: 'Mar26',
  forapr26: 'Apr26', formay26: 'May26', forjun26: 'Jun26', forjul26: 'Jul26',
  forjan27: 'Jan27', forfeb27: 'Feb27', formar27: 'Mar27',
  forapr27: 'Apr27', formay27: 'May27', forjun27: 'Jun27', forjul27: 'Jul27',
}

function fmt$(n) {
  const num = typeof n === 'number' ? n : parseFloat(n || 0)
  return '$' + (Number.isFinite(num) ? num : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function niceMax(v) {
  if (!v) return 10
  const withPadding = v * 1.15  // 15% headroom
  const mag = Math.pow(10, Math.floor(Math.log10(withPadding)))
  const n = withPadding / mag
  return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10) * mag
}

function getVolumeMonths(volumeData) {
  // Liquid uses volumeShippedData.months; backend here returns headers/rows. Infer month keys from headers.
  const headers = volumeData?.headers || volumeData?.data?.headers || []
  if (Array.isArray(headers) && headers.length) return headers
  const row = volumeData?.rows?.[0]
  if (!row) return []
  return Object.keys(row)
}

function getFilteredChartData(volumeData, buyer, vendor, monthList, monthLabels) {
  if (!volumeData?.rows?.length) return []
  const rows = volumeData.rows
  const months = monthList || getVolumeMonths(volumeData)
  const isAll = !buyer || buyer === 'All' || String(buyer).toUpperCase() === 'TOTAL'

  let filtered
  if (isAll) {
    filtered = rows.filter((r) => {
      if (!r.buyer) return false
      const ub = String(r.buyer).toUpperCase().trim()
      if (ub.endsWith(' TOTAL') || ub.includes('GRAND TOTAL')) return false
      return true
    })
  } else {
    const nb = String(buyer).toUpperCase()
    filtered = rows.filter((r) => {
      if (!r.buyer) return false
      const ub = String(r.buyer).toUpperCase().trim()
      return ub === nb
    })
  }

  if (vendor && vendor !== 'All') {
    const nv = String(vendor).toUpperCase().trim()
    filtered = filtered.filter((r) => r.vendor && String(r.vendor).toUpperCase().trim() === nv)
  }

  const totals = months.reduce((a, m) => {
    a[m] = 0
    return a
  }, {})
  filtered.forEach((row) => {
    months.forEach((m) => {
      totals[m] += parseFloat(row[m]) || 0
    })
  })

  return months.map((m) => ({
    key: m,
    label: monthLabels[m] || String(m).substring(0, 3),
    shippedK: (totals[m] || 0) / 1000,
    shippedRaw: totals[m] || 0,
  }))
}

function getFilteredOpenPoChartData(openOrdersData, buyer, buyerSwitcherBuyers, vendor, monthList, monthLabels, fyConfig) {
  if (!openOrdersData?.buyerBreakdown) return {}

  const breakdown  = openOrdersData.buyerBreakdown
  const isAll      = !buyer || buyer === 'All' || String(buyer).toUpperCase() === 'TOTAL'
  const validBuyers = (buyerSwitcherBuyers || []).filter((b) => String(b).toUpperCase() !== 'TOTAL')
  const buyersToSum = isAll ? validBuyers : [buyer]
  const fiscalMonths = fyConfig?.fiscalMonths || []
  const openPoFiscal = fyConfig?.openPoFiscal || []

  const resolveResult = (fullNameToValue) => {
    const result = {}
    monthList.forEach((m) => {
      const chartLabel    = monthLabels[m] || String(m).substring(0, 3)
      const fiscalIdx     = fiscalMonths.indexOf(m)
      const fullMonthName = fiscalIdx >= 0 ? openPoFiscal[fiscalIdx] : ''
      result[chartLabel]  = fullNameToValue[fullMonthName] || 0
    })
    return result
  }

  // No vendor filter — use pre-aggregated buyerBreakdown (fast, no row scan)
  if (!vendor || vendor === 'All') {
    const fullNameToValue = {}
    buyersToSum.forEach((b) => {
      const key = Object.keys(breakdown).find((k) => k.toUpperCase() === String(b).toUpperCase())
      if (!key) return
      breakdown[key].forEach((entry) => {
        fullNameToValue[entry.month] = (fullNameToValue[entry.month] || 0) + (entry.value || 0)
      })
    })
    return resolveResult(fullNameToValue)
  }

  // Vendor filter — use rows, keyed directly by the raw full month name
  // (e.g. "April 2025") toOpenData/computeLakshitOpenData store them under —
  // globally unique, so no fyConfig-dependent short-key translation needed
  // (a short key like "April" would be ambiguous: FY26 and FY27's own
  // fiscalMonths arrays both use "April".."December" for their first 9
  // entries, and this one openOrdersData object gets reused for both the
  // FY26 and FY27 "By Months" cards side by side).
  if (!openOrdersData?.rows?.length) return {}

  let rows = openOrdersData.rows.filter((r) => !r.isTotalRow)
  if (!isAll) {
    const nb = String(buyer).toUpperCase()
    rows = rows.filter((r) => String(r.buyer || '').replace(/ TOTAL$/, '').trim().toUpperCase() === nb)
  } else {
    const upper = buyersToSum.map((b) => String(b).toUpperCase())
    rows = rows.filter((r) => upper.includes(String(r.buyer || '').replace(/ TOTAL$/, '').trim().toUpperCase()))
  }
  const nv = String(vendor).toUpperCase().trim()
  rows = rows.filter((r) => r.vendor && String(r.vendor).toUpperCase().trim() === nv)

  const fullNameToValue = {}
  monthList.forEach((m) => {
    const fiscalIdx     = fiscalMonths.indexOf(m)
    const fullMonthName = fiscalIdx >= 0 ? openPoFiscal[fiscalIdx] : ''
    if (!fullMonthName) return
    fullNameToValue[fullMonthName] = rows.reduce((s, r) => s + (parseFloat(r[fullMonthName]) || 0), 0)
  })
  return resolveResult(fullNameToValue)
}

// dashboard_open_current_month_split (sql/dashboard_rpcs.sql) returns one
// row per (buyer, vendor) for just the current calendar month, split into
// overdueValue (target_date already passed) / upcomingValue (still to
// come) — same buyer/vendor filtering as getFilteredOpenPoChartData above,
// just against a flat per-buyer-per-vendor list instead of a pre-aggregated
// per-month breakdown (this data covers one month, not a whole year, so
// there's no need for the buyerBreakdown fast-path).
function getFilteredCurrentMonthSplit(splitData, buyer, buyerSwitcherBuyers, vendor) {
  if (!splitData?.length) return { overdueValue: 0, upcomingValue: 0 }
  const isAll = !buyer || buyer === 'All' || String(buyer).toUpperCase() === 'TOTAL'
  const validBuyers = (buyerSwitcherBuyers || []).filter((b) => String(b).toUpperCase() !== 'TOTAL')
  const buyersToSum = (isAll ? validBuyers : [buyer]).map((b) => String(b).toUpperCase())
  const nv = vendor && vendor !== 'All' ? String(vendor).toUpperCase().trim() : null

  return splitData.reduce((acc, row) => {
    if (!buyersToSum.includes(String(row.buyer || '').toUpperCase().trim())) return acc
    if (nv && String(row.vendor || '').toUpperCase().trim() !== nv) return acc
    acc.overdueValue  += row.overdueValue  || 0
    acc.upcomingValue += row.upcomingValue || 0
    return acc
  }, { overdueValue: 0, upcomingValue: 0 })
}

export default function Fy26ByMonthsChart({
  volumeData,
  openOrdersData,
  currentMonthSplit,
  buyer,
  buyerSwitcherBuyers,
  vendor,
  onTotals,
  onYMax,
  yMax: yMaxProp,
  fyConfig,
  compact = false,
  onBarClick,
}) {
  const [sel, setSel] = useState(null) // { idx, bar: 'shipped'|'open' }

  const MONTH_LABELS = useMemo(() =>
    fyConfig?.monthLabels ? { ...BASE_MONTH_LABELS, ...fyConfig.monthLabels } : BASE_MONTH_LABELS
  , [fyConfig])

  const fiscalMonths = fyConfig?.fiscalMonths ?? FISCAL_MONTHS_FY26

  const availableMonths = useMemo(() => {
    const hdrs = getVolumeMonths(volumeData)
    return new Set(hdrs.map((m) => String(m).toLowerCase()))
  }, [volumeData])

  const monthList = useMemo(() => {
    return fiscalMonths.filter((m) => {
      // Always include months present in the shipped volume data
      if (availableMonths.has(String(m).toLowerCase())) return true
      // Also include fiscal months that have open PO data even if no shipped data
      // (mirrors liquid logic: future months may have open POs but no shipped volume yet)
      if (!fyConfig?.openPoFiscal || !openOrdersData?.buyerBreakdown) return false
      const fiscalIdx = fiscalMonths.indexOf(m)
      const fullMonthName = fiscalIdx >= 0 ? fyConfig.openPoFiscal[fiscalIdx] : ''
      if (!fullMonthName) return false
      return Object.values(openOrdersData.buyerBreakdown).some(
        arr => Array.isArray(arr) && arr.some(e => e.month === fullMonthName && e.value > 0)
      )
    })
  }, [availableMonths, fiscalMonths, fyConfig, openOrdersData])

  const data = useMemo(() => getFilteredChartData(volumeData, buyer, vendor, monthList, MONTH_LABELS), [volumeData, buyer, vendor, monthList, MONTH_LABELS])

  const openByLabel = useMemo(
    () => getFilteredOpenPoChartData(openOrdersData, buyer, buyerSwitcherBuyers, vendor, monthList, MONTH_LABELS, fyConfig),
    [openOrdersData, buyer, buyerSwitcherBuyers, vendor, monthList, MONTH_LABELS, fyConfig]
  )

  const hasOpenData = useMemo(() => Object.values(openByLabel || {}).some((v) => (v || 0) > 0), [openByLabel])

  const currentMonthSplitFiltered = useMemo(
    () => getFilteredCurrentMonthSplit(currentMonthSplit, buyer, buyerSwitcherBuyers, vendor),
    [currentMonthSplit, buyer, buyerSwitcherBuyers, vendor]
  )

  useEffect(() => {
    if (!onTotals) return
    const totalShipped = data.reduce((s, d) => s + (d.shippedRaw || 0), 0)
    const totalOpen = Object.values(openByLabel || {}).reduce((s, v) => s + (v || 0), 0)
    onTotals({ totalShipped, totalOpen, hasOpenData })
  }, [data, openByLabel, hasOpenData, onTotals])

  const maxY = useMemo(() => {
    const maxV = Math.max(
      ...data.map((d) => {
        const openK = ((openByLabel?.[d.label] || 0) / 1000) || 0
        return Math.max(d.shippedK || 0, openK)
      }),
      0
    )
    return niceMax(maxV)
  }, [data, openByLabel])

  // Report computed max to parent so sibling charts can share a scale
  useEffect(() => { if (onYMax) onYMax(maxY) }, [maxY, onYMax])

  // Use parent-supplied max (for synchronized scale) if provided and larger
  const effectiveMaxY = yMaxProp != null && yMaxProp > maxY ? yMaxProp : maxY

  const { pastMonthLabels, currentMonthLabel } = useMemo(() => {
    if (!fyConfig?.fiscalMonths || !fyConfig?.openPoFiscal) return { pastMonthLabels: new Set(), currentMonthLabel: null }
    const now = new Date()
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const result = new Set()
    let curLabel = null
    fyConfig.fiscalMonths.forEach((m, idx) => {
      const full = fyConfig.openPoFiscal[idx]
      if (!full) return
      const [mon, yr] = full.split(' ')
      const mIdx = MONTH_NAMES.indexOf(mon)
      const mYear = parseInt(yr)
      if (!isNaN(mIdx) && !isNaN(mYear)) {
        // Strictly before the current month — the current month (even on
        // its first day) isn't "past" yet, just not finished.
        const isPast = mYear < now.getFullYear() || (mYear === now.getFullYear() && mIdx < now.getMonth())
        if (isPast) result.add(MONTH_LABELS[m] || m.substring(0, 3))
        else if (mYear === now.getFullYear() && mIdx === now.getMonth()) curLabel = MONTH_LABELS[m] || m.substring(0, 3)
      }
    })
    return { pastMonthLabels: result, currentMonthLabel: curLabel }
  }, [fyConfig, MONTH_LABELS])

  const chart = useMemo(() => {
    const W = compact ? 600 : 400
    const H = compact ? 150 : 300
    const yLW = 44
    const ca = { x: yLW + 6, y: 16, w: W - (yLW + 14), h: compact ? 110 : 195 }

    const yTicks = []
    for (let i = 0; i <= 4; i++) {
      const v = (effectiveMaxY / 4) * i
      const y = ca.y + ca.h - (v / effectiveMaxY) * ca.h
      const label = v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}M` : `${Math.round(v)}K`
      yTicks.push({ i, v, y, label })
    }

    const n = data.length
    const baseSp = n ? ca.w / n : ca.w
    const bw = hasOpenData ? Math.max(4, Math.min(10, baseSp / 2 - 2)) : data.length > 11 ? 14 : 20
    const barGap = hasOpenData ? 2 : 0
    const groupW = hasOpenData ? bw * 2 + barGap : bw

    // The current (in-progress) month's Open slot needs a 3rd bar (overdue +
    // upcoming, alongside shipped) that every other month doesn't — cramming
    // that into the same slot width as a normal 2-bar month forced both
    // halves down to an abnormally thin half-width. Instead, widen just the
    // current month's own slot to fit a 3rd FULL-width bar, borrowing the
    // difference evenly from every other month's slot so the total still
    // sums to ca.w — every bar (current month included) ends up the same
    // normal width instead of some being squeezed.
    const currentIdx = data.findIndex((d) => d.label === currentMonthLabel)
    const currentGroupW = bw * 3 + barGap * 2
    const extra = (hasOpenData && currentIdx >= 0) ? Math.max(0, currentGroupW - groupW) : 0
    const shrinkPerOther = n > 1 ? extra / (n - 1) : 0

    const slotWidths = data.map((_, i) => (i === currentIdx ? baseSp + extra : baseSp - shrinkPerOther))
    const slotX = []
    let cursor = ca.x
    slotWidths.forEach((w) => { slotX.push(cursor); cursor += w })

    const bars = data.map((d, i) => {
      const shippedH = effectiveMaxY > 0 ? (d.shippedK / effectiveMaxY) * ca.h : 0
      const openK = (openByLabel?.[d.label] || 0) / 1000
      const openH = effectiveMaxY > 0 ? Math.max(openK > 0 ? 3 : 0, (openK / effectiveMaxY) * ca.h) : 0
      const isPast = pastMonthLabels.has(d.label)
      const isCurrent = d.label === currentMonthLabel
      const slotW = slotWidths[i]
      const thisGroupW = (isCurrent && hasOpenData) ? currentGroupW : groupW
      const baseX = slotX[i] + (slotW - thisGroupW) / 2
      const shippedY = ca.y + ca.h - shippedH
      const openX = baseX + bw + barGap
      const openY = ca.y + ca.h - openH
      const isSelShip = sel && sel.idx === i && sel.bar === 'shipped'
      const isSelOpen = sel && sel.idx === i && sel.bar === 'open'
      // "April 2026" style full name for the drill-through click — the only
      // form labelToSlug (src/stores/openPoStore.js, used by the parent's
      // handleOpenInMis/handleShippedInMis) understands.
      const fiscalIdx = fiscalMonths.indexOf(d.key)
      const fullMonthName = fiscalIdx >= 0 ? (fyConfig?.openPoFiscal?.[fiscalIdx] || '') : ''

      // The current (in-progress) month is split into an overdue segment
      // (target_date already passed — colored the same red as a fully past
      // month, since that balance is delayed too) next to an upcoming
      // segment (still blue) — instead of the whole month solid-blue just
      // because the month itself hasn't finished yet. Both render at the
      // same full bw width every other month's single open bar uses — the
      // extra slot width reserved above exists specifically for this.
      let openOverdue = null, openUpcoming = null, open = null
      const isSelOverdue = sel && sel.idx === i && sel.bar === 'open-overdue'
      const isSelUpcoming = sel && sel.idx === i && sel.bar === 'open-upcoming'
      if (isCurrent && hasOpenData) {
        const overdueK  = (currentMonthSplitFiltered.overdueValue  || 0) / 1000
        const upcomingK = (currentMonthSplitFiltered.upcomingValue || 0) / 1000
        const overdueH  = effectiveMaxY > 0 ? Math.max(overdueK  > 0 ? 3 : 0, (overdueK  / effectiveMaxY) * ca.h) : 0
        const upcomingH = effectiveMaxY > 0 ? Math.max(upcomingK > 0 ? 3 : 0, (upcomingK / effectiveMaxY) * ca.h) : 0
        const upcomingX = openX + bw + barGap
        if (overdueH > 0) {
          openOverdue = { x: openX, y: ca.y + ca.h - overdueH, w: bw, h: overdueH, fill: isSelOverdue ? '#FF6B6B' : '#f04242' }
        }
        if (upcomingH > 0) {
          openUpcoming = { x: upcomingX, y: ca.y + ca.h - upcomingH, w: bw, h: upcomingH, fill: isSelUpcoming ? '#6b6eff' : '#1100ff' }
        }
      } else if (hasOpenData && openH > 0) {
        open = { x: openX, y: openY, w: bw, h: openH,
          fill: isSelOpen ? (isPast ? '#FF6B6B' : '#6b6eff') : (isPast ? '#f04242' : '#1100ff') }
      }

      return {
        i,
        label: d.label,
        fullMonthName,
        baseX,
        slotW,
        shipped: { x: baseX, y: shippedY, w: bw, h: shippedH, fill: isSelShip ? '#00ff40' : '#22c55e' },
        open,
        openOverdue,
        openUpcoming,
        groupW: thisGroupW,
        ca,
        shippedRaw: d.shippedRaw,
        openRaw: openByLabel?.[d.label] || 0,
        overdueRaw: isCurrent ? (currentMonthSplitFiltered.overdueValue || 0) : 0,
        upcomingRaw: isCurrent ? (currentMonthSplitFiltered.upcomingValue || 0) : 0,
        isPast,
        isCurrent,
      }
    })

    return { W, H, ca, yTicks, bars, sp: baseSp, bw, barGap, groupW }
  }, [data, openByLabel, hasOpenData, effectiveMaxY, sel, pastMonthLabels, currentMonthLabel, currentMonthSplitFiltered, compact, fiscalMonths, fyConfig])

  const tooltip = useMemo(() => {
    if (!sel || !data[sel.idx]) return null
    const b = chart.bars.find((x) => x.i === sel.idx)
    if (!b) return null
    const barByKey = { shipped: b.shipped, open: b.open, 'open-overdue': b.openOverdue, 'open-upcoming': b.openUpcoming }
    const bar = barByKey[sel.bar]
    if (!bar) return null
    const isShipped = sel.bar === 'shipped'

    const cx = bar.x + bar.w / 2
    const y  = bar.y
    const tipLine1 = `${b.label}`
    const RED = '#f87171', BLUE = '#60a5fa', GREEN = '#4ade80'
    let tipLine2, line2Color, tipLine3 = null, line3Color = null
    if (isShipped) {
      tipLine2 = `↑ ${fmt$(b.shippedRaw)}`
      line2Color = GREEN
      if (hasOpenData && (b.openRaw || 0) > 0) {
        tipLine3 = `● ${fmt$(b.openRaw)}`
        line3Color = pastMonthLabels.has(b.label) ? RED : BLUE
      }
    } else if (sel.bar === 'open-overdue') {
      tipLine2 = `Overdue: ${fmt$(b.overdueRaw)}`
      line2Color = RED
    } else if (sel.bar === 'open-upcoming') {
      tipLine2 = `Upcoming: ${fmt$(b.upcomingRaw)}`
      line2Color = BLUE
    } else {
      tipLine2 = `● ${fmt$(b.openRaw)}`
      line2Color = pastMonthLabels.has(b.label) ? RED : BLUE
    }
    const tw = 100
    const th = tipLine3 ? 38 : 26

    let tx = cx - tw / 2
    if (tx < chart.ca.x) tx = chart.ca.x
    if (tx + tw > chart.ca.x + chart.ca.w) tx = chart.ca.x + chart.ca.w - tw

    // Flip tooltip below bar top when there isn't enough room above it
    const spaceAbove = y - chart.ca.y
    const showBelow  = spaceAbove < th + 12
    const rawTy = showBelow ? y + 6 : y - th - 8
    // Clamp so tooltip never exits the SVG viewport
    const ty = Math.max(2, Math.min(rawTy, chart.H - th - 2))
    // Arrow: points down toward bar when above; points up toward bar when below
    const pts = showBelow
      ? `${cx - 5},${ty} ${cx},${ty - 5} ${cx + 5},${ty}`
      : `${cx - 5},${ty + th} ${cx},${ty + th + 5} ${cx + 5},${ty + th}`

    return { tx, ty, tw, th, pts, tipLine1, tipLine2, line2Color, tipLine3, line3Color, showBelow, cx }
  }, [sel, data, chart, hasOpenData, pastMonthLabels])

  const totalShipped = data.reduce((s, d) => s + (d.shippedRaw || 0), 0)
  // The current month's own value is split (overdue counts toward "past",
  // upcoming toward "future") instead of the whole month landing in
  // "future" just because the month itself isn't over — matching what the
  // split bar now shows.
  const totalOpenPast = data.reduce((s, d) => {
    if (d.label === currentMonthLabel) return s + (currentMonthSplitFiltered.overdueValue || 0)
    const v = openByLabel?.[d.label] || 0
    return s + (pastMonthLabels.has(d.label) ? v : 0)
  }, 0)
  const totalOpenFuture = data.reduce((s, d) => {
    if (d.label === currentMonthLabel) return s + (currentMonthSplitFiltered.upcomingValue || 0)
    const v = openByLabel?.[d.label] || 0
    return s + (!pastMonthLabels.has(d.label) ? v : 0)
  }, 0)

  if (!data.length) {
    return <div style={{ padding: '2em', textAlign: 'center', color: '#555555' }}>No data for selected filter.</div>
  }

  return (
    <div className="chart-container">
      {/* Legend with inline totals — clickable aggregates (whole-FY, no
          specific month) into the same drill-through the bars themselves
          use. fullMonthName: null tells the parent's onBarClick this is a
          whole-FY click; handleOpenInMis/handleShippedInMis already default
          to the full FY range whenever no month is passed. The two Open
          chips also pass subSegment ('overdue'/'upcoming') so their totals
          (totalOpenPast/totalOpenFuture, split by today across every month
          — not just the current one) don't both land on the exact same
          unfiltered whole-FY Open table. */}
      <div className="flex gap-4 items-center mb-1 px-6 flex-wrap">
        <button
          type="button"
          onClick={() => onBarClick && onBarClick({ bar: 'shipped', fullMonthName: null })}
          disabled={!onBarClick}
          className="flex items-center gap-1.5 text-[10px] bg-transparent border-0 p-0 disabled:cursor-default"
          style={{ cursor: onBarClick ? 'pointer' : 'default' }}
        >
          <span className="w-2.5 h-2.5 rounded-[2px] inline-block flex-shrink-0" style={{ background: '#22c55e' }} />
          <span className="text-gray-500">Shipped</span>
          <span className="font-semibold text-gray-800">{fmt$(totalShipped)}</span>
        </button>
        {hasOpenData && totalOpenPast > 0 && (
          <button
            type="button"
            onClick={() => onBarClick && onBarClick({ bar: 'open', fullMonthName: null, subSegment: 'overdue' })}
            disabled={!onBarClick}
            className="flex items-center gap-1.5 text-[10px] bg-transparent border-0 p-0 disabled:cursor-default"
            style={{ cursor: onBarClick ? 'pointer' : 'default' }}
          >
            <span className="w-2.5 h-2.5 rounded-[2px] inline-block flex-shrink-0 bg-red-400" />
            <span className="text-gray-500">Open (past)</span>
            <span className="font-semibold text-gray-800">{fmt$(totalOpenPast)}</span>
          </button>
        )}
        {hasOpenData && totalOpenFuture > 0 && (
          <button
            type="button"
            onClick={() => onBarClick && onBarClick({ bar: 'open', fullMonthName: null, subSegment: 'upcoming' })}
            disabled={!onBarClick}
            className="flex items-center gap-1.5 text-[10px] bg-transparent border-0 p-0 disabled:cursor-default"
            style={{ cursor: onBarClick ? 'pointer' : 'default' }}
          >
            <span className="w-2.5 h-2.5 rounded-[2px] inline-block flex-shrink-0 bg-blue-400" />
            <span className="text-gray-500">Open (future)</span>
            <span className="font-semibold text-gray-800">{fmt$(totalOpenFuture)}</span>
          </button>
        )}
      </div>
      <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%' }}>
        {/* y-axis labels + grid */}
        <g>
          {chart.yTicks.map((t) => (
            <g key={t.i}>
              <text
                x={chart.ca.x - 5}
                y={t.y + 3}
                textAnchor="end"
                fill="#374151"
                fontSize="8"
              >
                {t.label}
              </text>
              {t.i !== 0 && (
                <line
                  x1={chart.ca.x}
                  y1={t.y}
                  x2={chart.ca.x + chart.ca.w}
                  y2={t.y}
                  stroke="#f0f0f0"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
              )}
            </g>
          ))}
          <line x1={chart.ca.x} y1={chart.ca.y + chart.ca.h} x2={chart.ca.x + chart.ca.w} y2={chart.ca.y + chart.ca.h} stroke="#e5e7eb" strokeWidth="1" />
        </g>

        {/* bars */}
        <g>
          {chart.bars.map((b) => (
            <g key={b.i}>
              <rect
                x={b.shipped.x}
                y={b.shipped.y}
                width={b.shipped.w}
                height={b.shipped.h}
                fill={b.shipped.fill}
                rx="3"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setSel({ idx: b.i, bar: 'shipped' })}
                onMouseLeave={() => setSel(null)}
                onClick={() => {
                  setSel((prev) => (prev && prev.idx === b.i && prev.bar === 'shipped' ? null : { idx: b.i, bar: 'shipped' }))
                  if (onBarClick && b.fullMonthName) onBarClick({ bar: 'shipped', fullMonthName: b.fullMonthName })
                }}
              />
              {b.open && (
                <rect
                  x={b.open.x}
                  y={b.open.y}
                  width={b.open.w}
                  height={b.open.h}
                  fill={b.open.fill}
                  rx="3"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setSel({ idx: b.i, bar: 'open' })}
                  onMouseLeave={() => setSel(null)}
                  onClick={() => {
                    setSel((prev) => (prev && prev.idx === b.i && prev.bar === 'open' ? null : { idx: b.i, bar: 'open' }))
                    if (onBarClick && b.fullMonthName) onBarClick({ bar: 'open', fullMonthName: b.fullMonthName })
                  }}
                />
              )}
              {b.openOverdue && (
                <rect
                  x={b.openOverdue.x}
                  y={b.openOverdue.y}
                  width={b.openOverdue.w}
                  height={b.openOverdue.h}
                  fill={b.openOverdue.fill}
                  rx="2"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setSel({ idx: b.i, bar: 'open-overdue' })}
                  onMouseLeave={() => setSel(null)}
                  onClick={() => {
                    setSel((prev) => (prev && prev.idx === b.i && prev.bar === 'open-overdue' ? null : { idx: b.i, bar: 'open-overdue' }))
                    if (onBarClick && b.fullMonthName) onBarClick({ bar: 'open', fullMonthName: b.fullMonthName, subSegment: 'overdue' })
                  }}
                />
              )}
              {b.openUpcoming && (
                <rect
                  x={b.openUpcoming.x}
                  y={b.openUpcoming.y}
                  width={b.openUpcoming.w}
                  height={b.openUpcoming.h}
                  fill={b.openUpcoming.fill}
                  rx="2"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setSel({ idx: b.i, bar: 'open-upcoming' })}
                  onMouseLeave={() => setSel(null)}
                  onClick={() => {
                    setSel((prev) => (prev && prev.idx === b.i && prev.bar === 'open-upcoming' ? null : { idx: b.i, bar: 'open-upcoming' }))
                    if (onBarClick && b.fullMonthName) onBarClick({ bar: 'open', fullMonthName: b.fullMonthName, subSegment: 'upcoming' })
                  }}
                />
              )}

              <rect
                x={b.baseX + b.groupW / 2 - b.slotW * 0.42}
                y={chart.ca.y + chart.ca.h + 5}
                width={b.slotW * 0.84}
                height={13}
                rx="3"
                fill="#f3f4f6"
              />
              <text
                x={b.baseX + b.groupW / 2}
                y={chart.ca.y + chart.ca.h + 14}
                textAnchor="middle"
                fill="#111827"
                fontSize={data.length > 11 ? 7 : 8}
                fontWeight={b.shippedRaw > 0 || b.openRaw > 0 ? '600' : '400'}
              >
                {b.label}
              </text>
            </g>
          ))}
        </g>

        {/* tooltip */}
        {tooltip && (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={tooltip.tx} y={tooltip.ty} width={tooltip.tw} height={tooltip.th} rx="3" fill="#1e293b" fillOpacity=".95" />
            <polygon points={tooltip.pts} fill="#1e293b" fillOpacity=".95" />
            <text x={tooltip.tx + tooltip.tw / 2} y={tooltip.ty + 9} textAnchor="middle" fill="#cbd5e1" fontSize="7" fontWeight="600">
              {tooltip.tipLine1}
            </text>
            <text x={tooltip.tx + tooltip.tw / 2} y={tooltip.ty + 20} textAnchor="middle" fill={tooltip.line2Color} fontSize="7.5">
              {tooltip.tipLine2}
            </text>
            {tooltip.tipLine3 && (
              <text x={tooltip.tx + tooltip.tw / 2} y={tooltip.ty + 31} textAnchor="middle" fill={tooltip.line3Color} fontSize="7.5">
                {tooltip.tipLine3}
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  )
}

