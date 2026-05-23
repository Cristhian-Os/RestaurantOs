import { supabase } from './supabaseClient'
import message from 'antd/es/message'  // FIX: static import, no require()

export const pushNotificationService = {
  async initializePushNotifications(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js')
        console.log('Service Worker registrado:', registration)
      } catch (error) {
        console.error('Error registrando Service Worker:', error)
      }
    }
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  },

  async subscribeToPush(vapidPublicKey: string): Promise<string | null> {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Workers no soportados')
      return null
    }
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey),
      })
      const { error } = await supabase.from('push_subscriptions').insert([{
        user_id: (await supabase.auth.getUser()).data.user?.id,
        endpoint: subscription.endpoint,
        auth: JSON.stringify(subscription.getKey('auth')),
        p256dh: JSON.stringify(subscription.getKey('p256dh')),
      }])
      if (error) throw error
      return subscription.endpoint
    } catch (error) {
      console.error('Error suscribiendo a push:', error)
      return null
    }
  },

  // FIX SEC#1 — usa import estático en lugar de require()
  showInAppNotification(
    _title: string,
    body: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info'
  ): void {
    if (typeof window === 'undefined') return
    message[type]({ content: body, duration: 4 })
  },

  async sendPushToAdmin(title: string, body: string, data?: Record<string, string>): Promise<void> {
    try {
      await fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, data: data || {}, target_role: 'admin' }),
      })
    } catch (error) {
      console.error('Error enviando push:', error)
    }
  },

  urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  },
}
