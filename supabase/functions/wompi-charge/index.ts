// Edge Function: wompi-charge  (verify_jwt = false — protegida por secreto propio)
// ─────────────────────────────────────────────────────────────────────────
// Cobro mensual recurrente de las suscripciones. La invoca el cron diario
// (pg_cron + pg_net) enviando el header  x-cron-secret. Por cada suscripción
// vencida con tarjeta guardada, crea una transacción recurrente en Wompi.
// El resultado final (APPROVED/DECLINED) lo confirma wompi-webhook.
//
// Las transiciones de estado por fechas (past_due, mora, borrado) las hace la
// función SQL enforce_subscription_lifecycle(); aquí SOLO se intenta cobrar.
//
// IDEMPOTENCIA: la referencia es DETERMINISTA (restaurante + día de Bogotá) y payments.reference es único: si el cron
// corre dos veces el mismo día (o wompi-subscribe ya cobró hoy), el segundo INSERT falla con 23505 y ese restaurante se omite.
// Antes de cobrar se consulta la RPC suscripcion_puede_cobrar(restaurante) (service_role).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { iguales, sha256Hex } from '../_shared/guardas.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

/** Día calendario de Bogotá (YYYYMMDD). */
const diaBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).replaceAll('-', '')
const ref = (restaurantId: string) => `sub_${restaurantId}_${diaBogota()}`
// sandbox vs producción según el prefijo de la llave pública
function apiBase(publicKey: string): string {
  return publicKey.includes('_prod_') ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Autorización propia: solo el cron (con el secreto) puede disparar cobros
  const cronSecret = Deno.env.get('CRON_SECRET') ?? (await admin.from('platform_secrets').select('value').eq('key', 'cron_secret').maybeSingle()).data?.value
  if (!cronSecret || !iguales(req.headers.get('x-cron-secret') ?? '', String(cronSecret))) {
    return json({ error: 'no autorizado' }, 401)
  }

  try {
    // Llaves de la plataforma
    const secrets = await admin.from('platform_secrets').select('key, value')
      .in('key', ['wompi_public_key', 'wompi_private_key', 'wompi_integrity_secret'])
    const map = Object.fromEntries((secrets.data ?? []).map((r: any) => [r.key, r.value]))
    const publicKey = map['wompi_public_key'] ?? Deno.env.get('WOMPI_PUBLIC_KEY') ?? ''
    const privateKey = map['wompi_private_key'] ?? Deno.env.get('WOMPI_PRIVATE_KEY') ?? ''
    const integritySecret = map['wompi_integrity_secret'] ?? Deno.env.get('WOMPI_INTEGRITY_SECRET') ?? ''
    if (!publicKey || !privateKey || !integritySecret) return json({ error: 'llaves de plataforma no configuradas' }, 400)

    const base = apiBase(publicKey)
    const nowIso = new Date().toISOString()

    // Suscripciones vencidas, no promo, con tarjeta guardada
    const { data: due } = await admin.from('subscriptions')
      .select('restaurant_id, amount_in_cents, wompi_payment_source_id, wompi_customer_email, status, current_period_end, trial_ends_at')
      .in('status', ['active', 'past_due', 'trialing'])
      .eq('is_promo', false)
      .not('wompi_payment_source_id', 'is', null)

    const eligible = (due ?? []).filter((s: any) => {
      const end = s.current_period_end ?? s.trial_ends_at
      return end && new Date(end) <= new Date(nowIso) && s.amount_in_cents && s.wompi_customer_email
    })

    const results: any[] = []
    for (const s of eligible) {
      const reference = ref(s.restaurant_id)
      const amount = s.amount_in_cents as number
      if (!Number.isInteger(amount) || amount < 100) continue

      // La base decide si hoy toca cobrar (estado, fechas, pagos recientes). Fallo o respuesta distinta de true → no se cobra.
      const { data: puede, error: ePuede } = await admin.rpc('suscripcion_puede_cobrar', { p_restaurant_id: s.restaurant_id })
      if (ePuede || puede !== true) {
        if (ePuede) console.error('wompi-charge suscripcion_puede_cobrar:', ePuede.message)
        results.push({ restaurant_id: s.restaurant_id, skipped: ePuede ? 'error' : 'no_corresponde' })
        continue
      }
      const integrity = await sha256Hex(`${reference}${amount}COP${integritySecret}`)

      // Registrar el intento como PENDING (con base, IVA y total por separado). Referencia duplicada = ya se intentó hoy: se omite.
      const { data: d } = await admin.rpc('desglose_cobro', { p_total_cop: amount / 100 })
      const { error: eIns } = await admin.from('payments').insert({
        restaurant_id: s.restaurant_id, kind: 'subscription', reference,
        amount_in_cents: amount, currency: 'COP', status: 'PENDING',
        customer_email: s.wompi_customer_email,
        base_cop: d?.base_cop, iva_cop: d?.iva_cop, total_cop: d?.total_cop,
      })
      if (eIns) {
        if (eIns.code === '23505') { results.push({ restaurant_id: s.restaurant_id, skipped: 'ya_intentado_hoy' }); continue }
        console.error('wompi-charge payments insert:', eIns.message)
        results.push({ restaurant_id: s.restaurant_id, error: 'no_registrado' })
        continue
      }

      try {
        const resp = await fetch(`${base}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${privateKey}` },
          body: JSON.stringify({
            amount_in_cents: amount,
            currency: 'COP',
            customer_email: s.wompi_customer_email,
            payment_source_id: s.wompi_payment_source_id,
            reference,
            recurrent: true,
            signature: integrity,
          }),
        })
        const jr = await resp.json().catch(() => null)
        const txId = jr?.data?.id ?? null
        if (!resp.ok || !txId) {
          // Wompi rechazó la petición: no habrá webhook, así que el intento se cierra como ERROR (el cron lo reintenta mañana).
          console.error('wompi-charge: Wompi rechazó el cobro', s.restaurant_id, resp.status)
          await admin.from('payments').update({ status: 'ERROR', raw: jr }).eq('reference', reference).eq('status', 'PENDING')
          results.push({ restaurant_id: s.restaurant_id, error: 'rechazado_por_wompi' })
          continue
        }
        await admin.from('payments').update({ wompi_transaction_id: txId, raw: jr }).eq('reference', reference).eq('status', 'PENDING')
        results.push({ restaurant_id: s.restaurant_id, txId })
      } catch (e) {
        console.error('wompi-charge:', s.restaurant_id, e instanceof Error ? e.message : 'error')
        await admin.from('payments').update({ status: 'ERROR', raw: { error: 'sin_respuesta' } }).eq('reference', reference).eq('status', 'PENDING')
        results.push({ restaurant_id: s.restaurant_id, error: 'sin_respuesta' })
      }
    }

    return json({ ok: true, attempted: results.length, results })
  } catch (e) {
    console.error('wompi-charge:', e instanceof Error ? e.message : 'error')
    return json({ error: 'error interno' }, 500)
  }
})
