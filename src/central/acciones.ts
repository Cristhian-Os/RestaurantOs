/**
 * acciones.ts — todo lo que Central escribe en la base. Cada función devuelve `null` si salió bien o el texto del error en español.
 * La base decide de verdad (RLS + disparadores de 20261114140000_central_nucleo.sql): aquí solo se traducen los errores.
 * Ninguna acción toca restaurantes, pedidos ni dinero; ninguna envía nada fuera de RestaurantOS.
 */
import { supabase } from '../services/supabaseClient'
import type { Agente, Ciclo, EstadoTarea, Nivel, NivelAgente, Prioridad, Proveedor } from './catalogo.ts'

interface ErrorBase { code?: string; message?: string }

/** Los errores que la base escribe a propósito (reglas de Central) ya vienen en español; los técnicos se resumen. */
export function textoError(e: unknown): string {
  const err = (e ?? {}) as ErrorBase
  if (err.code === '42501') return 'Tu sesión ya no tiene permiso para esto. Vuelve a entrar con tu código de 2 pasos.'
  if (err.code === '23514') return 'Ese valor no cumple una regla de Central. Revisa los datos.'
  if (err.code === '23505') return 'Eso ya existe.'
  if (err.code === '23503') return 'Falta un dato relacionado (o se está usando en otro lugar).'
  if (err.code === 'P0001' && err.message) return err.message
  if (err.message && /fetch|network|Failed/i.test(err.message)) return 'No hay conexión. Inténtalo de nuevo.'
  return 'No se pudo guardar. Inténtalo de nuevo.'
}

const resultado = (error: unknown): string | null => (error ? textoError(error) : null)
const limpio = (s: string) => s.trim()

export interface NuevaTarea {
  titulo: string; descripcion?: string; prioridad: Prioridad; nivel_requerido: Nivel
  responsable_agente_id?: string | null; departamento_id?: string | null; proyecto_id?: string | null
  fecha_limite?: string | null; depende_de?: string[]
}
export async function crearTarea(t: NuevaTarea): Promise<string | null> {
  const { error } = await supabase.from('central_tareas').insert({
    titulo: limpio(t.titulo), descripcion: limpio(t.descripcion ?? ''), prioridad: t.prioridad, nivel_requerido: t.nivel_requerido,
    responsable_agente_id: t.responsable_agente_id || null, departamento_id: t.departamento_id || null, proyecto_id: t.proyecto_id || null,
    fecha_limite: t.fecha_limite || null, depende_de: t.depende_de ?? [],
  })
  return resultado(error)
}

export async function cambiarEstadoTarea(id: string, estado: EstadoTarea, resultadoTexto?: string): Promise<string | null> {
  const cambios: Record<string, unknown> = { estado }
  if (resultadoTexto !== undefined) cambios.resultado = limpio(resultadoTexto)
  const { error } = await supabase.from('central_tareas').update(cambios).eq('id', id)
  return resultado(error)
}

/** Pide TU aprobación para una tarea N1/N2/N3 (la tarea pasa a "pendiente de aprobación"). */
export async function pedirAprobacion(tarea: { id: string; titulo: string; nivel_requerido: Nivel }, impacto: string): Promise<string | null> {
  if (tarea.nivel_requerido === 'N0') return 'Una tarea de solo lectura no necesita aprobación.'
  const { error } = await supabase.from('central_aprobaciones').insert({
    tarea_id: tarea.id, accion: limpio(tarea.titulo).slice(0, 300), nivel: tarea.nivel_requerido, impacto: limpio(impacto),
  })
  if (error) return textoError(error)
  const { error: e2 } = await supabase.from('central_tareas').update({ estado: 'pendiente_aprobacion' }).eq('id', tarea.id)
  return resultado(e2)
}

export async function decidirAprobacion(id: string, decision: 'aprobada' | 'rechazada', nota: string): Promise<string | null> {
  const { error } = await supabase.rpc('central_decidir_aprobacion', { p_id: id, p_decision: decision, p_nota: limpio(nota) || null })
  return resultado(error)
}

