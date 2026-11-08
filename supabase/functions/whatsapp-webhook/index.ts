// Edge Function: whatsapp-webhook  (PÚBLICA — desplegar con verify_jwt = false)
// ─────────────────────────────────────────────────────────────────────────
// Meta llama aquí:
//   GET  → verificación del webhook (hub.mode / hub.verify_token / hub.challenge).
//   POST → mensajes entrantes y estados de envío. Se acepta SOLO si la firma X-Hub-Signature-256
//          (HMAC-SHA256 con el app_secret de la plataforma) es válida; si no, 401.
// Los secretos viven en Vault y se leen con funciones de servicio; nunca se registran en logs.
// No hay supabase/config.toml en el repo: el flag se pasa al desplegar (--no-verify-jwt).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { textoIgualConstante, verificarFirmaMeta, recortarError } from '../_shared/whatsapp.ts'
import { procesarWebhook, type Cerebro, type Puertos } from '../_shared/whatsapp_nucleo.ts'
import { callModel, cargarProveedor } from '../_shared/modelo.ts'
import { atenderCliente } from '../_shared/bot_cerebro.ts'
import { crearTranscriptor } from '../_shared/bot_audio.ts'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

// Cerebro del bot (entiende al cliente y toma pedidos). Si no hay proveedor de IA configurado queda sin cerebro:
// el bot responde como antes (mensajes fijos) y una persona atiende.
async function cerebro(): Promise<Cerebro | undefined> {
  const proveedor = await cargarProveedor(sb).catch(() => null)
  if (!proveedor) return undefined
  return {
    responder: e => atenderCliente({
      rpc: (n, a) => sb.rpc(n, a) as any,
      modelo: p => callModel(proveedor, p, (...a) => fetch(...a) as any),
      urlBase: Deno.env.get('APP_URL') ?? null,
    }, e),
    transcribir: async (bytes, mime) => {
      const { data } = await sb.from('platform_secrets').select('value').eq('key', 'gemini_api_key').maybeSingle()   // el oído siempre es Gemini (igual que Resti)
      return crearTranscriptor(data?.value ?? '', (...a) => fetch(...a))(bytes, mime)
    },
  }
}

const puertos = async (): Promise<Puertos> => ({
  cerebro: await cerebro(),
  rpc: (nombre, args) => sb.rpc(nombre, args) as any,
  fetch: (...a) => fetch(...a),
  graphBase: Deno.env.get('WA_GRAPH_BASE') ?? 'https://graph.facebook.com',
  subirComprobante: async (ruta, bytes, mime) => {
    const { error } = await sb.storage.from('comprobantes').upload(ruta, bytes, { contentType: mime, upsert: false })
    return error ? recortarError(error.message) : null
  },
})

async function plataforma(): Promise<{ app_secret?: string; verify_token?: string }> {
  const { data } = await sb.rpc('wa_leer_plataforma')
  return (data ?? {}) as { app_secret?: string; verify_token?: string }
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const q = new URL(req.url).searchParams
    const { verify_token } = await plataforma()
    if (q.get('hub.mode') === 'subscribe' && verify_token && textoIgualConstante(q.get('hub.verify_token') ?? '', verify_token)) {
      return new Response(q.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return new Response('forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const crudo = await req.text()
  const { app_secret } = await plataforma()
  if (!app_secret || !(await verificarFirmaMeta(app_secret, crudo, req.headers.get('x-hub-signature-256')))) {
    return new Response('invalid signature', { status: 401 })
  }
  let body: unknown
  try { body = JSON.parse(crudo) } catch { return new Response('bad json', { status: 400 }) }

  // Meta espera 200 rápido: el trabajo sigue en segundo plano. Si algo falla se registra sin datos sensibles.
  const trabajo = puertos().then(p => procesarWebhook(p, body)).catch(e => console.error('whatsapp-webhook', recortarError(e)))
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(trabajo); else await trabajo
  return new Response('ok', { status: 200 })
})
