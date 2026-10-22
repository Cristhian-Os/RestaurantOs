// Edge Function: wompi-webhook  (PÚBLICA — verify_jwt = false)
// ─────────────────────────────────────────────────────────────────────────
// Recibe los eventos de Wompi (transaction.updated) y los aplica con el RPC
// procesar_pago_wompi, que en UNA transacción de base de datos:
//   • verifica monto y moneda contra lo que se firmó al iniciar el pago,
//   • actualiza payments (fuente de verdad) sin pisar un APPROVED ya registrado,
//   • marca el pedido como pagado (pago de comensal) o renueva la suscripción
//     (pago de dueño) UNA sola vez, aunque Wompi reintente el mismo evento.
//
// MULTI-COMERCIO: un pago de SUSCRIPCIÓN se verifica con el secreto de eventos
// de la PLATAFORMA (platform_secrets). Un pago de COMENSAL se verifica con el
// secreto de eventos del RESTAURANTE dueño de la orden (restaurant_payment_config),
// porque ese dinero va a la cuenta Wompi de ese restaurante.
//
// Seguridad: NO usa JWT (Wompi no manda JWT). La autenticidad se garantiza
// verificando el checksum SHA-256 (comparación en tiempo constante). Por eso se
// despliega con verify_jwt=false. Es server-to-server: no expone CORS.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)
}

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
function iguales(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: any
  try { body = await req.json() } catch {
    return json({ error: 'invalid json' }, 400)
  }

  try {
    const tx = body?.data?.transaction
    const sig = body?.signature
    const timestamp = body?.timestamp
    if (!tx?.reference || !Array.isArray(sig?.properties) || !sig?.checksum || timestamp == null) {
      return json({ ok: true, ignored: 'malformed' })
    }

    // 1) Localizar el pago por su referencia única (creado en wompi-init/subscribe/charge)
    const { data: payment } = await supabase.from('payments')
      .select('id, restaurant_id, kind, order_id')
      .eq('reference', tx.reference)
      .maybeSingle()
    if (!payment) return json({ ok: true, ignored: 'unknown reference' })

    // 2) Elegir el secreto de eventos correcto según el tipo de pago
    let eventsSecret = ''
    if (payment.kind === 'subscription') {
      const { data } = await supabase.from('platform_secrets').select('value').eq('key', 'wompi_events_secret').maybeSingle()
      eventsSecret = (data?.value as string) ?? Deno.env.get('WOMPI_EVENTS_SECRET') ?? ''
    } else {
      const { data } = await supabase.from('restaurant_payment_config').select('wompi_events_secret').eq('restaurant_id', payment.restaurant_id).maybeSingle()
      eventsSecret = (data?.wompi_events_secret as string) ?? ''
    }

    // 3) Verificar autenticidad (checksum). Sin secreto configurado → rechazar.
    const concatenated = sig.properties.map((p: string) => String(getPath(body.data, p) ?? '')).join('') + String(timestamp) + eventsSecret
    const expected = await sha256Hex(concatenated)
    if (!eventsSecret || !iguales(expected.toLowerCase(), String(sig.checksum).toLowerCase())) {
      return json({ error: 'invalid signature' }, 401)
    }

    // 4) Aplicar el evento de forma atómica e idempotente. Wompi reintenta eventos (y puede entregarlos
    //    fuera de orden): el RPC ignora los repetidos y nunca degrada un pago ya APROBADO.
    //    No se rechaza por antigüedad del timestamp justamente porque Wompi reintenta durante horas.
    const amount = Number(tx.amount_in_cents)
    const { data: res, error } = await supabase.rpc('procesar_pago_wompi', {
      p_reference: tx.reference,
      p_tx_id: tx.id ?? null,
      p_status: String(tx.status ?? ''),
      p_amount_cents: Number.isFinite(amount) ? Math.round(amount) : null,
      p_currency: tx.currency ?? null,
      p_method_type: tx.payment_method_type ?? null,
      p_email: tx.customer_email ?? null,
      p_raw: body,
    })
    if (error) {
      // 500 → Wompi vuelve a intentar más tarde.
      console.error('wompi-webhook: procesar_pago_wompi falló', error.message)
      return json({ error: 'internal' }, 500)
    }

    // Casos que requieren revisión humana: quedan en los logs de la función y anotados en payments.raw.
    if (res?.result === 'amount_mismatch' || res?.result === 'voided_after_approval' || res?.order?.status === 'underpaid') {
      console.error('wompi-webhook: revisar pago', tx.reference, JSON.stringify(res))
    }

    return json({ ok: true, result: res?.result ?? null })
  } catch (e) {
    console.error('wompi-webhook', e)
    return json({ error: 'internal' }, 500)
  }
})
