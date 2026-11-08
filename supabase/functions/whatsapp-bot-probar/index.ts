// Edge Function: whatsapp-bot-probar  (CON sesión — desplegar con verify_jwt = true)
// ─────────────────────────────────────────────────────────────────────────
// "Probar el bot" desde el panel del administrador, sin Meta ni WhatsApp: corre el MISMO cerebro que el bot real
// sobre una conversación de prueba (marcada es_prueba, invisible en la bandeja). Confirmar un pedido NO crea nada.
//   Petición: { mensaje: string, reiniciar?: boolean }
//   Respuesta: { respuesta, estado, resumen: { items:[{nombre,cantidad,subtotal}], domicilio, total } | null, aviso? }
// El restaurante sale de la sesión (perfil), nunca del cuerpo. Solo admin / super_admin activos.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { callModel, cargarProveedor } from '../_shared/modelo.ts'
import { atenderCliente } from '../_shared/bot_cerebro.ts'
import { recortarError } from '../_shared/whatsapp.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const cuerpo = await req.json().catch(() => null) as { mensaje?: unknown; reiniciar?: unknown } | null
    const reiniciar = cuerpo?.reiniciar === true
    const mensaje = typeof cuerpo?.mensaje === 'string' ? cuerpo.mensaje.trim() : ''
    if (!cuerpo || mensaje.length > 1000 || (!mensaje && !reiniciar)) return json({ error: 'peticion_invalida' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
    if (!user) return json({ error: 'sin_sesion' }, 401)
    const { data: prof } = await admin.from('profiles').select('role, active, restaurant_id').eq('id', user.id).maybeSingle()
    if (!prof || prof.active === false || !['admin', 'super_admin'].includes(prof.role)) return json({ error: 'sin_permiso' }, 403)
    if (!prof.restaurant_id) return json({ error: 'sin_restaurante' }, 400)
    const rid: string = prof.restaurant_id

    const { data: permitido } = await admin.rpc('check_rate_limit', { p_key: `wbp:${user.id}`, p_max: 30, p_window_seconds: 600 })
    if (permitido === false) return json({ error: 'limite' }, 429)

    const { data: pc, error: ep } = await admin.rpc('wa_bot_prueba_conv', { p_rid: rid, p_user: user.id, p_reiniciar: reiniciar })
    if (ep || !pc) return json({ error: 'error' }, 500)
    if (!mensaje) return json({ respuesta: '', estado: 'abierta', resumen: null })

    const proveedor = await cargarProveedor(admin)
    if (!proveedor) return json({ error: 'sin_proveedor' }, 503)

    const { data: mensajeId, error: em } = await admin.rpc('wa_bot_prueba_msg', { p_conv: pc.conversacion_id, p_direccion: 'entrante', p_texto: mensaje })
    if (em) return json({ error: 'error' }, 500)

    const s = await atenderCliente({
      rpc: (n, a) => admin.rpc(n, a) as any,
      modelo: p => callModel(proveedor, p, (...a) => fetch(...a) as any),
      prueba: true,
      urlBase: Deno.env.get('APP_URL') ?? null,
    }, { rid, convId: pc.conversacion_id, telefono: pc.telefono, mensajeId, texto: mensaje })

    for (const t of s.textos) await admin.rpc('wa_bot_prueba_msg', { p_conv: pc.conversacion_id, p_direccion: 'saliente', p_texto: t })
    return json({
      respuesta: s.textos.join('\n\n'), estado: s.estado, resumen: s.resumen,
      ...(s.aviso ? { aviso: s.aviso } : s.estado === 'esperando_humano' ? { aviso: 'El bot pasó la conversación a una persona. Pulsa «Reiniciar» para seguir probando.' } : {}),
    })
  } catch (e) {
    console.error('whatsapp-bot-probar', recortarError(e))   // solo el mensaje: nunca el texto del cliente ni claves
    return json({ error: 'error' }, 500)
  }
})
