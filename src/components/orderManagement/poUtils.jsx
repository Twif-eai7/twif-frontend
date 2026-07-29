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

// Formats using the PO's original currency (falls back to USD)
export function fmtOriginalAmount(po) {
  if (po?.amount == null) return '—'
  const currency = po.currency || 'USD'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(po.amount)
}

export function fmtQty(n) {
  return n == null ? '—' : n.toLocaleString()
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

export function DocChip({ url, label }) {
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
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-[11px] text-gray-700 hover:border-gray-900 hover:text-gray-900 transition-colors">
      {fileIcon} {label}
    </a>
  )
}
