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

// Reconstruct the full month name from a raw Excel column key using the
// deterministic naming pattern the backend uses in MONTH_LABEL_MAP.
const _KEY_MONTHS = {
  jan:'January', feb:'February', mar:'March', apr:'April', may:'May',
  jun:'June', jul:'July', aug:'August', sep:'September', sept:'September',
  oct:'October', nov:'November', dec:'December',
}
function excelKeyToFullName(key) {
  const k = String(key).toLowerCase()
  if (_KEY_MONTHS[k]) return `${_KEY_MONTHS[k]} 2025`
  const m = k.match(/^for(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(\d{2})$/)
  if (m && _KEY_MONTHS[m[1]]) return `${_KEY_MONTHS[m[1]]} ${2000 + parseInt(m[2])}`
  return key
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

  // Vendor filter — use rows; map fullMonthName → excelKey via the key pattern
  if (!openOrdersData?.rows?.length) return {}

  const fullNameToExcelKey = {}
  ;(openOrdersData.months || []).forEach((key) => {
    fullNameToExcelKey[excelKeyToFullName(key)] = key
  })

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
    const excelKey = fullNameToExcelKey[fullMonthName]
    if (excelKey) {
      fullNameToValue[fullMonthName] = rows.reduce((s, r) => s + (parseFloat(r[excelKey]) || 0), 0)
    }
  })
  return resolveResult(fullNameToValue)
}

