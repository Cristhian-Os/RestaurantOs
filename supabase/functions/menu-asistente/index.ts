import { createClient } from 'jsr:@supabase/supabase-js@2'
import { armarCarta, agotadosDeConfig, cerrarRespuesta, validarPregunta, mesaValida, sesionValida, diaBogota, SYSTEM, RESPUESTA_SCHEMA, FUERA_DE_TEMA, LIMITE_MESA, SIN_SERVICIO } from './carta.ts'

// Asistente de la carta del menú QR (público, sin sesión). La carta sale de la base en el momento de la pregunta;
// el modelo solo redacta con esos datos. No se guarda la conversación: solo contadores de uso para limitar el costo.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const body = await req.json().catch(() => ({}))
    const pregunta = validarPregunta(body?.pregunta)
    if (!pregunta) return json({ respuesta: '¿Qué quieres saber de la carta?', tema: 'carta' })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Restaurante: por slug o por id, solo si está activo (misma función pública que usa el menú).
    const slug = typeof body?.slug === 'string' && /^[a-z0-9-]{1,80}$/.test(body.slug) ? body.slug : null
    const rid = typeof body?.restaurant_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.restaurant_id) ? body.restaurant_id : null
    if (!slug && !rid) return json({ respuesta: SIN_SERVICIO, tema: 'carta' }, 400)
    const { data: rest } = await admin.rpc('restaurante_publico', slug ? { p_slug: slug } : { p_id: rid }).maybeSingle<{ id: string; name: string }>()
    if (!rest?.id) return json({ respuesta: SIN_SERVICIO, tema: 'carta' }, 404)

    // Límites de costo (solo contadores, sin guardar texto): por IP, por sesión, por mesa y día, y por restaurante y día.
    const xff = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    const ipHash = (await sha256Hex((req.headers.get('cf-connecting-ip') ?? (xff || 'sin-ip')) + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))).slice(0, 16)
    const dia = diaBogota(), mesa = mesaValida(body?.mesa)
    for (const [key, max, secs] of [
      [`ma:ip:${ipHash}`, 20, 600], [`ma:s:${sesionValida(body?.sesion) ?? ipHash}`, 25, 3600],
      [`ma:m:${rest.id}:${mesa}:${dia}`, 20, 86400], [`ma:r:${rest.id}:${dia}`, 400, 86400],
    ] as const) {
      const { data: ok } = await admin.rpc('check_rate_limit', { p_key: key, p_max: max, p_window_seconds: secs })
      if (ok === false) return json({ respuesta: LIMITE_MESA, tema: 'carta', limite: true })
    }

    // La carta de AHORA: platos a la venta con su estado real, lo agotado por caja y los ingredientes registrados.
    const [{ data: platos }, { data: cfg }, { data: recetas }, { data: ings }] = await Promise.all([
      admin.from('dishes').select('id, name, description, price, category, availability_status, tags, sizes')
        .eq('restaurant_id', rest.id).eq('available', true).neq('availability_status', 'discontinued').order('sort_order').order('name').limit(200),
      admin.from('restaurant_config').select('display_name, modules_enabled').eq('restaurant_id', rest.id).maybeSingle(),
      admin.from('recetas').select('producto_id, ingrediente_id').eq('restaurant_id', rest.id).limit(3000),
      admin.from('ingredientes').select('id, nombre').eq('restaurant_id', rest.id).limit(1000),
    ])
    if (!platos?.length) return json({ respuesta: 'Todavía no hay platos cargados en la carta.', tema: 'carta' })
    const nombre = new Map((ings ?? []).map(i => [i.id as string, String(i.nombre)]))
    const porPlato = new Map<string, string[]>()
    for (const r of recetas ?? []) { const n = nombre.get(r.ingrediente_id as string); if (n) porPlato.set(r.producto_id as string, [...(porPlato.get(r.producto_id as string) ?? []), n]) }
    const carta = armarCarta(platos as never, porPlato)

    const { data: secret } = await admin.from('platform_secrets').select('value').eq('key', 'gemini_api_key').single()
    if (!secret?.value) return json({ respuesta: SIN_SERVICIO, tema: 'carta' })

    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000)
    let resp: Response
    try {
      resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(secret.value) },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM(String(cfg?.display_name ?? rest.name), JSON.stringify(carta), agotadosDeConfig(cfg?.modules_enabled)) }] },
          contents: [{ role: 'user', parts: [{ text: pregunta }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.2, responseMimeType: 'application/json', responseSchema: RESPUESTA_SCHEMA, thinkingConfig: { thinkingBudget: 0 } },   // sin "pensamiento" extra: no se come el límite y no corta el JSON
        }),
      })
    } catch { return json({ respuesta: SIN_SERVICIO, tema: 'carta' }) } finally { clearTimeout(t) }
    const data = await resp.json().catch(() => null)
    if (!resp.ok) { console.error('Gemini error', resp.status); return json({ respuesta: SIN_SERVICIO, tema: 'carta' }) }

    let salida: { tema?: string; respuesta?: string } = {}
    try { salida = JSON.parse(data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '') } catch { /* no era JSON */ }
    if (salida.tema === 'fuera') return json({ respuesta: FUERA_DE_TEMA, tema: 'fuera' })
    if (salida.tema !== 'carta' || typeof salida.respuesta !== 'string') return json({ respuesta: SIN_SERVICIO, tema: 'carta' })
    return json({ respuesta: cerrarRespuesta(pregunta, salida.respuesta), tema: 'carta' })
  } catch (e) {
    console.error(e)
    return json({ respuesta: SIN_SERVICIO, tema: 'carta' })
  }
})
