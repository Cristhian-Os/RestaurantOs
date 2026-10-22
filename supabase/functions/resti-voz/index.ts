import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  validarPeticion, pedidoTranscribir, leerTranscripcion, pedidoHablar, leerAudio,
  MODELO_STT_POR_DEFECTO, MODELO_TTS_POR_DEFECTO, VOZ_POR_DEFECTO,
} from './voz.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const peticion = validarPeticion(await req.json().catch(() => null))
    if (!peticion) return json({ error: 'peticion_invalida' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    // Usuario y rol salen de la sesión (nunca del cuerpo): solo el administrador activo de un restaurante.
    const auth = req.headers.get('Authorization') ?? ''
    const { data: { user } } = await admin.auth.getUser(auth.replace('Bearer ', ''))
    if (!user) return json({ error: 'sin_sesion' }, 401)
    const { data: prof } = await admin.from('profiles').select('role, active').eq('id', user.id).maybeSingle()
    if (!prof || prof.active === false || prof.role !== 'admin') return json({ error: 'sin_permiso' }, 403)

    const { data: filas } = await admin.from('platform_secrets').select('key, value').in('key', ['gemini_api_key', 'voz_modelo_stt', 'voz_modelo_tts', 'voz_nombre'])
    const s: Record<string, string> = Object.fromEntries((filas ?? []).map((f: { key: string; value: string }) => [f.key, f.value]))
    const clave = s.gemini_api_key
    if (!clave) return json({ error: 'sin_proveedor', stt: false, tts: false }, 503)
    if (peticion.accion === 'estado') return json({ stt: true, tts: true })

    // Topes por usuario (costo): ráfaga y día, aparte de los del cerebro.
    for (const [key, max, secs] of [[`rv:${user.id}`, 40, 600], [`rvd:${user.id}`, 400, 86400]] as const) {
      const { data: ok } = await admin.rpc('check_rate_limit', { p_key: key, p_max: max, p_window_seconds: secs })
      if (ok === false) return json({ error: 'limite' }, 429)
    }

    if (peticion.accion === 'transcribir') {
      const r = await gemini(s.voz_modelo_stt || MODELO_STT_POR_DEFECTO, clave, pedidoTranscribir(peticion.audio), 12_000)
      if (!r.ok) { console.error('stt', r.status); return json({ error: 'proveedor' }, 502) }
      return json({ texto: leerTranscripcion(r.data) })
    }
    const r = await gemini(s.voz_modelo_tts || MODELO_TTS_POR_DEFECTO, clave, pedidoHablar(peticion.texto, s.voz_nombre || VOZ_POR_DEFECTO), 20_000)
    if (!r.ok) { console.error('tts', r.status); return json({ error: 'proveedor' }, 502) }
    const audio = leerAudio(r.data)
    return audio ? json(audio) : json({ error: 'sin_audio' }, 502)
  } catch (e) {
    console.error('resti-voz', e instanceof Error ? e.message : 'error')   // solo el mensaje: nunca el audio, el texto ni la clave
    return json({ error: 'error' }, 500)
  }
})
