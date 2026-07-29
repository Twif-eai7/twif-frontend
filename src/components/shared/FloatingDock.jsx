import { useState, useRef, useEffect, useCallback } from 'react'

// Inject keyframes once into document
if (typeof document !== 'undefined' && !document.getElementById('floating-dock-kf')) {
  const s = document.createElement('style')
  s.id = 'floating-dock-kf'
  s.textContent = `
    @keyframes dockItemIn {
      from { opacity: 0; transform: scale(0.6) translateY(6px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
  `
  document.head.appendChild(s)
}

const SIZE     = 48
const PAD      = 16

/**
 * FloatingDock — draggable AssistiveTouch-style button.
 *
 * Props:
 *   actions: [{ id, label, icon: <svg/>, onClick }]
 *   initialY: number (px from top, default 200)
 */
export default function FloatingDock({ actions = [], initialY = 200 }) {
  const [pos, setPos] = useState(() => ({
    x: (typeof window !== 'undefined' ? window.innerWidth : 1200) - SIZE - PAD,
    y: initialY,
  }))
  const [open,     setOpen]     = useState(false)
  const [dragging, setDragging] = useState(false)
  const [snapping, setSnapping] = useState(false)

  const dragRef = useRef(null)   // { offsetX, offsetY, moved }
  const posRef  = useRef(pos)    // live position during drag (avoids stale closure)

  const isRight = pos.x + SIZE / 2 > window.innerWidth / 2

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const onDown = useCallback((e) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      offsetX: e.clientX - posRef.current.x,
      offsetY: e.clientY - posRef.current.y,
      moved: false,
    }
    setDragging(true)
    // Don't touch open here — let onUp handle the toggle
  }, [])

  const onMove = useCallback((e) => {
    if (!dragRef.current) return
    const next = {
      x: Math.max(0, Math.min(window.innerWidth  - SIZE, e.clientX - dragRef.current.offsetX)),
      y: Math.max(0, Math.min(window.innerHeight - SIZE, e.clientY - dragRef.current.offsetY)),
    }
    const dx = next.x - posRef.current.x
    const dy = next.y - posRef.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true
    posRef.current = next
    setPos(next)
  }, [])

  const onUp = useCallback(() => {
    if (!dragRef.current) return
    const moved = dragRef.current.moved
    dragRef.current = null
    setDragging(false)

    if (!moved) {
      setOpen(v => !v)
      return
    }

    // Was dragged — close panel then snap to edge
    setOpen(false)

    const snap = {
      x: posRef.current.x + SIZE / 2 < window.innerWidth / 2
        ? PAD
        : window.innerWidth - SIZE - PAD,
      y: Math.max(PAD, Math.min(window.innerHeight - SIZE - PAD, posRef.current.y)),
    }
    posRef.current = snap
    setSnapping(true)
    setPos(snap)
    setTimeout(() => setSnapping(false), 420)
  }, [])

  // ── Close on outside tap ───────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!e.target.closest('[data-fdock]')) setOpen(false)
    }
    window.addEventListener('pointerdown', handler, true)
    return () => window.removeEventListener('pointerdown', handler, true)
  }, [open])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      data-fdock=""
      style={{
        position:   'fixed',
        left:       pos.x,
        top:        pos.y,
        zIndex:     8900,
        userSelect: 'none',
        transition: snapping
          ? 'left 0.42s cubic-bezier(0.34,1.56,0.64,1), top 0.42s cubic-bezier(0.34,1.56,0.64,1)'
          : 'none',
        willChange: 'left, top',
      }}
    >
      {/* ── Action panel ── */}
      {open && (
        <div style={{
          position:      'absolute',
          top:           '50%',
          transform:     'translateY(-50%)',
          [isRight ? 'right' : 'left']: SIZE + 10,
          display:       'flex',
          flexDirection: 'column',
          gap:           8,
          alignItems:    isRight ? 'flex-end' : 'flex-start',
        }}>
          {actions.map((action, i) => (
            <DockAction
              key={action.id ?? i}
              action={action}
              index={i}
              isRight={isRight}
              onClose={() => setOpen(false)}
            />
          ))}
        </div>
      )}

      {/* ── Trigger button ── */}
      <button
        type="button"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        style={{ touchAction: 'none', display: 'block' }}
        className={[
          'w-12 h-12 rounded-full',
          'flex items-center justify-center',
          'border border-white/[.07]',
          'shadow-[0_3px_18px_rgba(0,0,0,0.45)]',
          'transition-all duration-150',
          dragging
            ? 'bg-[#1A1A18] opacity-100 scale-[1.1] cursor-grabbing'
            : open
              ? 'bg-[#1A1A18] opacity-100 scale-100 cursor-pointer'
              : 'bg-[#1A1A18]/85 opacity-85 hover:opacity-100 hover:scale-105 hover:bg-[#1A1A18] cursor-grab',
        ].join(' ')}
      >
        <span className="pointer-events-none flex items-center justify-center">
          {open ? <CloseIcon /> : <GridIcon />}
        </span>
      </button>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DockAction({ action, index, isRight, onClose }) {
  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        flexDirection:  isRight ? 'row-reverse' : 'row',
        animation:      `dockItemIn 0.22s cubic-bezier(0.34,1.56,0.64,1) ${index * 45}ms both`,
      }}
    >
      <span style={{
        fontSize:        9,
        fontWeight:      700,
        letterSpacing:  '0.08em',
        textTransform:  'uppercase',
        color:           'rgba(245,243,239,0.65)',
        background:      'rgba(26,26,24,0.9)',
        padding:         '3px 9px',
        whiteSpace:      'nowrap',
        backdropFilter:  'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}>
        {action.label}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); action.onClick?.(); onClose() }}
        className="w-10 h-10 rounded-full bg-[#1A1A18] border border-white/10 flex items-center justify-center cursor-pointer shadow-md hover:bg-[#2e2e2a] transition-colors flex-shrink-0"
      >
        {action.icon}
      </button>
    </div>
  )
}

function GridIcon() {
  const pts = [3, 9, 15]
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      {pts.flatMap(cy => pts.map(cx => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.55" fill="#F5F3EF" fillOpacity="0.82"/>
      )))}
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="#F5F3EF" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  )
}
