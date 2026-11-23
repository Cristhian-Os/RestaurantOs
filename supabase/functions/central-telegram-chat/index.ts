// central-telegram-chat: conversación de DOS vías con Chef Mayor por Telegram.
//   · Telegram le entrega tus mensajes (webhook). Solo se atiende al chat del dueño y solo si llega el secreto del webhook; todo lo demás se ignora sin responder.
//   · Responde con IA (mismo límite de gasto de Central) usando datos reales de la oficina, y guarda la charla en el hilo directo de Chef Mayor (se ve también en la app).
//   · Desde aquí SOLO se puede: conversar, /estado y /apagar. Encender agentes, aprobar o gastar se hace en Central con tu código de 2 pasos.
// Acciones del panel (solo dueño con 2 pasos): registrar (conecta Telegram con esta función) · quitar · estado.
// El token del bot y tu chat_id viven solo en el servidor. El secreto del webhook se genera aquí y se guarda en platform_secrets.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, exigirDueno } from '../_shared/central_acceso.ts'
import { avisarTelegram } from '../_shared/central_aviso.ts'
import { cargarLlaves } from '../_shared/central_llaves.ts'
import { callModel, type Fetch, type RespuestaModelo } from '../_shared/modelo.ts'
import { llamarAnthropic } from '../central-agente/anthropic.ts'
import { MAX_MENSAJES_POR_MINUTO, MAX_TOKENS_RESPUESTA, armarTurnos, costoEstimado, decidirLimite, elegirProveedor, modeloDe, primerDiaDelMes, sistemaAgente, textoBloqueo, type Proveedor } from '../central-agente/logica.ts'
import { TEXTO_AYUDA, comando, contextoParaIA, esDelDueno, iguales, leerMensaje, partir, textoEstado, type EstadoOficina } from './logica.ts'

const fetchReal: Fetch = (url, init) => fetch(url, init)
const CLAVE_SECRETO = 'central_telegram_secreto'
const ETQ_TIPO: Record<string, string> = { investigar_prospectos: 'Buscar negocios', redactar_borrador: 'Redactar borrador', informe_diario: 'Informe diario' }

