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

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function ref(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { kind, order_id, customer_email, redirect_url } = await req.json()
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
      const { data: prof } = await admin.from('profiles').select('restaurant_id, role').eq('id', user.id).maybeSingle()
      if (!prof?.restaurant_id) return json({ error: 'sin restaurante' }, 403)
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
      if (!order_id) return json({ error: 'order_id requerido' }, 400)
      // Monto autoritativo desde la orden (RPC en la base). Nunca confiar en el cliente.
      const { data: totalCents, error: rpcErr } = await admin.rpc('order_total_cents', { p_order_id: order_id })
      if (rpcErr || totalCents == null) return json({ error: 'no se pudo calcular el total de la orden' }, 400)
      amountInCents = Number(totalCents)

      const { data: order } = await admin.from('orders').select('restaurant_id').eq('id', order_id).maybeSingle()
      if (!order?.restaurant_id) return json({ error: 'orden no encontrada' }, 404)
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

    // Crear la referencia y firmar la integridad
    const reference = ref(paymentKind === 'subscription' ? 'sub' : 'ord')
    const integrity = await sha256Hex(`${reference}${amountInCents}${currency}${integritySecret}`)

    // Registrar el pago PENDIENTE (el webhook lo actualizará al confirmarse)
    const { error: insErr } = await admin.from('payments').insert({
      restaurant_id:   restaurantId,
      kind:            paymentKind,
      order_id:        paymentKind === 'diner' ? order_id : null,
      reference,
      amount_in_cents: amountInCents,
      currency,
      status:          'PENDING',
      customer_email:  customer_email ?? null,
    })
    if (insErr) return json({ error: insErr.message }, 500)

    // Parámetros para el Widget/Checkout de Wompi (el frontend abre el checkout)
    return json({
      ok: true,
      publicKey,
      currency,
      amountInCents,
      reference,
      signatureIntegrity: integrity,
      redirectUrl: redirect_url ?? null,
      customerEmail: customer_email ?? null,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
