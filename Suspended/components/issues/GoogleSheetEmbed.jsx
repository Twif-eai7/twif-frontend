import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

const DEFAULT_HEIGHT = '600px'
const DEFAULT_WIDTH = '100%'

function IconFile() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function IconZoomOut() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconZoomIn() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="23 4 23 10 17 10" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function IconExternal() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function IconExpand() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 9V3h6" />
      <path d="M21 9V3h-6" />
      <path d="M3 15v6h6" />
      <path d="M21 15v6h-6" />
    </svg>
  )
}

function IconCollapse() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 3v6H3" />
      <path d="M15 3v6h6" />
      <path d="M9 21v-6H3" />
      <path d="M15 21v-6h6" />
    </svg>
  )
}

const TOOLBAR_BTN =
  'flex h-8 w-8 items-center justify-center rounded border-0 bg-white text-[#5f6368] transition-colors hover:bg-[#e8eaed] hover:text-[#202124] disabled:cursor-not-allowed disabled:opacity-50'

/**
 * React port of the Liquid Google Sheet embed.
 * Supports: zoom, refresh, download, open-in-sheets, fullscreen, lazy-load, optional toolbar.
 */
export default function GoogleSheetEmbed({
  sheetId,
  gid = 0,
  height = DEFAULT_HEIGHT,
  width = DEFAULT_WIDTH,
  title = 'Google Sheet',
  viewMode = 'edit',
  showToolbar = true,
  allowFullscreen = true,
  lazyLoad = true,
}) {
  const reactId = useId().replace(/:/g, '')
  const wrapperRef = useRef(null)
  const containerRef = useRef(null)
  const iframeRef = useRef(null)

  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(true)
  const [cacheBust, setCacheBust] = useState(0)
  const [shouldLoad, setShouldLoad] = useState(!lazyLoad)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const baseSrc = useMemo(() => {
    if (!sheetId) return ''
    return `https://docs.google.com/spreadsheets/d/${sheetId}/${viewMode}?usp=sharing&rm=minimal&gid=${gid}&single=true&widget=true&chrome=false`
  }, [sheetId, gid, viewMode])

  const iframeSrc = shouldLoad
    ? cacheBust ? `${baseSrc}&t=${cacheBust}` : baseSrc
    : undefined

  useEffect(() => {
    if (!lazyLoad || shouldLoad) return
    const el = wrapperRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [lazyLoad, shouldLoad])

  useEffect(() => {
    const el = iframeRef.current
    if (!el) return
    el.style.transform = `scale(${zoom})`
    el.style.transformOrigin = 'top left'
    el.style.width = `${100 / zoom}%`
    el.style.height = `${100 / zoom}%`
  }, [zoom, shouldLoad])

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.1, 2.5)), [])
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.1, 0.5)), [])

  const refresh = useCallback(() => {
    setLoading(true)
    setCacheBust(Date.now())
  }, [])

  const download = useCallback(() => {
    window.open(
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx&gid=${gid}`,
      '_blank',
      'noopener,noreferrer',
    )
  }, [sheetId, gid])

  const openInSheets = useCallback(() => {
    window.open(
      `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}`,
      '_blank',
      'noopener,noreferrer',
    )
  }, [sheetId, gid])

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await el.requestFullscreen()
      }
    } catch {
      /* user dismissed or API unavailable */
    }
  }, [])

  const onIframeLoad = useCallback(() => setLoading(false), [])

  if (!sheetId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-8 text-center text-sm text-amber-900">
        No Google Sheet ID configured. Set <code className="rounded bg-amber-100/80 px-1.5 py-0.5 font-mono text-xs">sheetId</code> in <code className="rounded bg-amber-100/80 px-1.5 py-0.5 font-mono text-xs">src/components/issues/issueTrackerConfig.js</code>.
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className="mx-auto overflow-hidden rounded-lg bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
      style={{ width }}
    >
      {showToolbar && (
        <div className="flex items-center justify-between border-b border-gray-200 bg-[#f8f9fa] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#202124]">
            <IconFile />
            <span>{title}</span>
          </div>
          <div className="flex gap-1.5">
            <button type="button" className={TOOLBAR_BTN} onClick={zoomOut} title="Zoom out" aria-label="Zoom out">
              <IconZoomOut />
            </button>
            <button type="button" className={TOOLBAR_BTN} onClick={zoomIn} title="Zoom in" aria-label="Zoom in">
              <IconZoomIn />
            </button>
            <button type="button" className={TOOLBAR_BTN} onClick={refresh} title="Refresh" aria-label="Refresh">
              <IconRefresh />
            </button>
            <button type="button" className={TOOLBAR_BTN} onClick={download} title="Download" aria-label="Download as Excel">
              <IconDownload />
            </button>
            <button type="button" className={TOOLBAR_BTN} onClick={openInSheets} title="Open in Google Sheets" aria-label="Open in Google Sheets">
              <IconExternal />
            </button>
            {allowFullscreen && (
              <button
                type="button"
                className={TOOLBAR_BTN}
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <IconCollapse /> : <IconExpand />}
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        id={`sheet-container-${reactId}`}
        className="relative overflow-hidden bg-white"
        style={{ height: isFullscreen ? '100vh' : height }}
      >
        <div
          id={`sheet-loading-${reactId}`}
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-white ${loading ? 'flex' : 'hidden'}`}
          aria-live="polite"
          aria-busy={loading}
        >
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#f3f3f3] border-t-[#0f9d58]" role="status" />
          <p className="mt-3 text-sm text-gray-600">
            {shouldLoad ? 'Loading spreadsheet…' : 'Spreadsheet will load when in view…'}
          </p>
        </div>

        {shouldLoad && (
          <iframe
            ref={iframeRef}
            id={`sheet-iframe-${reactId}`}
            title={title}
            src={iframeSrc}
            className={`h-full w-full border-0 transition-opacity duration-200 ${loading ? 'opacity-0' : 'opacity-100'}`}
            onLoad={onIframeLoad}
            allow="clipboard-read; clipboard-write; fullscreen"
            allowFullScreen={allowFullscreen}
          />
        )}
      </div>
    </div>
  )
}
