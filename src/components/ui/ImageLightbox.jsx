import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Generic full-screen image viewer - click any thumbnail elsewhere in the
// app to enlarge it. Takes a plain array of image URLs (not photo row
// objects) so it stays usable regardless of which table/shape a caller's
// photos come from (inspection_report_photos, po_comment_photos, a local
// blob: preview before upload, etc). `startIndex` plus Left/Right arrow
// keys, a left/right swipe, and on-screen prev/next buttons let it double
// as a lightweight gallery when there's more than one image, not just a
// single-image viewer - the on-screen buttons are real <button>s (not a
// hover-only affordance), and the swipe handler covers touch/tablet where
// neither hover nor a keyboard exists.
export default function ImageLightbox({ images, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const count = images?.length ?? 0
  const touchStartX = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setIndex(i => Math.min(i + 1, count - 1))
      else if (e.key === 'ArrowLeft') setIndex(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, onClose])

  if (!count) return null

  // Swipe left -> next, swipe right -> previous. A generous 40px threshold
  // (vs. a couple pixels) so an ordinary tap-to-close doesn't get
  // misread as a swipe on a shaky touch.
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchStartX.current == null || count < 2) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 40) return
    if (dx < 0) setIndex(i => Math.min(i + 1, count - 1))
    else setIndex(i => Math.max(i - 1, 0))
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center px-12 py-14 sm:px-20 sm:py-16"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-2 right-2 sm:top-4 sm:right-4 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="sm:w-5 sm:h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>

      {count > 1 && index > 0 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setIndex(i => i - 1) }}
          aria-label="Previous"
          className="absolute left-1 sm:left-4 w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="sm:w-5 sm:h-5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}

      {/* Sized purely relative to the padded container above, not a fixed
          vw/vh number - it fills whatever space is left after the padding
          (which itself scales per breakpoint), so it never fights the
          nav buttons for room on a narrow phone the way a flat "92vw"
          would, and still fills a tablet/desktop window fully. */}
      <img
        src={images[index]}
        alt=""
        onClick={e => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg select-none"
      />

      {count > 1 && index < count - 1 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setIndex(i => i + 1) }}
          aria-label="Next"
          className="absolute right-1 sm:right-4 w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="sm:w-5 sm:h-5"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      )}

      {count > 1 && (
        <span className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 text-xs font-semibold text-white/80 bg-black/40 px-2.5 py-1 rounded-full">
          {index + 1} / {count}
        </span>
      )}
    </div>,
    document.body
  )
}
