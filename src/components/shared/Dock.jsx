import { useState, useRef, useCallback, useEffect, Children, cloneElement, useMemo } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Canvas, useThree } from '@react-three/fiber'
import { MeshTransmissionMaterial, RoundedBox } from '@react-three/drei'
import './Dock.css'

const PAD = 16

// ── Three.js glass panel ───────────────────────────────────────────────────────

function GlassBar() {
  const { viewport } = useThree()
  return (
    <RoundedBox
      args={[viewport.width * 0.97, viewport.height * 0.90, 0.60]}
      radius={0.22}
      smoothness={8}
    >
      <MeshTransmissionMaterial
        transmission={1}
        thickness={0.60}
        ior={1.50}
        roughness={0}
        chromaticAberration={0.07}
        distortion={0.22}
        distortionScale={0.35}
        temporalDistortion={0.10}
        color="white"
        attenuationColor="#fff8ee"
        attenuationDistance={1.5}
      />
    </RoundedBox>
  )
}

function GlassScene() {
  return (
    <>
      <color attach="background" args={['#fbf9f5']} />

      <mesh position={[ 3.5,  0.6, -1.5]}>
        <planeGeometry args={[6, 4]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0.45} />
      </mesh>
      <mesh position={[-3.5, -0.6, -1.5]}>
        <planeGeometry args={[6, 4]} />
        <meshBasicMaterial color="#bae6fd" transparent opacity={0.40} />
      </mesh>
      <mesh position={[0, 1.2, -1.8]}>
        <planeGeometry args={[4, 2]} />
        <meshBasicMaterial color="#fda4af" transparent opacity={0.30} />
      </mesh>

      <ambientLight intensity={0.8} />
      <directionalLight position={[0, 4, 4]} intensity={1.5} />
      <pointLight position={[ 4,  3, 2]} intensity={5} color="#fde68a" />
      <pointLight position={[-4, -2, 2]} intensity={4} color="#bae6fd" />

      <GlassBar />
    </>
  )
}

// ── Inner dock pieces ──────────────────────────────────────────────────────────

function DockItem({ children, className = '', onClick, mouseX, spring, distance, magnification, baseItemSize, badge = false }) {
  const ref = useRef(null)
  const isHovered = useMotionValue(0)

  const mouseDistance = useTransform(mouseX, val => {
    const rect = ref.current?.getBoundingClientRect() ?? { x: 0, width: baseItemSize }
    return val - rect.x - baseItemSize / 2
  })

  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize])
  const size = useSpring(targetSize, spring)

  return (
    <motion.div
      ref={ref}
      style={{ width: size, height: size }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onClick={onClick}
      className={`dock-item ${className}`}
      tabIndex={0}
      role="button"
    >
      {Children.map(children, child => cloneElement(child, { isHovered }))}
      {badge && <div className="dock-badge" />}
    </motion.div>
  )
}

