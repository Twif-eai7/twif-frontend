import { useState, useEffect } from 'react'

// Jump-to-top/bottom pair pinned to the bottom-right corner of whatever panel
// contains it. Unlike a page-level scroll nav (fixed to the viewport corner),
// this is meant to sit inside a `relative` wrapper around a specific
// scrollable region - e.g. a sidebar list or a long form - so it scrolls
// that region, not the whole page. `scrollEl` is the scrollable node itself
// (e.g. from a `ref={setFoo}` callback-ref-to-state, not a ref object).
export default function ScrollNav({ scrollEl }) {
  const [atTop, setAtTop] = useState(true)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => {
    if (!scrollEl) return
    const onScroll = () => {
      const max = scrollEl.scrollHeight - scrollEl.clientHeight
      setAtTop(scrollEl.scrollTop <= 4)
      setAtBottom(max <= 4 || scrollEl.scrollTop >= max - 4)
    }
    onScroll()
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    // Content commonly arrives after mount (a portal, an async fetch), so the
    // first onScroll() above can't see it yet - a MutationObserver catches
    // that arrival and rechecks.
    const mutationObserver = new MutationObserver(onScroll)
    mutationObserver.observe(scrollEl, { childList: true, subtree: true })
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      mutationObserver.disconnect()
    }
  }, [scrollEl])

  if (atTop && atBottom) return null
  const scrollTo = (top) => scrollEl?.scrollTo({ top, behavior: 'smooth' })

  return (
    <div className="absolute bottom-2 right-2 flex flex-col gap-1.5 pointer-events-none">
      {!atTop && (
        <button
          type="button"
          onClick={() => scrollTo(0)}
          title="Scroll to top"
          className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-500 hover:text-gray-900 hover:shadow-lg transition-all cursor-pointer"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6" /></svg>
        </button>
      )}
      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollTo(scrollEl?.scrollHeight ?? 0)}
          title="Scroll to bottom"
          className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-500 hover:text-gray-900 hover:shadow-lg transition-all cursor-pointer"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}
    </div>
  )
}
