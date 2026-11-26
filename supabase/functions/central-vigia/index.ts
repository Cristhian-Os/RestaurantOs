// central-vigia: revisa la plataforma con datos REALES (restaurantes, suscripciones, pedidos, opiniones de usuarios y errores que la app registra de sí misma),
// convierte lo que encuentra en tareas propuestas para el agente responsable y te avisa por Telegram solo de lo NUEVO.
// No escribe nada en los restaurantes ni contacta a nadie: solo lee y crea tareas en Central (estado "propuesta", nivel N0).
// Quién puede llamarla: el dueño con su código de 2 pasos (botón "Revisar ahora") o la programación automática (cabecera secreta).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, exigirDueno } from '../_shared/central_acceso.ts'
import { cargarLlaves } from '../_shared/central_llaves.ts'
import { evaluar, resumenTelegram, type Datos } from './logica.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const secretoRecibido = req.headers.get('x-vigia-secreto') ?? ''
    let autorizado = false
    if (secretoRecibido) {
      const { data } = await admin.from('platform_secrets').select('value').eq('key', 'central_vigia_secreto').maybeSingle()
      autorizado = !!data?.value && data.value === secretoRecibido
    }
    if (!autorizado) {
      const acceso = await exigirDueno(req, admin as never)
      if (!acceso.ok) return out({ ok: false, error: acceso.codigo, mensaje: 'Solo el dueño con su código de 2 pasos puede usar esto.' }, acceso.status)
    }

    const ahora = new Date()
    const desde = new Date(ahora.getTime() - 3 * 86_400_000).toISOString()
    const [rest, subs, ped, ops, errs] = await Promise.all([
      admin.from('restaurants').select('id, name, active, created_at, trial_ends_at'),
      admin.from('subscriptions').select('restaurant_id, status, current_period_end, trial_ends_at, created_at').order('created_at', { ascending: false }),
      admin.from('orders').select('restaurant_id').neq('status', 'cancelled').gte('created_at', desde).limit(20000),
      admin.from('feedback_items').select('numero, titulo, urgencia, created_at, tipo').eq('estado', 'nuevo').limit(200),
      // Errores de la app (si la tabla aún no está instalada, simplemente no hay): no frena la revisión del resto.
      admin.from('app_errores').select('huella, origen, mensaje, ruta, veces, estado, primera_vez, ultima_vez').eq('estado', 'nuevo').order('veces', { ascending: false }).limit(100),
    ])
    if (rest.error || subs.error || ped.error || ops.error) return out({ ok: false, error: 'lectura', mensaje: 'No se pudieron leer los datos de la plataforma.' }, 500)

    type Sub = { restaurant_id: string; status: string; current_period_end: string | null; trial_ends_at: string | null }
    const ultimaSub = new Map<string, Sub>()
    for (const s of (subs.data ?? []) as Sub[]) if (!ultimaSub.has(s.restaurant_id)) ultimaSub.set(s.restaurant_id, s)
    const pedidosPorRestaurante: Record<string, number> = {}
    for (const o of (ped.data ?? []) as { restaurant_id: string }[]) pedidosPorRestaurante[o.restaurant_id] = (pedidosPorRestaurante[o.restaurant_id] ?? 0) + 1

    const datos: Datos = {
      ahora, restaurantes: (rest.data ?? []) as Datos['restaurantes'], suscripciones: [...ultimaSub.values()],
      pedidosPorRestaurante, opiniones: (ops.data ?? []) as Datos['opiniones'],
      errores: errs.error ? [] : (errs.data ?? []) as Datos['errores'],
    }
    const hallazgos = evaluar(datos)

    // No repetir: una tarea abierta con la misma clave (guardada en la descripción) ya cuenta.
    const { data: abiertas } = await admin.from('central_tareas').select('descripcion').not('estado', 'in', '(completada,cancelada,rechazada)').like('descripcion', '%[vigia:%')
    const yaHay = new Set(((abiertas ?? []) as { descripcion: string }[]).map(t => /\[vigia:([^\]]+)\]/.exec(t.descripcion)?.[1]).filter(Boolean))
    const nuevos = hallazgos.filter(h => !yaHay.has(h.clave))

    const creados: typeof nuevos = []
    for (const h of nuevos) {
      const { error } = await admin.from('central_tareas').insert({
        titulo: h.titulo.slice(0, 160), descripcion: `${h.detalle}\n[vigia:${h.clave}]`.slice(0, 4000), solicitante_tipo: 'agente', solicitante_id: 'ronda',
        responsable_agente_id: h.agente, departamento_id: h.departamento, prioridad: h.prioridad, estado: 'propuesta', nivel_requerido: 'N0',
      })
      if (!error) creados.push(h)
    }
    // Los errores que ya se volvieron tarea pasan a "visto": no se repiten. Si uno resuelto vuelve a ocurrir, la base lo reabre como "nuevo".
    const vistos = creados.filter(h => h.clave.startsWith('error:')).map(h => h.clave.slice('error:'.length))
    if (vistos.length) await admin.from('app_errores').update({ estado: 'visto' }).in('huella', vistos).eq('estado', 'nuevo')

    let telegram: 'enviado' | 'sin_novedades' | 'sin_configurar' | 'falla' = 'sin_novedades'
    if (creados.length > 0) {
      const llaves = await cargarLlaves(admin)
      const token = llaves.leer('CENTRAL_TELEGRAM_TOKEN'), chat = llaves.leer('CENTRAL_TELEGRAM_CHAT_ID')
      if (!token || !chat) telegram = 'sin_configurar'
      else {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: resumenTelegram(creados, hallazgos.length), disable_web_page_preview: true }) })
        telegram = r.ok ? 'enviado' : 'falla'
      }
    }
    return out({ ok: true, vigilados: { restaurantes: datos.restaurantes.length, opiniones_nuevas: datos.opiniones.length }, hallazgos: hallazgos.length, tareas_creadas: creados.length, ya_estaban: hallazgos.length - nuevos.length, telegram })
  } catch {
    return out({ ok: false, error: 'interno', mensaje: 'Algo falló en el servidor. Inténtalo de nuevo.' }, 500)
  }
})
