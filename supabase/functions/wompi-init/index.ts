// Edge Function: wompi-init  (verify_jwt = false)
// ─────────────────────────────────────────────────────────────────────────
// Inicia un pago y devuelve los parámetros firmados para el Checkout de Wompi.
// La firma de integridad se calcula AQUÍ (server-side) para no exponer el
// secreto de integridad al navegador.
//
//   kind='subscription' → el DUEÑO paga su plan. Requiere JWT (admin del
//        restaurante). Usa las llaves de la PLATAFORMA (platform_secrets) y el
//        monto guardado en subscriptions.amount_in_cents.
//   kind='diner'        → un COMENSAL paga su cuenta. Público (sin login). Usa
//        las llaves del RESTAURANTE (restaurant_payment_config) y el monto real
//        de la orden (RPC order_total_cents, autoritativo — no confía en el cliente).
//
// verify_jwt=false porque el flujo de comensal es anónimo; para suscripción
// validamos el token manualmente con el header Authorization.
//
// Endurecimiento: pedidos pagados o cancelados → 409; order_id UUID y email válidos; `redirect_url` solo https y de un origen
// permitido (APP_ORIGINS, coma-separado; sin configurar, solo el Origin del propio request); el pago PENDIENTE reciente del mismo
// monto (30 min) se reutiliza para no llenar `payments` de basura; el limitador FALLA CERRADO; errores genéricos (el detalle va a
// console.error); CORS acotado a APP_ORIGINS si está definido.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { EMAIL, UUID, ipDe, origenValido, origenesConfigurados, permitido, redirectPermitido, sha256Hex } from '../_shared/guardas.ts'

const REUSO_MS = 30 * 60 * 1000

/** CORS: con APP_ORIGINS solo se refleja un origen de la lista; sin configurar queda abierto como antes (el flujo de comensal es público). */
function corsPara(req: Request): Record<string, string> {
  const h: Record<string, string> = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' }
  if (origenesConfigurados().length === 0) h['Access-Control-Allow-Origin'] = '*'
  else { const o = origenValido(req.headers.get('origin')); if (o) h['Access-Control-Allow-Origin'] = o }
  return h
}

function ref(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
}

