// central-trabajador: ejecuta los trabajos de la cola de Central (central_trabajos). Hoy sabe hacer dos, ambos SIN contactar ni publicar nada:
//   · "investigar_prospectos" (Mateo): busca negocios en la web dentro de una campaña vigente y los guarda como "prospecto identificado" con su fuente.
//   · "redactar_borrador" (Nico): deja UN borrador de contenido al día en la Biblioteca, marcado "no publicado", solo con lo verificado del producto.
// Acciones:  ejecutar (por defecto: toma hasta 2 trabajos y los corre) · encolar (crea los trabajos de hoy por cada campaña vigente, sin duplicar).
// Te avisa por Telegram SOLO cuando hay algo para ti (negocios nuevos, un borrador, un trabajo que falló del todo). Nunca resúmenes vacíos.
// Quién puede llamarla: el dueño con 2 pasos o la programación automática (cabecera secreta, la misma del vigía).
// Antes de cada paso se consulta al guardián de la base (interruptor global, pausas, autorización vigente, tope de gasto). El gasto se anota SIEMPRE.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, exigirDueno } from '../_shared/central_acceso.ts'
import { avisarTelegram } from '../_shared/central_aviso.ts'
import { cargarLlaves } from '../_shared/central_llaves.ts'
import { costoEstimado, modeloDe, proveedorPorId } from '../central-agente/logica.ts'
import {
  MAX_RESULTADOS_WEB, MAX_TOKENS_BUSQUEDA, armarPedido, armarPedidoContenido, citasDeRespuesta, claveTrabajoDiario, costoCorrida, cupoRestante, extraerJson,
  manifiestoValido, planSincronizacion, textoDocumento, validarCandidatos, validarPieza, type Alcance, type FuncionReal,
} from './logica.ts'

