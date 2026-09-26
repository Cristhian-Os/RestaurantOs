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
function ref(): string { return `sub_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}` }
function apiBase(publicKey: string): string {
  return publicKey.includes('_prod_') ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { card_token, customer_email, charge_now = true } = await req.json()
    if (!card_token || !customer_email) return json({ error: 'card_token y customer_email requeridos' }, 400)

    // Autenticar al admin del restaurante
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return json({ error: 'no autenticado' }, 401)
    const { data: prof } = await admin.from('profiles').select('restaurant_id, role').eq('id', user.id).maybeSingle()
    if (!prof?.restaurant_id) return json({ error: 'sin restaurante' }, 403)
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
    if (!paymentSourceId) return json({ error: 'no se pudo crear el método de pago', detail: ps }, 502)

    // Guardar en la suscripción
    await admin.from('subscriptions').update({
      wompi_payment_source_id: String(paymentSourceId),
      wompi_customer_email:    customer_email,
    }).eq('restaurant_id', restaurantId)

    // 3) Primer cobro inmediato (opcional)
    let firstCharge: any = null
    if (charge_now) {
      const { data: sub } = await admin.from('subscriptions').select('amount_in_cents').eq('restaurant_id', restaurantId).maybeSingle()
      const amount = sub?.amount_in_cents as number
      if (amount && amount >= 100) {
        const reference = ref()
        const integrity = await sha256Hex(`${reference}${amount}COP${integritySecret}`)
        await admin.from('payments').insert({
          restaurant_id: restaurantId, kind: 'subscription', reference,
          amount_in_cents: amount, currency: 'COP', status: 'PENDING', customer_email,
        })
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
    return json({ error: String(e) }, 500)
  }
})