export async function crearProyecto(p: { nombre: string; descripcion?: string; departamento_id?: string | null; fecha_inicio?: string | null; fecha_fin?: string | null }): Promise<string | null> {
  const { error } = await supabase.from('central_proyectos').insert({
    nombre: limpio(p.nombre), descripcion: limpio(p.descripcion ?? ''), departamento_id: p.departamento_id || null,
    fecha_inicio: p.fecha_inicio || null, fecha_fin: p.fecha_fin || null,
  })
  return resultado(error)
}

/** Devuelve el id de la conversación directa con un agente (la crea si no existe). */
export async function conversacionDirecta(agente: Pick<Agente, 'id' | 'nombre'>): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase.from('central_conversaciones').select('id').eq('tipo', 'directo').eq('agente_id', agente.id).maybeSingle()
  if (error) return { error: textoError(error) }
  if (data) return { id: data.id as string }
  const { data: nueva, error: e2 } = await supabase.from('central_conversaciones')
    .insert({ tipo: 'directo', titulo: agente.nombre, agente_id: agente.id }).select('id').single()
  return e2 || !nueva ? { error: textoError(e2) } : { id: nueva.id as string }
}

/** Guarda tu mensaje y, si hay respuesta, la guarda como "simulación local" (la base no deja guardarla como real desde la app). */
export async function enviarMensaje(conversacionId: string, userId: string, texto: string, respuesta?: { agenteId: string; texto: string }): Promise<string | null> {
  const { error } = await supabase.from('central_mensajes').insert({ conversacion_id: conversacionId, autor_tipo: 'humano', autor_id: userId, contenido: limpio(texto), modo: 'real' })
  if (error) return textoError(error)
  if (!respuesta) return null
  const { error: e2 } = await supabase.from('central_mensajes')
    .insert({ conversacion_id: conversacionId, autor_tipo: 'agente', autor_id: respuesta.agenteId, contenido: respuesta.texto, modo: 'simulacion_local' })
  return resultado(e2)
}

// ── Conexiones reales (las hace el SERVIDOR; aquí solo se le pide y se muestra lo que responde: nunca viajan llaves) ──
type Respuesta<T> = { ok: true; datos: T } | { ok: false; mensaje: string }

async function invocar<T>(funcion: string, cuerpo: Record<string, unknown>): Promise<Respuesta<T>> {
  const { data, error } = await supabase.functions.invoke(funcion, { body: cuerpo })
  if (!error) return { ok: true, datos: data as T }
  let mensaje = 'No se pudo hablar con el servidor. ¿Ya está instalada la función en Supabase?'
  const ctx = (error as { context?: unknown }).context
  if (typeof Response !== 'undefined' && ctx instanceof Response) {
    try {
      const j = (await ctx.json()) as { mensaje?: unknown; detalle?: unknown }
      if (typeof j.mensaje === 'string') mensaje = j.mensaje + (typeof j.detalle === 'string' ? ` (${j.detalle})` : '')
    } catch { /* se queda el mensaje general */ }
  }
  return { ok: false, mensaje }
}

