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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
