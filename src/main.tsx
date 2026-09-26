import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from './ErrorBoundary'
import { queryClient } from './services/queryClient'

// ── Registrar Service Worker ───────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return

  try {
    // Desregistrar cualquier SW viejo que no sea /sw.js
    const regs = await navigator.serviceWorker.getRegistrations()
    for (const reg of regs) {
      const url = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? ''
      if (!url.endsWith('/sw.js')) {
        await reg.unregister()
      }
    }

    // Limpiar cachés de versiones anteriores.
    // Este literal debe coincidir siempre con CACHE en public/sw.js — si no,
    // este código borra la caché del SW en cada carga y rompe el offline
    // (bug real detectado 2026-09-26: aquí decía 'ros-v7' mientras sw.js ya
    // usaba 'ros-v22', autodestruyendo la caché del app-shell en cada visita).
    const keys = await caches.keys()
    for (const key of keys) {
      if (key !== 'ros-v22') {
        await caches.delete(key)
      }
    }

    // Registrar el SW actual
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

    // Activar inmediatamente si hay uno esperando
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }

    reg.addEventListener('updatefound', () => {
      const w = reg.installing
      if (!w) return
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          w.postMessage({ type: 'SKIP_WAITING' })
        }
      })
    })

    // Recargar cuando cambie el SW activo
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading) {
        reloading = true
        window.location.reload()
      }
    })

  } catch (err) {
    console.warn('SW no disponible:', err)
  }
}

// Registrar después de que la app cargue
window.addEventListener('load', registerSW)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ErrorBoundary>,
)