export interface EstadoConexiones {
  ok: boolean; encendida: boolean; topeMensualUsd: number
  proveedores: { id: string; nombre: string; llave: boolean; origen: 'servidor' | 'panel' | null; modelo: string }[]
  telegram: { token: boolean; chat: boolean; origenToken: 'servidor' | 'panel' | null; origenChat: 'servidor' | 'panel' | null }
}
export type NombreLlave = 'CENTRAL_CLAVE_CLAUDE' | 'CENTRAL_CLAVE_NVIDIA' | 'CENTRAL_CLAVE_DEEPSEEK' | 'CENTRAL_CLAVE_OPENROUTER' | 'CENTRAL_CLAVE_OPENAI' | 'CENTRAL_CLAVE_GEMINI' | 'CENTRAL_CLAVE_GROQ' | 'CENTRAL_TELEGRAM_TOKEN' | 'CENTRAL_TELEGRAM_CHAT_ID'
/** Guarda una llave que pegaste en el panel. Viaja una sola vez al servidor, que la guarda y no la devuelve nunca. `null` = salió bien. */
export async function guardarLlave(nombre: NombreLlave, valor: string): Promise<string | null> {
  const r = await invocar<unknown>('central-agente', { accion: 'guardar_llave', nombre, valor })
  return r.ok === true ? null : r.mensaje
}
export async function quitarLlave(nombre: NombreLlave): Promise<string | null> {
  const r = await invocar<unknown>('central-agente', { accion: 'quitar_llave', nombre })
  return r.ok === true ? null : r.mensaje
}
export const estadoConexiones = () => invocar<EstadoConexiones>('central-agente', { accion: 'estado' })
export async function probarProveedor(proveedor: string): Promise<{ ok: boolean; texto: string }> {
  const r = await invocar<{ modelo: string; respuesta: string }>('central-agente', { accion: 'probar', proveedor })
  return r.ok === true ? { ok: true, texto: `Funciona. Modelo: ${r.datos.modelo}.` } : { ok: false, texto: r.mensaje }
}
export async function probarTelegram(): Promise<{ ok: boolean; texto: string }> {
  const r = await invocar<unknown>('central-telegram', { accion: 'probar' })
  return r.ok === true ? { ok: true, texto: 'Listo: revisa tu Telegram, debió llegar un mensaje.' } : { ok: false, texto: r.mensaje }
}
export interface ResultadoVigilancia { vigilados: { restaurantes: number; opiniones_nuevas: number }; hallazgos: number; tareas_creadas: number; ya_estaban: number; telegram: 'enviado' | 'sin_novedades' | 'sin_configurar' | 'falla' }
/** Pide al vigía que revise la plataforma ahora (datos reales). Crea tareas propuestas y avisa por Telegram solo de lo nuevo. */
export async function revisarPlataforma(): Promise<{ ok: true; datos: ResultadoVigilancia } | { ok: false; mensaje: string }> {
  const r = await invocar<{ ok: boolean } & ResultadoVigilancia>('central-vigia', {})
  return r.ok === true ? { ok: true, datos: r.datos } : { ok: false, mensaje: r.mensaje }
}
/** Pide la respuesta REAL del agente a la última pregunta de un chat directo. Devuelve `null` si salió bien o el texto del problema. */
export async function pedirRespuestaIA(conversacionId: string): Promise<string | null> {
  const r = await invocar<unknown>('central-agente', { conversacion_id: conversacionId })
  return r.ok === true ? null : r.mensaje
}

export async function crearReunion(r: { titulo: string; inicio: string; fin?: string | null; participantes: string[]; agenda?: string }): Promise<string | null> {
  const { error } = await supabase.from('central_reuniones').insert({
    titulo: limpio(r.titulo), inicio: r.inicio, fin: r.fin || null, participantes: r.participantes, agenda: limpio(r.agenda ?? ''),
  })
  return resultado(error)
}
export async function actualizarReunion(id: string, cambios: { estado?: string; acta?: string }): Promise<string | null> {
  const { error } = await supabase.from('central_reuniones').update(cambios).eq('id', id)
  return resultado(error)
}

export interface DatosDocumento { titulo: string; tipo: string; contenido: string; departamento_id?: string | null; confiabilidad: string; procedencia?: string }
export async function guardarDocumento(id: string | null, d: DatosDocumento): Promise<string | null> {
  const fila = { titulo: limpio(d.titulo), tipo: d.tipo, contenido: d.contenido, departamento_id: d.departamento_id || null, confiabilidad: d.confiabilidad, procedencia: limpio(d.procedencia ?? '') }
  const { error } = id ? await supabase.from('central_documentos').update(fila).eq('id', id) : await supabase.from('central_documentos').insert(fila)
  return resultado(error)
}

