// Envío Web Push compartido por `send-push` (personal autenticado) y `notify-order` (menú QR).
// Aquí vive lo común: cargar el par VAPID de `platform_secrets` y entregar a las suscripciones.
import webpush from 'npm:web-push@3.6.7'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { loadOrCreateVapid, VAPID_ROW_KEY, type VapidKeys, type VapidStore } from './vapid.ts'

const VAPID_SUBJECT = 'mailto:soporte@restaurantos.app'

/** Devuelve una función que lee (o crea la primera vez) el par VAPID y lo guarda en memoria. */
export function makeVapidGetter(admin: SupabaseClient): () => Promise<VapidKeys> {
  const store: VapidStore = {
    async read() {
      const { data, error } = await admin.from('platform_secrets').select('value').eq('key', VAPID_ROW_KEY).maybeSingle()
      if (error) throw new Error('No se pudo leer la clave VAPID: ' + error.message)
      return data?.value ?? null
    },
    async insertIfAbsent(value) {
      const { error } = await admin.from('platform_secrets')
        .upsert({ key: VAPID_ROW_KEY, value }, { onConflict: 'key', ignoreDuplicates: true })
      if (error) throw new Error('No se pudo guardar la clave VAPID: ' + error.message)
    },
  }
  let cache: VapidKeys | null = null
  return async () => (cache ??= await loadOrCreateVapid(store, () => webpush.generateVAPIDKeys()))
}

/** Envía `payload` a todas las suscripciones de `userIds`. Borra las muertas (404/410). */
export async function deliverPush(
  admin: SupabaseClient,
  userIds: string[],
  payload: { title: string; body: string; url: string },
  getVapid: () => Promise<VapidKeys>,
  label: string,
): Promise<{ sent: number; removed: number; failed: number }> {
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', userIds)
  const { publicKey, privateKey } = await getVapid()
  const json = JSON.stringify(payload)

  let sent = 0
  const dead: string[] = []
  const failed: Record<string, number> = {}
  await Promise.all((subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        json,
        { vapidDetails: { subject: VAPID_SUBJECT, publicKey, privateKey }, TTL: 3600, urgency: 'high' },
      )
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode
      // 404/410: el dispositivo ya no existe. Con 401/403 (clave distinta) NO se borra: ese
      // dispositivo se vuelve a suscribir solo cuando el usuario abre la app.
      if (code === 404 || code === 410) dead.push(s.endpoint)
      else failed[String(code ?? 'sin_codigo')] = (failed[String(code ?? 'sin_codigo')] ?? 0) + 1
    }
  }))

  if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead)
  if (Object.keys(failed).length) console.error(`${label}: envíos fallidos por código`, JSON.stringify(failed))

  return { sent, removed: dead.length, failed: Object.values(failed).reduce((a, b) => a + b, 0) }
}
