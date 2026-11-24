// central-agente: da voz real a un agente de RestaurantOS Central. Solo el dueño con su código de 2 pasos puede llamarla.
// Acciones:  responder (por defecto) · estado (qué llaves hay guardadas, sin mostrarlas) · probar (una llamada mínima para validar una llave)
//            · guardar_llave / quitar_llave (las llaves que pegas en el panel de Integraciones).
// Seguridad: las llaves viven SOLO en el servidor (secretos de Supabase o la tabla platform_secrets, sin acceso desde la app); nunca llegan al navegador ni a los agentes.
// Apagado general, límite de gasto mensual y presupuesto por agente se revisan ANTES de cada llamada. El agente solo conversa: no ejecuta nada.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { callModel, type Fetch, type RespuestaModelo } from '../_shared/modelo.ts'
import { cors, exigirDueno } from '../_shared/central_acceso.ts'
import { SECRETOS, cargarLlaves, filaDe, validarSecreto } from '../_shared/central_llaves.ts'
import { llamarAnthropic } from './anthropic.ts'
import {
  MAX_TOKENS_RESPUESTA, PROVEEDORES, armarTurnos, costoEstimado, decidirLimite, elegirProveedor, modeloDe, primerDiaDelMes, proveedorPorId, sistemaAgente, textoBloqueo, type Proveedor,
} from './logica.ts'

