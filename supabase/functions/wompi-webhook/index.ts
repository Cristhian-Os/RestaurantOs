// Edge Function: wompi-webhook  (PÚBLICA — verify_jwt = false)
// ─────────────────────────────────────────────────────────────────────────
// Recibe los eventos de Wompi (transaction.updated) y actualiza:
//   • payments        → estado real de la transacción (fuente de verdad)
//   • orders          → marca la orden como pagada (pago de comensal)
//   • subscriptions   → activa/renueva el plan del restaurante (pago de dueño)
//
// MULTI-COMERCIO: un pago de SUSCRIPCIÓN se verifica con el secreto de eventos
// de la PLATAFORMA (platform_secrets). Un pago de COMENSAL se verifica con el
// secreto de eventos del RESTAURANTE dueño de la orden (restaurant_payment_config),
// porque ese dinero va a la cuenta Wompi de ese restaurante.
//
// Seguridad: NO usa JWT (Wompi no manda JWT). La autenticidad se garantiza
// verificando el checksum SHA-256. Por eso se despliega con verify_jwt=false.
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

function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  try {
    const tx = body?.data?.transaction
    const sig = body?.signature
    const timestamp = body?.timestamp
    if (!tx?.reference || !sig?.properties || !sig?.checksum || timestamp == null) {
      return new Response(JSON.stringify({ ok: true, ignored: 'malformed' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // 1) Localizar el pago por su referencia única (creado en wompi-init/subscribe)
    const { data: payment } = await supabase.from('payments')
      .select('id, restaurant_id, kind, order_id')
      .eq('reference', tx.reference)
      .maybeSingle()
    if (!payment) {
      return new Response(JSON.stringify({ ok: true, ignored: 'unknown reference' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

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
    if (!eventsSecret || expected.toLowerCase() !== String(sig.checksum).toLowerCase()) {
      return new Response(JSON.stringify({ error: 'invalid signature' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // 4) Registrar el estado real de la transacción (fuente de verdad)
    const status: string = tx.status                       // APPROVED | DECLINED | VOIDED | ERROR
    await supabase.from('payments').update({
      status,
      wompi_transaction_id: tx.id ?? null,
      payment_method_type:  tx.payment_method_type ?? null,
      customer_email:       tx.customer_email ?? null,
      raw:                  body,
    }).eq('id', payment.id)

    // 5) Efectos de negocio si fue aprobada
    if (status === 'APPROVED') {
      if (payment.kind === 'subscription') {
        const now = new Date()
        const periodEnd = new Date(now); periodEnd.setMonth(periodEnd.getMonth() + 1)
        await supabase.from('subscriptions').update({
          status:               'active',
          current_period_start: now.toISOString(),
          current_period_end:   periodEnd.toISOString(),
          grace_ends_at:        null,
          purge_at:             null,
        }).eq('restaurant_id', payment.restaurant_id)
      } else if (payment.kind === 'diner' && payment.order_id) {
        try {
          await supabase.rpc('mark_order_paid', {
            p_order_id: payment.order_id,
            p_method:   tx.payment_method_type ?? 'ONLINE',
            p_tx_id:    tx.id ?? null,
          })
        } catch (_) { /* si la RPC aún no existe, el pago queda en payments igual */ }
      }
    }

    return new Response(JSON.stringify({ ok: true, status }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
