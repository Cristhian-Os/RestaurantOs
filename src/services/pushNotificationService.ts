import { supabase } from './supabaseClient'
import message from 'antd/es/message'

// La clave VAPID pública la entrega la Edge Function `send-push` (la pareja privada vive solo
// en la base, tabla platform_secrets). No va escrita en el código: si algún día se rota, los
// dispositivos se vuelven a suscribir solos con la nueva.
const KEY_MARKER = 'ros_push_vapid'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i)
  return arr
}

// ArrayBuffer → base64url (formato que espera web-push para p256dh/auth)
function bufToBase64url(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return window.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Pide a `send-push` la clave pública vigente. null si no se pudo (sin red, sin sesión…). */
async function fetchServerKey(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', { body: { action: 'public_key' } })
    const key = (data as { publicKey?: string } | null)?.publicKey
    return !error && typeof key === 'string' && key.length > 20 ? key : null
  } catch {
    return null
  }
}

function sameBytes(a: ArrayBuffer, b: Uint8Array): boolean {
  const x = new Uint8Array(a)
  if (x.length !== b.length) return false
  for (let i = 0; i < x.length; i++) if (x[i] !== b[i]) return false
  return true
}

function readMarker(): string | null {
  try { return localStorage.getItem(KEY_MARKER) } catch { return null }
}
function writeMarker(key: string): void {
  try { localStorage.setItem(KEY_MARKER, key) } catch { /* modo privado: no crítico */ }
}

/** ¿La suscripción existente fue creada con la clave que el servidor usa hoy? */
function matchesServerKey(sub: PushSubscription, serverKey: string): boolean {
  const current = sub.options?.applicationServerKey
  // Algunos navegadores no exponen la clave de la suscripción: ahí nos guiamos por la marca guardada.
  return current ? sameBytes(current, urlBase64ToUint8Array(serverKey)) : readMarker() === serverKey
}

export type PushTarget = 'admin' | 'waiter' | 'kitchen' | 'cashier' | 'client'

export const pushNotificationService = {
  // Pide permiso y suscribe el dispositivo (idempotente)
  async initializePushNotifications(): Promise<void> {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') return
      }
      if (Notification.permission === 'granted') {
        await this.subscribeToPush()
      }
    } catch {
      // iOS Safari antiguo / navegador sin soporte — ignorar
    }
  },

  async subscribeToPush(): Promise<string | null> {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
      if (Notification.permission !== 'granted') return null

      const registration = await navigator.serviceWorker.ready
      const serverKey = await fetchServerKey()
      let subscription = await registration.pushManager.getSubscription()
      let replacedEndpoint: string | null = null

      if (subscription && serverKey && !matchesServerKey(subscription, serverKey)) {
        // Suscripción hecha con una clave vieja: el servidor ya no puede enviarle nada. Se cambia por una nueva.
        replacedEndpoint = subscription.endpoint
        await subscription.unsubscribe()
        subscription = null
      }
      if (!subscription) {
        // Sin la clave del servidor no se puede crear una suscripción válida: se reintenta en la próxima carga.
        if (!serverKey) return null
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(serverKey) as BufferSource,
        })
      }
      if (serverKey) writeMarker(serverKey)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      // Guardar suscripción (upsert por endpoint para no duplicar dispositivos)
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id:  user.id,
        endpoint: subscription.endpoint,
        p256dh:   bufToBase64url(subscription.getKey('p256dh')),
        auth:     bufToBase64url(subscription.getKey('auth')),
      }, { onConflict: 'endpoint' })
      if (error) throw error

      if (replacedEndpoint && replacedEndpoint !== subscription.endpoint) {
        // La fila de la suscripción vieja ya no sirve (RLS: solo puede borrar las suyas).
        await supabase.from('push_subscriptions').delete().eq('endpoint', replacedEndpoint)
      }

      return subscription.endpoint
    } catch (error) {
      console.error('Error suscribiendo a push:', error)
      return null
    }
  },

  // Notificación in-app (cuando la app está abierta)
  showInAppNotification(
    _title: string,
    body: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info',
  ): void {
    if (typeof window === 'undefined') return
    message[type]({ content: body, duration: 4 })
  },

  // Aviso de un pedido del menú QR (cliente SIN sesión). Solo manda el id: el servidor lee el
  // pedido y arma el texto y los destinatarios (cocina y admin de ese restaurante). Si falla, se
  // ignora en silencio: el pedido ya está guardado y no debe verse afectado.
  async notifyPublicOrder(orderId: string): Promise<void> {
    try {
      await supabase.functions.invoke('notify-order', { body: { order_id: orderId } })
    } catch { /* sin aviso push, el pedido sigue válido */ }
  },

  // Enviar push a todos los dispositivos de uno o varios roles, vía Edge Function.
  // Funciona aunque la app del destinatario esté cerrada.
  //
  // MULTI-TENANT: siempre se manda restaurant_id, para que la notificación
  // solo llegue al personal de ESE restaurante (nunca a otros con el mismo
  // rol). Si no se pasa explícito (staff autenticado), se resuelve desde el
  // perfil del usuario actual. El flujo anónimo del menú público (sin
  // sesión) SÍ debe pasarlo explícito, porque no hay perfil de quien llama.
  // userIds: si se pasa, ADEMÁS de los roles se notifica directo a esas
  // personas puntuales (ej. el mesero dueño del pedido) — no reemplaza los
  // roles, los complementa.
  async notify(
    target: PushTarget | PushTarget[],
    title: string,
    body: string,
    url = '/',
    restaurantId?: string,
    userIds?: string[],
  ): Promise<void> {
    try {
      let rid = restaurantId
      if (!rid) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: prof } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).maybeSingle()
        rid = prof?.restaurant_id ?? undefined
        if (!rid) return
      }
      const roles = Array.isArray(target) ? target : [target]
      await supabase.functions.invoke('send-push', {
        body: { roles, title, body, url, restaurant_id: rid, user_ids: userIds },
      })
    } catch (error) {
      console.error('Error enviando push:', error)
    }
  },
}