async function llamar(p: Proveedor, llave: string, modelo: string, sistema: string, turnos: { rol: 'user' | 'assistant'; texto: string }[]): Promise<RespuestaModelo> {
  if (p.tipo === 'anthropic') return llamarAnthropic({ modelo, clave: llave }, { sistema, turnos, maxTokens: MAX_TOKENS_RESPUESTA, timeoutMs: 30_000 }, fetchReal)
  const ultimo = turnos[turnos.length - 1]
  return callModel({ proveedor: 'compatible', modelo, clave: llave, urlBase: p.urlBase }, { sistema, usuario: ultimo.texto, mensajes: turnos.slice(0, -1), json: false, maxTokens: MAX_TOKENS_RESPUESTA, timeoutMs: 30_000 }, fetchReal)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const llaves = await cargarLlaves(admin)
    const token = llaves.leer('CENTRAL_TELEGRAM_TOKEN'), chatDueno = llaves.leer('CENTRAL_TELEGRAM_CHAT_ID')
    const cuerpo = await req.json().catch(() => null) as Record<string, unknown> | null

    // ───────────── Acciones del panel (dueño con 2 pasos) ─────────────
    if (cuerpo && typeof cuerpo.accion === 'string') {
      const acceso = await exigirDueno(req, admin as never)
      if (!acceso.ok) return out({ ok: false, error: acceso.codigo, mensaje: 'Solo el dueño con su código de 2 pasos puede usar esto.' }, acceso.status)
      if (!token || !chatDueno) return out({ ok: false, error: 'sin_configurar', mensaje: 'Faltan el token del bot o tu chat_id. Pégalos en Integraciones.' }, 503)
      const api = (metodo: string, datos: Record<string, unknown>) => fetch(`https://api.telegram.org/bot${token}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
      const auditar = (accion: string) => admin.from('central_auditoria').insert({ actor_tipo: 'humano', actor_id: acceso.userId, accion, recurso: 'telegram_chat', nivel: 'N2', resultado: 'ok', detalle: {} })

      if (cuerpo.accion === 'registrar') {
        const bytes = new Uint8Array(32); crypto.getRandomValues(bytes)
        const secreto = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
        const { error } = await admin.from('platform_secrets').upsert({ key: CLAVE_SECRETO, value: secreto, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        if (error) return out({ ok: false, error: 'interno', mensaje: 'No se pudo guardar el secreto.' }, 500)
        const r = await api('setWebhook', { url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/central-telegram-chat`, secret_token: secreto, allowed_updates: ['message'], drop_pending_updates: true })
        if (!r.ok) { await admin.from('platform_secrets').delete().eq('key', CLAVE_SECRETO); return out({ ok: false, error: 'telegram_falla', mensaje: `Telegram respondió ${r.status}. Revisa el token.` }, 502) }
        await auditar('telegram_chat_registrar')
        await avisarTelegram(admin as never, '✅ Ya puedes escribirme por aquí. Prueba con /estado o /ayuda.')
        return out({ ok: true })
      }
      if (cuerpo.accion === 'quitar') {
        await api('deleteWebhook', { drop_pending_updates: true })
        await admin.from('platform_secrets').delete().eq('key', CLAVE_SECRETO)
        await auditar('telegram_chat_quitar')
        return out({ ok: true })
      }
      if (cuerpo.accion === 'estado') {
        const r = await api('getWebhookInfo', {})
        const j = await r.json().catch(() => ({})) as { result?: { url?: string; pending_update_count?: number; last_error_message?: string } }
        const { data: s } = await admin.from('platform_secrets').select('key').eq('key', CLAVE_SECRETO).maybeSingle()
        return out({ ok: true, activo: !!s && !!j.result?.url?.endsWith('/central-telegram-chat'), pendientes: j.result?.pending_update_count ?? 0, ultimoError: (j.result?.last_error_message ?? '').slice(0, 120) || null })
      }
      return out({ ok: false, error: 'peticion', mensaje: 'Acción desconocida.' }, 400)
    }

    // ───────────── Webhook de Telegram ─────────────
    const { data: fila } = await admin.from('platform_secrets').select('value').eq('key', CLAVE_SECRETO).maybeSingle()
    if (!iguales(req.headers.get('x-telegram-bot-api-secret-token') ?? '', String(fila?.value ?? ''))) return new Response('no', { status: 401 })
    const m = leerMensaje(cuerpo)
    if (!m || !esDelDueno(m, chatDueno)) return out({ ok: true })        // otra persona, un grupo o algo que no es texto: se ignora en silencio

    // Telegram reintenta si tarda: cada update se atiende una sola vez.
    const { data: ult } = await admin.from('central_config').select('valor').eq('clave', 'telegram_ultimo_update').maybeSingle()
    if (typeof ult?.valor === 'number' && m.updateId <= ult.valor) return out({ ok: true })
    await admin.from('central_config').upsert({ clave: 'telegram_ultimo_update', valor: m.updateId }, { onConflict: 'clave' })

    const decir = async (texto: string) => { for (const t of partir(texto)) await avisarTelegram(admin as never, t, 4000) }
    const periodo = primerDiaDelMes(new Date())
    const inicioDia = `${new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)}T05:00:00.000Z`

    const leerEstado = async (): Promise<{ estado: EstadoOficina; cfg: Record<string, unknown>; consumo: { agente_id: string; costo: number }[] }> => {
      const [cfgR, camp, pros, porV, trab, con] = await Promise.all([
        admin.from('central_config').select('clave, valor').in('clave', ['agentes_activos', 'pausa_tipos', 'ia_tope_mensual_usd', 'ia_encendida', 'ia_modelo_defecto', 'ia_modelos', 'ia_precios']),
        admin.from('growth_autorizaciones').select('id', { count: 'exact', head: true }).eq('tipo', 'campana').eq('estado', 'vigente').gt('vigente_hasta', new Date().toISOString()),
        admin.from('growth_prospectos').select('id', { count: 'exact', head: true }).eq('es_ficticio', false),
        admin.from('growth_prospectos').select('id', { count: 'exact', head: true }).eq('es_ficticio', false).eq('etapa', 'prospecto_identificado'),
        admin.from('central_trabajos').select('estado').gte('created_at', inicioDia).limit(500),
        admin.from('central_consumo').select('agente_id, costo').eq('periodo', periodo),
      ])
      const cfg: Record<string, unknown> = Object.fromEntries(((cfgR.data ?? []) as { clave: string; valor: unknown }[]).map(f => [f.clave, f.valor]))
      const trabajosHoy: Record<string, number> = {}
      for (const t of (trab.data ?? []) as { estado: string }[]) trabajosHoy[t.estado] = (trabajosHoy[t.estado] ?? 0) + 1
      const consumo = (con.data ?? []) as { agente_id: string; costo: number }[]
      return {
        cfg, consumo,
        estado: {
          agentesActivos: cfg.agentes_activos === true, campanasVigentes: camp.count ?? 0, prospectos: pros.count ?? 0, prospectosPorVerificar: porV.count ?? 0, trabajosHoy,
          gastoMes: consumo.reduce((s, f) => s + Number(f.costo), 0), topeMes: Number(cfg.ia_tope_mensual_usd) || 0,
          pausados: (Array.isArray(cfg.pausa_tipos) ? (cfg.pausa_tipos as string[]) : []).map(t => ETQ_TIPO[t] ?? t),
        },
      }
    }

    const cmd = comando(m.texto)
    if (cmd === 'start' || cmd === 'ayuda') { await decir(TEXTO_AYUDA); return out({ ok: true }) }
    if (cmd === 'estado') { await decir(textoEstado((await leerEstado()).estado)); return out({ ok: true }) }
    if (cmd === 'apagar') {
      await admin.from('central_config').update({ valor: false }).eq('clave', 'agentes_activos')
      await admin.from('central_trabajos').update({ estado: 'paused', error: 'interruptor_global_apagado', bloqueado_por: null, bloqueo_hasta: null })
        .in('estado', ['pending', 'scheduled', 'retrying', 'running']).neq('tipo', 'prueba')
      await admin.from('central_auditoria').insert({ actor_tipo: 'humano', actor_id: null, accion: 'telegram_apagar_agentes', recurso: 'agentes_activos', nivel: 'N1', resultado: 'ok', detalle: { origen: 'telegram' } })
      await decir('🛑 Listo: los agentes quedaron apagados y lo que corría se pausó. Para volver a encenderlos, hazlo en Central con tu código de 2 pasos.')
      return out({ ok: true })
    }

    // ── Conversación con IA ──
    const { data: agente } = await admin.from('central_agentes').select('*').eq('id', 'chef-mayor').maybeSingle()
    if (!agente || agente.proveedor_estado !== 'activo') { await decir('Chef Mayor no está disponible ahora.'); return out({ ok: true }) }
    const { estado, cfg, consumo } = await leerEstado()
    const hace1min = new Date(Date.now() - 60_000).toISOString()
    const { count: recientes } = await admin.from('central_mensajes').select('id', { count: 'exact', head: true }).eq('autor_tipo', 'agente').eq('modo', 'real').gte('created_at', hace1min)
    const bloqueo = decidirLimite({
      encendida: cfg.ia_encendida === true, topeGlobal: estado.topeMes, gastoGlobal: estado.gastoMes,
      presupuestoAgente: Number(agente.presupuesto_mensual) || 0, gastoAgente: consumo.filter(f => f.agente_id === agente.id).reduce((s, f) => s + Number(f.costo), 0),
      mensajesUltimoMinuto: Math.min(recientes ?? 0, MAX_MENSAJES_POR_MINUTO),
    })
    if (bloqueo) { await decir(textoBloqueo(bloqueo)); return out({ ok: true }) }
    const proveedor = elegirProveedor(agente.modelos, cfg.ia_modelo_defecto, p => llaves.leer(p.secreto) !== '')
    if (!proveedor) { await decir(textoBloqueo('sin_proveedor')); return out({ ok: true }) }

    // Hilo directo de Chef Mayor (el mismo de la app): se busca o se crea.
    let { data: conv } = await admin.from('central_conversaciones').select('id').eq('tipo', 'directo').eq('agente_id', agente.id).maybeSingle()
    if (!conv) { const c = await admin.from('central_conversaciones').insert({ tipo: 'directo', titulo: 'Chef Mayor', agente_id: agente.id }).select('id').single(); conv = c.data }
    if (!conv) { await decir('No pude guardar la conversación. Inténtalo de nuevo.'); return out({ ok: true }) }
    await admin.from('central_mensajes').insert({ conversacion_id: conv.id, autor_tipo: 'humano', autor_id: 'telegram', contenido: m.texto, modo: 'real' })
    const [{ data: msgs }, { data: area }] = await Promise.all([
      admin.from('central_mensajes').select('autor_tipo, contenido').eq('conversacion_id', conv.id).order('id', { ascending: false }).limit(30),
      admin.from('central_departamentos').select('nombre').eq('id', agente.departamento_id).maybeSingle(),
    ])
    const turnos = armarTurnos(((msgs ?? []) as { autor_tipo: string; contenido: string }[]).reverse())
    if (!turnos.length) return out({ ok: true })
    const sistema = `${sistemaAgente({ nombre: agente.nombre, rol: agente.rol, especialidad: agente.especialidad, objetivos: agente.objetivos, nivel: agente.nivel }, area?.nombre ?? 'Dirección')}\n\n${contextoParaIA(estado)}`
    const modelo = modeloDe(proveedor, cfg.ia_modelos)
    let r: RespuestaModelo
    try { r = await llamar(proveedor, llaves.leer(proveedor.secreto), modelo, sistema, turnos) } catch { await decir('No pude responder ahora, el proveedor de IA falló. Inténtalo en un momento.'); return out({ ok: true }) }
    const texto = r.texto.trim().slice(0, 3500)
    if (!texto) { await decir('No pude responder ahora. Inténtalo de nuevo.'); return out({ ok: true }) }
    // El gasto se anota PRIMERO, igual que en el chat de la app.
    const costo = costoEstimado(r.tokensEntrada, r.tokensSalida, cfg.ia_precios, proveedor.id)
    await admin.from('central_consumo').insert({ agente_id: agente.id, periodo, proveedor: `${proveedor.id}:${modelo}`.slice(0, 80), tokens: r.tokensEntrada + r.tokensSalida, costo })
    await admin.from('central_mensajes').insert({ conversacion_id: conv.id, autor_tipo: 'agente', autor_id: agente.id, contenido: texto, modo: 'real' })
    await decir(texto)
    return out({ ok: true })
  } catch {
    return out({ ok: false, error: 'interno', mensaje: 'Algo falló en el servidor.' }, 500)
  }
})
