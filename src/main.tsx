import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './business.css'
import './views.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Offline support + "add to home screen". Production only — in dev a service
// worker just serves stale bundles and makes changes look like they vanished.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // offline support is a bonus; the app works fine without it
    })
  })
}