export interface DatosMemoria { capa: string; titulo: string; contenido: string; departamento_id?: string | null; restaurante_id?: string | null; confiabilidad: string; procedencia?: string }
export async function guardarMemoria(id: string | null, m: DatosMemoria): Promise<string | null> {
  const fila = { capa: m.capa, titulo: limpio(m.titulo), contenido: m.contenido, departamento_id: m.departamento_id || null, restaurante_id: m.restaurante_id || null, confiabilidad: m.confiabilidad, procedencia: limpio(m.procedencia ?? '') }
  const { error } = id ? await supabase.from('central_memoria').update(fila).eq('id', id) : await supabase.from('central_memoria').insert(fila)
  return resultado(error)
}

export async function crearAgente(a: { id: string; nombre: string; departamento_id: string; especialidad: string }): Promise<string | null> {
  // Nace N0, "diseñado" y sin conexión: lo fijan los valores por defecto de la tabla, no esta función.
  const { error } = await supabase.from('central_agentes').insert({
    id: limpio(a.id).toLowerCase(), nombre: limpio(a.nombre), departamento_id: a.departamento_id, rol: 'subordinado', especialidad: limpio(a.especialidad),
  })
  return resultado(error)
}
export async function actualizarAgente(id: string, cambios: Partial<{ nivel: NivelAgente; ciclo: Ciclo; proveedor_estado: Proveedor; presupuesto_mensual: number; especialidad: string; objetivos: string[] }>): Promise<string | null> {
  const { error } = await supabase.from('central_agentes').update(cambios).eq('id', id)
  return resultado(error)
}

/** Pone a todos los agentes (no retirados) a conversar con la IA conectada. El presupuesto de cada uno es el tope mensual general, que sigue mandando sobre todos juntos. */
export async function conectarTodosLosAgentes(presupuesto: number): Promise<string | null> {
  const { error } = await supabase.from('central_agentes').update({ proveedor_estado: 'activo', presupuesto_mensual: presupuesto }).neq('ciclo', 'retirado')
  return resultado(error)
}

export async function actualizarIntegracion(id: string, cambios: { estado?: 'no_conectada' | 'pendiente_autorizacion'; notas?: string }): Promise<string | null> {
  const { error } = await supabase.from('central_integraciones').update(cambios).eq('id', id)
  return resultado(error)
}

export async function guardarConfig(clave: string, valor: unknown): Promise<string | null> {
  const { error } = await supabase.from('central_config').upsert({ clave, valor })
  return resultado(error)
}

export async function guardarUbicacion(restauranteId: string, c: { nombre: string; pais: string; lat: number; lng: number }): Promise<string | null> {
  const { error } = await supabase.from('central_ubicaciones').upsert({ restaurante_id: restauranteId, ciudad: c.nombre, pais: c.pais, lat: c.lat, lng: c.lng })
  return resultado(error)
}
export async function quitarUbicacion(restauranteId: string): Promise<string | null> {
  const { error } = await supabase.from('central_ubicaciones').delete().eq('restaurante_id', restauranteId)
  return resultado(error)
}

export async function marcarLeidas(ids: string[]): Promise<string | null> {
  if (!ids.length) return null
  const { error } = await supabase.from('central_notificaciones').update({ leida: true }).in('id', ids)
  return resultado(error)
}

// ── Crecimiento (Fase 1): matriz de funciones, autorizaciones de campaña y lista de "no contactar" ─────────────────────────
// Solo guardan reglas y permisos. Nada aquí contacta a nadie ni publica; la base hace cumplir los requisitos (migración 20261119120000).
export type EstadoFuncion = 'produccion' | 'parcial' | 'desarrollo' | 'planeada' | 'no_existe' | 'sin_verificar'
const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

export async function guardarFuncion(id: string, f: { estado: EstadoFuncion; evidencia: string; limitaciones: string }): Promise<string | null> {
  const { error } = await supabase.from('growth_funciones')
    .update({ estado: f.estado, evidencia: limpio(f.evidencia), limitaciones: limpio(f.limitaciones), verificado_en: f.estado === 'sin_verificar' ? null : hoyBogota() }).eq('id', id)
  return resultado(error)
}

