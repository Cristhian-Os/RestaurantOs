import { supabase } from './supabaseClient'
import message from 'antd/es/message'

// Clave VAPID pública (segura de exponer, igual que la anon key).
// La privada vive como secret en la Edge Function `send-push`.
const VAPID_PUBLIC_KEY = 'BGY-1TXDcSOVLs_Ll7sT5c9sTnSuuGz_3H-rFZL8zOc9QCVdzgtryAUldNeM8LAqM8mmxIDJwW2wVo23EFeRXjs'

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
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        })
      }

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

  // Enviar push a todos los dispositivos de uno o varios roles, vía Edge Function.
  // Funciona aunque la app del destinatario esté cerrada.
  //
  // MULTI-TENANT: siempre se manda restaurant_id, para que la notificación
  // solo llegue al personal de ESE restaurante (nunca a otros con el mismo
  // rol). Si no se pasa explícito (staff autenticado), se resuelve desde el
  // perfil del usuario actual. El flujo anónimo del menú público (sin
  // sesión) SÍ debe pasarlo explícito, porque no hay perfil de quien llama.
  async notify(
    target: PushTarget | PushTarget[],
    title: string,
    body: string,
    url = '/',
    restaurantId?: string,
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
        body: { roles, title, body, url, restaurant_id: rid },
      })
    } catch (error) {
      console.error('Error enviando push:', error)
    }
  },
}
