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
  proveedores: { id: string; nombre: string; llave: boolean; modelo: string }[]
  telegram: { token: boolean; chat: boolean }
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