export default function Fy26ByMonthsChart({
  volumeData,
  openOrdersData,
  buyer,
  buyerSwitcherBuyers,
  vendor,
  onTotals,
  onYMax,
  yMax: yMaxProp,
  fyConfig,
  compact = false,
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

  const pastMonthLabels = useMemo(() => {
    if (!fyConfig?.fiscalMonths || !fyConfig?.openPoFiscal) return new Set()
    const now = new Date()
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const result = new Set()
    fyConfig.fiscalMonths.forEach((m, idx) => {
      const full = fyConfig.openPoFiscal[idx]
      if (!full) return
      const [mon, yr] = full.split(' ')
      const mIdx = MONTH_NAMES.indexOf(mon)
      const mYear = parseInt(yr)
      if (!isNaN(mIdx) && !isNaN(mYear)) {
        const isPast = mYear < now.getFullYear() || (mYear === now.getFullYear() && mIdx <= now.getMonth())
        if (isPast) result.add(MONTH_LABELS[m] || m.substring(0, 3))
      }
    })
    return result
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

    const sp = data.length ? ca.w / data.length : ca.w
    const bw = hasOpenData ? Math.max(4, Math.min(10, sp / 2 - 2)) : data.length > 11 ? 14 : 20
    const barGap = hasOpenData ? 2 : 0
    const groupW = hasOpenData ? bw * 2 + barGap : bw
    const groupOffX = (sp - groupW) / 2

    const bars = data.map((d, i) => {
      const shippedH = effectiveMaxY > 0 ? (d.shippedK / effectiveMaxY) * ca.h : 0
      const openK = (openByLabel?.[d.label] || 0) / 1000
      const openH = effectiveMaxY > 0 ? Math.max(openK > 0 ? 3 : 0, (openK / effectiveMaxY) * ca.h) : 0
      const baseX = ca.x + i * sp + groupOffX
      const shippedY = ca.y + ca.h - shippedH
      const openX = baseX + bw + barGap
      const openY = ca.y + ca.h - openH
      const isSelShip = sel && sel.idx === i && sel.bar === 'shipped'
      const isSelOpen = sel && sel.idx === i && sel.bar === 'open'
      const isPast = pastMonthLabels.has(d.label)

      return {
        i,
        label: d.label,
        baseX,
        shipped: { x: baseX, y: shippedY, w: bw, h: shippedH, fill: isSelShip ? '#00ff40' : '#22c55e' },
        open: hasOpenData && openH > 0
          ? { x: openX, y: openY, w: bw, h: openH,
              fill: isSelOpen ? (isPast? '#FF6B6B' : '#6b6eff') : (isPast ? '#f04242' : '#1100ff') }
          : null,
        groupW,
        ca,
        shippedRaw: d.shippedRaw,
        openRaw: openByLabel?.[d.label] || 0,
        isPast,
      }
    })

    return { W, H, ca, yTicks, bars, sp, bw, barGap, groupW, groupOffX }
  }, [data, openByLabel, hasOpenData, effectiveMaxY, sel, pastMonthLabels, compact])

  const tooltip = useMemo(() => {
    if (!sel || !data[sel.idx]) return null
    const b = chart.bars.find((x) => x.i === sel.idx)
    if (!b) return null
    const isOpen = sel.bar === 'open'
    const bar = isOpen ? b.open : b.shipped
    if (!bar) return null

    const cx = bar.x + bar.w / 2
    const y  = bar.y
    const tipLine1 = `${b.label}`
    const tipLine2 = `↑ ${fmt$(b.shippedRaw)}`
    const tipLine3 = hasOpenData && (b.openRaw || 0) > 0 ? `● ${fmt$(b.openRaw)}` : null
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

    const openIsPast = pastMonthLabels.has(b.label)
    return { tx, ty, tw, th, pts, tipLine1, tipLine2, tipLine3, showBelow, cx, openIsPast }
  }, [sel, data, chart, hasOpenData, pastMonthLabels])

  const totalShipped = data.reduce((s, d) => s + (d.shippedRaw || 0), 0)
  const totalOpenPast = data.reduce((s, d) => {
    const v = openByLabel?.[d.label] || 0
    return s + (pastMonthLabels.has(d.label) ? v : 0)
  }, 0)
  const totalOpenFuture = data.reduce((s, d) => {
    const v = openByLabel?.[d.label] || 0
    return s + (!pastMonthLabels.has(d.label) ? v : 0)
  }, 0)

  const fmtC = (v) => {
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
    if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K'
    return '$' + Math.round(v)
  }

  if (!data.length) {
    return <div style={{ padding: '2em', textAlign: 'center', color: '#555555' }}>No data for selected filter.</div>
  }

  return (
    <div className="chart-container">
      {/* Legend with inline totals */}
      <div className="flex gap-4 items-center mb-1 px-6 flex-wrap">
        <span className="flex items-center gap-1.5 text-[10px]">
          <span className="w-2.5 h-2.5 rounded-[2px] inline-block flex-shrink-0" style={{ background: '#22c55e' }} />
          <span className="text-gray-500">Shipped</span>
          <span className="font-semibold text-gray-800">{fmtC(totalShipped)}</span>
        </span>
        {hasOpenData && totalOpenPast > 0 && (
          <span className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2.5 h-2.5 rounded-[2px] inline-block flex-shrink-0 bg-red-400" />
            <span className="text-gray-500">Open (past)</span>
            <span className="font-semibold text-gray-800">{fmtC(totalOpenPast)}</span>
          </span>
        )}
        {hasOpenData && totalOpenFuture > 0 && (
          <span className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2.5 h-2.5 rounded-[2px] inline-block flex-shrink-0 bg-blue-400" />
            <span className="text-gray-500">Open (future)</span>
            <span className="font-semibold text-gray-800">{fmtC(totalOpenFuture)}</span>
          </span>
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
                fill="#9ca3af"
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
                onClick={() => setSel((prev) => (prev && prev.idx === b.i && prev.bar === 'shipped' ? null : { idx: b.i, bar: 'shipped' }))}
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
                  onClick={() => setSel((prev) => (prev && prev.idx === b.i && prev.bar === 'open' ? null : { idx: b.i, bar: 'open' }))}
                />
              )}

              <text
                x={b.baseX + b.groupW / 2}
                y={chart.ca.y + chart.ca.h + 14}
                textAnchor="middle"
                fill="#6b7280"
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
            <text x={tooltip.tx + tooltip.tw / 2} y={tooltip.ty + 20} textAnchor="middle" fill="#4ade80" fontSize="7.5">
              {tooltip.tipLine2}
            </text>
            {tooltip.tipLine3 && (
              <text x={tooltip.tx + tooltip.tw / 2} y={tooltip.ty + 31} textAnchor="middle" fill={tooltip.openIsPast ? '#f87171' : '#60a5fa'} fontSize="7.5">
                {tooltip.tipLine3}
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  )
}

