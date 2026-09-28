import { useRef } from 'react'

// Long-press a row to enter multi-select mode (touch or mouse), folding the
// normal `onClick` into the same returned handlers so a `firedRef` flag can
// reliably suppress the short-tap action that follows a long-press release.
// Originally written for PoSkuSummary.jsx's SKU cards, hoisted here so
// RepositoryPanel.jsx/RepositoryPoDrawer.jsx (QC Reports) can reuse the
// exact same gesture instead of a second copy.
export function useLongPress({ onLongPress, onClick, threshold = 500 }) {
  const timerRef = useRef(null)
  const firedRef = useRef(false)
  const startPosRef = useRef(null)
  const clear = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }
  return {
    onPointerDown: (e) => {
      firedRef.current = false
      startPosRef.current = { x: e.clientX, y: e.clientY }
      clear()
      timerRef.current = setTimeout(() => { firedRef.current = true; onLongPress() }, threshold)
    },
    onPointerMove: (e) => {
      if (!startPosRef.current) return
      if (Math.abs(e.clientX - startPosRef.current.x) > 8 || Math.abs(e.clientY - startPosRef.current.y) > 8) clear()
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onClick: (e) => {
      if (firedRef.current) { firedRef.current = false; return }
      onClick(e)
    },
  }
}
