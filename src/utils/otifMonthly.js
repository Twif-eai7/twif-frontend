import {
  hasShippedActivity,
  isShippedPoOnTime,
  parseShippedDate,
  shippedPoKey,
} from './shippedPoTiming'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const FY27_OTIF_MONTH_KEYS = [
  '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
  '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03',
]

export const FY26_OTIF_MONTH_KEYS = [
  '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09',
  '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
]

/** Buyers query for shipped-po-summary — mirrors dashboardStore volume/open-orders fetch. */
export function buildShippedPoBuyersParam(currentBuyer, availableBuyers) {
  const isAll = !currentBuyer || currentBuyer === 'All' || currentBuyer === 'Total'
    || currentBuyer.toUpperCase().includes('TOTAL')
  if (!isAll) return currentBuyer
  return (availableBuyers || [])
    .filter(b => b && !b.toUpperCase().includes('TOTAL'))
    .join('||')
}

export function otifMonthKeysForFy(fy) {
  return fy === '26' ? FY26_OTIF_MONTH_KEYS : FY27_OTIF_MONTH_KEYS
}

function monthKeyToLabel(key) {
  const [yr, m] = key.split('-')
  return `${MONTHS[parseInt(m, 10) - 1] || m} ${yr}`
}

function monthKeyFromShipped(shippedDate) {
  const d = parseShippedDate(shippedDate)
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function computeOtifMonthly(rows, monthKeys = FY27_OTIF_MONTH_KEYS) {
  const byMonth = Object.fromEntries(monthKeys.map(k => [k, { poMap: new Map(), orderValue: 0, shippedValue: 0, balanceValue: 0 }]))

  for (const row of rows) {
    if (!hasShippedActivity(row)) continue

    const monthKey = monthKeyFromShipped(row.shippedDate)
    if (!monthKey || !byMonth[monthKey]) continue

    const key = shippedPoKey(row)
    if (!key || key === '__') continue

    byMonth[monthKey].orderValue += row.orderValue || 0
    byMonth[monthKey].shippedValue += row.shippedValue || 0
    byMonth[monthKey].balanceValue += row.balanceValue || 0

    const onTime = isShippedPoOnTime(row.shippedDate, row.target)
    if (onTime == null) continue

    const map = byMonth[monthKey].poMap
    if (!map.has(key)) {
      map.set(key, onTime)
    } else if (!onTime) {
      map.set(key, false)
    }
  }

  const months = monthKeys.map((key) => {
    const { poMap, orderValue, shippedValue, balanceValue } = byMonth[key]
    const pos = [...poMap.values()]
    const shippedPos = pos.length
    const onTimePos = pos.filter(Boolean).length
    return {
      label: monthKeyToLabel(key),
      orderValue: shippedPos ? orderValue : null,
      shippedValue: shippedPos ? shippedValue : null,
      balanceValue: shippedPos ? balanceValue : null,
      percentage: shippedPos ? (onTimePos / shippedPos) * 100 : null,
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
