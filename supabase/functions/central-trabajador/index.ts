// central-trabajador: ejecuta los trabajos de la cola de Central (central_trabajos). Hoy sabe hacer uno: "investigar_prospectos" de Mateo, en MODO SOMBRA.
//   · Busca negocios en la web con IA (OpenRouter + búsqueda web) dentro de una campaña autorizada y vigente.
//   · Los guarda como "prospecto identificado" con su fuente. NO contacta a nadie, NO envía nada.
// Acciones:  ejecutar (por defecto: toma hasta 2 trabajos y los corre) · encolar (crea el trabajo de hoy por cada campaña vigente, sin duplicar).
// Quién puede llamarla: el dueño con 2 pasos o la programación automática (cabecera secreta, la misma del vigía).
// Antes de cada paso se consulta al guardián de la base (interruptor global, pausas, autorización vigente, tope de gasto). El gasto se anota SIEMPRE.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, exigirDueno } from '../_shared/central_acceso.ts'
import { cargarLlaves } from '../_shared/central_llaves.ts'
import { costoEstimado, modeloDe, proveedorPorId } from '../central-agente/logica.ts'
import {
  MAX_RESULTADOS_WEB, MAX_TOKENS_BUSQUEDA, armarPedido, citasDeRespuesta, claveTrabajoDiario, costoCorrida, cupoRestante, extraerJson, validarCandidatos, type Alcance,
} from './logica.ts'

type Trabajo = { id: string; tipo: string; agente_id: string; autorizacion_id: string | null }
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

    // ── encolar: un trabajo por campaña vigente y por día (la clave impide duplicarlo) ──
    if (body.accion === 'encolar') {
      const { data: camp, error } = await admin.from('growth_autorizaciones').select('id').eq('tipo', 'campana').eq('estado', 'vigente').gt('vigente_hasta', new Date().toISOString())
      if (error) return out({ ok: false, error: 'lectura', mensaje: 'No se pudieron leer las campañas.' }, 500)
      const ids: string[] = []
      for (const c of (camp ?? []) as { id: string }[]) {
        const { data, error: e2 } = await admin.rpc('central_trabajo_encolar', {
          p_tipo: 'investigar_prospectos', p_agente: 'mateo', p_clave: claveTrabajoDiario(c.id, hoy), p_autorizacion: c.id,
          p_vence_en: new Date(Date.now() + 20 * 3_600_000).toISOString(),
        })
        if (!e2 && data) ids.push(String(data))
      }
      return out({ ok: true, campanas: (camp ?? []).length, trabajos: ids })
    }

    // ── ejecutar ──
    const { data: tomados, error: errTomar } = await admin.rpc('central_trabajo_tomar', { p_trabajador: 'central-trabajador', p_limite: 2 })
    if (errTomar) return out({ ok: false, error: 'cola', mensaje: 'No se pudo leer la cola de trabajos.' }, 500)
    const resultados: { id: string; estado: string; detalle?: unknown }[] = []
    for (const t of (tomados ?? []) as Trabajo[]) {
      const cerrar = async (ok: boolean, resultado: unknown, error: string | null, costo: number) => {
        const { data } = await admin.rpc('central_trabajo_terminar', { p_id: t.id, p_ok: ok, p_resultado: resultado ?? null, p_error: error, p_costo: costo })
        resultados.push({ id: t.id, estado: String(data ?? '?'), detalle: ok ? resultado : error })
      }
      try {
        if (t.tipo !== 'investigar_prospectos' || t.agente_id !== 'mateo' || !t.autorizacion_id) { await cerrar(false, null, 'Este tipo de trabajo todavía no tiene ejecutor.', 0); continue }

        const { data: camp } = await admin.from('growth_autorizaciones').select('alcance').eq('id', t.autorizacion_id).maybeSingle()
        const alcance = (camp?.alcance ?? {}) as Alcance
        const { count: existentes } = await admin.from('growth_prospectos').select('id', { count: 'exact', head: true }).eq('campana_id', t.autorizacion_id).eq('es_ficticio', false)
        const cupo = cupoRestante(alcance.max_prospectos, existentes ?? 0)
        if (cupo === 0) { await cerrar(true, { creados: 0, motivo: 'La campaña ya llegó a su máximo de prospectos.' }, null, 0); continue }

        // Proveedor: solo OpenRouter sabe buscar en la web con este formato.
        const proveedor = proveedorPorId('openrouter')!
        const llaves = await cargarLlaves(admin)
        const llave = llaves.leer(proveedor.secreto)
        if (!llave) { await cerrar(false, null, 'Falta la llave de OpenRouter (Integraciones).', 0); continue }
        const { data: filas } = await admin.from('central_config').select('clave, valor').in('clave', ['ia_modelos', 'ia_precios'])
        const cfg: Record<string, unknown> = Object.fromEntries((filas ?? []).map((f: { clave: string; valor: unknown }) => [f.clave, f.valor]))
        const modelo = modeloDe(proveedor, cfg.ia_modelos)

        // Antes de gastar: el guardián vuelve a mirar (el interruptor pudo apagarse mientras esperaba).
        const antes = await admin.rpc('central_trabajo_puede', { p_id: t.id })
        if (!antes.data?.puede) { await cerrar(false, null, `Bloqueado: ${antes.data?.motivo ?? 'sin permiso'}`, 0); continue }

        const { sistema, usuario } = armarPedido(alcance, cupo)
        const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
        let r: Response
        try {
          r = await fetch(`${proveedor.urlBase}/chat/completions`, {
            method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llave}` },
            body: JSON.stringify({
              model: modelo, max_tokens: MAX_TOKENS_BUSQUEDA, temperature: 0.2,
              plugins: [{ id: 'web', max_results: MAX_RESULTADOS_WEB }],
              messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
            }),
          })
        } finally { clearTimeout(timer) }
        // Se cobra la búsqueda aunque la respuesta no sirva: ya se hizo.
        if (!r.ok) { await cerrar(false, null, `El proveedor respondió ${r.status}.`, costoCorrida(0)); continue }
        const j = await r.json() as { choices?: { message?: { content?: string; annotations?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
        const costo = costoCorrida(costoEstimado(Number(j.usage?.prompt_tokens) || 0, Number(j.usage?.completion_tokens) || 0, cfg.ia_precios, 'openrouter'))
        const msg = j.choices?.[0]?.message
        const crudo = extraerJson(String(msg?.content ?? ''))
        if (!crudo) { await cerrar(false, null, 'La respuesta de la IA no tuvo el formato esperado.', costo); continue }
        const { aceptados, descartados } = validarCandidatos(crudo, citasDeRespuesta(msg), alcance, cupo)

        // Guardar solo si sigue permitido (la campaña pudo revocarse durante la búsqueda).
        const despues = await admin.rpc('central_trabajo_puede', { p_id: t.id })
        if (!despues.data?.puede) { await cerrar(false, null, `Bloqueado antes de guardar: ${despues.data?.motivo ?? 'sin permiso'}`, costo); continue }
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
      } catch (e) {
        await cerrar(false, null, e instanceof Error ? e.message.slice(0, 200) : 'Falló el trabajo.', 0)
      }
    }
    return out({ ok: true, ejecutados: resultados })
  } catch {
    return out({ ok: false, error: 'interno', mensaje: 'Algo falló en el servidor. Inténtalo de nuevo.' }, 500)
  }
})
