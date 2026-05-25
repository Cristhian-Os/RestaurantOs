import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from './ErrorBoundary'
import { queryClient } from './services/queryClient'

// Registrar SW minimalista
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        // Si hay un SW esperando activación, activarlo ahora
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        reg.addEventListener('updatefound', () => {
          const w = reg.installing
          if (w) {
            w.addEventListener('statechange', () => {
              if (w.state === 'installed') {
                w.postMessage({ type: 'SKIP_WAITING' })
              }
            })
          }
        })
      })
      .catch(() => {/* no crítico */})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ErrorBoundary>,
)