type Trabajo = { id: string; tipo: string; agente_id: string; autorizacion_id: string | null }
type RespIA = { choices?: { message?: { content?: string; annotations?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
const TIMEOUT_MS = 60_000

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
    const body = await req.json().catch(() => ({})) as { accion?: string }
    const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)   // día en Colombia (UTC-5 fijo)
    const aviso = (t: string) => avisarTelegram(admin as never, t)

    // ── encolar: un trabajo de Mateo y uno de Nico por campaña vigente y por día (la clave impide duplicarlos) ──
    if (body.accion === 'encolar') {
      const { data: camp, error } = await admin.from('growth_autorizaciones').select('id').eq('tipo', 'campana').eq('estado', 'vigente').gt('vigente_hasta', new Date().toISOString())
      if (error) return out({ ok: false, error: 'lectura', mensaje: 'No se pudieron leer las campañas.' }, 500)
      const ids: string[] = []
      const vence = new Date(Date.now() + 20 * 3_600_000).toISOString()
      for (const c of (camp ?? []) as { id: string }[]) {
        const nuevos = [
          { p_tipo: 'investigar_prospectos', p_agente: 'mateo', p_clave: claveTrabajoDiario(c.id, hoy) },
          { p_tipo: 'redactar_borrador', p_agente: 'nico', p_clave: `nico:${c.id}:${hoy}` },
        ]
        for (const n of nuevos) {
          const { data, error: e2 } = await admin.rpc('central_trabajo_encolar', { ...n, p_autorizacion: c.id, p_vence_en: vence })
          if (!e2 && data) ids.push(String(data))
        }
      }
      return out({ ok: true, campanas: (camp ?? []).length, trabajos: ids })
    }


    // ── sincronizar_funciones: compara lo que existe en el código (funciones.json de la app) con la matriz. Solo AGREGA como "parcial", BAJA o AVISA: nunca sube a producción. ──
    if (body.accion === 'sincronizar_funciones') {
      let crudo: unknown = null
      try {
        const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15_000)
        const r = await fetch('https://usarestaurantos.com/funciones.json', { signal: ctl.signal }).finally(() => clearTimeout(timer))
        if (r.ok) crudo = await r.json().catch(() => null)
      } catch { /* se informa abajo */ }
      const manifiesto = manifiestoValido(crudo)
      if (!manifiesto.length) return out({ ok: false, error: 'sin_manifiesto', mensaje: 'No se pudo leer la lista de funciones de la app (¿ya se publicó la versión nueva?).' }, 502)
      const { data: filas, error: eFilas } = await admin.from('growth_funciones').select('id, estado, evidencia')
      if (eFilas) return out({ ok: false, error: 'lectura', mensaje: 'No se pudo leer la matriz de funciones.' }, 500)
      const plan = planSincronizacion(manifiesto, (filas ?? []) as { id: string; estado: string; evidencia: string }[], hoy)
      let fallos = 0
      if (plan.insertar.length) { const { error } = await admin.from('growth_funciones').insert(plan.insertar); if (error) fallos++ }
      for (const a of plan.actualizar) { const { error } = await admin.from('growth_funciones').update({ evidencia: a.evidencia }).eq('id', a.id); if (error) fallos++ }
      for (const id of plan.bajar) {
        const { error } = await admin.from('growth_funciones').update({ estado: 'sin_verificar', limitaciones: 'Ya no se encuentra en el código: confirma si sigue existiendo antes de ofrecerla.' }).eq('id', id)
        if (error) fallos++
      }
      const nombres = (ids: string[]) => ids.map(i => manifiesto.find(f => f.id === i)?.nombre ?? i).join(', ').slice(0, 300)
      if (plan.reverificar.length || plan.bajar.length) {
        const detalle = [plan.reverificar.length ? `Cambió el código de: ${nombres(plan.reverificar)}. Vuelve a verificarlas.` : '', plan.bajar.length ? `Ya no aparecen en el código: ${nombres(plan.bajar)}.` : ''].filter(Boolean).join(' ')
        await admin.from('central_notificaciones').insert({ tipo: 'alerta', severidad: 'importante', titulo: 'Funciones de la app para revisar', detalle: detalle.slice(0, 1000), origen: 'funciones', enlace: '/central' })
        await aviso(`🔧 Funciones de la app para revisar: ${detalle}`.slice(0, 500))
      }
      return out({ ok: true, funciones: { total: manifiesto.length, nuevas: plan.insertar.length, actualizadas: plan.actualizar.length, bajadas: plan.bajar.length, reverificar: plan.reverificar.length, fallos } })
    }

    // ── ejecutar ──
    const { data: tomados, error: errTomar } = await admin.rpc('central_trabajo_tomar', { p_trabajador: 'central-trabajador', p_limite: 2 })
    if (errTomar) return out({ ok: false, error: 'cola', mensaje: 'No se pudo leer la cola de trabajos.' }, 500)
    const resultados: { id: string; estado: string; detalle?: unknown }[] = []
    for (const t of (tomados ?? []) as Trabajo[]) {
      const cerrar = async (ok: boolean, resultado: unknown, error: string | null, costo: number): Promise<string> => {
        const { data } = await admin.rpc('central_trabajo_terminar', { p_id: t.id, p_ok: ok, p_resultado: resultado ?? null, p_error: error, p_costo: costo })
        const estado = String(data ?? '?')
        resultados.push({ id: t.id, estado, detalle: ok ? resultado : error })
        // Solo avisa cuando el trabajo falló del todo (los reintentos no te molestan).
        if (estado === 'failed') await aviso(`⚠️ Un trabajo de ${t.agente_id} falló del todo: ${(error ?? 'sin detalle').slice(0, 160)}. Revisa Central → Crecimiento.`)
        return estado
      }
      try {
        const esMateo = t.tipo === 'investigar_prospectos' && t.agente_id === 'mateo'
        const esNico = t.tipo === 'redactar_borrador' && t.agente_id === 'nico'
        if ((!esMateo && !esNico) || !t.autorizacion_id) { await cerrar(false, null, 'Este tipo de trabajo todavía no tiene ejecutor.', 0); continue }

        const { data: camp } = await admin.from('growth_autorizaciones').select('alcance').eq('id', t.autorizacion_id).maybeSingle()
        const alcance = (camp?.alcance ?? {}) as Alcance

        // Mateo respeta el máximo de prospectos de la campaña.
        let cupo = 0
        if (esMateo) {
          const { count: existentes } = await admin.from('growth_prospectos').select('id', { count: 'exact', head: true }).eq('campana_id', t.autorizacion_id).eq('es_ficticio', false)
          cupo = cupoRestante(alcance.max_prospectos, existentes ?? 0)
          if (cupo === 0) { await cerrar(true, { creados: 0, motivo: 'La campaña ya llegó a su máximo de prospectos.' }, null, 0); continue }
        }

        // Proveedor: OpenRouter (búsqueda web para Mateo; Nico escribe sin web).
        const proveedor = proveedorPorId('openrouter')!
        const llaves = await cargarLlaves(admin)
        const llave = llaves.leer(proveedor.secreto)
        if (!llave) { await cerrar(false, null, 'Falta la llave de OpenRouter (Integraciones).', 0); continue }
        const { data: filas } = await admin.from('central_config').select('clave, valor').in('clave', ['ia_modelos', 'ia_precios'])
        const cfg: Record<string, unknown> = Object.fromEntries((filas ?? []).map((f: { clave: string; valor: unknown }) => [f.clave, f.valor]))
        const modelo = modeloDe(proveedor, cfg.ia_modelos)

        let pedido: { sistema: string; usuario: string }
        if (esMateo) pedido = armarPedido(alcance, cupo)
        else {
          const { data: fn } = await admin.from('growth_funciones').select('nombre, limitaciones').eq('estado', 'produccion').order('nombre')
          pedido = armarPedidoContenido(alcance, (fn ?? []) as FuncionReal[])
        }

        // Antes de gastar: el guardián vuelve a mirar (el interruptor pudo apagarse mientras esperaba).
        const antes = await admin.rpc('central_trabajo_puede', { p_id: t.id })
        if (!antes.data?.puede) { await cerrar(false, null, `Bloqueado: ${antes.data?.motivo ?? 'sin permiso'}`, 0); continue }

        const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
        let r: Response
        try {
          r = await fetch(`${proveedor.urlBase}/chat/completions`, {
            method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llave}` },
            body: JSON.stringify({
              model: modelo, max_tokens: MAX_TOKENS_BUSQUEDA, temperature: esMateo ? 0.2 : 0.7,
              ...(esMateo ? { plugins: [{ id: 'web', max_results: MAX_RESULTADOS_WEB }] } : {}),
              messages: [{ role: 'system', content: pedido.sistema }, { role: 'user', content: pedido.usuario }],
            }),
          })
        } finally { clearTimeout(timer) }
        const costoTokens = (j: RespIA | null) => costoEstimado(Number(j?.usage?.prompt_tokens) || 0, Number(j?.usage?.completion_tokens) || 0, cfg.ia_precios, 'openrouter')
        const costoBase = esMateo ? costoCorrida(0) : 0.001   // Mateo paga además la búsqueda web; se cobra aunque la respuesta no sirva
        if (!r.ok) { await cerrar(false, null, `El proveedor respondió ${r.status}.`, costoBase); continue }
        const j = await r.json() as RespIA
        const costo = esMateo ? costoCorrida(costoTokens(j)) : Math.max(0.001, costoTokens(j))
        const msg = j.choices?.[0]?.message
        const crudo = extraerJson(String(msg?.content ?? ''))
        if (!crudo) { await cerrar(false, null, 'La respuesta de la IA no tuvo el formato esperado.', costo); continue }

        // Guardar solo si sigue permitido (la campaña pudo revocarse durante la llamada).
        const despues = await admin.rpc('central_trabajo_puede', { p_id: t.id })
        if (!despues.data?.puede) { await cerrar(false, null, `Bloqueado antes de guardar: ${despues.data?.motivo ?? 'sin permiso'}`, costo); continue }

        if (esMateo) {
          const { aceptados, descartados } = validarCandidatos(crudo, citasDeRespuesta(msg), alcance, cupo)
          let creados = 0, duplicados = 0, fallos = 0
          for (const c of aceptados) {
            const { error } = await admin.from('growth_prospectos').insert({
              nombre_comercial: c.nombre_comercial, ciudad: c.ciudad, ubicacion_publica: c.ubicacion_publica, segmento: c.segmento,
              fuente: c.fuente, fuente_url: c.fuente_url, web: c.web, campana_id: t.autorizacion_id, responsable_agente_id: 'mateo',
              proxima_accion: 'Verificar que existe y completar su contacto público antes de investigarlo', es_ficticio: false,
            })
            if (!error) creados++
            else if (error.code === '23505') duplicados++
            else fallos++
          }
          await cerrar(true, { creados, duplicados, fallos, descartados: descartados.length, motivos_descarte: descartados.map(d => d.motivo) }, null, costo)
          if (creados > 0) await aviso(`🔎 Mateo encontró ${creados} negocio(s) nuevo(s) para verificar. Míralos en Central → Prospectos.`)
        } else {
          const v = validarPieza(crudo)
          if ('motivo' in v) { await cerrar(true, { guardado: false, motivo: `Borrador descartado: ${v.motivo}` }, null, costo); continue }
          const { error } = await admin.from('central_documentos').insert({
            titulo: `Borrador: ${v.pieza.titulo}`.slice(0, 160), tipo: 'otro', contenido: textoDocumento(v.pieza, hoy), departamento_id: 'marca',
            confiabilidad: 'baja', procedencia: 'Nico (IA) · borrador sin publicar',
          })
          if (error) { await cerrar(false, null, 'No se pudo guardar el borrador.', costo); continue }
          await cerrar(true, { guardado: true, titulo: v.pieza.titulo }, null, costo)
          await aviso(`✍️ Nico dejó un borrador de contenido: «${v.pieza.titulo.slice(0, 80)}». Revísalo en Central → Biblioteca. No se publicó nada.`)
        }
      } catch (e) {
        await cerrar(false, null, e instanceof Error ? e.message.slice(0, 200) : 'Falló el trabajo.', 0)
      }
    }
    return out({ ok: true, ejecutados: resultados })
  } catch {
    return out({ ok: false, error: 'interno', mensaje: 'Algo falló en el servidor. Inténtalo de nuevo.' }, 500)
  }
})
