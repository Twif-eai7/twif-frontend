import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// A new deploy removes old build chunks; a tab still open from before the
// deploy has stale hashed chunk URLs baked into its already-loaded bundle,
// so any lazy `import()` (exportInspectionReportPdf.js, etc.) 404s with
// "Failed to fetch dynamically imported module." Vite fires this event for
// exactly that failure - reload once to pick up the fresh chunk manifest.
// Guarded so a genuinely broken/offline chunk doesn't reload-loop.
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('chunk-reload')) {
    sessionStorage.setItem('chunk-reload', '1')
    window.location.reload()
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

sessionStorage.removeItem('chunk-reload')
