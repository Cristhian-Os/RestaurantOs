// Edge Function: send-push
// Envía notificaciones Web Push a todos los dispositivos de uno o varios roles.
// Desplegada en Supabase (project ifypeslrcdebvdqglywt).
//
// Claves VAPID: el par vive en `platform_secrets` (fila `vapid_keys`), accesible solo con
// la service role. Si no existe, la función lo genera la primera vez que se usa. Nunca está
// en el repo ni en variables de entorno, así que redesplegar no puede borrarlo (eso fue lo
// que dejó esta función en error 500: dependía de un secret que no estaba).
// El cliente pide la clave PÚBLICA con { action: 'public_key' } y se suscribe con ella.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { deliverPush, makeVapidGetter } from './sender.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const jsonHeaders = { ...cors, 'Content-Type': 'application/json' }
const reply = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: jsonHeaders })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const getVapid = makeVapidGetter(admin)

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

    return reply(await deliverPush(admin, ids, { title, body, url }, getVapid, 'send-push'))
  } catch (e) {
    console.error('send-push', e)
    return reply({ error: 'No se pudo enviar la notificación' }, 500)
  }
})
