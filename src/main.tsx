import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './services/queryClient'

// ── Registrar Service Worker con lógica de actualización inmediata ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

      // Detectar cuando hay un nuevo SW esperando
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Hay una versión nueva lista — forzar activación inmediata
            newWorker.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })

      // Cuando el SW tome control, recargar la página para usar la versión nueva
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true
          window.location.reload()
        }
      })

      // Si ya hay un SW activo en espera, activarlo de inmediato
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }

    } catch (err) {
      // SW no disponible (desarrollo local, incógnito, etc.) — no es error crítico
      console.warn('SW no disponible:', err)
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
