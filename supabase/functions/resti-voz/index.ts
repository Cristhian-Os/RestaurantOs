import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  validarPeticion, pedidoTranscribir, leerTranscripcion, pedidoHablar, leerAudio, crearLectorSse, vocabulario,
  MODELOS_STT_POR_DEFECTO, MODELOS_TTS_POR_DEFECTO, VOZ_POR_DEFECTO, listaModelos, esReintentable,
} from './voz.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Audio-Rate',
}

/** Llamada a Gemini con tiempo límite. El audio y el texto no se guardan ni se registran. */
async function gemini(modelo: string, clave: string, cuerpo: unknown, ms: number) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms)
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave }, body: JSON.stringify(cuerpo),
    })
    return { ok: resp.ok, status: resp.status, data: await resp.json().catch(() => null) }
  } finally { clearTimeout(t) }
}

/** Prueba los modelos en orden hasta que uno responda; solo pasa al siguiente si el fallo es de disponibilidad (404, cupo, 5xx o tiempo agotado). */
async function conRespaldo(modelos: string[], clave: string, cuerpo: unknown, ms: number) {
  let ultimo: { ok: boolean; status: number; data: unknown } = { ok: false, status: 0, data: null }
  for (const m of modelos) {
    try {
      const r = await gemini(m, clave, cuerpo, ms)
      if (r.ok) return r
      ultimo = r; console.error('voz modelo', m, r.status)
      if (!esReintentable(r.status)) break
    } catch { console.error('voz modelo', m, 'sin respuesta a tiempo') }
  }
  return ultimo
}

/**
 * Voz en streaming: abre la respuesta de Gemini y devuelve el audio PCM (16 bits, mono) a medida que llega, así Resti empieza a hablar
 * ~1 s después en vez de esperar a que se genere todo. Prueba los modelos en orden y solo responde cuando ya hay el primer audio.
 */
