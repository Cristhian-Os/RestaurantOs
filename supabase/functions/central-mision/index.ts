// central-mision: la misión del día del fundador (7:00 a. m.) y el cierre (7:30 p. m.), hora de Colombia.
// Decide POR REGLAS (sin IA, sin costo) con datos reales de Crecimiento. No contacta a nadie ni escribe en restaurantes.
// Modo "manana": crea la misión de hoy si no existe (una por día). Modo "cierre": guarda el resumen real del día y avisa por Telegram.
// Quién puede llamarla: el dueño con 2 pasos (botón "Generar ahora") o la programación automática (cabecera secreta).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, exigirDueno } from '../_shared/central_acceso.ts'
import { cargarLlaves } from '../_shared/central_llaves.ts'
import { elegirMision, textoCierre, textoManana, type Cierre } from './logica.ts'

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' })

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
    const body = await req.json().catch(() => ({})) as { modo?: string }
    const modo = body.modo === 'cierre' ? 'cierre' : 'manana'

    const ahora = new Date()
    const hoy = new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10) // día en Colombia (UTC-5 fijo)
    const iniDia = `${hoy}T05:00:00.000Z`
    const finDia = new Date(new Date(iniDia).getTime() + 86_400_000).toISOString()

    const avisar = async (texto: string) => {
      const llaves = await cargarLlaves(admin)
      const token = llaves.leer('CENTRAL_TELEGRAM_TOKEN'), chat = llaves.leer('CENTRAL_TELEGRAM_CHAT_ID')
      if (!token || !chat) return 'sin_configurar'
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: texto, disable_web_page_preview: true }) })
      return r.ok ? 'enviado' : 'falla'
    }

    const { data: existente } = await admin.from('growth_misiones').select('id, mision, estado').eq('fecha', hoy).maybeSingle()

    if (modo === 'manana') {
      if (existente) return out({ ok: true, creada: false, mision: existente.mision, estado: existente.estado })
      const ayer = new Date(new Date(iniDia).getTime() - 86_400_000).toISOString().slice(0, 10)
      const [pr, ex, ci, ta, au, my] = await Promise.all([
        admin.from('growth_prospectos').select('id, nombre_comercial, etapa, proxima_accion, proxima_accion_en').eq('es_ficticio', false).limit(2000),
        admin.from('growth_expedientes').select('prospecto_id'),
        admin.from('growth_citas').select('fecha_hora, growth_prospectos(nombre_comercial, es_ficticio)').eq('estado', 'confirmada').gte('fecha_hora', iniDia).lt('fecha_hora', finDia).order('fecha_hora'),
        admin.from('central_tareas').select('titulo, prioridad').in('prioridad', ['P0', 'P1']).not('estado', 'in', '(completada,cancelada,rechazada)').order('prioridad').limit(10),
        admin.from('growth_autorizaciones').select('id').eq('tipo', 'campana').eq('estado', 'vigente').gt('vigente_hasta', ahora.toISOString()).limit(1),
        admin.from('growth_misiones').select('estado').eq('fecha', ayer).maybeSingle(),
      ])
      if (pr.error || ex.error || ci.error || ta.error || au.error) return out({ ok: false, error: 'lectura', mensaje: 'No se pudieron leer los datos.' }, 500)
      const conExp = new Set((ex.data ?? []).map((e: { prospecto_id: string }) => e.prospecto_id))
      type Cita = { fecha_hora: string; growth_prospectos: { nombre_comercial: string; es_ficticio: boolean } | null }
      const m = elegirMision({
        ahora,
        prospectos: (pr.data ?? []).map((p: { id: string; nombre_comercial: string; etapa: string; proxima_accion: string; proxima_accion_en: string | null }) => ({ id: p.id, nombre: p.nombre_comercial, etapa: p.etapa, proxima_accion: p.proxima_accion, proxima_accion_en: p.proxima_accion_en, tiene_expediente: conExp.has(p.id) })),
        citasHoy: ((ci.data ?? []) as unknown as Cita[]).filter(c => c.growth_prospectos && !c.growth_prospectos.es_ficticio).map(c => ({ nombre: c.growth_prospectos!.nombre_comercial, hora: hora(c.fecha_hora) })),
        tareasUrgentes: (ta.data ?? []) as { titulo: string; prioridad: string }[],
        campanaVigente: (au.data ?? []).length > 0,
        ayerBloqueada: my.data?.estado === 'bloqueada',
      })
      const { error } = await admin.from('growth_misiones').insert({ fecha: hoy, ...m, origen: 'reglas' })
      if (error) return out({ ok: false, error: 'guardar', mensaje: 'No se pudo guardar la misión.' }, 500)
      const telegram = secretoRecibido ? await avisar(textoManana(m)) : 'no_aplica'
      return out({ ok: true, creada: true, mision: m.mision, telegram })
    }

    // cierre: solo hechos reales del día
    const [tc, hi, ci, pc] = await Promise.all([
      admin.from('central_tareas').select('id', { count: 'exact', head: true }).eq('estado', 'completada').gte('updated_at', iniDia).lt('updated_at', finDia),
      admin.from('growth_historial').select('tipo, prospecto_id, growth_prospectos(es_ficticio)').in('tipo', ['etapa', 'nota']).gte('created_at', iniDia).lt('created_at', finDia).limit(2000),
      admin.from('growth_citas').select('id, growth_prospectos(es_ficticio)').eq('estado', 'realizada').gte('updated_at', iniDia).lt('updated_at', finDia),
      admin.from('growth_prospectos').select('id', { count: 'exact', head: true }).eq('es_ficticio', false).gte('created_at', iniDia).lt('created_at', finDia),
    ])
    type H = { tipo: string; growth_prospectos: { es_ficticio: boolean } | null }
    const hs = ((hi.data ?? []) as unknown as H[]).filter(h => h.growth_prospectos && !h.growth_prospectos.es_ficticio)
    const citasReales = ((ci.data ?? []) as unknown as { growth_prospectos: { es_ficticio: boolean } | null }[]).filter(c => c.growth_prospectos && !c.growth_prospectos.es_ficticio)
    const pendientes: string[] = []
    if (existente && existente.estado !== 'completada') pendientes.push(`la misión quedó ${existente.estado === 'propuesta' ? 'sin empezar' : existente.estado}`)
    const cierre: Cierre = { tareas_completadas: tc.count ?? 0, cambios_de_etapa: hs.filter(h => h.tipo === 'etapa').length, notas: hs.filter(h => h.tipo === 'nota').length, citas_realizadas: citasReales.length, prospectos_creados: pc.count ?? 0, pendientes }
    if (existente) await admin.from('growth_misiones').update({ cierre }).eq('id', existente.id)
    const telegram = secretoRecibido ? await avisar(textoCierre(cierre, existente?.mision ?? null, existente?.estado ?? null)) : 'no_aplica'
    return out({ ok: true, cierre, telegram })
  } catch {
    return out({ ok: false, error: 'interno', mensaje: 'Algo falló en el servidor. Inténtalo de nuevo.' }, 500)
  }
})