function DockLabel({ children, className = '', ...rest }) {
  const { isHovered } = rest
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unsub = isHovered.on('change', v => setVisible(v === 1))
    return () => unsub()
  }, [isHovered])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: -2 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.14 }}
          className={`dock-label ${className}`}
          style={{ x: '-50%' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function DockIcon({ children, className = '' }) {
  return <div className={`dock-icon ${className}`}>{children}</div>
}

// ── Main Dock ─────────────────────────────────────────────────────────────────

export default function Dock({
  items        = [],
  className    = '',
  spring       = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 66,
  distance     = 160,
  panelHeight  = 64,
  baseItemSize = 48,
}) {
  const dockW = useMemo(
    () => items.length * (baseItemSize + 6) + 24,
    [items.length, baseItemSize]
  )

  const [pos, setPos] = useState(() => ({
    x: window.innerWidth / 2 - dockW / 2,
    y: window.innerHeight - panelHeight - PAD,
  }))
  const [snapping,   setSnapping]   = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const dragRef          = useRef(null)
  const posRef           = useRef(pos)
  const suppressClickRef = useRef(false)

  const mouseX    = useMotionValue(Infinity)
  const isHovered = useMotionValue(0)

  const onDockDown = useCallback((e) => {
    if (e.button !== 0) return
    dragRef.current = {
      offsetX: e.clientX - posRef.current.x,
      offsetY: e.clientY - posRef.current.y,
      moved: false,
    }
    setIsDragging(true)
  }, [])

  useEffect(() => {
    const clampX = v => Math.max(PAD, Math.min(window.innerWidth  - dockW      - PAD, v))
    const clampY = v => Math.max(PAD, Math.min(window.innerHeight - panelHeight - PAD, v))

    const onMove = (e) => {
      if (!dragRef.current) return
      const next = {
        x: e.clientX - dragRef.current.offsetX,
        y: e.clientY - dragRef.current.offsetY,
      }
      if (Math.abs(next.x - posRef.current.x) > 3 || Math.abs(next.y - posRef.current.y) > 3)
        dragRef.current.moved = true
      posRef.current = next
      setPos(next)
    }

    const onUp = () => {
      if (!dragRef.current) return
      const moved = dragRef.current.moved
      dragRef.current = null
      setIsDragging(false)
      if (!moved) return

      suppressClickRef.current = true
      setTimeout(() => { suppressClickRef.current = false }, 80)

      const { x, y } = posRef.current
      const W = window.innerWidth
      const H = window.innerHeight

      const dL = x,  dR = W - x - dockW
      const dT = y,  dB = H - y - panelHeight
      const min = Math.min(dL, dR, dT, dB)

      const snap =
        min === dL ? { x: PAD,             y: clampY(y) } :
        min === dR ? { x: W - dockW - PAD, y: clampY(y) } :
        min === dT ? { x: clampX(x),       y: PAD       } :
                     { x: clampX(x),       y: H - panelHeight - PAD }

      posRef.current = snap
      setSnapping(true)
      setPos(snap)
      setTimeout(() => setSnapping(false), 420)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
    }
  }, [dockW, panelHeight])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position:   'fixed',
        left:       pos.x,
        top:        pos.y,
        width:      dockW,
        height:     panelHeight,
        zIndex:     8900,
        userSelect: 'none',
        overflow:   'visible',
        transition: snapping
          ? 'left 0.42s cubic-bezier(0.34,1.56,0.64,1), top 0.42s cubic-bezier(0.34,1.56,0.64,1), width 0.28s cubic-bezier(0.34,1.56,0.64,1)'
          : 'width 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        willChange: 'left, top',
      }}
      onClick={(e) => { if (suppressClickRef.current) e.stopPropagation() }}
    >
      <motion.div
        onMouseMove={({ pageX }) => { isHovered.set(1); mouseX.set(pageX) }}
        onMouseLeave={() => { isHovered.set(0); mouseX.set(Infinity) }}
        onPointerDown={onDockDown}
        role="toolbar"
        className={className}
        style={{
          position:    'relative',
          width:       '100%',
          height:      '100%',
          overflow:    'visible',
          touchAction: 'none',
          cursor:      isDragging ? 'grabbing' : 'grab',
        }}
      >
        {/* Three.js liquid glass background — clipped to rounded rect */}
        <div style={{
          position:      'absolute',
          inset:         0,
          borderRadius:  20,
          overflow:      'hidden',
          pointerEvents: 'none',
          border:        '1px solid rgba(255,255,255,0.38)',
          boxShadow:     '0 8px 40px rgba(0,0,0,0.14), inset 0 1.5px 0 rgba(255,255,255,0.65)',
        }}>
          <Canvas
            camera={{ position: [0, 0, 3.5], fov: 30 }}
            gl={{ antialias: true }}
            dpr={[1, 1.5]}
          >
            <GlassScene />
          </Canvas>
        </div>

        {/* HTML dock items — float above the glass */}
        <div style={{
          position: 'relative',
          zIndex:   1,
          display:  'flex',
          alignItems: 'flex-end',
          gap:      6,
          padding:  '0 12px',
          height:   '100%',
          overflow: 'visible',
        }}>
          {items.map((item, i) => (
            <DockItem
              key={item.id ?? i}
              onClick={item.onClick}
              className={item.className}
              mouseX={mouseX}
              spring={spring}
              distance={distance}
              magnification={magnification}
              baseItemSize={baseItemSize}
              badge={item.badge}
            >
              <DockIcon>{item.icon}</DockIcon>
              <DockLabel>{item.label}</DockLabel>
            </DockItem>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
