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
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Orígenes de la app permitidos (APP_ORIGINS="https://app.ejemplo.com,https://otro.com"). Sin configurar, se acepta el
// origen de quien llama (misma página) para no romper el despliegue; el redirect_url siempre debe ser de ese origen.
const APP_ORIGINS = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean)

function corsFor(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const allow = APP_ORIGINS.length === 0 ? '*' : (APP_ORIGINS.includes(origin) ? origin : APP_ORIGINS[0])
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

/** Devuelve la URL de retorno solo si es https (o localhost) y del origen de la app; si no, null. */
function redirectSeguro(raw: unknown, req: Request): string | null {
  if (typeof raw !== 'string' || raw.length > 500) return null
  try {
    const u = new URL(raw)
    const esLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !(esLocal && u.protocol === 'http:')) return null
    const permitidos = APP_ORIGINS.length > 0 ? APP_ORIGINS : [req.headers.get('Origin') ?? '']
    return permitidos.includes(u.origin) ? u.toString() : null
  } catch { return null }
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function ref(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const reqBody = await req.json().catch(() => ({}))
    const { kind, order_id } = reqBody
    const customer_email: string | null = typeof reqBody.customer_email === 'string' && EMAIL_RE.test(reqBody.customer_email.trim()) && reqBody.customer_email.length <= 120
      ? reqBody.customer_email.trim() : null
    const redirect_url = redirectSeguro(reqBody.redirect_url, req)
    const currency = 'COP'

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
      if (!prof?.restaurant_id || !prof.active) return json({ error: 'sin restaurante' }, 403)
      if (prof.role !== 'admin') return json({ error: 'solo el admin puede pagar la suscripción' }, 403)
      restaurantId = prof.restaurant_id as string

      const { data: sub } = await admin.from('subscriptions').select('amount_in_cents').eq('restaurant_id', restaurantId).maybeSingle()
      if (!sub?.amount_in_cents) return json({ error: 'plan sin precio configurado' }, 400)
      amountInCents = sub.amount_in_cents as number

      const { data: pub } = await admin.from('platform_secrets').select('value').eq('key', 'wompi_public_key').maybeSingle()
      const { data: intg } = await admin.from('platform_secrets').select('value').eq('key', 'wompi_integrity_secret').maybeSingle()
      publicKey = (pub?.value as string) ?? Deno.env.get('WOMPI_PUBLIC_KEY') ?? ''
      integritySecret = (intg?.value as string) ?? Deno.env.get('WOMPI_INTEGRITY_SECRET') ?? ''
      paymentKind = 'subscription'

    } else if (kind === 'diner') {
      if (typeof order_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id)) {
        return json({ error: 'order_id requerido' }, 400)
      }

      // Rate limit: máx 10 intentos de pago por IP cada 5 min. Sin esto,
      // un script podía llenar la tabla payments de basura o golpear la
      // API de Wompi repetidamente sin ningún costo para el atacante.
      const xff = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
      const ip = req.headers.get('cf-connecting-ip') ?? (xff || 'sin-ip')
      const { data: withinLimit } = await admin.rpc('check_rate_limit', { p_key: `wompi:${ip}`, p_max: 10, p_window_seconds: 300 })
      // Falla cerrado: si el contador no responde, no se crea ningún pago.
      if (withinLimit !== true) return json({ error: 'Demasiados intentos, espera un momento' }, 429)
      // Monto autoritativo desde la orden (RPC en la base). Nunca confiar en el cliente.
      const { data: totalCents, error: rpcErr } = await admin.rpc('order_total_cents', { p_order_id: order_id })
      if (rpcErr || totalCents == null) return json({ error: 'no se pudo calcular el total de la orden' }, 400)
      amountInCents = Number(totalCents)

      const { data: order } = await admin.from('orders').select('restaurant_id, status, paid_at').eq('id', order_id).maybeSingle()
      if (!order?.restaurant_id) return json({ error: 'orden no encontrada' }, 404)
      if (order.status === 'cancelled') return json({ error: 'este pedido fue cancelado' }, 409)
      if (order.paid_at) return json({ error: 'este pedido ya está pagado' }, 409)
      restaurantId = order.restaurant_id as string

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

    // Reutilizar el intento PENDIENTE reciente del mismo monto (reintentos y doble clic no llenan la tabla de basura).
    let reference = ''
    {
      let q = admin.from('payments').select('reference').eq('restaurant_id', restaurantId).eq('kind', paymentKind)
        .eq('status', 'PENDING').eq('amount_in_cents', amountInCents)
        .gt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      q = paymentKind === 'diner' ? q.eq('order_id', order_id) : q.is('order_id', null)
      const { data: previo } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (previo?.reference) reference = previo.reference as string
    }

    if (!reference) {
      reference = ref(paymentKind === 'subscription' ? 'sub' : 'ord')
      // Registrar el pago PENDIENTE (el webhook lo actualizará al confirmarse)
      const { error: insErr } = await admin.from('payments').insert({
        restaurant_id:   restaurantId,
        kind:            paymentKind,
        order_id:        paymentKind === 'diner' ? order_id : null,
        reference,
        amount_in_cents: amountInCents,
        currency,
        status:          'PENDING',
        customer_email:  customer_email,
      })
      if (insErr) {
        console.error('wompi-init: no se pudo registrar el pago', insErr.message)
        return json({ error: 'No se pudo iniciar el pago' }, 500)
      }
    }
    const integrity = await sha256Hex(`${reference}${amountInCents}${currency}${integritySecret}`)

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
    console.error('wompi-init', e)
    return json({ error: 'No se pudo iniciar el pago' }, 500)
  }
})
