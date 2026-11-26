// central-redactar: prepara el PRIMER mensaje (WhatsApp o correo) de un prospecto como BORRADOR. No envía nada ni contacta a nadie.
// Quién puede llamarla: solo el dueño con su código de 2 pasos (botón "Preparar mensaje con IA" en Prospectos).
// Seguridad: usa los mismos frenos que el chat de los agentes: interruptor general de IA, tope mensual, presupuesto de Mateo y ritmo máximo.
// El borrador lo guarda con la llave de servicio, pero las reglas de la base (campaña, no contactar, ejemplos, sin duplicados) se aplican igual.
// Antes de gastar IA exige que el prospecto esté en una campaña vigente que incluya el canal pedido.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { callModel, type Fetch, type RespuestaModelo } from '../_shared/modelo.ts'
import { cors, exigirDueno } from '../_shared/central_acceso.ts'
import { cargarLlaves } from '../_shared/central_llaves.ts'
import { llamarAnthropic } from '../central-agente/anthropic.ts'
import { PROVEEDORES, costoEstimado, decidirLimite, elegirProveedor, modeloDe, primerDiaDelMes, textoBloqueo, type Proveedor } from '../central-agente/logica.ts'
import { extraerJson } from '../central-trabajador/logica.ts'
import { MOTIVOS_DESCARTE, armarMensaje, armarPedido, canalPermitido, motivoNoSePuede, validarRespuesta, type Canal, type Prospecto } from './logica.ts'

const fetchReal: Fetch = (url, init) => fetch(url, init)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AGENTE = 'mateo'

