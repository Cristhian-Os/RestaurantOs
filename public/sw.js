// RestaurantOS Service Worker v16 — offline real (cachea la app)
const CACHE = 'ros-v16'
const OFFLINE_URL = '/index.html'

// Install: cachear el HTML de entrada
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  )
})

// Helper: stale-while-revalidate (sirve de caché y actualiza en segundo plano)
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(res => { if (res && res.ok) cache.put(request, res.clone()); return res })
    .catch(() => cached)  // sin conexión → lo cacheado
  return cached || network
}

// Helper: cache-first (para fuentes — no cambian)
async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const res = await fetch(request)
    if (res && res.ok) cache.put(request, res.clone())
    return res
  } catch {
    return cached || Response.error()
  }
}

// Activate: borrar cachés viejos y tomar control inmediato
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// Fetch: CRÍTICO — siempre responder, nunca dejar petición colgada
self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  // Ignorar requests que no son HTTP/HTTPS (chrome-extension, etc.)
  if (!url.protocol.startsWith('http')) return
  // Solo cacheamos GET; el resto va directo a la red
  if (request.method !== 'GET') return

  // Datos en vivo (Supabase REST/Auth/Realtime/Functions): SIEMPRE red, sin caché
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/realtime/') ||
    url.pathname.startsWith('/functions/')
  ) return  // ← el browser la maneja normal (online-only)

  // Navegación (cargar la app): red primero, fallback al index.html cacheado
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(OFFLINE_URL, clone))
          }
          return res
        })
        .catch(() =>
          caches.match(OFFLINE_URL).then(cached =>
            cached ?? new Response('<h1>Sin conexión</h1>', {
              headers: { 'Content-Type': 'text/html' }
            })
          )
        )
    )
    return
  }

  // Fuentes de Google (Fraunces/Inter): cache-first → disponibles offline
  if (url.hostname.includes('gstatic.com') || url.hostname.includes('fonts.googleapis.com')) {
    e.respondWith(cacheFirst(request))
    return
  }

  // Assets de la app (JS, CSS, imágenes, fuentes locales) y mismo origen:
  // stale-while-revalidate → la app ARRANCA offline (no solo el shell).
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(request))
    return
  }

  // Cualquier otro origen externo: red directa
})

// Mensajes desde la app
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ─── Notificaciones Push ──────────────────────────────────────
self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} }
  catch { data = { body: e.data ? e.data.text() : '' } }

  const title = data.title || 'RestaurantOS'
  const options = {
    body:    data.body || '',
    icon:    data.icon || '/logo.jpg',
    badge:   '/logo.jpg',
    tag:     data.tag || 'ros-notif',
    renotify: true,
    requireInteraction: data.requireInteraction !== false,
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/' },
  }
  e.waitUntil(self.registration.showNotification(title, options))
})

// Click en la notificación → enfocar/abrir la app en la ruta indicada
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) { try { client.navigate(url) } catch (_) {} }
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
