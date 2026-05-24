// RestaurantOS Service Worker v3 — fuerza actualización inmediata
const CACHE_VERSION = 'restaurantos-v3'
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/logo.jpg']

// ── INSTALL: pre-cachear y saltar espera ────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())   // activar inmediatamente sin esperar
  )
})

// ── ACTIVATE: borrar cachés viejos y tomar control ──────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Borrar TODOS los cachés anteriores
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_VERSION)
            .map(k => { console.log('🗑️ Borrando caché viejo:', k); return caches.delete(k) })
        )
      ),
      // Tomar control de todas las pestañas/ventanas abiertas sin recargar
      self.clients.claim(),
    ])
  )
})

// ── FETCH: network-first para HTML, cache-first para assets ─
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignorar requests a APIs externas (Supabase, Google Fonts, etc.)
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/')
  ) return

  // Navegación (HTML): network-first → si falla sirve /index.html del caché
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE_VERSION).then(c => c.put(request, clone))
          return res
        })
        .catch(() =>
          caches.match('/index.html').then(r => r ?? fetch('/index.html'))
        )
    )
    return
  }

  // Assets JS/CSS/fonts/imágenes: cache-first con actualización en background
  if (
    request.destination === 'script' ||
    request.destination === 'style'  ||
    request.destination === 'font'   ||
    request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_VERSION).then(c => c.put(request, clone))
          }
          return res
        })
        return cached ?? fetchPromise
      })
    )
    return
  }
})

// ── MENSAJE desde la app: forzar actualización ──────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'CACHE_CLEARED' }))
      ))
  }
})

// ── PUSH notifications ───────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  try {
    const data = event.data.json()
    event.waitUntil(
      self.registration.showNotification(data.title || 'RestaurantOS', {
        body: data.body || '',
        icon: '/icon-192x192.png',
        badge: '/icon-72x72.png',
        tag: 'restaurantos',
        requireInteraction: data.requireInteraction || false,
      })
    )
  } catch { /* ignorar silenciosamente */ }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) { client.focus(); return }
      }
      return clients.openWindow('/')
    })
  )
})
