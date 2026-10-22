// Edge Function: wompi-subscribe  (verify_jwt = false — valida el JWT a mano)
// ─────────────────────────────────────────────────────────────────────────
// Habilita el COBRO AUTOMÁTICO mensual: recibe un token de tarjeta (tok_...)
// generado por el widget de Wompi en el navegador, crea un "payment source"
// reutilizable y lo guarda en la suscripción. Opcionalmente hace el primer
// cobro de una vez. Los cobros siguientes los hace el cron (wompi-charge).
//
// IDEMPOTENCIA: la referencia del cobro es DETERMINISTA (restaurante + día de Bogotá, la misma que usa wompi-charge); si ya hay un
// intento hoy el INSERT falla con 23505 y no se vuelve a cobrar. Antes de cobrar se consulta suscripcion_puede_cobrar().
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { EMAIL, sha256Hex } from '../_shared/guardas.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const diaBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).replaceAll('-', '')
// sub_<restaurante>_<día>_<n>: n cuenta los intentos del día (un rechazo no impide reintentar hoy con otra tarjeta;
// el tope de reintentos lo pone suscripcion_puede_cobrar y la carrera entre dos intentos la frena el UNIQUE de reference).
const ref = async (db: any, restaurantId: string) => {
  const base = `sub_${restaurantId}_${diaBogota()}`
  const { count } = await db.from('payments').select('id', { count: 'exact', head: true }).like('reference', `${base}_%`)
  return `${base}_${(count ?? 0) + 1}`
}
const CARD_TOKEN = /^tok_[A-Za-z0-9_]{6,120}$/
function apiBase(publicKey: string): string {
  return publicKey.includes('_prod_') ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { card_token, customer_email: emailCrudo, charge_now = true } = await req.json().catch(() => ({}))
    const customer_email = typeof emailCrudo === 'string' ? emailCrudo.trim().toLowerCase() : ''
    if (typeof card_token !== 'string' || !CARD_TOKEN.test(card_token) || !EMAIL.test(customer_email) || customer_email.length > 254) {
      return json({ error: 'card_token o customer_email no válidos' }, 400)
    }

    // Autenticar al admin del restaurante
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return json({ error: 'no autenticado' }, 401)
    const { data: prof } = await admin.from('profiles').select('restaurant_id, role, active').eq('id', user.id).maybeSingle()
    if (!prof?.restaurant_id || prof.active === false) return json({ error: 'sin restaurante' }, 403)
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
    const merchant = await merchantResp.json().catch(() => null)
    const acceptanceToken = merchant?.data?.presigned_acceptance?.acceptance_token
    if (!acceptanceToken) return json({ error: 'no se pudo obtener acceptance_token' }, 502)

    // 2) Crear el payment source (tarjeta reutilizable)
    const psResp = await fetch(`${base}/payment_sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${privateKey}` },
      body: JSON.stringify({ type: 'CARD', token: card_token, customer_email, acceptance_token: acceptanceToken }),
    })
    const ps = await psResp.json().catch(() => null)
    const paymentSourceId = ps?.data?.id
    if (!paymentSourceId) {
      console.error('wompi-subscribe: payment_source rechazado', psResp.status, JSON.stringify(ps?.error ?? null).slice(0, 300))
      return json({ error: 'no se pudo crear el método de pago' }, 502)
    }

    // Guardar en la suscripción
    await admin.from('subscriptions').update({
      wompi_payment_source_id: String(paymentSourceId),
      wompi_customer_email:    customer_email,
    }).eq('restaurant_id', restaurantId)

    // 3) Primer cobro inmediato (opcional)
    let firstCharge: { transaction_id: string | null; status: string | null } | null = null
    let cobro: 'cobrado' | 'omitido' | 'rechazado' | null = null
    if (charge_now === true) {
      const { data: sub } = await admin.from('subscriptions').select('amount_in_cents').eq('restaurant_id', restaurantId).maybeSingle()
      const amount = sub?.amount_in_cents as number
      if (Number.isInteger(amount) && amount >= 100) {
        // La base decide si hoy corresponde cobrar; cualquier cosa distinta de true no cobra.
        const { data: puede, error: ePuede } = await admin.rpc('suscripcion_puede_cobrar', { p_restaurant_id: restaurantId })
        if (ePuede) console.error('wompi-subscribe suscripcion_puede_cobrar:', ePuede.message)
        if (ePuede || puede !== true) cobro = 'omitido'
        else {
          const reference = await ref(admin, restaurantId)
          const integrity = await sha256Hex(`${reference}${amount}COP${integritySecret}`)
          const { data: d } = await admin.rpc('desglose_cobro', { p_total_cop: amount / 100 })
          const { error: eIns } = await admin.from('payments').insert({
            restaurant_id: restaurantId, kind: 'subscription', reference,
            amount_in_cents: amount, currency: 'COP', status: 'PENDING', customer_email,
            base_cop: d?.base_cop, iva_cop: d?.iva_cop, total_cop: d?.total_cop,
          })
          if (eIns) {
            // 23505 = ya hay un intento de cobro hoy: no se cobra otra vez.
            if (eIns.code !== '23505') console.error('wompi-subscribe payments insert:', eIns.message)
            cobro = 'omitido'
          } else {
            const txResp = await fetch(`${base}/transactions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${privateKey}` },
              body: JSON.stringify({
                amount_in_cents: amount, currency: 'COP', customer_email,
                payment_source_id: paymentSourceId, reference, recurrent: true, signature: integrity,
              }),
            })
            const tx = await txResp.json().catch(() => null)
            const txId = tx?.data?.id ?? null
            if (!txResp.ok || !txId) {
              console.error('wompi-subscribe: Wompi rechazó el cobro', txResp.status)
              await admin.from('payments').update({ status: 'ERROR', raw: tx }).eq('reference', reference).eq('status', 'PENDING')
              cobro = 'rechazado'
            } else {
              await admin.from('payments').update({ wompi_transaction_id: txId, raw: tx }).eq('reference', reference).eq('status', 'PENDING')
              firstCharge = { transaction_id: String(txId), status: tx?.data?.status ?? null }   // el resultado final lo confirma wompi-webhook
              cobro = 'cobrado'
            }
          }
        }
      }
    }

    return json({ ok: true, payment_source_id: String(paymentSourceId), first_charge: firstCharge, charge: cobro })
  } catch (e) {
    console.error('wompi-subscribe:', e instanceof Error ? e.message : 'error')
    return json({ error: 'error interno' }, 500)
  }
})
