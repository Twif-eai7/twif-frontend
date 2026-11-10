import { useEffect, useRef, useState } from 'react'
import '@google/model-viewer'
import CameraCaptureModal from '../../../components/plm/modals/CameraCaptureModal'
import { createArticle3dJob, getArticle3dJob, getArticle3dModel } from '../../../services/article3d'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
// The API compresses down to Hunyuan's 6 MB limit. 25 MB only stops huge uploads.
const MAX_BYTES = 25 * 1024 * 1024
const LAST_JOB_KEY = 'article3d:lastJobId'
const POLL_MS = 4000
const TIMEOUT_MS = 5 * 60 * 1000
// Visual progress matches the typical ~45s generate time; holds at 100 until the job finishes.
const PROGRESS_TARGET_MS = 45_000
const TIMEOUT_MESSAGE = 'This is taking longer than expected. You can try another photo. If you leave this page, a finished model can still be opened from this job.'

function rejectionReason(file) {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return 'Use a JPG, PNG, or WebP photo.'
  }
  if (file.size > MAX_BYTES) {
    return 'This photo is over 25 MB. Choose a smaller file.'
  }
  return ''
}

function timedOut(createdAt, now = Date.now()) {
  return now - Date.parse(createdAt) >= TIMEOUT_MS
}

function progressPercent(createdAt, now, phase) {
  if (phase === 'uploading' || !createdAt) return 1
  const elapsed = Math.max(0, now - Date.parse(createdAt))
  // Linear 1→100 over ~45s; stay at 100 if the job is still finishing.
  return Math.min(100, Math.max(1, Math.floor((elapsed / PROGRESS_TARGET_MS) * 100)))
}