export interface NuevaCampana { nombre: string; objetivo: string; ciudad: string; segmento: string; max_prospectos: number }
/** Crea un BORRADOR de campaña con las reglas predeterminadas del documento maestro (el resto de campos obligatorios). */
export async function crearCampana(c: NuevaCampana): Promise<string | null> {
  const { error } = await supabase.from('growth_autorizaciones').insert({
    tipo: 'campana', nombre: limpio(c.nombre),
    alcance: {
      objetivo: limpio(c.objetivo), ciudad: limpio(c.ciudad), segmento: limpio(c.segmento), max_prospectos: c.max_prospectos,
      criterios_exclusion: 'Clientes actuales, personas en la lista de no contactar y negocios sin canal comercial público',
      max_contactos_por_prospecto: 3, canales: ['correo'], horario: 'L-V 7:00-19:00, sábado 8:00-15:00, sin domingos ni festivos (America/Bogota)',
      plantillas: 'Se aprueban antes del primer envío', planes_permitidos: ['emprende', 'pro'], descuentos_permitidos: 'ninguno',
      frecuencia_seguimiento: 'cada 3 días, máximo 2 seguimientos', criterios_detencion: 'respuesta negativa, baja, rebote, o llegar al máximo de contactos',
    },
  })
  return resultado(error)
}
export async function activarAutorizacion(id: string, dias: number): Promise<string | null> {
  const { error } = await supabase.rpc('growth_activar_autorizacion', { p_id: id, p_hasta: new Date(Date.now() + dias * 86_400_000).toISOString() })
  return resultado(error)
}
export async function revocarAutorizacion(id: string, motivo: string): Promise<string | null> {
  const { error } = await supabase.rpc('growth_revocar_autorizacion', { p_id: id, p_motivo: limpio(motivo) })
  return resultado(error)
}
export async function agregarNoContactar(canal: 'correo' | 'whatsapp' | 'telefono' | 'redes', valor: string, motivo: 'baja_solicitada' | 'queja' | 'rebote' | 'manual'): Promise<string | null> {
  if (limpio(valor).length < 3) return 'Escribe el correo o número a no contactar.'
  const { error } = await supabase.rpc('growth_suprimir', { p_canal: canal, p_valor: limpio(valor), p_motivo: motivo, p_fuente: 'Agregado a mano en Central' })
  return resultado(error)
}

// ── Prospectos (Fase 2): CRM, expedientes e historial ───────────────────────────────────────────────────────────────────
// La base hace cumplir las reglas de etapa (fuentes, campaña vigente, no contactar, ejemplos nunca se contactan). Aquí solo se traducen los errores.
export const ETAPAS = ['prospecto_identificado', 'investigado', 'contacto_pendiente', 'contactado', 'conversacion_iniciada', 'calificado', 'demostracion_propuesta', 'demostracion_confirmada', 'demostracion_realizada', 'propuesta_presentada', 'seguimiento', 'negociacion', 'aprobacion_pendiente', 'cliente_activado', 'perdido', 'recontacto_futuro', 'no_contactar'] as const
export type Etapa = (typeof ETAPAS)[number]

const vacioNull = (s?: string) => (s && s.trim() ? s.trim() : null)
function errorProspecto(e: unknown): string | null {
  if (!e) return null
  if ((e as ErrorBase).code === '23505') return 'Ese prospecto ya existe (mismo nombre y ciudad, correo, teléfono o web).'
  return textoError(e)
}

export interface NuevoProspecto { nombre_comercial: string; ciudad: string; segmento: string; fuente: string; fuente_url?: string; ubicacion_publica?: string; campana_id?: string | null; correo?: string; telefono?: string; web?: string; es_ficticio?: boolean }
export async function crearProspecto(p: NuevoProspecto): Promise<string | null> {
  const { error } = await supabase.from('growth_prospectos').insert({
    nombre_comercial: limpio(p.nombre_comercial), ciudad: limpio(p.ciudad), segmento: limpio(p.segmento), fuente: limpio(p.fuente),
    ubicacion_publica: limpio(p.ubicacion_publica ?? ''), campana_id: p.campana_id ?? null,
    fuente_url: vacioNull(p.fuente_url), correo: vacioNull(p.correo), telefono: vacioNull(p.telefono), web: vacioNull(p.web), es_ficticio: !!p.es_ficticio,
  })
  return errorProspecto(error)
}

