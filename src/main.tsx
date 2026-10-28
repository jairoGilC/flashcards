import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AppProvider } from './app/AppContext'
import { db } from './db/instance'

// Ask the browser not to evict our IndexedDB (iOS clears unused PWA storage otherwise).
navigator.storage?.persist?.().catch(() => {})

// Wide screens open the deck editor; phones open the study home.
if (!window.location.hash && window.matchMedia('(min-width: 900px)').matches) {
  window.location.hash = '#/editor'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider db={db}>
      <App />
    </AppProvider>
  </StrictMode>,
)