function ModelBuildAnimation({ percent }) {
  const stage = Math.min(5, Math.floor(percent / 20) + 1)
  return (
    <div className="relative w-44 h-44 sm:w-72 sm:h-72 max-w-[70vw] max-h-[42vh] aspect-square mx-auto" aria-hidden="true">
      <div
        className="absolute inset-6 rounded-full border border-[var(--wm-yellow)]/20"
        style={{ animation: 'wm-pulse-ring 3s ease-in-out infinite' }}
      />
      <svg viewBox="0 0 240 240" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <linearGradient id="wmBuildFace" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFC220" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffe08a" stopOpacity="0.75" />
          </linearGradient>
          <linearGradient id="wmBuildSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0071CE" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#004888" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="wmBuildTop" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#5aa8e8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#FFC220" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {/* Floor grid */}
        <g opacity="0.35" stroke="rgba(255,255,255,0.45)" strokeWidth="1" fill="none">
          <path d="M40 160 L120 200 L200 160 L120 120 Z" />
          <path d="M60 150 L120 180 L180 150" />
          <path d="M80 140 L120 160 L160 140" />
          <path d="M100 130 L120 140 L140 130" />
        </g>

        {/* Layer 1 — base */}
        <g
          style={{
            opacity: stage >= 1 ? 1 : 0,
            transform: stage >= 1 ? 'translateY(0)' : 'translateY(18px)',
            transition: 'opacity 0.35s ease, transform 0.45s ease',
          }}
        >
          <polygon points="120,168 168,144 120,120 72,144" fill="url(#wmBuildTop)" />
          <polygon points="72,144 120,168 120,188 72,164" fill="url(#wmBuildSide)" />
          <polygon points="120,168 168,144 168,164 120,188" fill="url(#wmBuildFace)" />
        </g>

        {/* Layer 2 */}
        <g
          style={{
            opacity: stage >= 2 ? 1 : 0,
            transform: stage >= 2 ? 'translateY(0)' : 'translateY(18px)',
            transition: 'opacity 0.35s ease, transform 0.45s ease',
          }}
        >
          <polygon points="120,140 160,120 120,100 80,120" fill="url(#wmBuildTop)" />
          <polygon points="80,120 120,140 120,160 80,140" fill="url(#wmBuildSide)" />
          <polygon points="120,140 160,120 160,140 120,160" fill="url(#wmBuildFace)" />
        </g>

        {/* Layer 3 */}
        <g
          style={{
            opacity: stage >= 3 ? 1 : 0,
            transform: stage >= 3 ? 'translateY(0)' : 'translateY(18px)',
            transition: 'opacity 0.35s ease, transform 0.45s ease',
          }}
        >
          <polygon points="120,112 152,96 120,80 88,96" fill="url(#wmBuildTop)" />
          <polygon points="88,96 120,112 120,132 88,116" fill="url(#wmBuildSide)" />
          <polygon points="120,112 152,96 152,116 120,132" fill="url(#wmBuildFace)" />
        </g>

        {/* Layer 4 — body taper */}
        <g
          style={{
            opacity: stage >= 4 ? 1 : 0,
            transform: stage >= 4 ? 'translateY(0)' : 'translateY(18px)',
            transition: 'opacity 0.35s ease, transform 0.45s ease',
          }}
        >
          <polygon points="120,84 144,72 120,60 96,72" fill="url(#wmBuildTop)" />
          <polygon points="96,72 120,84 120,104 96,92" fill="url(#wmBuildSide)" />
          <polygon points="120,84 144,72 144,92 120,104" fill="url(#wmBuildFace)" />
        </g>

        {/* Layer 5 — crown / spark */}
        <g
          style={{
            opacity: stage >= 5 ? 1 : 0,
            transform: stage >= 5 ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.85)',
            transformOrigin: '120px 56px',
            transition: 'opacity 0.35s ease, transform 0.45s ease',
          }}
        >
          <polygon points="120,56 136,48 120,28 104,48" fill="url(#wmBuildTop)" />
          <polygon points="104,48 120,56 120,72 104,64" fill="url(#wmBuildSide)" />
          <polygon points="120,56 136,48 136,64 120,72" fill="url(#wmBuildFace)" />
          <circle cx="120" cy="34" r="5" fill="#FFC220" style={{ animation: 'wm-spark 1.2s ease-in-out infinite' }} />
        </g>

        {/* Construction crane arm / beam */}
        <g style={{ animation: 'wm-crane 2.8s ease-in-out infinite', transformOrigin: '40px 40px' }}>
          <line x1="36" y1="48" x2="36" y2="170" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
          <line x1="36" y1="48" x2="150" y2="70" stroke="#FFC220" strokeWidth="2.5" strokeLinecap="round" />
          <line
            x1="150"
            y1="70"
            x2="150"
            y2={90 + (100 - percent) * 0.45}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <rect
            x="142"
            y={82 + (100 - percent) * 0.45}
            width="16"
            height="12"
            rx="2"
            fill="#FFC220"
            opacity="0.9"
          />
        </g>

        {/* Floating wireframe piece */}
        <g
          opacity="0.7"
          style={{ animation: 'wm-float-piece 2.2s ease-in-out infinite' }}
          stroke="#FFC220"
          strokeWidth="1.5"
          fill="none"
        >
          <polygon points="190,70 210,60 190,50 170,60" />
          <polyline points="170,60 170,74 190,84 210,74 210,60" />
          <line x1="190" y1="70" x2="190" y2="84" />
        </g>
      </svg>

      <p className="absolute inset-x-0 bottom-0 sm:bottom-1 text-center text-3xl sm:text-5xl font-semibold tabular-nums tracking-tight text-white drop-shadow">
        {percent}
        <span className="text-xl sm:text-3xl text-[var(--wm-yellow)]">%</span>
      </p>
    </div>
  )
}

