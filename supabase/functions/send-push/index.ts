// Edge Function: send-push
// Envía notificaciones Web Push a todos los dispositivos de uno o varios roles.
// Desplegada en Supabase (project ifypeslrcdebvdqglywt).
//
// Claves VAPID: el par vive en `platform_secrets` (fila `vapid_keys`), accesible solo con
// la service role. Si no existe, la función lo genera la primera vez que se usa. Nunca está
// en el repo ni en variables de entorno, así que redesplegar no puede borrarlo (eso fue lo
// que dejó esta función en error 500: dependía de un secret que no estaba).
// El cliente pide la clave PÚBLICA con { action: 'public_key' } y se suscribe con ella.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { loadOrCreateVapid, VAPID_ROW_KEY, type VapidKeys, type VapidStore } from './vapid.ts'

const VAPID_SUBJECT = 'mailto:soporte@restaurantos.app'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const jsonHeaders = { ...cors, 'Content-Type': 'application/json' }
const reply = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: jsonHeaders })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

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

let vapidCache: VapidKeys | null = null
async function getVapid(): Promise<VapidKeys> {
  vapidCache ??= await loadOrCreateVapid(store, () => webpush.generateVAPIDKeys())
  return vapidCache
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { action, roles = [], title, body, url = '/', user_ids = [] } = await req.json().catch(() => ({}))

    // Escopar SIEMPRE al restaurante de quien llama — antes esto notificaba a
    // admins/meseros/cocina de TODOS los restaurantes del SaaS, no solo el propio.
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return reply({ error: 'no autenticado' }, 401)

    // El cliente pide la clave pública para suscribir el dispositivo. La privada nunca sale de aquí.
    if (action === 'public_key') {
      const { publicKey } = await getVapid()
      return reply({ publicKey })
    }

    if (!title || !body) return reply({ error: 'title y body requeridos' }, 400)

    const { data: callerProf } = await admin.from('profiles').select('restaurant_id').eq('id', user.id).maybeSingle()
    if (!callerProf?.restaurant_id) return reply({ error: 'sin restaurante' }, 403)

    const roleIds: string[] = []
    if (Array.isArray(roles) && roles.length > 0) {
      const { data: profs } = await admin.from('profiles').select('id')
        .in('role', roles).eq('restaurant_id', callerProf.restaurant_id)
      roleIds.push(...(profs ?? []).map((p: { id: string }) => p.id))
    }

    // user_ids: destinatarios puntuales (ej. el mesero dueño del pedido). Se
    // verifica que pertenezcan al MISMO restaurante del que llama, para que
    // nadie pueda pasar un id de otro restaurante y filtrar una notificación.
    let directIds: string[] = []
    if (Array.isArray(user_ids) && user_ids.length > 0) {
      const { data: verified } = await admin.from('profiles').select('id')
        .in('id', user_ids).eq('restaurant_id', callerProf.restaurant_id)
      directIds = (verified ?? []).map((p: { id: string }) => p.id)
    }

    const ids = [...new Set([...roleIds, ...directIds])]
    if (ids.length === 0) return reply({ sent: 0, reason: 'sin destinatarios' })

    const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', ids)
    const payload = JSON.stringify({ title, body, url })
    const { publicKey, privateKey } = await getVapid()

    let sent = 0
    const dead: string[] = []
    const failed: Record<string, number> = {}
    await Promise.all((subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
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
    if (Object.keys(failed).length) console.error('send-push: envíos fallidos por código', JSON.stringify(failed))

    return reply({ sent, removed: dead.length, failed: Object.values(failed).reduce((a, b) => a + b, 0) })
  } catch (e) {
    console.error('send-push', e)
    return reply({ error: 'No se pudo enviar la notificación' }, 500)
  }
})
