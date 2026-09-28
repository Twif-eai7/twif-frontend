import { useRef } from 'react'

// Swipe left/right to move between a horizontal set of tabs - the natural
// mobile gesture for tab-like views (matches Mail-folder/Photos-category
// style swiping), on top of the tab pills themselves. Gated to
// `pointerType === 'touch'` (not a CSS breakpoint) so it never hijacks a
// desktop trackpad/mouse drag - the pills stay the only way to switch tabs
// there, exactly as before. Deliberately loose on vertical scrolling: only
// commits to a tab change once the horizontal distance clearly dominates
// the vertical one, so scrolling the list underneath never gets mistaken
// for a swipe. Originally written for PoSkuSummary.jsx's Overview/Inline/
// Midline/Final tabs, hoisted here so other tab rows (e.g.
// RepositoryPoDrawer.jsx's Inline/Midline/Final tabs) can reuse the same
// gesture instead of a second copy.
export function useSwipeTabs({ order, activeKey, onChange, threshold = 60 }) {
  const startRef = useRef(null)
  return {
    onPointerDown: (e) => {
      if (e.pointerType !== 'touch') return
      startRef.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e) => {
      const start = startRef.current
      startRef.current = null
      if (!start || e.pointerType !== 'touch') return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return
      const idx = order.indexOf(activeKey)
      if (idx === -1) return
      const nextIdx = dx < 0 ? idx + 1 : idx - 1
      if (nextIdx >= 0 && nextIdx < order.length) onChange(order[nextIdx])
    },
    onPointerCancel: () => { startRef.current = null },
  }
}
