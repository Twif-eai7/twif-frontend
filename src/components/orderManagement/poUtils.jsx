// Shared formatting helpers and display micro-components for PO views

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const LEGACY_BUCKET = 'POFY26'

export function publicUrl(ref) {
  if (!ref) return ''
  if (ref.startsWith('http')) return ref
  const [bucket, ...rest] = ref.includes('::') ? ref.split('::') : [LEGACY_BUCKET, ref]
  const path = rest.join('::').split('/').map(encodeURIComponent).join('/')
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

export function fmt$(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

// Formats an amount in whatever currency it's actually in — shipment/invoice
// values are shown in their original booked currency now, not converted to
// USD (a live/implied rate drifting from the real number was actively
// misleading). Falls back to a plain "1234 XXX" if Intl doesn't recognize
// the currency code (bad/legacy data) rather than throwing.
export function fmtCurrency(amount, currency = 'USD') {
  if (amount == null) return '—'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${Math.round(amount).toLocaleString()} ${currency}`
  }
}

// Formats using the PO's original currency (falls back to USD)
export function fmtOriginalAmount(po) {
  if (po?.amount == null) return '—'
  return fmtCurrency(po.amount, po.currency || 'USD')
}

// Sums `amounts` (an array of { currency, value }, value possibly null)
// grouped by currency — the building block for any place that used to sum
// straight into one USD number but now has to keep currencies separate
// instead of silently mixing them.
export function sumByCurrency(amounts) {
  const totals = {}
  amounts.forEach(({ currency, value }) => {
    if (value == null) return
    const key = currency || 'USD'
    totals[key] = (totals[key] || 0) + value
  })
  return totals
}

// Renders a { currency: total } map as "$1,200 · €300" — one term per
// currency, stable order (USD first if present, then alphabetical) so it
// doesn't reshuffle between renders.
export function fmtCurrencySubtotals(totals) {
  const entries = Object.entries(totals || {}).filter(([, v]) => v)
  if (!entries.length) return '—'
  entries.sort(([a], [b]) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)))
  return entries.map(([currency, value]) => fmtCurrency(value, currency)).join(' · ')
}

// USD PO needs no conversion at all — rate is always 1 regardless of whether
// amount_usd happens to be populated (ERP-synced POs routinely only set
// `amount`, leaving amount_usd null). Only a genuinely non-USD PO still
// requires a real amount_usd/amount division to convert, and still returns
// null if that conversion isn't available — no rate gets fabricated for a
// currency that can't be converted. Shared by PoDrawer.jsx (line-item value
// checks) and AdvancePaymentModal.jsx (advance payment USD conversion) so
// both derive USD the same way the PO itself was valued, rather than a live
// FX rate that can drift from whatever rate the PO was actually booked at.
export function impliedRateFor(po) {
  if (!po?.currency || po.currency === 'USD') return 1
  return po?.amount_usd && po?.amount ? po.amount_usd / po.amount : null
}

export function fmtQty(n) {
  return n == null ? '—' : n.toLocaleString()
}

// Rounds to 2dp and drops trailing zeros (12.3 not 12.30, 12 not 12.00) —
// CBM values otherwise show long floating-point tails from sums/divisions
// upstream (e.g. 12.300000000000001).
export function fmtCbm(cbm) {
  if (cbm == null) return '—'
  return (Math.round(cbm * 100) / 100).toString()
}

export function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function PiBadge({ confirmed }) {
  return confirmed
    ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 whitespace-nowrap">Confirmed</span>
    : <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 whitespace-nowrap">PI Pending</span>
}

export function ErpBadge({ synced }) {
  return synced
    ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 whitespace-nowrap">ERP Synced</span>
    : <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-200 text-gray-600 whitespace-nowrap">Not Synced</span>
}

// onPreview is opt-in: pass it to open the doc in an in-page preview (e.g.
// DocPreviewModal) instead of the default behavior of navigating to it in a
// new tab.
export function DocChip({ url, label, onPreview }) {
  const fileIcon = (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
  if (!url) return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 border border-dashed border-gray-400 rounded-full text-[11px] text-gray-500">
      {fileIcon} No {label}
    </span>
  )
  // The in-page preview (PiPreviewPanel) is desktop-only (hidden on narrow
  // screens — no room for it alongside the drawer), so on mobile this falls
  // back to the same plain new-tab link the no-onPreview branch below uses,
  // rather than a button that would silently do nothing when tapped.
  if (onPreview) return (
    <>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="sm:hidden inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-[11px] text-gray-700 hover:border-gray-900 hover:text-gray-900 transition-colors">
        {fileIcon} {label}
      </a>
      <button type="button" onClick={() => onPreview(url)}
        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-[11px] text-gray-700 hover:border-gray-900 hover:text-gray-900 transition-colors cursor-pointer">
        {fileIcon} {label}
      </button>
    </>
  )
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-[11px] text-gray-700 hover:border-gray-900 hover:text-gray-900 transition-colors">
      {fileIcon} {label}
    </a>
  )
}
