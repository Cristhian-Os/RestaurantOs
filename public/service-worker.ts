declare const self: ServiceWorkerGlobalScope

// Escuchar push events
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return

  const data = event.data.json()
  const options: NotificationOptions = {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/badge-72x72.png',
    tag: 'restaurant-notification',
    requireInteraction: data.requireInteraction || false,
    data: data.data || {},
  }

  // Mostrar notificación nativa
  event.waitUntil(self.registration.showNotification(data.title || 'RestaurantOS', options))
})

// Escuchar clicks en notificaciones
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()

  // Navegar a la ventana/tab apropiada
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/')
      }
    }),
  )
})

// Escuchar background sync (para intentos fallidos)
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncPendingNotifications())
  }
})

async function syncPendingNotifications(): Promise<void> {
  // Reintentar enviar notificaciones si falla la conexión
  console.log('Sincronizando notificaciones pendientes...')
}

export {}
