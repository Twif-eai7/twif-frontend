export function formatCurrency(value) {
  const num = typeof value === 'number' ? value : parseFloat(value || 0)
  if (Number.isNaN(num)) return '$0.00'
  return `$${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// ── Currency conversion ───────────────────────────────────────────────────────

export const FALLBACK_RATES = { USD: 1, EUR: 1.17, GBP: 1.34, INR: 0.011 }

export function convertToUSD(amount, currency, rates = FALLBACK_RATES) {
  const rate = rates[currency] ?? 1
  return Math.round(amount * rate * 100) / 100
}

export function usdToInr(usd, rates = FALLBACK_RATES) {
  const r = rates.INR ?? FALLBACK_RATES.INR
  return Math.round((usd / r) * 100) / 100
}

export function inrToUsd(inr, rates = FALLBACK_RATES) {
  const r = rates.INR ?? FALLBACK_RATES.INR
  return Math.round(inr * r * 100) / 100
}

/** Chehoma flat-fee note — uses Rs. (not ₹) so PDF/Excel render correctly. */
export function formatChehomaCommissionNote(amountUsd, { showInr, rates, alreadyConverted = false } = {}) {
  if (!amountUsd || amountUsd <= 0) return null
  const v = showInr
    ? (alreadyConverted ? amountUsd : usdToInr(amountUsd, rates))
    : amountUsd
  const formatted = showInr
    ? `Rs. ${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `AS CHEHOMA's commission (${formatted}) is added`
}

export async function fetchLiveRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) throw new Error()
    const { rates } = await res.json()
    return Object.fromEntries(
      Object.entries(rates).map(([cur, r]) => [cur, r > 0 ? 1 / r : 1])
    )
  } catch {
    return FALLBACK_RATES
  }
}

// ── Org name display casing ───────────────────────────────────────────────────
// buyer/vendor names in `organizations.display_name` are entered inconsistently
// (all-caps, all-lower, mixed) — normalize to Title Case for display, while
// preserving common business-suffix acronyms that Title Case would otherwise
// mangle (e.g. "Vantage Packaging Ltd" not "Vantage Packaging Ltd" -> "Ltd").
const KEEP_UPPER = new Set(['LLC', 'INC', 'LTD', 'CO', 'USA', 'UK', 'LLP', 'PLC', 'BV', 'LP', 'SA', 'NV', 'GMBH'])

export function titleCaseName(str) {
  if (!str) return str
  return str
    .toLowerCase()
    .split(' ')
    .map(word => {
      const bare = word.toUpperCase().replace(/[.,]/g, '')
      if (KEEP_UPPER.has(bare)) return word.toUpperCase()
      return word.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-')
    })
    .join(' ')
}

// ── Container booking status ──────────────────────────────────────────────────
// container_number is NOT NULL on shipment_containers, so a container can be
// created (and invoices attached to it) before the real number is known — the
// convention is to type "TBA" as a placeholder. An invoice/group with
// container_id set is therefore not necessarily actually booked yet; check
// the container's own number before calling it "Booked" rather than trusting
// container_id presence alone.
export function isContainerNumberConfirmed(containerNumber) {
  const n = (containerNumber || '').trim().toUpperCase()
  return n.length > 0 && n !== 'TBA'
}

// ── Date + time ───────────────────────────────────────────────────────────────
// Short, locale-stable "2 Sep 2026, 14:30". Returns '—' for missing/invalid input.
export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatPercent(value) {
  if (value == null) return '0%'
  if (typeof value === 'string' && value.endsWith('%')) return value
  const num = typeof value === 'number' ? value : parseFloat(value || 0)
  if (Number.isNaN(num)) return '0%'
  return `${num.toFixed(1)}%`
}
