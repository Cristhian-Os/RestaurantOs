// Edge Function: wompi-webhook  (PÚBLICA — verify_jwt = false)
// ─────────────────────────────────────────────────────────────────────────
// Recibe los eventos de Wompi (transaction.updated) y los aplica con UNA sola RPC atómica e idempotente:
//   procesar_pago_wompi(...)  → verifica monto/moneda, APPROVED es terminal, marca el pedido pagado
//                               (pago de comensal) o renueva la suscripción (pago de dueño) una sola vez.
//
// Autenticidad en TRES capas:
//   1) Checksum SHA-256 del evento, comparado en TIEMPO CONSTANTE, con el secreto de eventos que corresponde
//      (plataforma para suscripciones, restaurante para pagos de comensal). Sin secreto configurado → 401.
//   2) Lista blanca mínima en signature.properties: transaction.id, transaction.status y transaction.amount_in_cents
//      deben ir firmados; si falta alguna → 401 (si no, se podría alterar el valor no firmado).
//   3) Confirmación contra Wompi (GET /transactions/{id} con la llave privada): referencia, monto, moneda y estado
//      deben coincidir. La `reference` NO va en la firma de Wompi: sin esta capa, cambiarla en el cuerpo firmado
//      serviría para pagar otro pedido. Si Wompi no responde se devuelve 500 para que reintente.
//
// Es server-to-server: sin CORS. Errores genéricos hacia afuera; el detalle solo va a console.error.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { iguales, sha256Hex } from '../_shared/guardas.ts'

const REQUERIDAS = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents']
const PROP_OK = /^[a-z_]+(\.[a-z_]+){0,3}$/i

const getPath = (obj: any, path: string): unknown => path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)
const apiBase = (llave: string) => (llave.includes('_prod_') ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1')

const respuesta = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: any
  try { body = await req.json() } catch { return respuesta({ error: 'solicitud inválida' }, 400) }

  try {
    const tx = body?.data?.transaction
    const sig = body?.signature
    const timestamp = body?.timestamp
    if (!tx || typeof tx.reference !== 'string' || typeof tx.id !== 'string' || typeof tx.status !== 'string'
      || !Array.isArray(sig?.properties) || typeof sig?.checksum !== 'string' || timestamp == null) {
      return respuesta({ ok: true, ignored: 'malformed' })
    }

    // Lista blanca mínima de propiedades firmadas (y formato sano de cada una).
    const props: string[] = sig.properties
    if (props.length > 20 || props.some((p) => typeof p !== 'string' || !PROP_OK.test(p)) || REQUERIDAS.some((p) => !props.includes(p))) {
      console.error('wompi-webhook: propiedades firmadas insuficientes')
      return respuesta({ error: 'no autorizado' }, 401)
    }

    // 1) Localizar el pago por su referencia única (creado en wompi-init / wompi-subscribe / wompi-charge)
    const { data: payment, error: ePay } = await supabase.from('payments')
      .select('id, restaurant_id, kind, order_id').eq('reference', tx.reference).maybeSingle()
    if (ePay) { console.error('wompi-webhook payments:', ePay.message); return respuesta({ error: 'error interno' }, 500) }
    if (!payment) return respuesta({ ok: true, ignored: 'unknown reference' })

    // 2) Secretos según el tipo de pago: eventos (firma) y llave privada (confirmación)
    let eventsSecret = '', privateKey = ''
    if (payment.kind === 'subscription') {
      const { data } = await supabase.from('platform_secrets').select('key, value').in('key', ['wompi_events_secret', 'wompi_private_key'])
      const m = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]))
      eventsSecret = (m['wompi_events_secret'] as string) || Deno.env.get('WOMPI_EVENTS_SECRET') || ''
      privateKey = (m['wompi_private_key'] as string) || Deno.env.get('WOMPI_PRIVATE_KEY') || ''
    } else {
      const { data } = await supabase.from('restaurant_payment_config').select('wompi_events_secret, wompi_private_key').eq('restaurant_id', payment.restaurant_id).maybeSingle()
      eventsSecret = (data?.wompi_events_secret as string) || ''
      privateKey = (data?.wompi_private_key as string) || ''
    }
    if (!eventsSecret) { console.error('wompi-webhook: sin secreto de eventos para', payment.kind); return respuesta({ error: 'no autorizado' }, 401) }

    // 3) Checksum en tiempo constante
    const concatenado = props.map((p) => String(getPath(body.data, p) ?? '')).join('') + String(timestamp) + eventsSecret
    const esperado = await sha256Hex(concatenado)
    if (!iguales(esperado, String(sig.checksum).toLowerCase())) return respuesta({ error: 'no autorizado' }, 401)

    // 4) Confirmar el evento con Wompi (la referencia del cuerpo no está firmada)
    if (!privateKey) { console.error('wompi-webhook: sin llave privada para confirmar'); return respuesta({ error: 'error interno' }, 500) }
    let real: any
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000)
      try {
        const r = await fetch(`${apiBase(privateKey)}/transactions/${encodeURIComponent(tx.id)}`, { headers: { Authorization: `Bearer ${privateKey}` }, signal: ctl.signal })
        if (!r.ok) { console.error('wompi-webhook: Wompi respondió', r.status); return respuesta({ error: 'no se pudo confirmar' }, 500) }
        real = (await r.json())?.data
      } finally { clearTimeout(t) }
    } catch (e) {
      console.error('wompi-webhook: sin respuesta de Wompi', e instanceof Error ? e.message : 'error')
      return respuesta({ error: 'no se pudo confirmar' }, 500)
    }
    if (!real || real.reference !== tx.reference || Number(real.amount_in_cents) !== Number(tx.amount_in_cents) || real.currency !== tx.currency) {
      console.error('wompi-webhook: el evento no coincide con Wompi (referencia/monto/moneda)', tx.id)
      return respuesta({ error: 'no autorizado' }, 401)
    }
    if (real.status !== tx.status) {
      // El estado cambió entre el evento y la consulta: Wompi enviará otro evento; este se reintenta después.
      console.error('wompi-webhook: estado distinto', tx.id, tx.status, real.status)
      return respuesta({ error: 'estado en transición' }, 409)
    }

    // 5) Aplicar con la RPC atómica e idempotente (verifica monto/moneda contra el pago registrado)
    const { error } = await supabase.rpc('procesar_pago_wompi', {
      p_reference: tx.reference,
      p_tx_id: tx.id,
      p_status: real.status,
      p_amount_cents: Number(real.amount_in_cents),
      p_currency: real.currency,
      p_method_type: tx.payment_method_type ?? null,
      p_email: tx.customer_email ?? null,
      p_raw: body,
    })
    if (error) { console.error('wompi-webhook procesar_pago_wompi:', error.message); return respuesta({ error: 'error interno' }, 500) }

    return respuesta({ ok: true })
  } catch (e) {
    console.error('wompi-webhook:', e instanceof Error ? e.message : 'error')
    return respuesta({ error: 'error interno' }, 500)
  }
})
