// Edge Function: wompi-subscribe  (verify_jwt = false — valida el JWT a mano)
// ─────────────────────────────────────────────────────────────────────────
// Habilita el COBRO AUTOMÁTICO mensual: recibe un token de tarjeta (tok_...)
// generado por el widget de Wompi en el navegador, crea un "payment source"
// reutilizable y lo guarda en la suscripción. Opcionalmente hace el primer
// cobro de una vez. Los cobros siguientes los hace el cron (wompi-charge).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}
// Referencia determinista por restaurante y día (payments.reference es único): un doble clic no cobra dos veces.
function ref(restaurantId: string): string {
  return `subnow_${restaurantId.replace(/-/g, '').slice(0, 12)}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
}
function apiBase(publicKey: string): string {
  return publicKey.includes('_prod_') ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { card_token, customer_email, charge_now = true } = await req.json()
    if (typeof card_token !== 'string' || typeof customer_email !== 'string' || !/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(customer_email.trim())) {
      return json({ error: 'card_token y customer_email válidos requeridos' }, 400)
    }

    // Autenticar al admin del restaurante
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return json({ error: 'no autenticado' }, 401)
    const { data: prof } = await admin.from('profiles').select('restaurant_id, role, active').eq('id', user.id).maybeSingle()
    if (!prof?.restaurant_id || !prof.active) return json({ error: 'sin restaurante' }, 403)
    if (prof.role !== 'admin') return json({ error: 'solo el admin' }, 403)
    const restaurantId = prof.restaurant_id as string

    // Llaves de la plataforma
    const secrets = await admin.from('platform_secrets').select('key, value')
      .in('key', ['wompi_public_key', 'wompi_private_key', 'wompi_integrity_secret'])
    const map = Object.fromEntries((secrets.data ?? []).map((r: any) => [r.key, r.value]))
    const publicKey = map['wompi_public_key'] ?? ''
    const privateKey = map['wompi_private_key'] ?? ''
    const integritySecret = map['wompi_integrity_secret'] ?? ''
    if (!publicKey || !privateKey || !integritySecret) return json({ error: 'llaves de plataforma no configuradas' }, 400)
    const base = apiBase(publicKey)

    // 1) Obtener el acceptance_token del comercio
    const merchantResp = await fetch(`${base}/merchants/${publicKey}`)
    const merchant = await merchantResp.json()
    const acceptanceToken = merchant?.data?.presigned_acceptance?.acceptance_token
    if (!acceptanceToken) return json({ error: 'no se pudo obtener acceptance_token' }, 502)

    // 2) Crear el payment source (tarjeta reutilizable)
    const psResp = await fetch(`${base}/payment_sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${privateKey}` },
      body: JSON.stringify({ type: 'CARD', token: card_token, customer_email, acceptance_token: acceptanceToken }),
    })
    const ps = await psResp.json()
    const paymentSourceId = ps?.data?.id
    if (!paymentSourceId) {
      console.error('wompi-subscribe: payment_source rechazado', JSON.stringify(ps).slice(0, 500))
      return json({ error: 'no se pudo crear el método de pago' }, 502)
    }

    // Guardar en la suscripción
    await admin.from('subscriptions').update({
      wompi_payment_source_id: String(paymentSourceId),
      wompi_customer_email:    customer_email,
    }).eq('restaurant_id', restaurantId)

    // 3) Primer cobro inmediato (opcional)
    let firstCharge: any = null
    // No cobra si ya hay un pago aprobado/pendiente reciente o demasiados rechazos (suscripcion_puede_cobrar).
    const { data: puedeCobrar } = charge_now
      ? await admin.rpc('suscripcion_puede_cobrar', { p_restaurant_id: restaurantId })
      : { data: false }
    if (charge_now && puedeCobrar === true) {
      const { data: sub } = await admin.from('subscriptions').select('amount_in_cents').eq('restaurant_id', restaurantId).maybeSingle()
      const amount = sub?.amount_in_cents as number
      if (amount && amount >= 100) {
        const reference = ref(restaurantId)
        const integrity = await sha256Hex(`${reference}${amount}COP${integritySecret}`)
        const { error: insErr } = await admin.from('payments').insert({
          restaurant_id: restaurantId, kind: 'subscription', reference,
          amount_in_cents: amount, currency: 'COP', status: 'PENDING', customer_email,
        })
        if (insErr) {
          // Referencia duplicada = ya se intentó hoy: se responde sin cobrar de nuevo.
          return json({ ok: true, payment_source_id: paymentSourceId, first_charge: null, note: 'ya hay un cobro de hoy' })
        }
        const txResp = await fetch(`${base}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${privateKey}` },
          body: JSON.stringify({
            amount_in_cents: amount, currency: 'COP', customer_email,
            payment_source_id: paymentSourceId, reference, recurrent: true, signature: integrity,
          }),
        })
        firstCharge = await txResp.json()
        await admin.from('payments').update({ wompi_transaction_id: firstCharge?.data?.id ?? null, raw: firstCharge }).eq('reference', reference)
      }
    }

    return json({ ok: true, payment_source_id: paymentSourceId, first_charge: firstCharge })
  } catch (e) {
    console.error('wompi-subscribe', e)
    return json({ error: 'No se pudo activar el cobro automático' }, 500)
  }
})
