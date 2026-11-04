import { useEffect, useRef, useState } from 'react'
import '@google/model-viewer'
import { createArticle3dJob, getArticle3dJob, getArticle3dModel } from '../../../services/article3d'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
// The API compresses down to Hunyuan's 6 MB limit. 25 MB only stops huge uploads.
const MAX_BYTES = 25 * 1024 * 1024
const LAST_JOB_KEY = 'article3d:lastJobId'
const POLL_MS = 4000
const TIMEOUT_MS = 5 * 60 * 1000
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

function formatElapsed(createdAt, now) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000))
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function timedOut(createdAt, now = Date.now()) {
  return now - Date.parse(createdAt) >= TIMEOUT_MS
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
    if (phase !== 'processing' || !createdAt) return
    const tick = () => {
      const next = Date.now()
      setNow(next)
      if (timedOut(createdAt, next)) {
        setPhase('timeout')
        stopPolling()
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
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

  return (
    <div className="flex flex-col h-full bg-[#fafafa]">
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-stone-200/80 flex-shrink-0 bg-white">
        <h1 className="text-[15px] font-semibold text-stone-900 tracking-tight">Photo to 3D</h1>
        <p className="text-[12px] text-stone-400 mt-0.5">One article photo becomes a model you can rotate.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-xl">
          {(showChooser || previewUrl) && (
            <div
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`rounded-xl border-2 border-dashed transition-colors ${
                dragging && showChooser
                  ? 'border-stone-900 bg-stone-100'
                  : 'border-stone-300 bg-white'
              }`}
            >
              {previewUrl ? (
                <div className="p-4">
                  <img
                    src={previewUrl}
                    alt=""
                    className="w-full max-h-80 object-contain rounded-lg bg-stone-50"
                  />
                  {file && (
                    <p className="mt-3 text-[13px] font-medium text-stone-800 truncate">{file.name}</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-stone-400" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="text-sm font-medium text-stone-700">Drop one article photo here</p>
                  <p className="text-[12px] text-stone-400">JPG, PNG, or WebP · up to 25 MB</p>
                </div>
              )}
            </div>
          )}

          {showChooser && (
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center px-3 py-2 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
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
            </div>
          )}

          {error && phase !== 'failed' && (
            <p role="alert" className="mt-3 text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {waiting && (
            <div className="mt-4" role="status">
              <p className="text-sm font-medium text-stone-800">Generating your model</p>
              {phase === 'processing' && createdAt && (
                <p className="mt-1 text-[13px] tabular-nums text-stone-500">{formatElapsed(createdAt, now)}</p>
              )}
            </div>
          )}

          {phase === 'timeout' && (
            <div className="mt-4">
              <p className="text-[13px] text-stone-600 leading-relaxed">{TIMEOUT_MESSAGE}</p>
              <button
                type="button"
                onClick={resetToIdle}
                className="mt-3 inline-flex items-center px-3 py-2 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
              >
                Try another photo
              </button>
            </div>
          )}

          {phase === 'failed' && (
            <div className="mt-4">
              {jobError && (
                <p role="alert" className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {jobError}
                </p>
              )}
              <button
                type="button"
                onClick={resetToIdle}
                className="mt-3 inline-flex items-center px-3 py-2 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
              >
                Try another photo
              </button>
            </div>
          )}

          {phase === 'ready' && modelUrl && (
            <div className="mt-4">
              <model-viewer
                src={modelUrl}
                alt="Generated article model"
                camera-controls=""
                auto-rotate=""
                shadow-intensity="1"
                className="block w-full h-[480px] rounded-xl border border-stone-200 bg-white"
              />
              <p className="mt-2 text-[12px] text-stone-400">Drag to orbit, scroll to zoom.</p>
            </div>
          )}

          {phase === 'ready' && modelError && (
            <div className="mt-4">
              <p role="alert" className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {modelError}
              </p>
              <button
                type="button"
                onClick={resetToIdle}
                className="mt-3 inline-flex items-center px-3 py-2 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
              >
                Try another photo
              </button>
            </div>
          )}

          {showChooser && selected && (
            <button
              type="button"
              onClick={onGenerate}
              className="mt-4 inline-flex items-center px-3.5 py-2 rounded-lg bg-stone-900 text-xs font-semibold text-white hover:bg-stone-800"
            >
              Generate 3D model
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
