const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function normBuyerName(name) {
  return name?.toString().trim().replace(/\u00A0/g, '').replace(/\s+/g, ' ').toUpperCase() || ''
}

export function shippedPoKey(row) {
  const vendor = (row?.vendor || '').toString().trim()
  const poNo = (row?.poNo || '').toString().trim()
  return `${vendor}__${poNo}`
}

export function hasShippedActivity(row) {
  return (row?.shippedQty || 0) > 0 || (row?.shippedValue || 0) > 0
}

export function parseShippedDate(value) {
  if (!value) return null
  const str = value.toString().trim()
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/** Target may be a full date or a month label like "April 2026". */
export function parseTargetDate(value) {
  if (!value) return null
  const str = value.toString().trim()
  if (!str) return null

  const monthLabel = /^([A-Za-z]+)\s+(\d{4})$/.exec(str)
  if (monthLabel) {
    const monthIndex = MONTHS.findIndex(m => m.toLowerCase() === monthLabel[1].toLowerCase())
    if (monthIndex !== -1) {
      const year = parseInt(monthLabel[2], 10)
      return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
    }
  }

  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/** Matches Shipped PO Summary "On Time" — shipped on or before target. */
export function isShippedPoOnTime(shippedDate, target) {
  const shipped = parseShippedDate(shippedDate)
  const targetD = parseTargetDate(target)
  if (!shipped || !targetD) return null
  return shipped <= targetD
}
