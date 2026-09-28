import { useState, useEffect } from 'react'

// Aligned to Tailwind's own `md` breakpoint (768px) so JS and CSS never
// disagree on where the line is. Only reach for this where mobile needs
// genuinely different behavior (not just different CSS) - e.g. whether a
// heavy component mounts at all, or which handler a tap wires to. Plain
// `hidden md:block` / `md:hidden` dual-render stays the default tool for
// pure layout/markup swaps.
export default function useIsMobile(breakpoint = 767) {
  const query = `(max-width: ${breakpoint}px)`
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return isMobile
}
