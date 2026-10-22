import { createClient } from 'jsr:@supabase/supabase-js@2'
import { callModel, cargarProveedor, type Fetch } from '../_shared/modelo.ts'
import { hashIp, ipDe, permitido, registrarUsoIA, topeGlobal } from '../_shared/guardas.ts'
import { armarCarta, agotadosDeConfig, cerrarRespuesta, validarPregunta, mesaValida, sesionValida, diaBogota, SYSTEM, FUERA_DE_TEMA, LIMITE_MESA, SIN_SERVICIO } from './carta.ts'

// Asistente de la carta del menú QR (público, sin sesión). La carta sale de la base en el momento de la pregunta;
// el modelo solo redacta con esos datos. No se guarda la conversación: solo contadores de uso para limitar el costo.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const ipHash = await hashIp(ipDe(req))   // sal propia (IP_HASH_SALT), no la service key
    const dia = diaBogota(), mesa = mesaValida(body?.mesa)
    for (const [key, max, secs] of [
      [`ma:ip:${ipHash}`, 20, 600], [`ma:s:${sesionValida(body?.sesion) ?? ipHash}`, 25, 3600],
      [`ma:m:${rest.id}:${mesa}:${dia}`, 20, 86400], [`ma:r:${rest.id}:${dia}`, 400, 86400],
    ] as const) {
      if (!(await permitido(admin, key, max, secs))) return json({ respuesta: LIMITE_MESA, tema: 'carta', limite: true })   // falla cerrado
    }
    // Tope GLOBAL diario de la función (techo de costo del servicio público).
    if (!(await topeGlobal(admin, 'menu-asistente'))) return json({ respuesta: LIMITE_MESA, tema: 'carta', limite: true })

    // La carta de AHORA: platos a la venta con su estado real, lo agotado por caja y los ingredientes registrados.
    const [{ data: platos }, { data: cfgRest }, { data: recetas }, { data: ings }] = await Promise.all([
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

    const cfg = await cargarProveedor(admin)
    if (!cfg) return json({ respuesta: SIN_SERVICIO, tema: 'carta' })

    // La salida se pide en JSON {tema, respuesta} y se valida abajo: lo que no cumple se descarta (nunca se muestra tal cual).
    const FORMATO = '\n\nResponde únicamente con un objeto JSON: {"tema": "carta" o "fuera", "respuesta": "tu respuesta"}.'
    let salida: { tema?: string; respuesta?: string } = {}
    try {
      const resp = await callModel(cfg, {
        sistema: SYSTEM(String(cfgRest?.display_name ?? rest.name), JSON.stringify(carta), agotadosDeConfig(cfgRest?.modules_enabled)) + FORMATO,
        usuario: pregunta, maxTokens: 400, temperatura: 0.2, timeoutMs: 9000,
      }, fetch as unknown as Fetch)
      await registrarUsoIA(admin, rest.id, 'menu_asistente', resp)
      const t = resp.texto
      try { salida = JSON.parse(t) } catch { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) { try { salida = JSON.parse(t.slice(a, b + 1)) } catch { /* no era JSON */ } } }
    } catch (e) { console.error('proveedor de IA:', e instanceof Error ? e.message : 'error'); return json({ respuesta: SIN_SERVICIO, tema: 'carta' }) }
    if (salida.tema === 'fuera') return json({ respuesta: FUERA_DE_TEMA, tema: 'fuera' })
    if (salida.tema !== 'carta' || typeof salida.respuesta !== 'string') return json({ respuesta: SIN_SERVICIO, tema: 'carta' })
    return json({ respuesta: cerrarRespuesta(pregunta, salida.respuesta), tema: 'carta' })
  } catch (e) {
    console.error(e)
    return json({ respuesta: SIN_SERVICIO, tema: 'carta' })
  }
})