Deno.serve(async (req) => {
  const cors = corsPara(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ error: 'solicitud inválida' }, 400)
    const { kind, order_id } = body as { kind?: unknown; order_id?: unknown }
    const currency = 'COP'

    // Email (opcional) y redirect_url (opcional) validados antes de tocar la base.
    const customer_email: string | null = typeof body.customer_email === 'string' && body.customer_email.trim() ? body.customer_email.trim().toLowerCase() : null
    if (body.customer_email != null && (!customer_email || customer_email.length > 254 || !EMAIL.test(customer_email))) return json({ error: 'email no válido' }, 400)
    const redirect_url: string | null = typeof body.redirect_url === 'string' && body.redirect_url ? body.redirect_url : null
    if (body.redirect_url != null && body.redirect_url !== '' && (!redirect_url || !redirectPermitido(redirect_url, req.headers.get('origin')))) return json({ error: 'redirect_url no permitida' }, 400)

    let restaurantId: string
    let amountInCents: number
    let publicKey: string
    let integritySecret: string
    let paymentKind: 'subscription' | 'diner'

    if (kind === 'subscription') {
      // Autenticar al dueño con su JWT
      const authHeader = req.headers.get('Authorization') ?? ''
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await admin.auth.getUser(token)
      if (!user) return json({ error: 'no autenticado' }, 401)
      const { data: prof } = await admin.from('profiles').select('restaurant_id, role, active').eq('id', user.id).maybeSingle()
      if (!prof?.restaurant_id || prof.active === false) return json({ error: 'sin restaurante' }, 403)
      if (prof.role !== 'admin') return json({ error: 'solo el admin puede pagar la suscripción' }, 403)
      restaurantId = prof.restaurant_id as string
      if (!(await permitido(admin, `wompi:u:${user.id}`, 10, 300))) return json({ error: 'Demasiados intentos, espera un momento' }, 429)

      const { data: sub } = await admin.from('subscriptions').select('amount_in_cents').eq('restaurant_id', restaurantId).maybeSingle()
      if (!sub?.amount_in_cents) return json({ error: 'plan sin precio configurado' }, 400)
      amountInCents = sub.amount_in_cents as number

      const { data: pub } = await admin.from('platform_secrets').select('value').eq('key', 'wompi_public_key').maybeSingle()
      const { data: intg } = await admin.from('platform_secrets').select('value').eq('key', 'wompi_integrity_secret').maybeSingle()
      publicKey = (pub?.value as string) ?? Deno.env.get('WOMPI_PUBLIC_KEY') ?? ''
      integritySecret = (intg?.value as string) ?? Deno.env.get('WOMPI_INTEGRITY_SECRET') ?? ''
      paymentKind = 'subscription'

    } else if (kind === 'diner') {
      if (typeof order_id !== 'string' || !UUID.test(order_id)) return json({ error: 'order_id inválido' }, 400)

      // Rate limit (FALLA CERRADO): máx 10 intentos de pago por IP cada 5 min. Sin esto, un script podía llenar la tabla
      // payments de basura o golpear la API de Wompi sin costo; y si la base del limitador fallaba, quedaba abierto.
      if (!(await permitido(admin, `wompi:${ipDe(req)}`, 10, 300))) return json({ error: 'Demasiados intentos, espera un momento' }, 429)

      const { data: order } = await admin.from('orders').select('restaurant_id, status, paid_at').eq('id', order_id).maybeSingle()
      if (!order?.restaurant_id) return json({ error: 'orden no encontrada' }, 404)
      if (order.paid_at || order.status === 'cancelled') return json({ error: 'este pedido ya no admite pago en línea' }, 409)
      restaurantId = order.restaurant_id as string

      // Monto autoritativo desde la orden (RPC en la base). Nunca confiar en el cliente.
      const { data: totalCents, error: rpcErr } = await admin.rpc('order_total_cents', { p_order_id: order_id })
      if (rpcErr || totalCents == null) { if (rpcErr) console.error('wompi-init order_total_cents:', rpcErr.message); return json({ error: 'no se pudo calcular el total de la orden' }, 400) }
      amountInCents = Number(totalCents)

      const { data: cfg } = await admin.from('restaurant_payment_config')
        .select('wompi_public_key, wompi_integrity_secret, enabled').eq('restaurant_id', restaurantId).maybeSingle()
      if (!cfg?.enabled || !cfg?.wompi_public_key) return json({ error: 'este restaurante no tiene pagos en línea activos' }, 400)
      publicKey = cfg.wompi_public_key as string
      integritySecret = (cfg.wompi_integrity_secret as string) ?? ''
      paymentKind = 'diner'

    } else {
      return json({ error: 'kind inválido (subscription|diner)' }, 400)
    }

    if (!publicKey || !integritySecret) return json({ error: 'llaves de Wompi no configuradas todavía' }, 400)
    if (!amountInCents || amountInCents < 100) return json({ error: 'monto inválido' }, 400)

    // Reutilizar el pago PENDIENTE reciente (mismo restaurante, tipo, pedido y monto) para no acumular filas basura.
    let reference = ''
    {
      const desde = new Date(Date.now() - REUSO_MS).toISOString()
      let q = admin.from('payments').select('reference').eq('restaurant_id', restaurantId).eq('kind', paymentKind)
        .eq('status', 'PENDING').eq('amount_in_cents', amountInCents).gte('created_at', desde)
      q = paymentKind === 'diner' ? q.eq('order_id', order_id as string) : q.is('order_id', null)
      const { data: previo } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (previo?.reference) reference = previo.reference as string
    }
    const reutilizado = !!reference
    if (!reutilizado) reference = ref(paymentKind === 'subscription' ? 'sub' : 'ord')
    const integrity = await sha256Hex(`${reference}${amountInCents}${currency}${integritySecret}`)

    // Pago de suscripción: guardar base, IVA y total por separado (las comisiones se calculan sobre la base)
    let desglose: Record<string, number> = {}
    if (paymentKind === 'subscription' && !reutilizado) {
      const { data: d } = await admin.rpc('desglose_cobro', { p_total_cop: amountInCents / 100 })
      if (d) desglose = { base_cop: d.base_cop, iva_cop: d.iva_cop, total_cop: d.total_cop }
    }

    // Registrar el pago PENDIENTE (el webhook lo actualizará al confirmarse)
    const { error: insErr } = reutilizado ? { error: null } : await admin.from('payments').insert({
      restaurant_id:   restaurantId,
      kind:            paymentKind,
      order_id:        paymentKind === 'diner' ? order_id : null,
      reference,
      amount_in_cents: amountInCents,
      currency,
      status:          'PENDING',
      customer_email:  customer_email,
      ...desglose,
    })
    if (insErr) { console.error('wompi-init payments insert:', insErr.message); return json({ error: 'no se pudo iniciar el pago' }, 500) }

    // Parámetros para el Widget/Checkout de Wompi (el frontend abre el checkout)
    return json({
      ok: true,
      publicKey,
      currency,
      amountInCents,
      reference,
      signatureIntegrity: integrity,
      redirectUrl: redirect_url,
      customerEmail: customer_email,
    })
  } catch (e) {
    console.error('wompi-init:', e instanceof Error ? e.message : 'error')
    return json({ error: 'error interno' }, 500)
  }
})
