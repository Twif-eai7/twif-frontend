import { useRef, useState } from 'react'

// Drag a bottom sheet down to dismiss it - the native iOS/Android bottom-
// sheet gesture people instinctively try, on top of whatever explicit
// close affordance (backdrop tap, an X/Cancel button) the sheet already
// has. Only commits to closing past a real drag distance (not a tap, not a
// small wobble); a partial drag that doesn't clear the threshold just
// settles back to 0 once released - the caller applies `dragY` as a
// translateY so the sheet visibly follows the finger while dragging, then
// snaps back (via its own CSS transition) if the drag didn't go far enough.
// Touch-only (`pointerType === 'touch'`) rather than gated by viewport
// width - a desktop mouse-drag on a centered dialog isn't the same gesture
// and shouldn't close it, regardless of screen size.
export function useDragToDismiss({ onDismiss, threshold = 80 }) {
  const [dragY, setDragY] = useState(0)
  const startYRef = useRef(null)
  const draggingRef = useRef(false)
  const dragYRef = useRef(0)
  const handlers = {
    onPointerDown: (e) => {
      if (e.pointerType !== 'touch') return
      startYRef.current = e.clientY
      draggingRef.current = true
    },
    onPointerMove: (e) => {
      if (!draggingRef.current || startYRef.current == null) return
      const delta = e.clientY - startYRef.current
      const next = delta > 0 ? delta : 0   // only downward - never lifts the sheet above its resting spot
      dragYRef.current = next
      setDragY(next)
    },
    onPointerUp: () => {
      if (draggingRef.current && dragYRef.current > threshold) onDismiss()
      draggingRef.current = false
      startYRef.current = null
      dragYRef.current = 0
      setDragY(0)
    },
    onPointerCancel: () => { draggingRef.current = false; startYRef.current = null; dragYRef.current = 0; setDragY(0) },
  }
  return { dragY, dragHandlers: handlers }
}
