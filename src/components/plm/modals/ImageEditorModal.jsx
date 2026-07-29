import { useState, useEffect, useRef, useCallback } from 'react'

// Small line-icon set styled after WhatsApp's photo-editor toolbar (plain outline glyphs,
// no fills) rather than the unicode symbols used before — clearer at a glance, and each
// button now carries a short label underneath so the toolbar doesn't rely on hover tooltips.
const MoveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>
    <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
  </svg>
)
const PenIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
  </svg>
)
const HighlighterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 11-6 6v3h3l6-6"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
  </svg>
)
const TextIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
  </svg>
)
const ShapesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="12" height="12" rx="2"/><circle cx="17" cy="17" r="4"/>
  </svg>
)

const ANNOTATION_TOOLS = [
  { key: 'none',        icon: <MoveIcon />,        label: 'Move',       title: 'Select / move' },
  { key: 'pen',         icon: <PenIcon />,          label: 'Pen',        title: 'Pen (auto-straightens lines & shapes)' },
  { key: 'highlighter', icon: <HighlighterIcon />,  label: 'Highlight',  title: 'Highlighter' },
  { key: 'text',        icon: <TextIcon />,         label: 'Text',       title: 'Text' },
]

const SHAPE_TOOLS = [
  { key: 'line',     icon: '╱',  title: 'Line' },
  { key: 'arrow',    icon: '↗',  title: 'Arrow' },
  { key: 'rect',     icon: '▭',  title: 'Rectangle' },
  { key: 'ellipse',  icon: '◯',  title: 'Ellipse' },
  { key: 'triangle', icon: '△',  title: 'Triangle' },
  { key: 'diamond',  icon: '◇',  title: 'Diamond' },
  { key: 'pentagon', icon: '⬠',  title: 'Pentagon' },
  { key: 'hexagon',  icon: '⬡',  title: 'Hexagon' },
  { key: 'star',     icon: '★',  title: 'Star' },
]

const FONT_FAMILIES = [
  { value: 'system-ui, sans-serif',        label: 'Sans' },
  { value: 'Georgia, serif',               label: 'Serif' },
  { value: '"Courier New", monospace',     label: 'Mono' },
  { value: '"Comic Sans MS", cursive',     label: 'Casual' },
  { value: '"Times New Roman", serif',     label: 'Times' },
]

const ANNOTATION_COLORS = [
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be',
  '#007aff', '#5856d6', '#af52de', '#1a1a18', '#ffffff',
]

// Resize handles shown around a selected annotation's (padded) bounding box.
// `get` locates the handle, `anchorOf` is the opposite point that stays fixed while
// dragging, and `axis` says which axes the drag should scale ('both' for corners).
const RESIZE_HANDLES = {
  nw: { get: b => ({ x: b.x,         y: b.y         }), anchorOf: b => ({ x: b.x + b.w,     y: b.y + b.h     }), axis: 'both', cursor: 'nwse-resize' },
  ne: { get: b => ({ x: b.x + b.w,   y: b.y         }), anchorOf: b => ({ x: b.x,           y: b.y + b.h     }), axis: 'both', cursor: 'nesw-resize' },
  sw: { get: b => ({ x: b.x,         y: b.y + b.h   }), anchorOf: b => ({ x: b.x + b.w,     y: b.y           }), axis: 'both', cursor: 'nesw-resize' },
  se: { get: b => ({ x: b.x + b.w,   y: b.y + b.h   }), anchorOf: b => ({ x: b.x,           y: b.y           }), axis: 'both', cursor: 'nwse-resize' },
  n:  { get: b => ({ x: b.x + b.w/2, y: b.y         }), anchorOf: b => ({ x: b.x + b.w/2,   y: b.y + b.h     }), axis: 'y',    cursor: 'ns-resize'   },
  s:  { get: b => ({ x: b.x + b.w/2, y: b.y + b.h   }), anchorOf: b => ({ x: b.x + b.w/2,   y: b.y           }), axis: 'y',    cursor: 'ns-resize'   },
  w:  { get: b => ({ x: b.x,         y: b.y + b.h/2 }), anchorOf: b => ({ x: b.x + b.w,     y: b.y + b.h/2   }), axis: 'x',    cursor: 'ew-resize'   },
  e:  { get: b => ({ x: b.x + b.w,   y: b.y + b.h/2 }), anchorOf: b => ({ x: b.x,           y: b.y + b.h/2   }), axis: 'x',    cursor: 'ew-resize'   },
}
const RESIZE_HANDLE_PAD = 4 // matches the selection outline's padding in drawOneAnnotation

/**
 * ImageEditorModal
 *
 * Props:
 *   imageUrl        {string}   – URL of the image to edit
 *   onSave          {function} – async (blob) => void  called with the exported PNG blob.
 *                                 Ignored whenever onSaveAsCopy is given.
 *   onSaveAsCopy    {function} – async (blob) => void  — saves the edit as a new image, leaving
 *                                 the original untouched. Given alone, renders a single
 *                                 "Save as Copy" button. Given together with onSaveReplace,
 *                                 renders two buttons instead of one.
 *   onSaveReplace   {function} – async (blob) => void  — dual-save mode only: overwrites the original.
 *   replaceDisabled {boolean}  – disables the "Replace Original" button (e.g. original is pinned
 *                                 elsewhere) — the save still succeeds, just as a copy.
 *   replaceDisabledReason {string} – tooltip shown on the disabled Replace button.
 *   copyOnlyReason  {string}   – explanatory note shown under the button in copy-only mode
 *                                 (onSaveAsCopy given without onSaveReplace).
 *   onClose         {function} – called when the user closes without saving
 *   isLocked        {boolean}  – if true, shows a toast and does nothing
 *   toast           {function} – (message, isError?) => void  — pass your app's toast fn
 */
