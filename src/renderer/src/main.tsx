import './assets/main.css'
import '@fontsource/sarabun/400.css'
import '@fontsource/sarabun/700.css'
import '@fontsource/noto-sans-thai/400.css'
import '@fontsource/noto-sans-thai/700.css'
import '@fontsource/ibm-plex-sans-thai/400.css'
import '@fontsource/ibm-plex-sans-thai/700.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// ─── Dev-only: cap React 19's User Timing flood ───────────────────────────────
// In development, react-dom emits performance.measure()/mark() entries for its
// internal "React performance tracks". They pile up unbounded in the User Timing
// buffer (observed >2,000,000 entries → ~hundreds of MB → JS-heap OOM → "black
// screen after long use"), amplified by StrictMode's double render and DualView
// rendering every row. Nothing reads them back unless the DevTools Performance
// panel is actively recording, so periodically drop them. Production react-dom
// does not emit these, so this is gated to dev only. (Disable while profiling.)
if (import.meta.env.DEV) {
  setInterval(() => {
    performance.clearMeasures()
    performance.clearMarks()
  }, 5000)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