/** Tres prospectos claramente de ejemplo para practicar el flujo. Nunca pueden pasar a "contactado". */
export async function cargarEjemplos(): Promise<string | null> {
  const ej = [['Café Ficticio del Parque', 'cafetería'], ['Pizzería de Ejemplo', 'pizzería'], ['Hamburguesas Imaginarias', 'hamburguesería']]
  for (const [nombre, segmento] of ej) {
    const e = await crearProspecto({ nombre_comercial: `[EJEMPLO] ${nombre}`, ciudad: 'Armenia', segmento, fuente: 'Dato de ejemplo (no es un negocio real)', es_ficticio: true })
    if (e && !/ya existe/.test(e)) return e
  }
  return null
}

export interface CambiosProspecto { etapa?: Etapa; campana_id?: string | null; motivo_perdida?: string; proxima_accion?: string; proxima_accion_en?: string | null; necesidades_confirmadas?: string }
export async function actualizarProspecto(id: string, c: CambiosProspecto): Promise<string | null> {
  const { error } = await supabase.from('growth_prospectos').update(c).eq('id', id)
  return errorProspecto(error)
}

export interface Expediente { investigacion: Record<string, unknown>; ventas: Record<string, unknown>; fundador: Record<string, unknown> }
export async function guardarExpediente(prospectoId: string, e: Expediente): Promise<string | null> {
  const { error } = await supabase.from('growth_expedientes').upsert({ prospecto_id: prospectoId, ...e }, { onConflict: 'prospecto_id' })
  return resultado(error)
}

export async function agregarNota(prospectoId: string, texto: string): Promise<string | null> {
  if (limpio(texto).length < 2) return 'Escribe la nota.'
  const { error } = await supabase.from('growth_historial').insert({ prospecto_id: prospectoId, tipo: 'nota', detalle: limpio(texto).slice(0, 2000) })
  return resultado(error)
}

// ── Fase 3: misión del día y agenda comercial ───────────────────────────────
/** Pide la misión de hoy (si ya existe no crea otra). Se decide por reglas con datos reales, sin IA. */
export async function generarMision(): Promise<string | null> {
  const r = await invocar<{ ok: boolean }>('central-mision', { modo: 'manana' })
  return r.ok === true ? null : r.mensaje
}
/** El dueño solo cambia el estado de la misión; si la bloquea debe decir qué la bloqueó. */
export async function actualizarMision(id: string, estado: 'en_curso' | 'completada' | 'bloqueada', bloqueo?: string): Promise<string | null> {
  const { error } = await supabase.from('growth_misiones').update({ estado, bloqueo: estado === 'bloqueada' ? limpio(bloqueo ?? '') : null }).eq('id', id)
  return resultado(error)
}

export type TipoCita = 'llamada' | 'demostracion' | 'visita' | 'seguimiento'
export type EstadoCita = 'propuesta' | 'confirmada' | 'realizada' | 'cancelada' | 'no_asistio'
export interface NuevaCita { prospecto_id: string; tipo: TipoCita; canal: string; contacto?: string; resumen?: string }
export async function crearCita(c: NuevaCita): Promise<string | null> {
  const { error } = await supabase.from('growth_citas').insert({ ...c, contacto: limpio(c.contacto ?? ''), resumen: limpio(c.resumen ?? '') })
  return resultado(error)
}
export interface CambiosCita { estado?: EstadoCita; fecha_hora?: string; aceptacion?: string; resultado?: string; necesidades?: string; objeciones?: string }
export async function actualizarCita(id: string, c: CambiosCita): Promise<string | null> {
  const { error } = await supabase.from('growth_citas').update(c).eq('id', id)
  return resultado(error)
}