export default function ImageEditorModal({
  imageUrl, onSave, onSaveAsCopy, onSaveReplace, replaceDisabled = false, replaceDisabledReason,
  copyOnlyReason = 'This image can no longer be replaced directly — your edit will be saved as a new image in Reference Media instead.',
  onClose, isLocked = false, toast,
}) {
  const dualSaveMode = !!(onSaveAsCopy && onSaveReplace)
  const copyOnlyMode = !dualSaveMode && !!onSaveAsCopy

  // ── canvas refs ──────────────────────────────────────────────────────────
  const canvasRef     = useRef(null)
  const cropCanvasRef = useRef(null)
  const wrapRef       = useRef(null)
  const slideRef      = useRef(null)
  const fileInputRef  = useRef(null)

  // ── image state ──────────────────────────────────────────────────────────
  const sourceImgRef = useRef(null)
  const [naturalW, setNaturalW] = useState(0)
  const [naturalH, setNaturalH] = useState(0)

  // ── transform state ──────────────────────────────────────────────────────
  const [rotation,   setRotation]   = useState(0)
  const [flipH,      setFlipH]      = useState(false)
  const [flipV,      setFlipV]      = useState(false)
  const [imageScale, setImageScale] = useState(1.0)
  const [slideRatio, setSlideRatio] = useState('1:1')
  // A permanent caption baked as a footer strip below the image on export — distinct from the
  // Text annotation tool, which floats on top of the photo and can be moved/hidden/cropped out.
  const [remarks,         setRemarks]         = useState('')
  const [remarksColor,    setRemarksColor]    = useState('#1a1a18')
  const [remarksFontSize, setRemarksFontSize] = useState(16)
  const [remarksEditing,  setRemarksEditing]  = useState(false)

  // ── crop state ───────────────────────────────────────────────────────────
  const [cropMode,    setCropMode]    = useState(false)
  const [cropRect,    setCropRect]    = useState(null)
  const cropStartRef  = useRef(null)
  const isDraggingRef = useRef(false)

  // ── annotation state ─────────────────────────────────────────────────────
  const annotationCanvasRef = useRef(null)
  const [annoTool,   setAnnoTool]   = useState('none')   // 'none'|'pen'|'highlighter'|'rect'|'ellipse'|'line'|'arrow'|'triangle'|'star'|'text'
  const [annoColor,  setAnnoColor]  = useState('#ff3b30')
  const [annoWidth,  setAnnoWidth]  = useState(4)
  const [annoFontSize, setAnnoFontSize] = useState(24)
  const [annoFontFamily, setAnnoFontFamily] = useState(FONT_FAMILIES[0].value)
  const [shapesMenuOpen, setShapesMenuOpen] = useState(false)
  const shapesMenuRef = useRef(null)
  const [annotations,     setAnnotations]     = useState([])   // committed shapes/strokes
  const [annoHistory,     setAnnoHistory]     = useState([])   // undo stack (past states)
  const [annoFuture,      setAnnoFuture]      = useState([])   // redo stack
  const [selectedAnnoId,  setSelectedAnnoId]  = useState(null)
  const [draftAnno,       setDraftAnno]       = useState(null) // shape/stroke currently being drawn
  const [textEditing,     setTextEditing]     = useState(null) // { x, y, value, editingId? } while placing/editing a text annotation
  const annoDrawingRef    = useRef(false)
  const annoStartRef      = useRef(null)
  const annoMoveRef       = useRef(null) // { id, original, startX, startY, lastX, lastY } while dragging a selected annotation
  const annoResizeRef     = useRef(null) // { id, original, corner, lastX, lastY } while dragging a resize handle
  const [hoverHandle,     setHoverHandle]     = useState(null) // resize handle key under the cursor (for cursor styling)
  const textInputRef      = useRef(null)
  // Set while the mouse is down on a toolbar text control (color/font/size) — lets the
  // text input's onBlur know the blur was caused by the toolbar, not by the user clicking
  // away, so it doesn't commit/close the editor out from under an in-progress adjustment.
  const toolbarInteractionRef = useRef(false)

  // ── saving state ─────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)

  // ── image-level history (crop / replace) ─────────────────────────────────
  // Separate from annoHistory/annoFuture (which only cover annotation edits) — this
  // stack snapshots the whole editable image (source + transform + annotations) right
  // before a destructive action (Apply Crop, Replace Image) so those steps can be undone
  // too, not just individual shapes/strokes.
  const [imageHistory, setImageHistory] = useState([])
  const [imageFuture,  setImageFuture]  = useState([])
  const pendingRestoreRef = useRef(null)

  // ── refs for values used inside canvas callbacks ─────────────────────────
  // (avoids stale closures in mouse handlers)
  const stateRef = useRef({})
  stateRef.current = { rotation, flipH, flipV, imageScale, slideRatio, cropMode, cropRect }

  // ── locked guard ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLocked) {
      toast?.('Image cannot be edited after workspace is active', true)
      onClose?.()
    }
  }, [isLocked])

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  const getSlideSize = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return { slideW: 600, slideH: 600 }
    const wrapW  = wrap.clientWidth  || 800
    const wrapH  = wrap.clientHeight || 500
    const margin = 48
    const { rotation: rot, slideRatio: ratio } = stateRef.current
    const nW = naturalW, nH = naturalH

    if (ratio === 'free') {
      const isRot90 = rot % 180 !== 0
      const imgW = isRot90 ? nH : nW
      const imgH = isRot90 ? nW : nH
      if (!imgW || !imgH) return { slideW: wrapW - margin, slideH: wrapH - margin }
      const fit = Math.min((wrapW - margin) / imgW, (wrapH - margin) / imgH, 1)
      return { slideW: Math.round(imgW * fit), slideH: Math.round(imgH * fit) }
    }

    const [rw, rh] = ratio.split(':').map(Number)
    const aspect = rw / rh
    const maxW   = wrapW - margin
    const maxH   = wrapH - margin
    if (maxW / maxH > aspect) {
      const slideH = maxH
      return { slideW: Math.round(slideH * aspect), slideH }
    }
    const slideW = maxW
    return { slideW, slideH: Math.round(slideW / aspect) }
  }, [naturalW, naturalH])

  const renderSlide = useCallback((slideW, slideH) => {
    const { rotation: rot, flipH: fH, flipV: fV, imageScale: scale } = stateRef.current
    const off  = document.createElement('canvas')
    off.width  = slideW
    off.height = slideH
    const octx = off.getContext('2d')
    octx.imageSmoothingEnabled = true
    octx.imageSmoothingQuality = 'high'
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, slideW, slideH)

    const img = sourceImgRef.current
    if (!img) return off

    const isRot90   = rot % 180 !== 0
    const srcW      = isRot90 ? naturalH : naturalW
    const srcH      = isRot90 ? naturalW : naturalH
    const baseFit   = Math.min(slideW / srcW, slideH / srcH)
    const drawW     = srcW * baseFit * scale
    const drawH     = srcH * baseFit * scale
    const cx        = slideW / 2
    const cy        = slideH / 2

    octx.save()
    octx.translate(cx, cy)
    octx.rotate((rot * Math.PI) / 180)
    octx.scale(fH ? -1 : 1, fV ? -1 : 1)
    if (isRot90) {
      octx.drawImage(img, -drawH / 2, -drawW / 2, drawH, drawW)
    } else {
      octx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
    }
    octx.restore()
    return off
  }, [naturalW, naturalH])

  const drawCropOverlay = useCallback(() => {
    const cc = cropCanvasRef.current
    if (!cc) return
    const cctx = cc.getContext('2d')
    const { cropMode: cm, cropRect: cr } = stateRef.current
    cctx.clearRect(0, 0, cc.width, cc.height)
    if (!cm || !cr || cr.w < 2 || cr.h < 2) return

    const { x: cx, y: cy, w: cw, h: ch } = { ...cr,
      x: Math.round(cr.x), y: Math.round(cr.y),
      w: Math.round(cr.w), h: Math.round(cr.h),
    }

    cctx.fillStyle = 'rgba(0,0,0,0.58)'
    cctx.fillRect(0, 0, cc.width, cy)
    cctx.fillRect(0, cy + ch, cc.width, cc.height - cy - ch)
    cctx.fillRect(0, cy, cx, ch)
    cctx.fillRect(cx + cw, cy, cc.width - cx - cw, ch)

    cctx.save()
    cctx.strokeStyle = '#7b68ee'
    cctx.lineWidth   = 1.5
    cctx.setLineDash([5, 3])
    cctx.strokeRect(cx + 0.5, cy + 0.5, cw, ch)
    cctx.setLineDash([])

    cctx.strokeStyle = 'rgba(123,104,238,0.35)'
    cctx.lineWidth   = 0.75
    cctx.beginPath()
    cctx.moveTo(cx + cw / 3, cy);      cctx.lineTo(cx + cw / 3, cy + ch)
    cctx.moveTo(cx + (2*cw)/3, cy);    cctx.lineTo(cx + (2*cw)/3, cy + ch)
    cctx.moveTo(cx, cy + ch / 3);      cctx.lineTo(cx + cw, cy + ch / 3)
    cctx.moveTo(cx, cy + (2*ch)/3);    cctx.lineTo(cx + cw, cy + (2*ch)/3)
    cctx.stroke()

    cctx.fillStyle = '#7b68ee'
    ;[[cx,cy],[cx+cw,cy],[cx,cy+ch],[cx+cw,cy+ch],
      [cx+cw/2,cy],[cx+cw/2,cy+ch],[cx,cy+ch/2],[cx+cw,cy+ch/2]
    ].forEach(([hx, hy]) => {
      cctx.beginPath(); cctx.arc(hx, hy, 5, 0, Math.PI * 2); cctx.fill()
    })
    cctx.restore()
  }, [])

  // ── annotation rendering ─────────────────────────────────────────────────
  const strokePolyline = (ctx, points) => {
    if (points.length < 2) return
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
  }

  const drawArrowHead = (ctx, fromX, fromY, toX, toY, size) => {
    const angle = Math.atan2(toY - fromY, toX - fromX)
    ctx.beginPath()
    ctx.moveTo(toX, toY)
    ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6))
    ctx.moveTo(toX, toY)
    ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6))
    ctx.stroke()
  }

  const drawPolygon = (ctx, cx, cy, r, sides, rotation = -Math.PI / 2) => {
    ctx.beginPath()
    for (let i = 0; i < sides; i++) {
      const a = rotation + (i * 2 * Math.PI) / sides
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  const drawStar = (ctx, cx, cy, rOuter, rInner, points = 5) => {
    ctx.beginPath()
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? rOuter : rInner
      const a = -Math.PI / 2 + (i * Math.PI) / points
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  // ── pen smoothing + shape-snap ───────────────────────────────────────────
  // Freehand pen strokes are jittery by nature. We smooth them with a small moving
  // average, then check whether the smoothed path is "trying" to be a straight
  // line, rectangle, or circle/ellipse (drawn roughly, without lifting the pen) —
  // if so we snap it to the clean shape instead of keeping the wobbly line.
  const smoothPoints = (points, passes = 2) => {
    let pts = points
    for (let p = 0; p < passes; p++) {
      const out = [pts[0]]
      for (let i = 1; i < pts.length - 1; i++) {
        out.push({
          x: (pts[i - 1].x + pts[i].x + pts[i + 1].x) / 3,
          y: (pts[i - 1].y + pts[i].y + pts[i + 1].y) / 3,
        })
      }
      out.push(pts[pts.length - 1])
      pts = out
    }
    return pts
  }

  const snapPenStroke = (rawPoints) => {
    if (rawPoints.length < 4) return { points: rawPoints }
    const pts = smoothPoints(rawPoints)
    const first = pts[0], last = pts[pts.length - 1]
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const w = maxX - minX, h = maxY - minY
    const diag = Math.hypot(w, h) || 1

    let L = 0
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)

    const closeGap = Math.hypot(last.x - first.x, last.y - first.y)
    const isClosed = closeGap < Math.max(20, diag * 0.12)

    if (!isClosed) {
      // Straight-line check: how far do points stray from the chord first→last?
      const dx = last.x - first.x, dy = last.y - first.y
      const lineLen = Math.hypot(dx, dy) || 1
      let maxDist = 0
      pts.forEach(p => {
        const d = Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / lineLen
        if (d > maxDist) maxDist = d
      })
      if (lineLen > 20 && maxDist / lineLen < 0.045) {
        return { snapTo: 'line', x1: first.x, y1: first.y, x2: last.x, y2: last.y }
      }
      return { points: pts }
    }

    // Closed loop — decide rectangle vs ellipse vs leave as freehand
    const rectPerimeter = 2 * (w + h) || 1
    const circPerimeter = (Math.PI * (w + h)) / 2 || 1
    const rectScore = Math.abs(L / rectPerimeter - 1)
    const circScore = Math.abs(L / circPerimeter - 1)

    if (Math.min(rectScore, circScore) < 0.3 && w > 10 && h > 10) {
      return rectScore < circScore
        ? { snapTo: 'rect',    x1: minX, y1: minY, x2: maxX, y2: maxY }
        : { snapTo: 'ellipse', x1: minX, y1: minY, x2: maxX, y2: maxY }
    }
    return { points: pts }
  }

  const annoBounds = (a) => {
    if (a.type === 'pen' || a.type === 'highlighter') {
      const xs = a.points.map(p => p.x), ys = a.points.map(p => p.y)
      const x = Math.min(...xs), y = Math.min(...ys)
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
    if (a.type === 'text') {
      return { x: a.x, y: a.y, w: (a.text?.length || 1) * a.fontSize * 0.55, h: a.fontSize }
    }
    const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2)
    return { x, y, w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) }
  }

  const drawOneAnnotation = useCallback((ctx, a, isSelected) => {
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap  = 'round'

    if (a.type === 'pen') {
      ctx.strokeStyle = a.color
      ctx.lineWidth   = a.width
      ctx.globalAlpha = 1
      strokePolyline(ctx, a.points)
    } else if (a.type === 'highlighter') {
      ctx.strokeStyle = a.color
      ctx.lineWidth   = a.width * 3
      ctx.globalAlpha = 0.35
      ctx.globalCompositeOperation = 'multiply'
      strokePolyline(ctx, a.points)
    } else if (a.type === 'text') {
      ctx.fillStyle = a.color
      ctx.font = `600 ${a.fontSize}px ${a.fontFamily || 'system-ui, sans-serif'}`
      ctx.textBaseline = 'top'
      ctx.fillText(a.text, a.x, a.y)
    } else {
      // shape tools — all share x1,y1,x2,y2 bounding box
      const { x1, y1, x2, y2 } = a
      ctx.strokeStyle = a.color
      ctx.lineWidth   = a.width
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
      const w  = Math.abs(x2 - x1), h = Math.abs(y2 - y1)

      if (a.type === 'rect') {
        ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), w, h)
      } else if (a.type === 'ellipse') {
        ctx.beginPath()
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (a.type === 'line') {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      } else if (a.type === 'arrow') {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
        drawArrowHead(ctx, x1, y1, x2, y2, Math.max(10, a.width * 3))
      } else if (a.type === 'triangle') {
        drawPolygon(ctx, cx, cy, Math.max(w, h) / 2, 3); ctx.stroke()
      } else if (a.type === 'diamond') {
        drawPolygon(ctx, cx, cy, Math.max(w, h) / 2, 4); ctx.stroke()
      } else if (a.type === 'pentagon') {
        drawPolygon(ctx, cx, cy, Math.max(w, h) / 2, 5); ctx.stroke()
      } else if (a.type === 'hexagon') {
        drawPolygon(ctx, cx, cy, Math.max(w, h) / 2, 6); ctx.stroke()
      } else if (a.type === 'star') {
        const rOuter = Math.max(w, h) / 2
        drawStar(ctx, cx, cy, rOuter, rOuter * 0.45, 5)
        ctx.stroke()
      }
    }

    if (isSelected) {
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = '#7b68ee'
      ctx.lineWidth   = 1
      const b = annoBounds(a)
      const pb = { x: b.x - RESIZE_HANDLE_PAD, y: b.y - RESIZE_HANDLE_PAD, w: b.w + RESIZE_HANDLE_PAD * 2, h: b.h + RESIZE_HANDLE_PAD * 2 }
      ctx.strokeRect(pb.x, pb.y, pb.w, pb.h)
      ctx.setLineDash([])

      const hs = 5 // handle half-size
      Object.values(RESIZE_HANDLES).forEach(def => {
        const p = def.get(pb)
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = '#7b68ee'
        ctx.lineWidth = 1.5
        ctx.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2)
        ctx.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2)
      })
    }

    ctx.restore()
  }, [])

  const drawAnnotations = useCallback(() => {
    const ac = annotationCanvasRef.current
    if (!ac) return
    const ctx = ac.getContext('2d')
    ctx.clearRect(0, 0, ac.width, ac.height)
    annotations.forEach(a => {
      if (a.id === textEditing?.editingId) return
      drawOneAnnotation(ctx, a, a.id === selectedAnnoId)
    })
    if (draftAnno) drawOneAnnotation(ctx, draftAnno, false)
  }, [annotations, draftAnno, selectedAnnoId, drawOneAnnotation, textEditing])

  const redraw = useCallback(() => {
    const canvas     = canvasRef.current
    const cropCanvas = cropCanvasRef.current
    const slide      = slideRef.current
    if (!canvas || !cropCanvas) return

    const { slideW, slideH } = getSlideSize()
    // Render at physical pixel density so the preview is crisp on HiDPI/Retina screens
    const dpr   = window.devicePixelRatio || 1
    const physW = Math.round(slideW * dpr)
    const physH = Math.round(slideH * dpr)

    canvas.width  = physW
    canvas.height = physH
    canvas.style.width  = slideW + 'px'
    canvas.style.height = slideH + 'px'

    // Crop overlay stays at logical pixels so mouse coordinate math stays correct
    cropCanvas.width  = slideW
    cropCanvas.height = slideH

    // Annotation overlay also stays at logical pixels — shape coordinates are stored
    // in this space so they scale correctly whenever the slide is resized/rotated.
    const annoCanvas = annotationCanvasRef.current
    if (annoCanvas) {
      annoCanvas.width  = slideW
      annoCanvas.height = slideH
    }

    if (slide) {
      slide.style.width  = slideW + 'px'
      slide.style.height = slideH + 'px'
    }

    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const off = renderSlide(physW, physH)
    ctx.clearRect(0, 0, physW, physH)
    ctx.drawImage(off, 0, 0)

    drawCropOverlay()
    drawAnnotations()
  }, [getSlideSize, renderSlide, drawCropOverlay, drawAnnotations])

  // ── load image ───────────────────────────────────────────────────────────
  const loadSrc = useCallback((src) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      sourceImgRef.current = img
      setNaturalW(img.naturalWidth)
      setNaturalH(img.naturalHeight)
    }
    img.onerror = () => {
      const retry = new Image()
      retry.onload = () => {
        sourceImgRef.current = retry
        setNaturalW(retry.naturalWidth)
        setNaturalH(retry.naturalHeight)
      }
      retry.onerror = () => toast?.('Could not load image', true)
      retry.src = src + (src.includes('?') ? '&' : '?') + '_nc=' + Date.now()
    }
    img.src = src
  }, [toast])

  // re-draw whenever naturalW/H changes (image loaded)
  useEffect(() => {
    if (naturalW && naturalH) {
      // A crop/replace undo just swapped the source image back in via loadSrc — once it's
      // actually loaded (naturalW/H updated), re-apply the transform/annotation snapshot
      // taken right before that action, so Undo restores the full pre-crop/pre-replace state.
      if (pendingRestoreRef.current) {
        const snap = pendingRestoreRef.current
        pendingRestoreRef.current = null
        setRotation(snap.rotation); setFlipH(snap.flipH); setFlipV(snap.flipV)
        setImageScale(snap.imageScale); setSlideRatio(snap.slideRatio)
        annotationsRef.current = snap.annotations
        setAnnotations(snap.annotations)
        setAnnoHistory([]); setAnnoFuture([]); setSelectedAnnoId(null)
      }
      setTimeout(redraw, 20)
    }
  }, [naturalW, naturalH, redraw])

  // re-draw whenever transform state changes
  useEffect(() => { if (sourceImgRef.current) redraw() },
    [rotation, flipH, flipV, imageScale, slideRatio, cropRect, redraw])

  // re-draw the annotation layer only (cheap — no image re-render) when shapes change
  useEffect(() => { drawAnnotations() }, [annotations, draftAnno, selectedAnnoId, drawAnnotations])

  // close the shapes dropdown on outside click
  useEffect(() => {
    if (!shapesMenuOpen) return
    const onDocClick = (e) => {
      if (shapesMenuRef.current && !shapesMenuRef.current.contains(e.target)) setShapesMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [shapesMenuOpen])

  // initial load
  useEffect(() => { if (imageUrl) loadSrc(imageUrl) }, [imageUrl, loadSrc])

  // resize
  useEffect(() => {
    const onResize = () => { if (sourceImgRef.current) redraw() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [redraw])

  // ──────────────────────────────────────────────────────────────────────────
  // Crop mouse handlers
  // ──────────────────────────────────────────────────────────────────────────

  const getCanvasPos = (e) => {
    const cc = cropCanvasRef.current
    const r  = cc.getBoundingClientRect()
    const scX = cc.width  / r.width
    const scY = cc.height / r.height
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: (clientX - r.left) * scX, y: (clientY - r.top) * scY }
  }

  const clampRect = (sx, sy, ex, ey) => {
    const canvas = canvasRef.current
    const x = Math.max(0, Math.min(sx, ex))
    const y = Math.max(0, Math.min(sy, ey))
    const w = Math.min((canvas?.width  ?? 9999) - x, Math.abs(ex - sx))
    const h = Math.min((canvas?.height ?? 9999) - y, Math.abs(ey - sy))
    return { x, y, w, h }
  }

  const handleCropMouseDown = (e) => {
    if (!stateRef.current.cropMode) return
    e.preventDefault()
    isDraggingRef.current = true
    cropStartRef.current  = getCanvasPos(e)
    setCropRect(null)
  }

  const handleCropMouseMove = (e) => {
    if (!stateRef.current.cropMode || !isDraggingRef.current || !cropStartRef.current) return
    const { x, y } = getCanvasPos(e)
    const rect = clampRect(cropStartRef.current.x, cropStartRef.current.y, x, y)
    setCropRect(rect)
    // draw immediately without waiting for state cycle
    stateRef.current.cropRect = rect
    drawCropOverlay()
  }

  const handleCropMouseUp = (e) => {
    if (!stateRef.current.cropMode || !isDraggingRef.current) return
    isDraggingRef.current = false
    const { x, y } = getCanvasPos(e)
    setCropRect(clampRect(cropStartRef.current.x, cropStartRef.current.y, x, y))
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Annotation mouse handlers
  // ──────────────────────────────────────────────────────────────────────────

  const annotationsRef = useRef([])
  const genAnnoId = () => `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const hitTestAnno = (a, x, y) => {
    const b = annoBounds(a)
    const pad = 8
    return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad
  }

  // The padded box the selection outline is drawn around — resize handles sit on its corners/edges.
  const paddedAnnoBounds = (a) => {
    const b = annoBounds(a)
    return { x: b.x - RESIZE_HANDLE_PAD, y: b.y - RESIZE_HANDLE_PAD, w: b.w + RESIZE_HANDLE_PAD * 2, h: b.h + RESIZE_HANDLE_PAD * 2 }
  }

  const hitTestHandle = (a, x, y) => {
    const b = paddedAnnoBounds(a)
    const radius = 8
    for (const key of Object.keys(RESIZE_HANDLES)) {
      const p = RESIZE_HANDLES[key].get(b)
      if (Math.hypot(x - p.x, y - p.y) <= radius) return key
    }
    return null
  }

  // Scales an annotation's geometry about a fixed anchor point by (sx, sy). Works uniformly
  // across shapes (scale both endpoints), freehand strokes (scale every point), and text
  // (scale its origin the same way, and turn the scale into a fontSize change).
  const scaleAnnotation = (a, anchor, sx, sy) => {
    const sp = (p) => ({ x: anchor.x + (p.x - anchor.x) * sx, y: anchor.y + (p.y - anchor.y) * sy })
    if (a.type === 'pen' || a.type === 'highlighter') {
      return { ...a, points: a.points.map(sp) }
    }
    if (a.type === 'text') {
      const pos = sp({ x: a.x, y: a.y })
      const scale = (Math.abs(sx) + Math.abs(sy)) / 2
      const fontSize = Math.max(8, Math.min(200, Math.round(a.fontSize * scale)))
      return { ...a, x: pos.x, y: pos.y, fontSize }
    }
    const p1 = sp({ x: a.x1, y: a.y1 })
    const p2 = sp({ x: a.x2, y: a.y2 })
    return { ...a, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
  }

  const resizeAnnotationTo = (original, corner, x, y) => {
    const def = RESIZE_HANDLES[corner]
    const b = paddedAnnoBounds(original)
    const anchor = def.anchorOf(b)
    const origCorner = def.get(b)
    const denomX = origCorner.x - anchor.x
    const denomY = origCorner.y - anchor.y
    const sx = def.axis === 'y' ? 1 : (denomX !== 0 ? (x - anchor.x) / denomX : 1)
    const sy = def.axis === 'x' ? 1 : (denomY !== 0 ? (y - anchor.y) / denomY : 1)
    return scaleAnnotation(original, anchor, sx, sy)
  }

  const commitAnnotations = (nextList) => {
    // Capture the pre-commit list BEFORE mutating the ref. setAnnoHistory's updater
    // isn't invoked synchronously — React runs it after this function returns, by which
    // point annotationsRef.current would already equal nextList, so reading the ref
    // directly inside the updater silently pushed a duplicate of the NEW state onto
    // history instead of the true previous state (undo looked like it worked — the
    // button disabled correctly — but the canvas never actually reverted).
    const prevList = annotationsRef.current
    setAnnoHistory(h => [...h, prevList])
    setAnnoFuture([])
    annotationsRef.current = nextList
    setAnnotations(nextList)
  }

  // These read/write annoHistory & annoFuture directly (not via a setState updater
  // function) — a functional updater here would be double-invoked by React 18 StrictMode
  // in dev, duplicating entries pushed onto the other stack (see commitTextEditing).
  const handleUndoAnno = () => {
    if (!annoHistory.length) return
    const prev = annoHistory[annoHistory.length - 1]
    const current = annotationsRef.current // capture before mutating — see commitAnnotations
    setAnnoFuture(f => [current, ...f])
    setAnnoHistory(h => h.slice(0, -1))
    annotationsRef.current = prev
    setAnnotations(prev)
    setSelectedAnnoId(null)
  }

  const handleRedoAnno = () => {
    if (!annoFuture.length) return
    const next = annoFuture[0]
    const current = annotationsRef.current // capture before mutating — see commitAnnotations
    setAnnoHistory(h => [...h, current])
    setAnnoFuture(f => f.slice(1))
    annotationsRef.current = next
    setAnnotations(next)
    setSelectedAnnoId(null)
  }

  // Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z (redo). Registered on window in the
  // capture phase so it fires no matter what has focus inside the modal — a bubble-phase
  // listener would get swallowed by the root div's onKeyDown stopPropagation() once any
  // toolbar button has focus. Skipped while a text input has focus so native text-undo works.
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndoAnno()
      } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault()
        handleRedoAnno()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [handleUndoAnno, handleRedoAnno])

  const handleDeleteSelectedAnno = () => {
    if (!selectedAnnoId) return
    commitAnnotations(annotationsRef.current.filter(a => a.id !== selectedAnnoId))
    setSelectedAnnoId(null)
  }

  const translateAnnotation = (a, dx, dy) => {
    if (a.type === 'pen' || a.type === 'highlighter') {
      return { ...a, points: a.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
    }
    if (a.type === 'text') return { ...a, x: a.x + dx, y: a.y + dy }
    return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy }
  }

  const handleAnnoMouseDown = (e) => {
    const tool = annoTool
    // A range/select drag on the text toolbar leaves textEditing open (see the input's
    // onBlur guard) without focus anywhere — clicking the canvas next should still commit it.
    if (textEditing) commitTextEditing()
    if (tool === 'none') {
      const { x, y } = getCanvasPos(e)
      if (selectedAnnoId) {
        const selected = annotationsRef.current.find(a => a.id === selectedAnnoId)
        const handle = selected ? hitTestHandle(selected, x, y) : null
        if (handle) {
          e.preventDefault()
          annoResizeRef.current = { id: selected.id, original: selected, corner: handle, lastX: x, lastY: y }
          return
        }
      }
      const hit = [...annotationsRef.current].reverse().find(a => hitTestAnno(a, x, y))
      setSelectedAnnoId(hit ? hit.id : null)
      if (hit) {
        e.preventDefault()
        annoMoveRef.current = { id: hit.id, original: hit, startX: x, startY: y, lastX: x, lastY: y }
      }
      return
    }
    if (tool === 'text') {
      // Prevent the browser's default mousedown behavior — without this, focusing the
      // newly-mounted text input still gets immediately blurred by the native mousedown
      // handling on the (non-focusable) canvas, closing the box before you can type.
      e.preventDefault()
      const { x, y } = getCanvasPos(e)
      setSelectedAnnoId(null)
      setTextEditing({ x, y, value: '' })
      return
    }

    e.preventDefault()
    setSelectedAnnoId(null)
    const { x, y } = getCanvasPos(e)
    annoDrawingRef.current = true
    annoStartRef.current  = { x, y }
    const id = genAnnoId()
    if (tool === 'pen' || tool === 'highlighter') {
      setDraftAnno({ id, type: tool, color: annoColor, width: annoWidth, points: [{ x, y }] })
    } else {
      setDraftAnno({ id, type: tool, color: annoColor, width: annoWidth, x1: x, y1: y, x2: x, y2: y })
    }
  }

  const handleAnnoDoubleClick = (e) => {
    if (annoTool !== 'none') return
    const { x, y } = getCanvasPos(e)
    const hit = [...annotationsRef.current].reverse().find(a => hitTestAnno(a, x, y))
    if (!hit || hit.type !== 'text') return
    e.preventDefault()
    annoMoveRef.current = null
    setSelectedAnnoId(null)
    setAnnoColor(hit.color)
    setAnnoFontSize(hit.fontSize)
    setAnnoFontFamily(hit.fontFamily)
    // Original annotation stays in annotationsRef.current (hidden from the canvas draw via
    // the editingId check in drawAnnotations) so Escape can cancel with no history entry.
    setTextEditing({ x: hit.x, y: hit.y, value: hit.text, editingId: hit.id })
  }

  const handleAnnoMouseMove = (e) => {
    if (annoResizeRef.current) {
      const { x, y } = getCanvasPos(e)
      annoResizeRef.current.lastX = x
      annoResizeRef.current.lastY = y
      const { id, original, corner } = annoResizeRef.current
      const resized = resizeAnnotationTo(original, corner, x, y)
      setAnnotations(list => list.map(a => a.id === id ? resized : a))
      return
    }
    if (annoMoveRef.current) {
      const { x, y } = getCanvasPos(e)
      annoMoveRef.current.lastX = x
      annoMoveRef.current.lastY = y
      const { original, startX, startY } = annoMoveRef.current
      const moved = translateAnnotation(original, x - startX, y - startY)
      setAnnotations(list => list.map(a => a.id === moved.id ? moved : a))
      return
    }
    if (annoDrawingRef.current) {
      const { x, y } = getCanvasPos(e)
      setDraftAnno(d => {
        if (!d) return d
        if (d.type === 'pen' || d.type === 'highlighter') return { ...d, points: [...d.points, { x, y }] }
        return { ...d, x2: x, y2: y }
      })
      return
    }
    // Idle hover — update the cursor when over a resize handle of the selected annotation.
    if (annoTool === 'none' && selectedAnnoId) {
      const { x, y } = getCanvasPos(e)
      const selected = annotationsRef.current.find(a => a.id === selectedAnnoId)
      const handle = selected ? hitTestHandle(selected, x, y) : null
      setHoverHandle(handle)
    } else if (hoverHandle) {
      setHoverHandle(null)
    }
  }

  const finalizeAnnotation = (d) => {
    if (d.type === 'highlighter') {
      return d.points.length >= 4 ? { ...d, points: smoothPoints(d.points, 1) } : d
    }
    if (d.type !== 'pen') return d
    const snap = snapPenStroke(d.points)
    if (snap.snapTo === 'line')    return { id: d.id, type: 'line',    color: d.color, width: d.width, x1: snap.x1, y1: snap.y1, x2: snap.x2, y2: snap.y2 }
    if (snap.snapTo === 'rect')    return { id: d.id, type: 'rect',    color: d.color, width: d.width, x1: snap.x1, y1: snap.y1, x2: snap.x2, y2: snap.y2 }
    if (snap.snapTo === 'ellipse') return { id: d.id, type: 'ellipse', color: d.color, width: d.width, x1: snap.x1, y1: snap.y1, x2: snap.x2, y2: snap.y2 }
    return { ...d, points: snap.points }
  }

  const commitTextEditing = () => {
    // Do the commit as a plain side effect, not inside the setTextEditing updater —
    // React 18 StrictMode double-invokes updater functions in dev, which was calling
    // commitAnnotations twice and adding the text box (with a fresh id each time) twice,
    // corrupting the undo history so a single Undo only removed one of the duplicates.
    if (textEditing?.editingId) {
      const trimmed = textEditing.value.trim()
      commitAnnotations(
        trimmed
          ? annotationsRef.current.map(a => a.id === textEditing.editingId
              ? { ...a, color: annoColor, fontSize: annoFontSize, fontFamily: annoFontFamily, text: textEditing.value }
              : a)
          : annotationsRef.current.filter(a => a.id !== textEditing.editingId)
      )
    } else if (textEditing && textEditing.value.trim()) {
      commitAnnotations([...annotationsRef.current, {
        id: genAnnoId(), type: 'text', color: annoColor, fontSize: annoFontSize, fontFamily: annoFontFamily, x: textEditing.x, y: textEditing.y, text: textEditing.value,
      }])
    }
    setTextEditing(null)
  }

  const handleAnnoMouseUp = () => {
    if (annoResizeRef.current) {
      const { id, original, corner, lastX, lastY } = annoResizeRef.current
      annoResizeRef.current = null
      const resized = resizeAnnotationTo(original, corner, lastX, lastY)
      commitAnnotations(annotationsRef.current.map(a => a.id === id ? resized : a))
      return
    }
    if (annoMoveRef.current) {
      const { id, original, startX, startY, lastX, lastY } = annoMoveRef.current
      annoMoveRef.current = null
      const dx = lastX - startX, dy = lastY - startY
      if (dx !== 0 || dy !== 0) {
        const moved = translateAnnotation(original, dx, dy)
        commitAnnotations(annotationsRef.current.map(a => a.id === id ? moved : a))
      }
      return
    }
    if (!annoDrawingRef.current) return
    annoDrawingRef.current = false
    // Read draftAnno directly rather than via a setState updater — StrictMode double-invokes
    // updater functions in dev, which would call commitAnnotations (and genAnnoId()) twice,
    // committing the shape/stroke twice and corrupting the undo history (see commitTextEditing).
    if (draftAnno) commitAnnotations([...annotationsRef.current, finalizeAnnotation(draftAnno)])
    setDraftAnno(null)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────────────────────────────────────

  const clearAnnotations = () => {
    annotationsRef.current = []
    setAnnotations([]); setAnnoHistory([]); setAnnoFuture([])
    setSelectedAnnoId(null); setDraftAnno(null); setTextEditing(null); setAnnoTool('none')
  }

  // Draws every committed annotation onto an export-resolution context, scaled from
  // the on-screen slide space (where shapes were drawn) up to export pixel space.
  const paintAnnotationsAtScale = (ctx, exportScale) => {
    if (!annotationsRef.current.length) return
    ctx.save()
    ctx.scale(exportScale, exportScale)
    annotationsRef.current.forEach(a => drawOneAnnotation(ctx, a, false))
    ctx.restore()
  }

  const handleReset = () => {
    setRotation(0); setFlipH(false); setFlipV(false)
    setImageScale(1.0); setSlideRatio('1:1')
    setCropMode(false); setCropRect(null)
    setRemarks(''); setRemarksEditing(false)
    clearAnnotations()
    setImageHistory([]); setImageFuture([])
    if (imageUrl) loadSrc(imageUrl)
  }

  // Snapshots the whole current image (source + transform + annotations) so a later
  // Undo can restore it — call right before a destructive action (crop/replace) mutates it.
  // Starting a new action invalidates whatever was in the redo stack, same as the
  // annotation undo/redo stack (commitAnnotations) does.
  const pushImageHistory = () => {
    const img = sourceImgRef.current
    if (!img) return
    setImageHistory(h => [...h, {
      src: img.src,
      rotation, flipH, flipV, imageScale, slideRatio,
      annotations: annotationsRef.current,
    }])
    setImageFuture([])
  }

  const snapshotCurrentImage = () => {
    const img = sourceImgRef.current
    if (!img) return null
    return {
      src: img.src,
      rotation, flipH, flipV, imageScale, slideRatio,
      annotations: annotationsRef.current,
    }
  }

  const handleUndoImage = () => {
    if (!imageHistory.length) return
    const current = snapshotCurrentImage()
    const prev = imageHistory[imageHistory.length - 1]
    setImageHistory(h => h.slice(0, -1))
    if (current) setImageFuture(f => [current, ...f])
    pendingRestoreRef.current = prev
    setCropMode(false); setCropRect(null)
    loadSrc(prev.src)
  }

  const handleRedoImage = () => {
    if (!imageFuture.length) return
    const current = snapshotCurrentImage()
    const next = imageFuture[0]
    setImageFuture(f => f.slice(1))
    if (current) setImageHistory(h => [...h, current])
    pendingRestoreRef.current = next
    setCropMode(false); setCropRect(null)
    loadSrc(next.src)
  }

  const handleReplaceFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast?.('Please select an image file', true); return }
    pushImageHistory()
    const reader = new FileReader()
    reader.onload = (ev) => {
      setRotation(0); setFlipH(false); setFlipV(false)
      setImageScale(0.8)
      setCropMode(false); setCropRect(null)
      clearAnnotations()
      loadSrc(ev.target.result)
      toast?.('New image loaded — click Save to confirm')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleApplyCrop = () => {
    const cr = stateRef.current.cropRect
    if (!cr || cr.w < 4 || cr.h < 4) { toast?.('Draw a crop area first', true); return }

    pushImageHistory()

    const { slideW, slideH } = getSlideSize()
    // Export at native image resolution so crop never loses quality
    const EXPORT_SIZE  = Math.max(naturalW, naturalH, 1200)
    const exportScale  = EXPORT_SIZE / Math.max(slideW, slideH)
    const exportSlideW = Math.round(slideW * exportScale)
    const exportSlideH = Math.round(slideH * exportScale)

    const { rotation: rot, flipH: fH, flipV: fV, imageScale: scale } = stateRef.current

    const fullOff = document.createElement('canvas')
    fullOff.width  = exportSlideW
    fullOff.height = exportSlideH
    const octx = fullOff.getContext('2d')
    octx.imageSmoothingEnabled = true
    octx.imageSmoothingQuality = 'high'
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, exportSlideW, exportSlideH)

    const img = sourceImgRef.current
    if (img) {
      const isRot90 = rot % 180 !== 0
      const srcW    = isRot90 ? naturalH : naturalW
      const srcH    = isRot90 ? naturalW : naturalH
      const baseFit = Math.min(exportSlideW / srcW, exportSlideH / srcH)
      const drawW   = srcW * baseFit * scale
      const drawH   = srcH * baseFit * scale
      octx.save()
      octx.translate(exportSlideW / 2, exportSlideH / 2)
      octx.rotate((rot * Math.PI) / 180)
      octx.scale(fH ? -1 : 1, fV ? -1 : 1)
      if (isRot90) octx.drawImage(img, -drawH/2, -drawW/2, drawH, drawW)
      else         octx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH)
      octx.restore()
    }

    paintAnnotationsAtScale(octx, exportScale)

    const cropX = Math.round(cr.x * exportScale)
    const cropY = Math.round(cr.y * exportScale)
    const cropW = Math.round(cr.w * exportScale)
    const cropH = Math.round(cr.h * exportScale)
    const tmp   = document.createElement('canvas')
    tmp.width   = Math.max(1, cropW)
    tmp.height  = Math.max(1, cropH)
    const tmpCtx = tmp.getContext('2d')
    tmpCtx.imageSmoothingEnabled = true
    tmpCtx.imageSmoothingQuality = 'high'
    tmpCtx.drawImage(fullOff, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

    setRotation(0); setFlipH(false); setFlipV(false)
    setImageScale(0.8)
    setCropMode(false); setCropRect(null)
    clearAnnotations()
    loadSrc(tmp.toDataURL('image/png'))
  }

  const handleSave = async (target = 'default') => {
    if (!sourceImgRef.current) { toast?.('No image loaded', true); return }
    setSaving(true)

    const img = sourceImgRef.current  // ✅ use ref, not stale state
    const nW  = img.naturalWidth      // ✅ always fresh
    const nH  = img.naturalHeight

    const { slideW, slideH } = getSlideSize()
    // Export at native image resolution — never downgrade below original pixel count
    const TARGET       = Math.max(nW, nH, 1200)
    const exportScale  = TARGET / Math.max(slideW, slideH)
    const exportSlideW = Math.round(slideW * exportScale)
    const exportSlideH = Math.round(slideH * exportScale)

    const { rotation: rot, flipH: fH, flipV: fV, imageScale: scale } = stateRef.current

    // Remarks get baked in as a fixed white footer strip below the image — not a draggable
    // annotation, so it can't be moved/hidden/cropped out. remarksFontSize is an on-screen px
    // value (same convention as annoFontSize), scaled up to the export resolution here.
    const remarksLines  = remarks.trim() ? remarks.trim().split('\n') : []
    const footerFont    = Math.round(remarksFontSize * exportScale)
    const footerLine    = Math.round(footerFont * 1.4)
    const footerPad     = Math.round(footerFont * 0.8)
    const footerHeaderH = remarksLines.length ? Math.round(footerLine * 1.2) : 0
    const footerHeight  = remarksLines.length ? footerPad * 2 + footerHeaderH + remarksLines.length * footerLine : 0

    const ec    = document.createElement('canvas')
    ec.width    = exportSlideW
    ec.height   = exportSlideH + footerHeight
    const ectx  = ec.getContext('2d')
    ectx.imageSmoothingEnabled = true
    ectx.imageSmoothingQuality = 'high'
    ectx.fillStyle = '#ffffff'
    ectx.fillRect(0, 0, exportSlideW, exportSlideH + footerHeight)

    const isRot90 = rot % 180 !== 0
    const srcW    = isRot90 ? nH : nW
    const srcH    = isRot90 ? nW : nH
    const baseFit = Math.min(exportSlideW / srcW, exportSlideH / srcH)
    const drawW   = srcW * baseFit * scale
    const drawH   = srcH * baseFit * scale

    ectx.save()
    ectx.translate(exportSlideW / 2, exportSlideH / 2)
    ectx.rotate((rot * Math.PI) / 180)
    ectx.scale(fH ? -1 : 1, fV ? -1 : 1)
    if (isRot90) ectx.drawImage(img, -drawH/2, -drawW/2, drawH, drawW)
    else         ectx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH)
    ectx.restore()

    paintAnnotationsAtScale(ectx, exportScale)

    if (remarksLines.length) {
      ectx.strokeStyle = '#dddddd'
      ectx.lineWidth = 1
      ectx.beginPath()
      ectx.moveTo(0, exportSlideH + 0.5)
      ectx.lineTo(exportSlideW, exportSlideH + 0.5)
      ectx.stroke()

      ectx.fillStyle = remarksColor
      ectx.textBaseline = 'top'

      ectx.font = `700 ${footerFont}px system-ui, sans-serif`
      ectx.fillText('Remarks:', footerPad, exportSlideH + footerPad)

      ectx.font = `${footerFont}px system-ui, sans-serif`
      remarksLines.forEach((line, i) => {
        ectx.fillText(line, footerPad, exportSlideH + footerPad + footerHeaderH + i * footerLine)
      })
    }

    ec.toBlob((blob) => {
      setSaving(false)
      if (!blob) { toast?.('Could not export image', true); return }
      onClose?.()
      const save = target === 'replace' ? onSaveReplace : target === 'copy' ? onSaveAsCopy : onSave
      save(blob).catch(err => toast?.(err.message, true))
    }, 'image/png')
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50"
      style={{ display: 'flex', alignItems: 'stretch' }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      {/* ── Left sidebar — always visible ────────────────────────────────── */}
      <div
        className="flex flex-col bg-white border-r-2 border-gray-400 flex-shrink-0 overflow-y-auto"
        style={{ width: 200 }}
      >
        {/* Header — fixed height matches the annotation toolbar's row height so their
            bottom borders land on the same line instead of stair-stepping */}
        <div className="h-[58px] flex items-center justify-between px-4 border-b-2 border-gray-400 flex-shrink-0">
          <span className="text-[11px] font-semibold text-gray-800 uppercase tracking-widest">Edit Image</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-400 bg-gray-100 text-gray-700 hover:bg-gray-200 hover:border-gray-500 hover:scale-110 active:bg-gray-300 active:scale-95 transition-all">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4 flex-1">

          {/* Rotate */}
          <Section label={`Rotate — ${rotation}°`}>
            <input
              type="range" min={0} max={359} step={1}
              value={rotation}
              onChange={e => { setRotation(parseInt(e.target.value)); setCropRect(null) }}
              className="w-full accent-[#7b68ee] cursor-pointer"
            />
            <button
              onClick={() => { setRotation(0); setCropRect(null) }}
              className="text-[10px] text-gray-800 hover:text-black transition-colors self-start"
            >
              Reset
            </button>
          </Section>

          {/* Flip */}
          <Section label="Flip">
            <div className="flex gap-2">
              <SideBtn onClick={() => setFlipH(v => !v)}>⇄ H</SideBtn>
              <SideBtn onClick={() => setFlipV(v => !v)}>⇅ V</SideBtn>
            </div>
          </Section>

          {/* Scale */}
          <Section label={`Scale — ${Math.round(imageScale * 100)}%`}>
            <input
              type="range" min={10} max={150} step={1}
              value={Math.round(imageScale * 100)}
              onChange={e => setImageScale(parseInt(e.target.value) / 100)}
              className="w-full accent-[#7b68ee] cursor-pointer"
            />
          </Section>

          {/* Slide ratio */}
          <Section label="Slide Ratio">
            <select
              value={slideRatio}
              onChange={e => { setSlideRatio(e.target.value); setCropRect(null) }}
              className="w-full bg-white border border-gray-400 hover:border-gray-500 text-black text-[11px] px-2 py-1.5 rounded-md outline-none cursor-pointer transition-colors"
            >
              {['1:1','4:3','3:4','16:9','9:16','3:2','2:3','free'].map(r =>
                <option key={r} value={r}>{r === 'free' ? 'Free' : r.replace(':', ' : ')}</option>
              )}
            </select>
          </Section>

          {/* Remarks — baked in as a permanent footer strip below the image on export.
              Toggles an editable box directly under the image, in the canvas area, so
              typing there already looks exactly like the final footer — not edited here. */}
          <Section label="Remarks">
            <SideBtn active={remarksEditing} onClick={() => setRemarksEditing(v => !v)} full>
              {remarks.trim() ? 'Edit Remarks' : 'Add Remarks'}
            </SideBtn>
          </Section>

          {/* Crop */}
          <Section label="Crop">
            <SideBtn
              active={cropMode}
              onClick={() => { setCropMode(v => !v); setCropRect(null); setAnnoTool('none') }}
              full
            >
              ✂ {cropMode ? 'Cancel Crop' : 'Start Crop'}
            </SideBtn>
            {cropMode && cropRect && (
              <>
                <p className="text-[10px] text-black mt-1">
                  {Math.round(cropRect.w)} × {Math.round(cropRect.h)} px
                </p>
                <SideBtn
                  onClick={handleApplyCrop}
                  full
                  className="mt-1 bg-[#7b68ee] border-[#7b68ee] text-black hover:bg-[#6a59d1] hover:scale-[1.03] active:bg-[#5a4bc4] active:scale-[0.97] transition-transform"
                >
                  Apply Crop
                </SideBtn>
              </>
            )}
            {cropMode && !cropRect && (
              <p className="text-[10px] text-black mt-1">Drag on the canvas to select area</p>
            )}
          </Section>

          {/* divider */}
          <div className="h-px bg-gray-300" />

          {/* Replace */}
          <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium
                            bg-gray-100 border border-gray-400 text-black hover:bg-gray-200 hover:border-gray-500 hover:scale-[1.03] active:bg-gray-300 active:scale-[0.97] cursor-pointer transition-all w-full">
            ↑ {imageUrl ? 'Replace Image' : 'Upload Image'}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceFile} />
          </label>

          {/* Undo / Redo last crop or replace */}
          <div className="flex gap-2">
            <SideBtn onClick={handleUndoImage} disabled={!imageHistory.length} title="Undo last Apply Crop / Replace Image" className="flex-1 text-center">
              ↺ Undo
            </SideBtn>
            <SideBtn onClick={handleRedoImage} disabled={!imageFuture.length} title="Redo" className="flex-1 text-center">
              ↻ Redo
            </SideBtn>
          </div>

          {/* Reset */}
          <SideBtn onClick={handleReset} full>Reset All</SideBtn>

        </div>

        {/* Save at bottom */}
        <div className="px-4 py-4 border-t-2 border-gray-400 flex-shrink-0 flex flex-col gap-2">
          {dualSaveMode ? (
            <>
              <button
                onClick={() => handleSave('copy')}
                disabled={saving}
                title="Adds this edit as a new image in Reference Media — the original is untouched"
                className="w-full py-2.5 rounded-md text-[13px] font-semibold bg-[#534AB7] border border-[#7b68ee]
                           text-white hover:bg-[#7b68ee] hover:scale-[1.02] active:bg-[#453d99] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100 transition-all"
              >
                {saving ? 'Saving…' : 'Save as Copy'}
              </button>
              <button
                onClick={() => handleSave('replace')}
                disabled={saving || replaceDisabled}
                title={replaceDisabled ? replaceDisabledReason : 'Overwrites this image with the edited version'}
                className="w-full py-2.5 rounded-md text-[13px] font-semibold bg-white border border-gray-400
                           text-black hover:bg-gray-100 hover:border-gray-500 hover:scale-[1.02] active:bg-gray-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100 transition-all"
              >
                {saving ? 'Saving…' : 'Replace Original'}
              </button>
              {replaceDisabled && replaceDisabledReason && (
                <p className="text-[10px] text-gray-800 leading-snug">{replaceDisabledReason}</p>
              )}
            </>
          ) : copyOnlyMode ? (
            <>
              <button
                onClick={() => handleSave('copy')}
                disabled={saving}
                className="w-full py-2.5 rounded-md text-[13px] font-semibold bg-[#534AB7] border border-[#7b68ee]
                           text-white hover:bg-[#7b68ee] hover:scale-[1.02] active:bg-[#453d99] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100 transition-all"
              >
                {saving ? 'Saving…' : 'Save as Copy'}
              </button>
              <p className="text-[10px] text-gray-800 leading-snug">
                {copyOnlyReason}
              </p>
            </>
          ) : (
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="w-full py-2.5 rounded-md text-[13px] font-semibold bg-[#534AB7] border border-[#7b68ee]
                         text-white hover:bg-[#7b68ee] hover:scale-[1.02] active:bg-[#453d99] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100 transition-all"
            >
              {saving ? 'Saving…' : 'Save Image'}
            </button>
          )}
        </div>
      </div>

      {/* ── Canvas area ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Annotation toolbar — top. min-h (not h) matches the sidebar header's height so the
            two bottom borders land on the same line, but still lets the row grow if the color
            swatches / font controls wrap onto a second line on a narrower window. */}
        <div className="min-h-[58px] flex items-center gap-1 px-3 py-2 border-b-2 border-gray-400 bg-white flex-shrink-0 flex-wrap">
          {ANNOTATION_TOOLS.map(t => (
            <button
              key={t.key}
              type="button"
              title={t.title}
              onClick={() => { if (textEditing) commitTextEditing(); setCropMode(false); setShapesMenuOpen(false); setAnnoTool(v => v === t.key ? 'none' : t.key) }}
              className={`flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-2.5 py-1.5 rounded-md border transition-all
                ${annoTool === t.key
                  ? 'bg-[#7b68ee] border-[#7b68ee] text-white'
                  : 'bg-gray-100 border-gray-400 text-black hover:bg-gray-200 hover:border-gray-500 hover:scale-105 active:bg-gray-300 active:scale-95'}`}
            >
              {t.icon}
              <span className="text-[8px] font-bold uppercase tracking-[.04em] leading-none whitespace-nowrap">{t.label}</span>
            </button>
          ))}

          {/* Shapes dropdown */}
          <div className="relative flex-shrink-0" ref={shapesMenuRef}>
            <button
              type="button"
              title="Shapes"
              onClick={() => { if (textEditing) commitTextEditing(); setCropMode(false); setShapesMenuOpen(v => !v) }}
              className={`flex items-center justify-center flex-col gap-0.5 px-2.5 py-1.5 rounded-md border transition-all
                ${SHAPE_TOOLS.some(s => s.key === annoTool)
                  ? 'bg-[#7b68ee] border-[#7b68ee] text-white'
                  : 'bg-gray-100 border-gray-400 text-black hover:bg-gray-200 hover:border-gray-500 hover:scale-105 active:bg-gray-300 active:scale-95'}`}
            >
              <ShapesIcon />
              <span className="text-[8px] font-bold uppercase tracking-[.04em] leading-none whitespace-nowrap">Shapes</span>
            </button>
            {shapesMenuOpen && (
              <div className="absolute left-0 top-full mt-1 grid grid-cols-3 gap-1 p-2 bg-white border-2 border-gray-400 rounded-md shadow-xl z-20 w-[124px]">
                {SHAPE_TOOLS.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    title={s.title}
                    onClick={() => { setAnnoTool(s.key); setShapesMenuOpen(false) }}
                    className={`w-8 h-8 flex items-center justify-center rounded-md border text-[14px] transition-all
                      ${annoTool === s.key
                        ? 'bg-[#7b68ee] border-[#7b68ee] text-white'
                        : 'bg-gray-100 border-gray-400 text-black hover:bg-gray-200 hover:border-gray-500 hover:scale-105 active:bg-gray-300 active:scale-95'}`}
                  >
                    {s.icon}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />

          <button
            type="button" title="Undo (Ctrl+Z)" onClick={handleUndoAnno}
            disabled={!annoHistory.length}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md border border-gray-400 bg-gray-100 text-black hover:bg-gray-200 hover:border-gray-500 hover:scale-105 active:bg-gray-300 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none disabled:hover:scale-100"
          >↶</button>
          <button
            type="button" title="Redo (Ctrl+Y)" onClick={handleRedoAnno}
            disabled={!annoFuture.length}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md border border-gray-400 bg-gray-100 text-black hover:bg-gray-200 hover:border-gray-500 hover:scale-105 active:bg-gray-300 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none disabled:hover:scale-100"
          >↷</button>
          {selectedAnnoId && (
            <button
              type="button" title="Delete selected" onClick={handleDeleteSelectedAnno}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-400 hover:scale-105 active:bg-red-200 active:scale-95 transition-all"
            >🗑</button>
          )}
          {annotations.length > 0 && (
            <button
              type="button" title="Clear all annotations"
              onClick={() => { commitAnnotations([]); setSelectedAnnoId(null) }}
              className="text-[10px] text-gray-800 hover:text-black active:text-black transition-colors flex-shrink-0 ml-1"
            >Clear all</button>
          )}

          {/* Colors — relevant once a drawing tool is active, or while re-editing an existing text box */}
          {(annoTool !== 'none' || textEditing?.editingId) && (
            <div className="contents" onMouseDown={() => { toolbarInteractionRef.current = true }}>
              <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />
              {ANNOTATION_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => setAnnoColor(c)}
                  className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-transform hover:scale-110 active:scale-95 ${annoColor === c ? 'border-[#7b68ee] scale-110' : 'border-white hover:border-gray-400'}`}
                  style={{ background: c, boxShadow: '0 0 0 1px rgba(0,0,0,.3)' }}
                />
              ))}
              <input
                type="color"
                value={annoColor}
                onChange={e => setAnnoColor(e.target.value)}
                title="Custom color"
                className="w-5 h-5 rounded-full border border-gray-400 hover:border-gray-500 cursor-pointer p-0 bg-transparent flex-shrink-0 transition-colors"
              />
            </div>
          )}

          {/* Stroke width — pen / highlighter / shapes */}
          {annoTool !== 'none' && annoTool !== 'text' && (
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-black whitespace-nowrap">{annoWidth}px</span>
              <input
                type="range" min={1} max={24} step={1}
                value={annoWidth}
                onChange={e => setAnnoWidth(parseInt(e.target.value))}
                className="w-20 accent-[#7b68ee] cursor-pointer"
              />
            </div>
          )}

          {/* Font family + size — text tool, or while re-editing an existing text box */}
          {(annoTool === 'text' || textEditing?.editingId) && (
            <div
              className="flex items-center gap-2 flex-shrink-0 ml-1"
              onMouseDown={() => { toolbarInteractionRef.current = true }}
            >
              <select
                value={annoFontFamily}
                onChange={e => setAnnoFontFamily(e.target.value)}
                title="Font"
                style={{ fontFamily: annoFontFamily }}
                className="bg-white border border-gray-400 hover:border-gray-500 text-black text-[11px] px-1.5 py-1 rounded-md outline-none cursor-pointer transition-colors"
              >
                {FONT_FAMILIES.map(f => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                ))}
              </select>
              <span className="text-[9px] font-bold uppercase tracking-widest text-black whitespace-nowrap">{annoFontSize}px</span>
              <input
                type="range" min={10} max={96} step={1}
                value={annoFontSize}
                onChange={e => setAnnoFontSize(parseInt(e.target.value))}
                className="w-20 accent-[#7b68ee] cursor-pointer"
              />
            </div>
          )}
        </div>

        <div
          ref={wrapRef}
          className="flex items-center justify-center overflow-auto flex-1"
          style={{ background: 'repeating-conic-gradient(#e8e8e8 0% 25%, #f5f5f5 0% 50%) 0 0 / 20px 20px' }}
        >
        <div ref={slideRef} className="relative flex-shrink-0">
          {/* Main canvas — slide content */}
          <canvas
            ref={canvasRef}
            className="block"
            style={{ boxShadow: '0 8px 40px rgba(0,0,0,.15)', cursor: cropMode ? 'crosshair' : 'default' }}
          />
          {/* Crop overlay canvas */}
          <canvas
            ref={cropCanvasRef}
            className="absolute top-0 left-0"
            style={{
              pointerEvents: cropMode ? 'auto' : 'none',
              cursor: cropMode ? 'crosshair' : 'default',
            }}
            onMouseDown={handleCropMouseDown}
            onMouseMove={handleCropMouseMove}
            onMouseUp={handleCropMouseUp}
            onMouseLeave={() => { isDraggingRef.current = false }}
            onTouchStart={handleCropMouseDown}
            onTouchMove={handleCropMouseMove}
            onTouchEnd={handleCropMouseUp}
          />
          {/* Annotation overlay canvas */}
          <canvas
            ref={annotationCanvasRef}
            className="absolute top-0 left-0"
            style={{
              pointerEvents: cropMode ? 'none' : 'auto',
              cursor: hoverHandle ? RESIZE_HANDLES[hoverHandle].cursor
                : annoTool === 'none' ? 'default' : annoTool === 'text' ? 'text' : 'crosshair',
            }}
            onMouseDown={handleAnnoMouseDown}
            onDoubleClick={handleAnnoDoubleClick}
            onMouseMove={handleAnnoMouseMove}
            onMouseUp={handleAnnoMouseUp}
            onMouseLeave={handleAnnoMouseUp}
            onTouchStart={handleAnnoMouseDown}
            onTouchMove={handleAnnoMouseMove}
            onTouchEnd={handleAnnoMouseUp}
          />
          {/* Inline text annotation input */}
          {textEditing && (
            <input
              ref={textInputRef}
              autoFocus
              value={textEditing.value}
              onChange={e => setTextEditing(t => ({ ...t, value: e.target.value }))}
              onBlur={() => {
                // A blur caused by mousedown on a toolbar control (color swatch, font
                // dropdown, size slider) should not close the editor out from under it.
                if (toolbarInteractionRef.current) { toolbarInteractionRef.current = false; return }
                commitTextEditing()
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitTextEditing() }
                if (e.key === 'Escape') { e.preventDefault(); setTextEditing(null) }
              }}
              placeholder="Type…"
              style={{
                position: 'absolute',
                left: textEditing.x,
                top: textEditing.y,
                zIndex: 30,
                font: `600 ${annoFontSize}px ${annoFontFamily}`,
                color: annoColor,
                background: 'transparent',
                border: '1.5px dashed #000000',
                borderRadius: 3,
                outline: 'none',
                padding: '2px 4px',
                minWidth: 80,
                minHeight: annoFontSize + 8,
              }}
            />
          )}
          {/* Remarks — a normal-flow block below the (absolutely-positioned) canvas stack, so
              it renders directly under the image, in the exact place the baked-in footer will
              actually appear after saving. Toggled via the sidebar's Add/Edit Remarks button. */}
          {(remarksEditing || remarks.trim()) && (
            <div className="w-full bg-white border-t border-gray-300">
              {remarksEditing && (
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200 flex-wrap">
                  {ANNOTATION_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => setRemarksColor(c)}
                      className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-transform hover:scale-110 active:scale-95 ${remarksColor === c ? 'border-[#7b68ee] scale-110' : 'border-white hover:border-gray-400'}`}
                      style={{ background: c, boxShadow: '0 0 0 1px rgba(0,0,0,.3)' }}
                    />
                  ))}
                  <input
                    type="color"
                    value={remarksColor}
                    onChange={e => setRemarksColor(e.target.value)}
                    title="Custom color"
                    className="w-5 h-5 rounded-full border border-gray-400 hover:border-gray-500 cursor-pointer p-0 bg-transparent flex-shrink-0 transition-colors"
                  />
                  <div className="w-px h-5 bg-gray-300 mx-1 flex-shrink-0" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black whitespace-nowrap">{remarksFontSize}px</span>
                  <input
                    type="range" min={10} max={48} step={1}
                    value={remarksFontSize}
                    onChange={e => setRemarksFontSize(parseInt(e.target.value))}
                    className="w-24 accent-[#7b68ee] cursor-pointer"
                  />
                </div>
              )}
              <div className="px-3 py-2.5">
                <div className="font-bold leading-snug" style={{ color: remarksColor, fontSize: remarksFontSize }}>Remarks:</div>
                {remarksEditing ? (
                  <textarea
                    autoFocus
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    placeholder="Type a note…"
                    rows={2}
                    className="w-full outline-none resize-none bg-transparent leading-snug placeholder:text-gray-300"
                    style={{ color: remarksColor, fontSize: remarksFontSize }}
                  />
                ) : (
                  <div
                    onClick={() => setRemarksEditing(true)}
                    className="leading-snug whitespace-pre-wrap cursor-text"
                    style={{ color: remarksColor, fontSize: remarksFontSize }}
                  >
                    {remarks}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

// ── Tiny shared sub-components ────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-black">{label}</span>
      {children}
    </div>
  )
}

function SideBtn({ onClick, children, active = false, full = false, className = '', disabled = false, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'px-2.5 py-1.5 rounded-md text-[12px] font-medium border transition-all active:scale-[0.96]',
        full ? 'w-full hover:scale-[1.02]' : 'hover:scale-105',
        active
          ? 'bg-white border-[#7b68ee] text-black hover:bg-[#e5e2fb] active:bg-[#d5d0f7]'
          : 'bg-gray-100 border-gray-400 text-black hover:bg-gray-200 hover:border-gray-500 active:bg-gray-300',
        disabled ? 'opacity-40 cursor-not-allowed hover:scale-100 active:scale-100' : '',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// keep old Btn/Sep for any remaining references
function Btn({ onClick, children, active = false }) {
  return <SideBtn onClick={onClick} active={active}>{children}</SideBtn>
}

function Sep() {
  return <div className="w-px h-5 bg-white/10 mx-0.5 flex-shrink-0" />
}