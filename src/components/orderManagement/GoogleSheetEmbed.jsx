import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

/**
 * Port of Shopify Liquid Google Sheet embed — same toolbar, lazy load, zoom, refresh,
 * download, open in new tab, optional buyer switcher. Fullscreen escape handler when
 * allowFullscreen (toolbar fullscreen button was commented out in Liquid).
 */

function IconSheet() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function IconZoomOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconZoomIn() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function IconExternal() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

const DROPDOWN_CHEVRON =
  'url("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20d%3D%22M9.293%2C12.95l.707%2C.707L15.657%2C8l-1.414-1.414L10%2C10.828L5.757%2C6.586L4.343%2C8l5%2C5Z%22%20fill%3D%22%235f6368%22%2F%3E%3C%2Fsvg%3E")'

function resolveEntry(entry) {
  if (entry == null) return { sheetId: '', gId: undefined }
  if (typeof entry === 'string') return { sheetId: entry, gId: undefined }
  return {
    sheetId: entry.sheetId || '',
    gId: entry.gId,
  }
}

export default function GoogleSheetEmbed({
  sheetId = '',
  height = '600px',
  width = '100%',
  gid = 0,
  title = 'Google Sheet',
  showToolbar = true,
  allowFullscreen = true,
  lazyLoad = true,
  viewMode = 'edit',
  enableBuyerSwitcher = false,
  buyerSheetMap = null,
}) {
  const reactDomId = useId().replace(/:/g, '')
  const uniqueId = useMemo(() => {
    const base = `${String(sheetId).replace(/-/g, '').replace(/_/g, '')}${gid}`
    return base || `embed${reactDomId}`
  }, [sheetId, gid, reactDomId])

  const iframeRef = useRef(null)
  const wrapperRef = useRef(null)
  const buyerMapInitialized = useRef(false)

  const [currentSheetId, setCurrentSheetId] = useState(sheetId)
  const [currentGid, setCurrentGid] = useState(gid)
  const [currentBuyer, setCurrentBuyer] = useState(null)
  const [loadingVisible, setLoadingVisible] = useState(true)
  const [lazyReady, setLazyReady] = useState(!lazyLoad)
  const [sheetZoom, setSheetZoom] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  /** Cache-bust query (&t=); 0 = omit (matches first-load embed URL in Liquid) */
  const [cacheBust, setCacheBust] = useState(0)

  const buildEmbedUrl = useCallback(
    (sid, g, withBust = false) => {
      const gNum = g !== undefined && g !== null ? Number(g) : 0
      const base = `https://docs.google.com/spreadsheets/d/${sid}/${viewMode}?usp=sharing&rm=minimal&gid=${gNum}&single=true&widget=true&chrome=false`
      return withBust ? `${base}&t=${Date.now()}` : base
    },
    [viewMode],
  )

  const iframeSrc = useMemo(() => {
    if (!currentSheetId) return undefined
    if (lazyLoad && !lazyReady) return undefined
    const base = buildEmbedUrl(currentSheetId, currentGid, false)
    return cacheBust ? `${base}&t=${cacheBust}` : base
  }, [currentSheetId, currentGid, lazyLoad, lazyReady, cacheBust, buildEmbedUrl])

  const hideLoading = useCallback(() => {
    setLoadingVisible(false)
    const iframe = iframeRef.current
    if (iframe) {
      iframe.style.visibility = 'visible'
      iframe.style.opacity = '1'
    }
  }, [])

  const showLoadingOverlay = useCallback(() => {
    setLoadingVisible(true)
    const iframe = iframeRef.current
    if (iframe) {
      iframe.style.visibility = 'hidden'
      iframe.style.opacity = '0'
    }
  }, [])

  const refreshSheet = useCallback(() => {
    showLoadingOverlay()
    setCacheBust(Date.now())
  }, [showLoadingOverlay])

  const downloadSheet = useCallback(() => {
    const sid = currentSheetId
    const g = currentGid
    if (!sid) {
      console.warn('No sheet ID available for download')
      return
    }
    const downloadUrl = `https://docs.google.com/spreadsheets/d/${sid}/export?format=xlsx&gid=${g}`
    const link = document.createElement('a')
    link.href = downloadUrl
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [currentSheetId, currentGid])

  const openSheetInNewTab = useCallback(() => {
    const sid = currentSheetId
    const g = currentGid
    if (!sid) {
      console.warn('No active sheet ID')
      return
    }
    const url = `https://docs.google.com/spreadsheets/d/${sid}/edit#gid=${g}`
    window.open(url, '_blank', 'noopener')
  }, [currentSheetId, currentGid])

  const switchSheetForBuyer = useCallback(
    (buyer) => {
      if (!buyerSheetMap || Object.keys(buyerSheetMap).length === 0) {
        console.warn(`[Sheet ${uniqueId}] No buyer-to-sheet mapping provided`)
        return
      }
      const entry = buyerSheetMap[buyer]
      if (!entry) {
        console.warn(`[Sheet ${uniqueId}] No sheet found for buyer:`, buyer)
        return
      }
      const { sheetId: newSid, gId: newGidRaw } = resolveEntry(entry)
      const newGid = newGidRaw !== undefined ? newGidRaw : currentGid
      if (!newSid) {
        console.warn(`[Sheet ${uniqueId}] No sheet ID found for buyer:`, buyer)
        return
      }
      showLoadingOverlay()
      setCurrentGid(newGid)
      setCurrentSheetId(newSid)
      setCurrentBuyer(buyer)
      setCacheBust(Date.now())
    },
    [buyerSheetMap, currentGid, showLoadingOverlay, uniqueId],
  )

  const handleBuyerChange = useCallback(
    (e) => {
      switchSheetForBuyer(e.target.value)
    },
    [switchSheetForBuyer],
  )

  useEffect(() => {
    if (!allowFullscreen) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setFullscreen((prev) => {
        if (!prev) return prev
        document.body.style.overflow = ''
        return false
      })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [allowFullscreen])

  useEffect(() => {
    if (!enableBuyerSwitcher || !buyerSheetMap || Object.keys(buyerSheetMap).length === 0) return
    if (buyerMapInitialized.current) return
    buyerMapInitialized.current = true

    let buyers = Object.keys(buyerSheetMap).sort((a, b) => a.localeCompare(b))
    const allIndex = buyers.findIndex((b) => b.toUpperCase() === 'ALL')
    if (allIndex !== -1) {
      const [allBuyer] = buyers.splice(allIndex, 1)
      buyers.unshift(allBuyer)
    }
    const firstBuyer = buyers[0]
    const firstEntry = buyerSheetMap[firstBuyer]
    const { sheetId: firstSid, gId: firstGidRaw } = resolveEntry(firstEntry)
    const firstGid = firstGidRaw !== undefined ? firstGidRaw : gid

    setCurrentBuyer(firstBuyer)
    setCurrentSheetId(firstSid || sheetId)
    setCurrentGid(firstGid)
  }, [enableBuyerSwitcher, buyerSheetMap, gid, sheetId])

  useEffect(() => {
    if (!lazyLoad) return undefined
    const iframe = iframeRef.current
    if (!iframe) return undefined
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setLazyReady(true)
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 },
    )
    obs.observe(iframe)
    return () => obs.disconnect()
  }, [lazyLoad, uniqueId])

  const applyZoom = useCallback(() => {
    const iframe = iframeRef.current
    const scale = sheetZoom
    if (!iframe) return
    iframe.style.transform = `scale(${scale})`
    iframe.style.transformOrigin = 'top left'
    iframe.style.width = `${100 / scale}%`
    iframe.style.height = `${100 / scale}%`
  }, [sheetZoom])

  useEffect(() => {
    applyZoom()
  }, [applyZoom, sheetZoom])

  const zoomIn = useCallback(() => {
    setSheetZoom((z) => z + 0.1)
  }, [])

  const zoomOut = useCallback(() => {
    setSheetZoom((z) => Math.max(0.5, z - 0.1))
  }, [])

  const hasBuyerMap = buyerSheetMap && Object.keys(buyerSheetMap).length > 0
  if (!sheetId && (!enableBuyerSwitcher || !hasBuyerMap)) {
    return (
      <div className="rounded bg-[#f8f8f8] p-5 text-center">
        <p className="m-0 text-[#666]">Please provide a Google Sheet ID to display the sheet.</p>
      </div>
    )
  }

  const buyerOptions = useMemo(() => {
    if (!buyerSheetMap) return []
    let buyers = Object.keys(buyerSheetMap).sort((a, b) => a.localeCompare(b))
    const allIndex = buyers.findIndex((b) => b.toUpperCase() === 'ALL')
    if (allIndex !== -1) {
      const [allBuyer] = buyers.splice(allIndex, 1)
      buyers.unshift(allBuyer)
    }
    return buyers
  }, [buyerSheetMap])

  return (
    <div
      ref={wrapperRef}
      id={`sheet-wrapper-${uniqueId}`}
      className={`mx-auto overflow-hidden rounded-lg bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-all duration-300 ${
        fullscreen ? 'fixed inset-0 z-[9999] m-0 flex h-screen w-screen max-w-none flex-col rounded-none' : ''
      }`}
      style={{ width }}
    >
      {showToolbar && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-b border-[#e0e0e0] bg-[#f8f9fa] px-4 py-3 md:flex-nowrap ${
            fullscreen ? 'relative z-[10001] shrink-0 shadow-[0_2px_4px_rgba(0,0,0,0.1)]' : ''
          }`}
        >
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#202124] max-md:[&>span:last-child]:hidden">
            <span className="shrink-0 text-[#0f9d58] [&>svg]:block">
              <IconSheet />
            </span>
            <span>{title}</span>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 md:flex-nowrap">
            {enableBuyerSwitcher && hasBuyerMap && (
              <select
                id={`sheet-buyer-dropdown-${uniqueId}`}
                title="Select Buyer"
                value={currentBuyer ?? buyerOptions[0] ?? ''}
                onChange={handleBuyerChange}
                className="min-w-[120px] max-w-[200px] cursor-pointer appearance-none rounded-md border border-[#dadce0] bg-white py-1.5 pr-8 pl-3 text-xs font-medium text-[#202124] outline-none transition-all duration-200 hover:border-[#1a73e8] hover:bg-[#f8f9fa] focus:border-[#1a73e8] focus:shadow-[0_0_0_2px_rgba(26,115,232,0.2)] md:min-w-[140px] md:text-[13px]"
                style={{
                  backgroundImage: DROPDOWN_CHEVRON,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '12px',
                }}
              >
                {buyerOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-white text-[#5f6368] transition-colors duration-200 hover:bg-[#e8eaed] hover:text-[#202124]"
              onClick={zoomOut}
              title="Zoom Out"
            >
              <IconZoomOut />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-white text-[#5f6368] transition-colors duration-200 hover:bg-[#e8eaed] hover:text-[#202124]"
              onClick={zoomIn}
              title="Zoom In"
            >
              <IconZoomIn />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-white text-[#5f6368] transition-colors duration-200 hover:bg-[#e8eaed] hover:text-[#202124]"
              onClick={refreshSheet}
              title="Refresh"
            >
              <IconRefresh />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-white text-[#5f6368] transition-colors duration-200 hover:bg-[#e8eaed] hover:text-[#202124]"
              onClick={downloadSheet}
              title="Download as Excel"
            >
              <IconDownload />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-white text-[#5f6368] transition-colors duration-200 hover:bg-[#e8eaed] hover:text-[#202124]"
              onClick={openSheetInNewTab}
              title="Open in Google Sheets"
            >
              <IconExternal />
            </button>
          </div>
        </div>
      )}

      <div
        id={`sheet-container-${uniqueId}`}
        className={`relative overflow-auto bg-white max-md:!h-[500px] ${
          fullscreen ? 'relative flex min-h-0 flex-1 flex-col [&_iframe]:h-full [&_iframe]:min-h-0 [&_iframe]:flex-1' : ''
        }`}
        style={fullscreen ? { height: 'auto' } : { height }}
      >
        <div
          id={`sheet-loading-${uniqueId}`}
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-white transition-opacity duration-300 ${
            loadingVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-[#f3f3f3]"
            style={{ borderTopColor: '#0f9d58' }}
          />
          <p className="mt-4 text-sm text-[#5f6368]">Loading spreadsheet...</p>
        </div>

        <iframe
          ref={iframeRef}
          id={`sheet-iframe-${uniqueId}`}
          title={title}
          src={iframeSrc}
          className="block h-full w-full border-0 transition-opacity duration-300"
          style={{
            visibility: 'hidden',
            opacity: 0,
          }}
          allowFullScreen
          onLoad={hideLoading}
        />
      </div>

      <div
        className={`pointer-events-none fixed right-2.5 top-2.5 z-[10002] rounded bg-black/70 px-3 py-2 text-xs text-white ${
          fullscreen ? 'block' : 'hidden'
        }`}
      >
        Press ESC to exit fullscreen
      </div>
    </div>
  )
}
