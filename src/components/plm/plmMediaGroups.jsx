import { useState } from 'react'

// Shared by WorkspaceModal, PLMGuestChatPage and DemoWorkspaceModal so their Media panels
// and small-screen auto-scaling behave identically.

// Auto-shrink dense 3-column workspace surfaces on smaller desktop screens (>= 1024px, below
// which they collapse to a single stacked pane). Returns a CSS `zoom` factor — the same
// effect as the user lowering browser zoom, but automatic. Pair with the `.ws-modal-scale`
// rules in index.css: put the returned value in `--ws-scale` and `data-scaled="1"` on a
// wrapper around the header + body (keep overlays outside the wrapper).
export function computeWorkspaceScale() {
  if (typeof window === 'undefined') return 1
  const w = window.innerWidth
  if (w < 1024) return 1
  return Math.min(1, Math.max(0.67, Math.round((w / 1900) * 100) / 100))
}

// Buckets media items (each carrying `uploadedAt`) into month groups, newest month first.
// Items with no date land in a trailing "Undated" bucket. Order within a month is preserved,
// so callers can keep passing the full section array to the lightbox unchanged.
export function monthBucketsOf(items) {
  const map = new Map()
  for (const item of items) {
    const raw = item.uploadedAt ?? item.ts ?? null   // `ts` is what DemoWorkspaceModal carries
    const d = raw ? new Date(raw) : null
    const key = d && !isNaN(d)
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : '0000-00'
    const label = key === '0000-00'
      ? 'Undated'
      : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    if (!map.has(key)) map.set(key, { key, label, items: [] })
    map.get(key).items.push(item)
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
}

// Collapsible month sub-header for a Media panel. Keyed by month in the parent so a
// newly-appearing month mounts fresh with its own `defaultOpen`.
export function MonthGroup({ label, count, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="group w-full flex items-center gap-1.5 py-1 text-[9px] lg:text-[11px] font-bold uppercase tracking-[.1em] text-[#1A1A18] cursor-pointer border-none bg-transparent"
      >
        <span className="flex items-center justify-center w-4 h-4 lg:w-[18px] lg:h-[18px] rounded-sm border border-black/25 flex-shrink-0 group-hover:border-black/50 group-hover:bg-black/[.04] transition-colors">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${open ? 'rotate-90' : ''}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        <span className="group-hover:opacity-70 transition-opacity">{label}</span>
        <span className="group-hover:opacity-70 transition-opacity">· {count}</span>
        <span className="flex-1 flex items-center gap-1.5 ml-1">
          <span className="flex-1 h-px bg-black/25 group-hover:bg-black/45 transition-colors" />
          <span className="text-[8px] lg:text-[9px] tracking-[.08em] text-[#1A1A18] group-hover:opacity-70 transition-opacity">{open ? 'Collapse' : 'Expand'}</span>
          <span className="flex-1 h-px bg-black/25 group-hover:bg-black/45 transition-colors" />
        </span>
      </button>
      {open && children}
    </div>
  )
}
