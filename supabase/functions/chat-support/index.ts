import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `Eres "Resti", el asistente de soporte de RestaurantOS, un sistema en la nube de gestión para restaurantes.

Qué hace RestaurantOS: menú digital con código QR, toma de pedidos, control de mesas, inventario y recetas (descuenta ingredientes solo), panel de cocina en tiempo real, caja y corte de caja en Excel (con productos, cantidades y método de pago), métricas de ventas, y gestión del equipo (mesero, cocina, cajero).

Planes (USD/mes): Basic $79 (elige tus mesas, menú QR, pedidos, inventario básico, recetas, corte en Excel, 1 admin, pagos en línea, soporte estándar), Normal $135 (todo Basic + mesas y equipo ilimitados, inventario avanzado, cocina en tiempo real, tareas, métricas, soporte prioritario), Premium $220 (todo Normal + multi-sucursal, personalización total de marca, soporte prioritario 24/7). Los pagos en línea para que tus clientes paguen por la app están incluidos en TODOS los planes. Todos incluyen 7 días de prueba gratis, sin tarjeta.

Promoción de lanzamiento: los primeros 3 restaurantes obtienen Premium GRATIS de por vida (cupos ya ocupados).

Cómo empezar: botón "Comienza gratis" o "Registra tu restaurante" en la página; se crea la cuenta en menos de un minuto y se obtiene un dominio propio y menú. También hay un botón "Ver demo" para probar sin registrarse.

Pagos: la facturación es mensual. Si un pago se atrasa hay 7 días de gracia; si no se paga, se pierde el acceso y los datos se eliminan (esto está en los términos).

Reglas: responde en español, con tono cálido, claro y breve. Ayuda con dudas de uso y de venta. Si no sabes algo o piden soporte técnico avanzado, sugiere escribir al correo de soporte. No inventes funciones que no existen. No pidas ni manejes contraseñas ni datos de tarjetas.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const body = await req.json().catch(() => ({}))
    const messages: Array<{ role?: string; text?: string }> = Array.isArray(body?.messages) ? body.messages : []

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Rate limit: máx 20 mensajes por IP cada 10 min. Cada mensaje cuesta
    // dinero real (llamada a Gemini) — sin esto, un script podía generar
    // una factura sorpresa sin que hubiera ni un cliente real detrás.
    const xff = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    const ip = req.headers.get('cf-connecting-ip') ?? (xff || 'sin-ip')
    const { data: withinLimit } = await supabase.rpc('check_rate_limit', { p_key: `chat:${ip}`, p_max: 20, p_window_seconds: 600 })
    if (withinLimit === false) return json({ reply: 'Has enviado muchos mensajes seguidos. Espera unos minutos e intenta de nuevo.' }, 429)

    const { data: secret } = await supabase
      .from('platform_secrets').select('value').eq('key', 'gemini_api_key').single()
    const apiKey = secret?.value
    if (!apiKey) return json({ error: 'Config faltante' }, 500)

    const contents = messages.slice(-12).map((m) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(m.text ?? '').slice(0, 2000) }],
    })).filter((c) => c.parts[0].text.length > 0)

    if (contents.length === 0) return json({ reply: '¡Hola! Soy Resti 👋 ¿En qué te ayudo con RestaurantOS?' })

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig: { maxOutputTokens: 600, temperature: 0.4 },
        }),
      },
    )
    const data = await resp.json()
    if (!resp.ok) {
      console.error('Gemini error', JSON.stringify(data))
      return json({ reply: 'Ahora mismo no puedo responder. Intenta de nuevo en un momento.' })
    }
    const reply = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '').join('').trim()
      || 'No pude generar una respuesta. ¿Puedes reformular tu pregunta?'

    // Log para que el super-admin pueda revisar quejas/dudas reales del chatbot.
    // Best-effort: si falla el insert, no debe romper la respuesta al usuario.
    const lastUserMessage = contents.filter((c) => c.role === 'user').at(-1)?.parts[0]?.text ?? ''
    supabase.from('platform_chat_logs').insert({
      user_message: lastUserMessage,
      bot_reply: reply,
      ip,
    }).then(({ error }) => { if (error) console.error('chat log insert failed', error) })

    return json({ reply })
  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
