// Edge Function: whatsapp-enviar  (trabajador de la cola — desplegar con verify_jwt = false)
// ─────────────────────────────────────────────────────────────────────────
// Lo llama un programador (pg_cron + pg_net, cada minuto) con la cabecera x-cron-secret, o alguien con la llave de servicio.
// Cada vuelta: encola los recordatorios a repartidores que tocan, toma los mensajes vencidos de wa_mensajes
// ('en_cola' → 'enviando', sin repetirse aunque haya dos llamadas a la vez) y los manda por la API de Meta.
// El secreto de cron y los tokens nunca se escriben en logs.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { textoIgualConstante, recortarError } from '../_shared/whatsapp.ts'
import { procesarCola } from '../_shared/whatsapp_nucleo.ts'

const llave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const sb = createClient(Deno.env.get('SUPABASE_URL')!, llave, { auth: { persistSession: false } })
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const cron = req.headers.get('x-cron-secret') ?? ''
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  let autorizado = bearer !== '' && textoIgualConstante(bearer, llave)
  if (!autorizado && cron) {
    const { data } = await sb.rpc('wa_leer_plataforma')
    const esperado = (data as { cron_secret?: string } | null)?.cron_secret
    autorizado = !!esperado && textoIgualConstante(cron, esperado)
  }
  if (!autorizado) return json({ error: 'unauthorized' }, 401)

  try {
    const r = await procesarCola({
      rpc: (nombre, args) => sb.rpc(nombre, args) as any,
      fetch: (...a) => fetch(...a),
      graphBase: Deno.env.get('WA_GRAPH_BASE') ?? 'https://graph.facebook.com',
      subirComprobante: async () => 'no aplica',
    }, 20)
    return json(r)
  } catch (e) {
    console.error('whatsapp-enviar', recortarError(e))
    return json({ error: 'fallo interno' }, 500)
  }
})
