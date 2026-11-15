// central-telegram: manda avisos de Central a TU Telegram. Solo salida (no recibe órdenes por Telegram: aprobar sigue siendo dentro de Central).
// Solo el dueño con su código de 2 pasos puede usarla. Acciones: probar (mensaje de prueba) · avisar (texto corto tuyo).
// El token del bot y tu chat_id viven SOLO como secretos del servidor (CENTRAL_TELEGRAM_TOKEN, CENTRAL_TELEGRAM_CHAT_ID).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, exigirDueno } from '../_shared/central_acceso.ts'
import { cargarLlaves } from '../_shared/central_llaves.ts'
import { textoBloqueo } from '../central-agente/logica.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const body = await req.json().catch(() => ({}))
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const acceso = await exigirDueno(req, admin as never)
    if (!acceso.ok) return out({ ok: false, error: acceso.codigo, mensaje: textoBloqueo(acceso.codigo) }, acceso.status)

    const llaves = await cargarLlaves(admin)
    const token = llaves.leer('CENTRAL_TELEGRAM_TOKEN'), chat = llaves.leer('CENTRAL_TELEGRAM_CHAT_ID')
    if (!token || !chat) return out({ ok: false, error: 'sin_configurar', mensaje: 'Faltan el token del bot o tu chat_id. Pégalos en Integraciones.' }, 503)

    const texto = body?.accion === 'avisar' && typeof body.texto === 'string'
      ? body.texto.replace(/\s+/g, ' ').trim().slice(0, 500)
      : '✅ RestaurantOS Central: Telegram quedó conectado. Así te llegarán los avisos.'
    if (!texto) return out({ ok: false, error: 'peticion', mensaje: textoBloqueo('peticion') }, 400)

    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: texto, disable_web_page_preview: true }),
    })
    // Nunca se devuelve ni se escribe el cuerpo de la respuesta de Telegram (puede contener datos del bot): solo si salió bien.
    return r.ok ? out({ ok: true }) : out({ ok: false, error: 'telegram_falla', mensaje: `Telegram respondió ${r.status}. Revisa el token y el chat_id.` }, 502)
  } catch {
    return out({ ok: false, error: 'interno', mensaje: 'Algo falló en el servidor. Inténtalo de nuevo.' }, 500)
  }
})