async function llamar(p: Proveedor, llave: string, modelo: string, sistema: string, usuario: string): Promise<RespuestaModelo> {
  const turnos = [{ rol: 'user' as const, texto: usuario }]
  if (p.tipo === 'anthropic') return llamarAnthropic({ modelo, clave: llave }, { sistema, turnos, maxTokens: 500, timeoutMs: 25_000 }, fetchReal)
  return callModel({ proveedor: 'compatible', modelo, clave: llave, urlBase: p.urlBase }, { sistema, usuario, json: false, maxTokens: 500, timeoutMs: 25_000 }, fetchReal)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const no = (codigo: string, status = 400, mensaje?: string) => out({ ok: false, error: codigo, mensaje: mensaje ?? textoBloqueo(codigo) }, status)
  try {
    const body = await req.json().catch(() => ({})) as { prospecto_id?: unknown; canal?: unknown }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const acceso = await exigirDueno(req, admin as never)
    if (!acceso.ok) return no(acceso.codigo, acceso.status)

    const prospectoId = typeof body.prospecto_id === 'string' && UUID.test(body.prospecto_id) ? body.prospecto_id : null
    const canal: Canal | null = body.canal === 'whatsapp' || body.canal === 'correo' ? body.canal : null
    if (!prospectoId || !canal) return no('peticion')

    const { data: pr } = await admin.from('growth_prospectos')
      .select('id, nombre_comercial, ciudad, segmento, ubicacion_publica, web, telefono, correo, etapa, es_ficticio, campana_id').eq('id', prospectoId).maybeSingle()
    if (!pr) return no('sin_prospecto', 404, 'No encontré ese prospecto.')
    const p = pr as Prospecto
    const motivo = motivoNoSePuede(p, canal)
    if (motivo) return no('no_se_puede', 409, motivo)

    // Un solo primer mensaje por canal (la base también lo impide): se avisa antes de gastar IA.
    const { data: yaHay } = await admin.from('growth_mensajes').select('id, estado').eq('prospecto_id', p.id).eq('canal', canal).eq('paso', 1).maybeSingle()
    if (yaHay) return no('ya_existe', 409, 'Ya hay un primer mensaje de ese canal para este prospecto: ábrelo en Mensajes.')

    // Campaña: debe estar vigente e incluir el canal (si no, la base no dejaría aprobar el mensaje: se avisa ANTES de gastar IA).
    const { data: camp } = p.campana_id
      ? await admin.from('growth_autorizaciones').select('id, alcance').eq('id', p.campana_id).eq('tipo', 'campana').eq('estado', 'vigente').gt('vigente_hasta', new Date().toISOString()).maybeSingle()
      : { data: null }
    if (!camp) return no('sin_campana', 409, 'Este prospecto no está en una campaña vigente. Asígnale una campaña activa antes de preparar su mensaje.')
    if (!canalPermitido(camp.alcance, canal)) return no('canal_no_permitido', 409, `Tu campaña no incluye ${canal === 'whatsapp' ? 'WhatsApp' : 'correo'} como canal. Prepara el mensaje por otro canal o crea una campaña que lo incluya.`)
    const campanaId: string = camp.id

    // ── Frenos de IA (los mismos del chat de los agentes) ──
    const llaves = await cargarLlaves(admin)
    const clave = (x: Proveedor) => llaves.leer(x.secreto)
    const { data: filas } = await admin.from('central_config').select('clave, valor').in('clave', ['ia_encendida', 'ia_tope_mensual_usd', 'ia_modelo_defecto', 'ia_modelos', 'ia_precios'])
    const cfg: Record<string, unknown> = Object.fromEntries((filas ?? []).map((f: { clave: string; valor: unknown }) => [f.clave, f.valor]))
    const { data: agente } = await admin.from('central_agentes').select('id, ciclo, proveedor_estado, presupuesto_mensual, modelos').eq('id', AGENTE).maybeSingle()
    if (!agente || agente.proveedor_estado !== 'activo' || ['suspendido', 'retirado'].includes(agente.ciclo)) return no('agente_no_activo', 409)
    const periodo = primerDiaDelMes(new Date())
    const { data: consumo } = await admin.from('central_consumo').select('agente_id, costo').eq('periodo', periodo)
    const gastos = (consumo ?? []) as { agente_id: string; costo: number }[]
    const bloqueo = decidirLimite({
      encendida: cfg.ia_encendida === true,
      topeGlobal: Number(cfg.ia_tope_mensual_usd) || 0, gastoGlobal: gastos.reduce((s, f) => s + Number(f.costo), 0),
      presupuestoAgente: Number(agente.presupuesto_mensual) || 0, gastoAgente: gastos.filter(f => f.agente_id === AGENTE).reduce((s, f) => s + Number(f.costo), 0),
      mensajesUltimoMinuto: 0,
    })
    if (bloqueo) return no(bloqueo, 403)
    const principal = elegirProveedor(agente.modelos, cfg.ia_modelo_defecto, x => clave(x) !== '')
    if (!principal) return no('sin_proveedor', 503)

    // ── Redactar: solo se le da lo verificado del producto y los datos públicos del negocio ──
    const { data: funciones } = await admin.from('growth_funciones').select('nombre, limitaciones').eq('estado', 'produccion').order('nombre').limit(12)
    const pedido = armarPedido(p, canal, (funciones ?? []) as { nombre: string; limitaciones: string }[])
    const orden = [principal, ...PROVEEDORES.filter(x => x.id !== principal.id && clave(x) !== '')].slice(0, 3)
    let r: RespuestaModelo | null = null, usado = { proveedor: principal, modelo: modeloDe(principal, cfg.ia_modelos) }, ultimoError: string | undefined
    for (const x of orden) {
      const m = modeloDe(x, cfg.ia_modelos)
      try { r = await llamar(x, clave(x), m, pedido.sistema, pedido.usuario); usado = { proveedor: x, modelo: m }; break }
      catch (e) { ultimoError = e instanceof Error ? e.message.slice(0, 120) : undefined }
    }
    if (!r) return out({ ok: false, error: 'proveedor_falla', mensaje: textoBloqueo('proveedor_falla'), ...(ultimoError ? { detalle: ultimoError } : {}) }, 502)

    // El gasto se anota PRIMERO: aunque la IA devuelva algo inservible, queda registrado lo que costó.
    const costo = costoEstimado(r.tokensEntrada, r.tokensSalida, cfg.ia_precios, usado.proveedor.id)
    await admin.from('central_consumo').insert({ agente_id: AGENTE, periodo, proveedor: `${usado.proveedor.id}:${usado.modelo}`.slice(0, 80), tokens: r.tokensEntrada + r.tokensSalida, costo })

    const v = validarRespuesta(extraerJson(r.texto), canal)
    if (!v.ok) return no('descartado', 422, `${MOTIVOS_DESCARTE[v.motivo] ?? 'La respuesta de la IA no sirvió.'} No se guardó nada: inténtalo de nuevo o escríbelo tú.`)

    const m = armarMensaje(canal, p.nombre_comercial, v.parrafo, v.asunto)
    const { data: guardado, error } = await admin.from('growth_mensajes')
      .insert({ prospecto_id: p.id, canal, paso: 1, asunto: m.asunto, cuerpo: m.cuerpo, campana_id: campanaId }).select('id').single()
    if (error) {
      if (error.code === '23505') return no('ya_existe', 409, 'Ya hay un primer mensaje de ese canal para este prospecto: ábrelo en Mensajes.')
      return no('guardar', 409, `No se pudo guardar el borrador: ${String(error.message ?? '').slice(0, 150)}`)
    }
    return out({ ok: true, mensaje_id: guardado?.id ?? null, canal, costo })
  } catch {
    return out({ ok: false, error: 'interno', mensaje: 'Algo falló en el servidor. Inténtalo de nuevo.' }, 500)
  }
})