export default function Article3dSection() {
  const inputRef = useRef(null)
  const previewUrlRef = useRef(null)
  const dragDepth = useRef(0)
  const pollRef = useRef({ stopped: true, inFlight: false, timer: null, generation: 0 })
  const machineRef = useRef({})
  const mountedRef = useRef(true)
  const generatingRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState('')
  const [jobError, setJobError] = useState('')
  const [phase, setPhase] = useState('idle')
  const [jobId, setJobId] = useState(null)
  const [modelUrl, setModelUrl] = useState(null)
  const [modelError, setModelError] = useState('')
  const [createdAt, setCreatedAt] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [cameraOpen, setCameraOpen] = useState(false)

  function stopPolling() {
    pollRef.current.stopped = true
    pollRef.current.generation += 1
    clearTimeout(pollRef.current.timer)
    pollRef.current.timer = null
  }

  function revokePreview() {
    if (!previewUrlRef.current) return
    URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
  }

  // Returns true when polling should stop.
  function applyRemoteJob(job) {
    setJobId(job.id)
    setCreatedAt(job.createdAt)
    if (job.status === 'ready') {
      setPhase('ready')
      stopPolling()
      return true
    }
    if (job.status === 'failed') {
      setJobError(job.error || '')
      setPhase('failed')
      stopPolling()
      return true
    }
    if (timedOut(job.createdAt)) {
      setPhase('timeout')
      stopPolling()
      return true
    }
    setPhase('processing')
    return false
  }

  function startPolling(id) {
    stopPolling()
    const generation = pollRef.current.generation
    pollRef.current.stopped = false

    const tick = async () => {
      if (pollRef.current.stopped || pollRef.current.generation !== generation) return
      if (pollRef.current.inFlight) {
        pollRef.current.timer = setTimeout(tick, POLL_MS)
        return
      }
      pollRef.current.inFlight = true
      let terminal = false
      try {
        const job = await getArticle3dJob(id)
        if (pollRef.current.stopped || pollRef.current.generation !== generation) return
        terminal = applyRemoteJob(job)
      } catch (err) {
        if (!pollRef.current.stopped && pollRef.current.generation === generation) {
          setError(err.message || 'Could not check the job.')
        }
      } finally {
        pollRef.current.inFlight = false
      }
      if (terminal || pollRef.current.stopped || pollRef.current.generation !== generation) return
      pollRef.current.timer = setTimeout(tick, POLL_MS)
    }

    pollRef.current.timer = setTimeout(tick, POLL_MS)
  }

  machineRef.current = { applyRemoteJob, startPolling }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      revokePreview()
    }
  }, [])

  useEffect(() => {
    const id = sessionStorage.getItem(LAST_JOB_KEY)
    let cancelled = false
    if (id) {
      getArticle3dJob(id)
        .then((job) => {
          if (cancelled) return
          const terminal = machineRef.current.applyRemoteJob(job)
          if (!terminal && job.status === 'processing') machineRef.current.startPolling(job.id)
        })
        .catch((err) => {
          if (!cancelled) setError(err.message || 'Could not restore the job.')
        })
    }
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [])

  useEffect(() => {
    const modelPending = phase === 'ready' && !modelUrl && !modelError
    if (phase !== 'uploading' && phase !== 'processing' && !modelPending) return undefined
    let frame = 0
    const tick = () => {
      const next = Date.now()
      setNow(next)
      if (createdAt && timedOut(createdAt, next) && phase !== 'ready') {
        setPhase('timeout')
        stopPolling()
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, createdAt, modelUrl, modelError])

  useEffect(() => {
    if (phase !== 'ready' || !jobId) return undefined
    let cancelled = false
    let objectUrl = null
    setModelError('')
    setModelUrl(null)
    getArticle3dModel(jobId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setModelUrl(objectUrl)
      })
      .catch((err) => {
        if (cancelled) return
        setModelError(err.message || 'Could not load the model.')
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [phase, jobId])

  function resetToIdle() {
    generatingRef.current = false
    stopPolling()
    revokePreview()
    setPreviewUrl(null)
    setFile(null)
    setError('')
    setJobError('')
    setCreatedAt(null)
    setJobId(null)
    setModelUrl(null)
    setModelError('')
    setPhase('idle')
    if (inputRef.current) inputRef.current.value = ''
  }

  function applyFile(next) {
    if (!next || phase !== 'idle') return
    const reason = rejectionReason(next)
    if (reason) {
      setError(reason)
      return
    }
    revokePreview()
    const url = URL.createObjectURL(next)
    previewUrlRef.current = url
    setPreviewUrl(url)
    setFile(next)
    setError('')
  }

  function onInputChange(event) {
    const next = event.target.files?.[0]
    event.target.value = ''
    if (next) applyFile(next)
  }

  function onDragEnter(event) {
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragOver(event) {
    event.preventDefault()
  }

  function onDragLeave(event) {
    event.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragging(false)
    }
  }

  function onDrop(event) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    applyFile(event.dataTransfer.files?.[0])
  }

  async function onGenerate() {
    if (!file || phase !== 'idle' || generatingRef.current) return
    generatingRef.current = true
    setPhase('uploading')
    setError('')
    setJobError('')
    try {
      const job = await createArticle3dJob(file)
      try { sessionStorage.setItem(LAST_JOB_KEY, job.id) } catch { /* storage unavailable */ }
      if (!mountedRef.current) return
      setJobId(job.id)
      setCreatedAt(job.createdAt)
      setModelError('')
      setPhase('processing')
      startPolling(job.id)
    } catch (err) {
      generatingRef.current = false
      setPhase('idle')
      setError(err.message || 'Could not start the 3D job.')
    }
  }

  const selected = Boolean(file && previewUrl)
  const modelPending = phase === 'ready' && !modelUrl && !modelError
  const waiting = phase === 'uploading' || phase === 'processing' || modelPending
  const showChooser = phase === 'idle'
  const percent = progressPercent(createdAt, now, phase)

  const secondaryBtn =
    'inline-flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-11 px-4 py-2.5 rounded-lg border-2 border-white/70 bg-transparent text-sm font-semibold text-white hover:bg-white/10 transition-colors'
  const primaryBtn =
    'inline-flex items-center justify-center w-full sm:w-auto min-h-11 px-5 py-2.5 rounded-lg bg-[var(--wm-yellow)] text-sm font-semibold text-[var(--wm-blue)] hover:brightness-105 transition-[filter]'

  return (
    <div
      className="relative flex flex-col h-full min-h-0 overflow-hidden text-white overscroll-none"
      style={{
        ['--wm-yellow']: '#FFC220',
        ['--wm-blue']: '#0071CE',
        ['--wm-blue-deep']: '#0057A0',
        fontFamily: "'Figtree', 'DM Sans', sans-serif",
        background:
          'linear-gradient(135deg, var(--wm-blue) 0%, var(--wm-blue-deep) 55%, #004888 100%)',
      }}
    >
      <style>{`
        @keyframes wm-pulse-ring {
          0%, 100% { transform: scale(0.92); opacity: 0.25; }
          50% { transform: scale(1.06); opacity: 0.55; }
        }
        @keyframes wm-bar-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @keyframes wm-crane {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(5deg); }
        }
        @keyframes wm-float-piece {
          0%, 100% { transform: translate(0, 0) rotate(-6deg); opacity: 0.45; }
          50% { transform: translate(-10px, 14px) rotate(4deg); opacity: 0.9; }
        }
        @keyframes wm-spark {
          0%, 100% { opacity: 0.55; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.25); }
        }
      `}</style>

      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-[var(--wm-yellow)]"
        aria-hidden="true"
      />

      {waiting ? (
        <div
          className="relative flex-1 min-h-0 flex flex-col items-center justify-center px-4 sm:px-6 py-4 text-center"
          role="status"
          aria-live="polite"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <ModelBuildAnimation percent={percent} />

          <h2 className="mt-4 sm:mt-6 text-xl sm:text-3xl font-semibold tracking-tight text-white px-2">
            {modelPending
              ? 'Opening your model'
              : phase === 'uploading'
                ? 'Uploading your photo'
                : 'Building your 3D model'}
          </h2>
          <p className="mt-2 text-xs sm:text-base text-white/70 max-w-md px-2">
            {modelPending
              ? 'Loading the 3D model…'
              : phase === 'uploading'
                ? 'Sending the article photo…'
                : 'Stacking layers into a model you can rotate.'}
          </p>

          <div className="mt-5 sm:mt-8 w-full max-w-md h-2 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-150 ease-out"
              style={{
                width: `${percent}%`,
                background:
                  'linear-gradient(90deg, var(--wm-yellow) 0%, #ffe08a 45%, var(--wm-yellow) 90%)',
                backgroundSize: '200% 100%',
                animation: 'wm-bar-shimmer 1.4s linear infinite',
              }}
            />
          </div>
        </div>
      ) : phase === 'ready' && modelUrl ? (
        <div className="relative flex-1 min-h-0 flex flex-col">
          <model-viewer
            src={modelUrl}
            alt="Generated article model"
            camera-controls=""
            auto-rotate=""
            touch-action="pan-y"
            shadow-intensity="1"
            className="block w-full h-full min-h-0 bg-[#f4f7fb]"
          />
          {/* Desktop: controls top-left */}
          <div className="hidden sm:flex absolute top-5 left-5 flex-wrap items-center gap-2 z-10">
            <button
              type="button"
              onClick={resetToIdle}
              className="inline-flex items-center gap-1.5 min-h-10 px-3 py-2 rounded-lg bg-white/95 text-sm font-semibold text-[var(--wm-blue)] shadow-md hover:bg-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="inline-flex items-center min-h-10 px-3 py-2 rounded-lg bg-[var(--wm-yellow)] text-sm font-semibold text-[var(--wm-blue)] shadow-md hover:brightness-105 transition-[filter]"
            >
              Upload another photo
            </button>
          </div>
          {previewUrl && (
            <div className="absolute top-3 right-3 sm:top-5 sm:right-5 w-14 h-14 sm:w-28 sm:h-28 rounded-lg sm:rounded-xl overflow-hidden border-2 border-[var(--wm-yellow)] shadow-lg bg-white z-10">
              <img
                src={previewUrl}
                alt={file?.name ? `Uploaded photo ${file.name}` : 'Uploaded photo'}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[11px] sm:text-sm text-white/90 bg-black/35 rounded-full px-3 py-1.5 bottom-20 sm:bottom-4 max-w-[90vw] text-center">
            Drag to orbit, scroll to zoom.
          </p>
          {/* Mobile: full-width action bar above the home indicator */}
          <div
            className="sm:hidden absolute inset-x-0 bottom-0 z-10 flex gap-2 p-3 bg-gradient-to-t from-black/55 via-black/35 to-transparent"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              onClick={resetToIdle}
              className="inline-flex flex-1 items-center justify-center gap-1.5 min-h-11 px-3 py-2 rounded-lg bg-white/95 text-sm font-semibold text-[var(--wm-blue)] shadow-md"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="inline-flex flex-[1.4] items-center justify-center min-h-11 px-3 py-2 rounded-lg bg-[var(--wm-yellow)] text-sm font-semibold text-[var(--wm-blue)] shadow-md"
            >
              Upload another
            </button>
          </div>
        </div>
      ) : (
        <div
          className="relative flex flex-col flex-1 min-h-0 px-3 sm:px-8 pt-5 sm:pt-8 overflow-y-auto"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <header className="flex-shrink-0 max-w-3xl">
            <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white">
              Photo to 3D
            </h1>
            <p className="mt-1.5 sm:mt-2 text-xs sm:text-base text-white/75">
              One article photo becomes a model you can rotate.
            </p>
          </header>

          <div className="flex-1 min-h-0 mt-4 sm:mt-6 flex flex-col gap-3 sm:gap-4">
            {(showChooser || previewUrl) && (
              <div
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`flex-1 min-h-[200px] sm:min-h-[280px] rounded-2xl border-2 border-dashed transition-colors ${
                  dragging && showChooser
                    ? 'border-[var(--wm-yellow)] bg-[var(--wm-yellow)]/20'
                    : 'border-white/45 bg-white/10'
                }`}
              >
                {previewUrl ? (
                  <div className="h-full flex flex-col p-3 sm:p-6">
                    <img
                      src={previewUrl}
                      alt=""
                      className="flex-1 w-full min-h-0 object-contain rounded-xl bg-black/15"
                    />
                    {file && (
                      <p className="mt-2 sm:mt-3 text-sm font-medium text-white truncate">{file.name}</p>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 text-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--wm-yellow)] sm:w-9 sm:h-9" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p className="text-base sm:text-xl font-semibold text-white">Drop one article photo here</p>
                    <p className="text-xs sm:text-sm text-white/70">JPG, PNG, or WebP · up to 25 MB</p>
                  </div>
                )}
              </div>
            )}

            {showChooser && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className={selected ? secondaryBtn : primaryBtn}
                >
                  {selected ? 'Choose a different photo' : 'Choose photo'}
                </button>
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className={secondaryBtn}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  Take photo
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={onInputChange}
                />
                {selected && (
                  <button type="button" onClick={onGenerate} className={primaryBtn}>
                    Generate 3D model
                  </button>
                )}
              </div>
            )}

            {cameraOpen && (
              <CameraCaptureModal
                onCapture={(shot) => {
                  applyFile(shot)
                  setCameraOpen(false)
                }}
                onDone={() => setCameraOpen(false)}
              />
            )}

            {error && phase !== 'failed' && (
              <p role="alert" className="flex-shrink-0 text-sm text-[#3b1d00] bg-[var(--wm-yellow)] border border-[#e0a800] rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {phase === 'timeout' && (
              <div className="flex-shrink-0 max-w-2xl">
                <p className="text-sm text-white/85 leading-relaxed">{TIMEOUT_MESSAGE}</p>
                <button type="button" onClick={resetToIdle} className={`${secondaryBtn} mt-3`}>
                  Try another photo
                </button>
              </div>
            )}

            {phase === 'failed' && (
              <div className="flex-shrink-0 max-w-2xl">
                {jobError && (
                  <p role="alert" className="text-sm text-[#3b1d00] bg-[var(--wm-yellow)] border border-[#e0a800] rounded-lg px-3 py-2">
                    {jobError}
                  </p>
                )}
                <button type="button" onClick={resetToIdle} className={`${secondaryBtn} mt-3`}>
                  Try another photo
                </button>
              </div>
            )}

            {phase === 'ready' && modelError && (
              <div className="flex-shrink-0 max-w-2xl">
                <p role="alert" className="text-sm text-[#3b1d00] bg-[var(--wm-yellow)] border border-[#e0a800] rounded-lg px-3 py-2">
                  {modelError}
                </p>
                <button type="button" onClick={resetToIdle} className={`${secondaryBtn} mt-3`}>
                  Try another photo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
