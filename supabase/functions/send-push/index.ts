// Edge Function: send-push
// Envía notificaciones Web Push a todos los dispositivos de uno o varios roles.
// Desplegada en Supabase (project ifypeslrcdebvdqglywt).
//
// NOTA DE SEGURIDAD: en el despliegue real, VAPID_PRIVATE está embebida en la
// función (server-side, nunca expuesta al cliente). En este archivo del repo
// se lee de variable de entorno para NO filtrar la llave privada al repo público.
// Si rediespliegas desde aquí, define el secret VAPID_PRIVATE_KEY o vuelve a
// embeber la llave en el deploy (no la subas al repo).
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const VAPID_PUBLIC  = 'BGY-1TXDcSOVLs_Ll7sT5c9sTnSuuGz_3H-rFZL8zOc9QCVdzgtryAUldNeM8LAqM8mmxIDJwW2wVo23EFeRXjs'
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

webpush.setVapidDetails('mailto:soporte@restaurantos.app', VAPID_PUBLIC, VAPID_PRIVATE)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { roles = [], title, body, url = '/' } = await req.json()
    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title y body requeridos' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: profs } = await supabase.from('profiles').select('id').in('role', roles)
    const ids = (profs ?? []).map((p: { id: string }) => p.id)
    if (ids.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'sin destinatarios' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const { data: subs } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', ids)
    const payload = JSON.stringify({ title, body, url })

    let sent = 0
    const dead: string[] = []
    await Promise.all((subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        sent++
      } catch (e: any) {
        const code = e?.statusCode
        if (code === 404 || code === 410) dead.push(s.endpoint)
      }
    }))

    if (dead.length) await supabase.from('push_subscriptions').delete().in('endpoint', dead)

    return new Response(JSON.stringify({ sent, removed: dead.length }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
