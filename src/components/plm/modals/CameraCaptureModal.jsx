import { useState, useEffect, useRef } from 'react'

// Live in-browser camera — works identically on a phone's camera or a laptop's webcam via
// getUserMedia, instead of relying on a file input's capture="environment" attribute (whose
// behavior is inconsistent: some mobile browsers open the native camera, others show a
// file/recents picker, and desktop browsers ignore it entirely and always show a file picker).
//
// Stays open across multiple shots (shutter never closes it) so a bulk-capture session doesn't
// mean re-opening the camera each time — onCapture fires once per shot, onDone ends the session
// (whether zero or many shots were taken) and hands off to the caller's own review/edit step.
export default function CameraCaptureModal({ onCapture, onDone, shotCount = 0 }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const rootRef = useRef(null)
  const [error, setError] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'environment' (back) | 'user' (front) — mobile only, harmless on desktop

  // Mobile browsers pin `position: fixed`/`absolute` elements to the page's LAYOUT
  // viewport, not the zoomed-in visual one — so a pinch-zoom gesture here (nothing to
  // zoom into, it's a live camera feed, not page content) visually drags the shutter
  // button out of the on-screen area without it having actually moved. `touch-action:
  // none` (set inline below) stops most browsers from starting that zoom at all, but
  // Safari still needs an explicit non-passive touchmove guard for a real 2-finger pinch.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const blockPinch = (e) => { if (e.touches.length > 1) e.preventDefault() }
    el.addEventListener('touchmove', blockPinch, { passive: false })
    return () => el.removeEventListener('touchmove', blockPinch)
  }, [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser doesn't support in-page camera access.")
      return
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(err => {
        setError(err?.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow camera access in your browser settings to use this.'
          : 'Could not access a camera on this device.')
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [facingMode])

  const handleShutter = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (blob) onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center" style={{ touchAction: 'none' }}>
      <button
        type="button"
        onClick={onDone}
        title={shotCount > 0 ? `Done — ${shotCount} photo${shotCount === 1 ? '' : 's'} taken` : 'Close'}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 border-none flex items-center justify-center text-white cursor-pointer z-10"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      {shotCount > 0 && !error && (
        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-white/15 text-white text-[11px] font-bold z-10">
          {shotCount} photo{shotCount === 1 ? '' : 's'} taken
        </div>
      )}

      {error ? (
        <div className="text-white text-center px-8 max-w-sm">
          <p className="text-[13px] leading-relaxed mb-5">{error}</p>
          <button
            type="button"
            onClick={onDone}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-white text-black rounded-sm cursor-pointer hover:opacity-80"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          {/* max-h-full (not a vh/dvh length) - computes against this
              flex-col's own real box (fixed inset-0, so always the true
              screen height) rather than a viewport-unit calculation a given
              browser may not honor consistently - the shutter button below
              is already anchored to the real screen edge directly
              (absolute bottom-8) and unaffected either way, but this keeps
              the video itself from ever risking the same class of bug. */}
          <video ref={videoRef} autoPlay playsInline muted className="max-w-full max-h-full object-contain" />
          <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-8">
            <button
              type="button"
              title="Switch camera"
              onClick={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 border-none flex items-center justify-center text-white cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </button>
            <button
              type="button"
              title="Take photo"
              onClick={handleShutter}
              className="w-16 h-16 rounded-full bg-white border-4 border-white/40 cursor-pointer hover:opacity-90"
            />
            {shotCount > 0 ? (
              <button
                type="button"
                title={`Done — review ${shotCount} photo${shotCount === 1 ? '' : 's'}`}
                onClick={onDone}
                className="w-10 h-10 rounded-full bg-white flex items-center justify-center cursor-pointer hover:opacity-90"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
            ) : (
              <div className="w-10 h-10" />
            )}
          </div>
        </>
      )}
    </div>
  )
}