async function vozEnFlujo(modelos: string[], clave: string, cuerpo: unknown, msTotal: number): Promise<Response | null> {
  for (const m of modelos) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), msTotal)
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:streamGenerateContent?alt=sse`, {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave }, body: JSON.stringify(cuerpo),
      })
      if (!resp.ok || !resp.body) { console.error('voz flujo', m, resp.status); clearTimeout(t); if (!esReintentable(resp.status)) return null; continue }
      const lector = resp.body.getReader(), dec = new TextDecoder(), sse = crearLectorSse()
      let primeros: Uint8Array[] = []
      while (!primeros.length) {
        const { done, value } = await lector.read()
        if (done) { primeros = sse.cerrar(); break }
        primeros = sse.empujar(dec.decode(value, { stream: true }))
      }
      if (!primeros.length) { clearTimeout(t); continue }
      const cuerpoSalida = new ReadableStream<Uint8Array>({
        start(c) { for (const p of primeros) c.enqueue(p) },
        async pull(c) {
          try {
            const { done, value } = await lector.read()
            if (done) { for (const p of sse.cerrar()) c.enqueue(p); clearTimeout(t); c.close(); return }
            for (const p of sse.empujar(dec.decode(value, { stream: true }))) c.enqueue(p)
          } catch { clearTimeout(t); c.close() }
        },
        cancel() { clearTimeout(t); ctl.abort() },
      })
      return new Response(cuerpoSalida, { headers: { ...cors, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Audio-Rate': String(sse.rate()) } })
    } catch { clearTimeout(t); console.error('voz flujo', m, 'sin respuesta a tiempo') }
  }
  return null
}

/** Secretos de la plataforma (clave y modelos de voz): casi nunca cambian, así que se guardan 60 s en la instancia y se evita una consulta por cada frase. */
let secretos: { t: number; v: Record<string, string> } | null = null
async function leerSecretos(admin: { from: (t: string) => any }): Promise<Record<string, string>> {
  if (secretos && Date.now() - secretos.t < 60_000) return secretos.v
  const { data: filas } = await admin.from('platform_secrets').select('key, value').in('key', ['gemini_api_key', 'voz_modelo_stt', 'voz_modelo_tts', 'voz_nombre'])
  const v: Record<string, string> = Object.fromEntries((filas ?? []).map((f: { key: string; value: string }) => [f.key, f.value]))
  if (v.gemini_api_key) secretos = { t: Date.now(), v }
  return v
}
/** Vocabulario del restaurante (platos, sabores, ingredientes): 5 min en la instancia, para no leer 3 tablas en cada frase. */
const cacheVocab = new Map<string, { t: number; v: string }>()

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const peticion = validarPeticion(await req.json().catch(() => null))
    if (!peticion) return json({ error: 'peticion_invalida' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    // Usuario y rol salen de la sesión (nunca del cuerpo): solo el administrador activo de un restaurante.
    // Antes eran 5 consultas una tras otra antes de hablar; ahora la sesión y los secretos van a la vez, y luego el perfil y los topes a la vez.
    const auth = req.headers.get('Authorization') ?? ''
    const [{ data: { user } }, s] = await Promise.all([admin.auth.getUser(auth.replace('Bearer ', '')), leerSecretos(admin)])
    if (!user) return json({ error: 'sin_sesion' }, 401)
    const esEstado = peticion.accion === 'estado'
    const [{ data: prof }, ...topes] = await Promise.all([
      admin.from('profiles').select('role, active, restaurant_id').eq('id', user.id).maybeSingle(),
      // Topes por usuario (costo): ráfaga y día, aparte de los del cerebro.
      ...(esEstado ? [] : [[`rv:${user.id}`, 80, 600], [`rvd:${user.id}`, 600, 86400]].map(([key, max, secs]) => admin.rpc('check_rate_limit', { p_key: key, p_max: max, p_window_seconds: secs }))),
    ])
    if (!prof || prof.active === false || prof.role !== 'admin') return json({ error: 'sin_permiso' }, 403)
    const clave = s.gemini_api_key
    if (!clave) return json({ error: 'sin_proveedor', stt: false, tts: false }, 503)
    if (esEstado) return json({ stt: true, tts: true })
    if (topes.some(({ data: ok }) => ok === false)) return json({ error: 'limite' }, 429)

    if (peticion.accion === 'hablar_stream') {
      const flujo = await vozEnFlujo(listaModelos(s.voz_modelo_tts, MODELOS_TTS_POR_DEFECTO), clave, pedidoHablar(peticion.texto, s.voz_nombre || VOZ_POR_DEFECTO), 25_000)
      return flujo ?? json({ error: 'proveedor' }, 502)
    }

    if (peticion.accion === 'transcribir') {
      // Vocabulario del restaurante (platos, sabores, ingredientes): el oído acierta mucho más con las palabras que de verdad se usan.
      let vocab = ''
      const enVocab = prof.restaurant_id ? cacheVocab.get(prof.restaurant_id) : undefined
      if (enVocab && Date.now() - enVocab.t < 300_000) vocab = enVocab.v
      else if (prof.restaurant_id) {
        try {
          const [{ data: platos }, { data: cfg }, { data: ings }] = await Promise.all([
            admin.from('dishes').select('name').eq('restaurant_id', prof.restaurant_id).limit(120),
            admin.from('restaurant_config').select('modules_enabled').eq('restaurant_id', prof.restaurant_id).maybeSingle(),
            admin.from('ingredientes').select('nombre').eq('restaurant_id', prof.restaurant_id).limit(80),
          ])
          const m = (cfg?.modules_enabled ?? {}) as Record<string, unknown>
          const lista = (v: unknown) => Array.isArray(v) ? v : []
          vocab = vocabulario([...(platos ?? []).map((x: { name: string }) => x.name), ...lista(m.helado_flavors), ...lista(m.jugo_flavors), ...lista(m.toppings), ...(ings ?? []).map((x: { nombre: string }) => x.nombre)])
          cacheVocab.set(prof.restaurant_id, { t: Date.now(), v: vocab })
        } catch { /* sin vocabulario: se transcribe igual */ }
      }
      const r = await conRespaldo(listaModelos(s.voz_modelo_stt, MODELOS_STT_POR_DEFECTO), clave, pedidoTranscribir(peticion.audio, vocab), 10_000)
      if (!r.ok) { console.error('stt', r.status); return json({ error: 'proveedor' }, 502) }
      return json({ texto: leerTranscripcion(r.data) })
    }
    const r = await conRespaldo(listaModelos(s.voz_modelo_tts, MODELOS_TTS_POR_DEFECTO), clave, pedidoHablar(peticion.texto, s.voz_nombre || VOZ_POR_DEFECTO), 14_000)
    if (!r.ok) { console.error('tts', r.status); return json({ error: 'proveedor' }, 502) }
    const audio = leerAudio(r.data)
    return audio ? json(audio) : json({ error: 'sin_audio' }, 502)
  } catch (e) {
    console.error('resti-voz', e instanceof Error ? e.message : 'error')   // solo el mensaje: nunca el audio, el texto ni la clave
    return json({ error: 'error' }, 500)
  }
})
