// Edge Function: wompi-charge  (verify_jwt = false — protegida por secreto propio)
// ─────────────────────────────────────────────────────────────────────────
// Cobro mensual recurrente de las suscripciones. La invoca el cron diario
// (pg_cron + pg_net) enviando el header  x-cron-secret. Por cada suscripción
// vencida con tarjeta guardada, crea una transacción recurrente en Wompi.
// El resultado final (APPROVED/DECLINED) lo confirma wompi-webhook.
//
// Las transiciones de estado por fechas (past_due, mora, borrado) las hace la
// función SQL enforce_subscription_lifecycle(); aquí SOLO se intenta cobrar.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}
function ref(): string { return `sub_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}` }
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
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
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
      const reference = ref()
      const amount = s.amount_in_cents as number
      const integrity = await sha256Hex(`${reference}${amount}COP${integritySecret}`)

      // Registrar el intento como PENDING
      await admin.from('payments').insert({
        restaurant_id: s.restaurant_id, kind: 'subscription', reference,
        amount_in_cents: amount, currency: 'COP', status: 'PENDING',
        customer_email: s.wompi_customer_email,
      })

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
        const jr = await resp.json()
        const txId = jr?.data?.id ?? null
        await admin.from('payments').update({ wompi_transaction_id: txId, raw: jr }).eq('reference', reference)
        results.push({ restaurant_id: s.restaurant_id, reference, txId, http: resp.status })
      } catch (e) {
        await admin.from('payments').update({ status: 'ERROR', raw: { error: String(e) } }).eq('reference', reference)
        results.push({ restaurant_id: s.restaurant_id, reference, error: String(e) })
      }
    }

    return json({ ok: true, attempted: results.length, results })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