// ── Fase 4 (parte 1): bandeja de mensajes en modo borrador (no hay correo conectado: nada se envía solo) ──
export type CanalMensaje = 'correo' | 'whatsapp' | 'telefono'
export type EstadoMensaje = 'borrador' | 'aprobado' | 'enviado' | 'fallido' | 'recibido' | 'cancelado' | 'hecho_manual'
export interface NuevoMensaje { prospecto_id: string; canal: CanalMensaje; paso: number; asunto: string; cuerpo: string; campana_id?: string | null }
export async function crearMensaje(m: NuevoMensaje): Promise<string | null> {
  const { error } = await supabase.from('growth_mensajes').insert({ ...m, asunto: limpio(m.asunto), cuerpo: limpio(m.cuerpo), campana_id: m.campana_id || null })
  return error?.code === '23505' ? 'Ya existe un mensaje para ese prospecto, canal y paso.' : resultado(error)
}
export async function actualizarMensaje(id: string, c: { asunto?: string; cuerpo?: string; campana_id?: string | null; estado?: EstadoMensaje }): Promise<string | null> {
  const { error } = await supabase.from('growth_mensajes').update(c).eq('id', id)
  return resultado(error)
}

// ── Trabajo automático de los agentes (cola central_trabajos). Los interruptores los decide la base; aquí solo se piden. ──
export async function moverInterruptor(clave: 'agentes_activos' | 'pausa_agentes' | 'pausa_tipos', valor: boolean | string[]): Promise<string | null> {
  const { error } = await supabase.rpc('central_interruptor', { p_clave: clave, p_valor: valor })
  return resultado(error)
}
export interface RespuestaTrabajador { ok: boolean; plan?: { ya_existia: boolean; estado: string; semana: string; tareas?: number }; funciones?: { total: number; nuevas: number; actualizadas: number; bajadas: number; reverificar: number; fallos: number }; campanas?: number; trabajos?: string[]; ejecutados?: { id: string; estado: string; detalle?: unknown }[]; mensaje?: string }
/** "encolar": crea el trabajo de hoy por cada campaña vigente (sin duplicar). "ejecutar": toma trabajos de la cola y los corre (solo investiga: no contacta a nadie). */
export const pedirAlTrabajador = (accion: 'encolar' | 'ejecutar' | 'sincronizar_funciones' | 'generar_plan') => invocar<RespuestaTrabajador>('central-trabajador', { accion })

// ── Conversación de dos vías por Telegram (la hace el SERVIDOR; aquí solo se pide activarla, quitarla o ver si está activa) ──
export interface EstadoTelegramChat { ok: boolean; activo: boolean; pendientes: number; ultimoError: string | null }
export const telegramChat = <T = { ok: boolean }>(accion: 'registrar' | 'quitar' | 'estado') => invocar<T>('central-telegram-chat', { accion })

// ── Propuestas de herramientas y conectores (Tomi propone; solo el dueño con 2 pasos aprueba o rechaza; lo decide la base) ──
export async function decidirPropuesta(id: string, decision: 'aprobar' | 'rechazar', nota: string): Promise<string | null> {
  const { error } = await supabase.rpc('central_decidir_propuesta', { p_id: id, p_decision: decision, p_nota: limpio(nota) || null })
  return resultado(error)
}

// ── Plan semanal: el dueño quita, cambia y aprueba; la base impide editar un plan ya aprobado ──
export async function cambiarItemPlan(id: string, c: { quitado?: boolean; descripcion?: string }): Promise<string | null> {
  const { error } = await supabase.rpc('central_plan_item_cambiar', { p_item: id, p_quitado: c.quitado ?? null, p_descripcion: c.descripcion ? limpio(c.descripcion) : null, p_dia: null })
  return resultado(error)
}
export async function aprobarPlan(id: string): Promise<{ ok: true; datos: { encolados: number; para_ti: number; dias_pasados: number } } | { ok: false; mensaje: string }> {
  const { data, error } = await supabase.rpc('central_plan_aprobar', { p_plan: id })
  return error ? { ok: false, mensaje: textoError(error) } : { ok: true, datos: data as { encolados: number; para_ti: number; dias_pasados: number } }
}