const fetchReal: Fetch = (url, init) => fetch(url, init)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function llamar(p: Proveedor, llave: string, modelo: string, sistema: string, turnos: { rol: 'user' | 'assistant'; texto: string }[], maxTokens: number, timeoutMs: number): Promise<RespuestaModelo> {
  if (p.tipo === 'anthropic') return llamarAnthropic({ modelo, clave: llave }, { sistema, turnos, maxTokens, timeoutMs }, fetchReal)
  const ultimo = turnos[turnos.length - 1]
  return callModel({ proveedor: 'compatible', modelo, clave: llave, urlBase: p.urlBase }, { sistema, usuario: ultimo.texto, mensajes: turnos.slice(0, -1), json: false, maxTokens, timeoutMs }, fetchReal)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const no = (codigo: string, status = 400, detalle?: string) => out({ ok: false, error: codigo, mensaje: textoBloqueo(codigo), ...(detalle ? { detalle } : {}) }, status)
  try {
    const body = await req.json().catch(() => ({}))
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const acceso = await exigirDueno(req, admin as never)
    if (!acceso.ok) return no(acceso.codigo, acceso.status)

    // ── guardar / quitar una llave desde el panel (el valor nunca se devuelve ni se registra) ──
    if (body?.accion === 'guardar_llave' || body?.accion === 'quitar_llave') {
      const nombre = typeof body.nombre === 'string' ? body.nombre : ''
      const guardar = body.accion === 'guardar_llave'
      const motivo = guardar ? validarSecreto(nombre, body.valor) : (SECRETOS as readonly string[]).includes(nombre) ? null : 'Ese dato no existe.'
      if (motivo) return out({ ok: false, error: 'peticion', mensaje: motivo }, 400)
      const { error } = guardar
        ? await admin.from('platform_secrets').upsert({ key: filaDe(nombre), value: String(body.valor).trim(), updated_at: new Date().toISOString() }, { onConflict: 'key' })
        : await admin.from('platform_secrets').delete().eq('key', filaDe(nombre))
      if (error) return out({ ok: false, error: 'interno', mensaje: 'No se pudo guardar. Inténtalo de nuevo.' }, 500)
      await admin.from('central_auditoria').insert({ actor_tipo: 'humano', actor_id: acceso.userId, accion: guardar ? 'guardar_llave' : 'quitar_llave', recurso: nombre, nivel: 'N3', resultado: 'ok', detalle: { origen: 'panel' } })
      return out({ ok: true })
    }

    const llaves = await cargarLlaves(admin)
    const clave = (p: Proveedor) => llaves.leer(p.secreto)

    const { data: filas } = await admin.from('central_config').select('clave, valor')
      .in('clave', ['ia_encendida', 'ia_tope_mensual_usd', 'ia_modelo_defecto', 'ia_modelos', 'ia_precios'])
    const cfg: Record<string, unknown> = Object.fromEntries((filas ?? []).map((f: { clave: string; valor: unknown }) => [f.clave, f.valor]))

    if (body?.accion === 'estado') {
      return out({
        ok: true, encendida: cfg.ia_encendida === true, topeMensualUsd: Number(cfg.ia_tope_mensual_usd) || 0,
        proveedores: PROVEEDORES.map(p => ({ id: p.id, nombre: p.nombre, llave: clave(p) !== '', origen: llaves.origen(p.secreto), modelo: modeloDe(p, cfg.ia_modelos) })),
        telegram: { token: llaves.leer('CENTRAL_TELEGRAM_TOKEN') !== '', chat: llaves.leer('CENTRAL_TELEGRAM_CHAT_ID') !== '', origenToken: llaves.origen('CENTRAL_TELEGRAM_TOKEN'), origenChat: llaves.origen('CENTRAL_TELEGRAM_CHAT_ID') },
      })
    }

    if (body?.accion === 'probar') {
      const p = typeof body.proveedor === 'string' ? proveedorPorId(body.proveedor) : null
      if (!p) return no('peticion')
      if (!clave(p)) return no('sin_proveedor')
      const modelo = modeloDe(p, cfg.ia_modelos)
      try {
        const r = await llamar(p, clave(p), modelo, 'Responde solo con la palabra OK.', [{ rol: 'user', texto: 'Hola' }], 16, 15_000)
        return out({ ok: true, proveedor: p.id, modelo, respuesta: r.texto.slice(0, 40) })
      } catch (e) {
        return no('proveedor_falla', 502, e instanceof Error ? e.message.slice(0, 120) : undefined)   // p. ej. "El proveedor respondió 401" = llave incorrecta
      }
    }

    // ── responder ──
    const conversacionId = typeof body?.conversacion_id === 'string' && UUID.test(body.conversacion_id) ? body.conversacion_id : null
    if (!conversacionId) return no('peticion')
    const { data: conv } = await admin.from('central_conversaciones').select('tipo, agente_id').eq('id', conversacionId).maybeSingle()
    if (!conv || conv.tipo !== 'directo' || !conv.agente_id) return no('conversacion')
    const { data: agente } = await admin.from('central_agentes').select('*').eq('id', conv.agente_id).maybeSingle()
    if (!agente || agente.proveedor_estado !== 'activo' || ['suspendido', 'retirado'].includes(agente.ciclo)) return no('agente_no_activo', 409)

    const periodo = primerDiaDelMes(new Date())
    const hace1min = new Date(Date.now() - 60_000).toISOString()
    const [{ data: consumo }, { count: recientes }] = await Promise.all([
      admin.from('central_consumo').select('agente_id, costo').eq('periodo', periodo),
      admin.from('central_mensajes').select('id', { count: 'exact', head: true }).eq('autor_tipo', 'agente').eq('modo', 'real').gte('created_at', hace1min),
    ])
    const filasConsumo = (consumo ?? []) as { agente_id: string; costo: number }[]
    const bloqueo = decidirLimite({
      encendida: cfg.ia_encendida === true,
      topeGlobal: Number(cfg.ia_tope_mensual_usd) || 0, gastoGlobal: filasConsumo.reduce((s, f) => s + Number(f.costo), 0),
      presupuestoAgente: Number(agente.presupuesto_mensual) || 0, gastoAgente: filasConsumo.filter(f => f.agente_id === agente.id).reduce((s, f) => s + Number(f.costo), 0),
      mensajesUltimoMinuto: recientes ?? 0,
    })
    if (bloqueo) return no(bloqueo, bloqueo === 'muy_rapido' ? 429 : 403)

    const proveedor = elegirProveedor(agente.modelos, cfg.ia_modelo_defecto, p => clave(p) !== '')
    if (!proveedor) return no('sin_proveedor', 503)
    const modelo = modeloDe(proveedor, cfg.ia_modelos)

    const [{ data: msgs }, { data: area }] = await Promise.all([
      admin.from('central_mensajes').select('autor_tipo, contenido').eq('conversacion_id', conversacionId).order('id', { ascending: false }).limit(30),
      admin.from('central_departamentos').select('nombre').eq('id', agente.departamento_id).maybeSingle(),
    ])
    const turnos = armarTurnos(((msgs ?? []) as { autor_tipo: string; contenido: string }[]).reverse())
    if (!turnos.length) return no('peticion')

    // Si el proveedor principal falla (sin saldo, 404, caída), se prueba con los demás que tengan llave, en vez de dejarte sin respuesta.
    const sistema = sistemaAgente({ nombre: agente.nombre, rol: agente.rol, especialidad: agente.especialidad, objetivos: agente.objetivos, nivel: agente.nivel }, area?.nombre ?? 'Central')
    const orden = [proveedor, ...PROVEEDORES.filter(p => p.id !== proveedor.id && clave(p) !== '')].slice(0, 3)
    let r: RespuestaModelo | null = null
    let usado = { proveedor, modelo }
    let ultimoError: string | undefined
    for (const p of orden) {
      const m = modeloDe(p, cfg.ia_modelos)
      try { r = await llamar(p, clave(p), m, sistema, turnos, MAX_TOKENS_RESPUESTA, 25_000); usado = { proveedor: p, modelo: m }; break }
      catch (e) { ultimoError = e instanceof Error ? e.message.slice(0, 120) : undefined }
    }
    if (!r) return no('proveedor_falla', 502, ultimoError)
    const texto = r.texto.slice(0, 4000)
    if (!texto) return no('vacio', 502)

    // El gasto se anota PRIMERO: aunque falle el guardado del mensaje, queda registrado lo que costó.
    const costo = costoEstimado(r.tokensEntrada, r.tokensSalida, cfg.ia_precios, usado.proveedor.id)
    await admin.from('central_consumo').insert({ agente_id: agente.id, periodo, proveedor: `${usado.proveedor.id}:${usado.modelo}`.slice(0, 80), tokens: r.tokensEntrada + r.tokensSalida, costo })
    const { data: guardado, error: errMsg } = await admin.from('central_mensajes')
      .insert({ conversacion_id: conversacionId, autor_tipo: 'agente', autor_id: agente.id, contenido: texto, modo: 'real' }).select('id').single()
    if (errMsg) return no('vacio', 500)
    return out({ ok: true, mensaje_id: guardado?.id ?? null, proveedor: usado.proveedor.id, modelo: usado.modelo, costo })
  } catch {
    return out({ ok: false, error: 'interno', mensaje: 'Algo falló en el servidor. Inténtalo de nuevo.' }, 500)
  }
})
