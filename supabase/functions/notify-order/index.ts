// Edge Function: notify-order
// Avisa por push a cocina y admin de UN pedido del menú QR público. El cliente (anónimo) solo
// manda `order_id`: el texto y los destinatarios los decide el servidor leyendo el pedido, y
// solo se notifica al personal del restaurante DEL PEDIDO. Una sola vez por pedido.
// Desplegada con verify_jwt = true (la anon key sirve); NO exige sesión de personal.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { deliverPush, makeVapidGetter } from '../send-push/sender.ts'
import { buildMessage, cutoffIso, evaluateOrder, type OrderRow } from './logic.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const getVapid = makeVapidGetter(admin)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REASON_STATUS = { not_public: 403, too_old: 410, already_notified: 409 } as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { order_id } = await req.json().catch(() => ({}))
    if (typeof order_id !== 'string' || !UUID.test(order_id)) return reply({ error: 'order_id inválido' }, 400)

    const { data: order } = await admin.from('orders')
      .select('restaurant_id, user_id, tipo_pedido, status, created_at, push_notified_at, table_num, customer_name')
      .eq('id', order_id).maybeSingle()
    if (!order) return reply({ error: 'pedido no encontrado' }, 404)

    const now = Date.now()
    const verdict = evaluateOrder(order as OrderRow, now)
    if (verdict !== 'ok') return reply({ sent: 0, reason: verdict }, REASON_STATUS[verdict])

    // Tope por restaurante, antes de reclamar el pedido para que un rechazo se pueda reintentar.
    const { data: allowed } = await admin.rpc('check_rate_limit', {
      p_key: `notify-order:${order.restaurant_id}`, p_max: 30, p_window_seconds: 60,
    })
    if (allowed !== true) return reply({ sent: 0, reason: 'rate_limited' }, 429)

    // Reclamo atómico: solo una llamada puede pasar de NULL a now(); las demás (repetidas o
    // simultáneas) no actualizan ninguna fila. Repite las condiciones por si cambió algo.
    const { data: claimed, error: claimErr } = await admin.from('orders')
      .update({ push_notified_at: new Date(now).toISOString() })
      .eq('id', order_id).is('push_notified_at', null).is('user_id', null)
      .eq('tipo_pedido', 'LOCAL').eq('status', 'pending').gt('created_at', cutoffIso(now))
      .select('id')
    if (claimErr) throw claimErr
    if (!claimed?.length) return reply({ sent: 0, reason: 'already_notified' }, 409)

    try {
      const { data: staff } = await admin.from('profiles').select('id')
        .eq('restaurant_id', order.restaurant_id).in('role', ['kitchen', 'admin'])
      const ids = (staff ?? []).map((p: { id: string }) => p.id)
      if (ids.length === 0) return reply({ sent: 0, recipients: 0, reason: 'sin destinatarios' })

      const { title, body } = buildMessage(order)
      const r = await deliverPush(admin, ids, { title, body, url: '/' }, getVapid, 'notify-order')
      return reply({ ...r, recipients: ids.length })
    } catch (e) {
      // El envío reventó: se libera el reclamo para que se pueda reintentar dentro de la ventana.
      await admin.from('orders').update({ push_notified_at: null }).eq('id', order_id)
      throw e
    }
  } catch (e) {
    console.error('notify-order', e)
    return reply({ error: 'No se pudo enviar la notificación' }, 500)
  }
})
