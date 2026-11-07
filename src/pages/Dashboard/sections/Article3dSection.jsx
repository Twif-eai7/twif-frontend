import { useEffect, useRef, useState } from 'react'
import '@google/model-viewer'
import { createArticle3dJob, getArticle3dJob, getArticle3dModel } from '../../../services/article3d'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
// The API compresses down to Hunyuan's 6 MB limit. 25 MB only stops huge uploads.
const MAX_BYTES = 25 * 1024 * 1024
const LAST_JOB_KEY = 'article3d:lastJobId'
const POLL_MS = 4000
const TIMEOUT_MS = 5 * 60 * 1000
// Visual progress maps the typical mock/generate window; stays under 100 until the job finishes.
const PROGRESS_TARGET_MS = 8000
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
  if (phase === 'uploading' || !createdAt) return 4
  const elapsed = Math.max(0, now - Date.parse(createdAt))
  const linear = (elapsed / PROGRESS_TARGET_MS) * 95
  if (linear < 95) return Math.max(4, Math.floor(linear))
  const extra = elapsed - PROGRESS_TARGET_MS
  return Math.min(99, 95 + Math.floor((1 - Math.exp(-extra / 30000)) * 4))
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
    if (phase !== 'uploading' && phase !== 'processing') return undefined
    let frame = 0
    const tick = () => {
      const next = Date.now()
      setNow(next)
      if (createdAt && timedOut(createdAt, next)) {
        setPhase('timeout')
        stopPolling()
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, createdAt])

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
  const waiting = phase === 'uploading' || phase === 'processing'
  const showChooser = phase === 'idle'
  const percent = progressPercent(createdAt, now, phase)

  const secondaryBtn =
    'inline-flex items-center justify-center px-4 py-2.5 rounded-lg border-2 border-white/70 bg-transparent text-sm font-semibold text-white hover:bg-white/10 transition-colors'
  const primaryBtn =
    'inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[var(--wm-yellow)] text-sm font-semibold text-[var(--wm-blue)] hover:brightness-105 transition-[filter]'

  return (
    <div
      className="relative flex flex-col h-full min-h-0 overflow-hidden text-white"
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
        @keyframes wm-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes wm-pulse-ring {
          0%, 100% { transform: scale(0.92); opacity: 0.35; }
          50% { transform: scale(1.08); opacity: 0.7; }
        }
        @keyframes wm-bar-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>

      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-[var(--wm-yellow)]"
        aria-hidden="true"
      />

      {waiting ? (
        <div
          className="relative flex-1 min-h-0 flex flex-col items-center justify-center px-6 text-center"
          role="status"
          aria-live="polite"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="relative w-44 h-44 sm:w-56 sm:h-56" aria-hidden="true">
            <div
              className="absolute inset-0 rounded-full border-2 border-[var(--wm-yellow)]/25"
              style={{ animation: 'wm-pulse-ring 2.4s ease-in-out infinite' }}
            />
            <div
              className="absolute inset-3 rounded-full border-2 border-dashed border-white/35"
              style={{ animation: 'wm-orbit 10s linear infinite' }}
            />
            <div
              className="absolute inset-0"
              style={{ animation: 'wm-orbit 2.8s linear infinite' }}
            >
              <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[var(--wm-yellow)] shadow-[0_0_18px_rgba(255,194,32,0.85)]" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-4xl sm:text-5xl font-semibold tabular-nums tracking-tight text-white">
                {percent}
                <span className="text-2xl sm:text-3xl text-[var(--wm-yellow)]">%</span>
              </p>
            </div>
          </div>

          <h2 className="mt-8 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            {phase === 'uploading' ? 'Uploading your photo' : 'Generating your model'}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-white/70 max-w-md">
            {phase === 'uploading'
              ? 'Sending the article photo…'
              : 'Building a rotatable 3D model from your photo.'}
          </p>

          <div className="mt-8 w-full max-w-md h-2 rounded-full bg-white/15 overflow-hidden">
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
            shadow-intensity="1"
            className="block w-full h-full min-h-0 bg-[#f4f7fb]"
          />
          <div className="absolute top-4 left-4 sm:top-5 sm:left-5 flex flex-wrap items-center gap-2 z-10">
            <button
              type="button"
              onClick={resetToIdle}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/95 text-sm font-semibold text-[var(--wm-blue)] shadow-md hover:bg-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="inline-flex items-center px-3 py-2 rounded-lg bg-[var(--wm-yellow)] text-sm font-semibold text-[var(--wm-blue)] shadow-md hover:brightness-105 transition-[filter]"
            >
              Upload another photo
            </button>
          </div>
          <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/90 bg-black/35 rounded-full px-3 py-1.5">
            Drag to orbit, scroll to zoom.
          </p>
          {previewUrl && (
            <div className="absolute top-4 right-4 sm:top-5 sm:right-5 w-20 h-20 sm:w-28 sm:h-28 rounded-xl overflow-hidden border-2 border-[var(--wm-yellow)] shadow-lg bg-white z-10">
              <img
                src={previewUrl}
                alt={file?.name ? `Uploaded photo ${file.name}` : 'Uploaded photo'}
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex flex-col flex-1 min-h-0 px-4 sm:px-8 pt-8 pb-6">
          <header className="flex-shrink-0 max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              Photo to 3D
            </h1>
            <p className="mt-2 text-sm sm:text-base text-white/75">
              One article photo becomes a model you can rotate.
            </p>
          </header>

          <div className="flex-1 min-h-0 mt-6 flex flex-col gap-4">
            {(showChooser || previewUrl) && (
              <div
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`flex-1 min-h-[280px] rounded-2xl border-2 border-dashed transition-colors ${
                  dragging && showChooser
                    ? 'border-[var(--wm-yellow)] bg-[var(--wm-yellow)]/20'
                    : 'border-white/45 bg-white/10'
                }`}
              >
                {previewUrl ? (
                  <div className="h-full flex flex-col p-4 sm:p-6">
                    <img
                      src={previewUrl}
                      alt=""
                      className="flex-1 w-full min-h-0 object-contain rounded-xl bg-black/15"
                    />
                    {file && (
                      <p className="mt-3 text-sm font-medium text-white truncate">{file.name}</p>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--wm-yellow)]" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p className="text-lg sm:text-xl font-semibold text-white">Drop one article photo here</p>
                    <p className="text-sm text-white/70">JPG, PNG, or WebP · up to 25 MB</p>
                  </div>
                )}
              </div>
            )}

            {showChooser && (
              <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className={selected ? secondaryBtn : primaryBtn}
                >
                  {selected ? 'Choose a different photo' : 'Choose photo'}
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
