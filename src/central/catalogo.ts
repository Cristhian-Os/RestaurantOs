/**
 * catalogo.ts — tipos y textos de RestaurantOS Central (sin red ni React; se prueba con `node src/central/permisos.test.ts`).
 * Los tipos reflejan las tablas de supabase/migrations/20261114140000_central_nucleo.sql.
 */
export type Nivel = 'N0' | 'N1' | 'N2' | 'N3'
export type NivelAgente = 'N0' | 'N1' | 'N2'          // N3 es solo humano: ningún agente lo tiene
export type Ciclo = 'disenado' | 'configuracion' | 'pruebas' | 'activo' | 'suspendido' | 'en_revision' | 'retirado'
export type Proveedor = 'no_conectado' | 'simulacion_local' | 'pendiente_configuracion' | 'activo'
export type Prioridad = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type EstadoTarea = 'propuesta' | 'pendiente_aprobacion' | 'aprobada' | 'en_ejecucion' | 'bloqueada' | 'completada' | 'rechazada' | 'cancelada'

export interface Departamento {
  id: string; nombre: string; tipo: 'direccion' | 'supervision' | 'reuniones' | 'planificacion' | 'departamento' | 'servicio'
  anillo: 2 | 3 | 4; orden: number; color: string; descripcion: string
  privacidad: 'abierto' | 'semiprivado' | 'privado'; estado: 'activo' | 'en_construccion'
}
export interface Agente {
  id: string; nombre: string; departamento_id: string; rol: 'chef_mayor' | 'jefe' | 'subordinado' | 'asistente'
  especialidad: string; objetivos: string[]; ciclo: Ciclo; nivel: NivelAgente; proveedor_estado: Proveedor
  modelos: string[]; herramientas: string[]; presupuesto_mensual: number; reporta_a: string | null; orden: number
  /** Calculado en pantalla (no viene de la base): tiene un trabajo en marcha o terminado en las últimas 24 h. */
  trabajando?: boolean
}
export interface Proyecto {
  id: string; nombre: string; descripcion: string; estado: 'planeado' | 'en_curso' | 'pausado' | 'completado' | 'cancelado'
  departamento_id: string | null; presupuesto: number | null; fecha_inicio: string | null; fecha_fin: string | null; created_at: string
}
export interface Tarea {
  id: string; codigo: number; titulo: string; descripcion: string; solicitante_tipo: 'humano' | 'agente'; solicitante_id: string
  responsable_agente_id: string | null; departamento_id: string | null; proyecto_id: string | null
  prioridad: Prioridad; estado: EstadoTarea; nivel_requerido: Nivel; depende_de: string[]; fecha_limite: string | null
  presupuesto: number | null; resultado: string | null; created_at: string; updated_at: string
}
export interface Aprobacion {
  id: string; tarea_id: string | null; accion: string; nivel: 'N1' | 'N2' | 'N3'; alcance: string; impacto: string
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'expirada' | 'revocada'; decidido_por: string | null; decidido_en: string | null
  nota_decision: string | null; expira_en: string | null; created_at: string
}
export interface Conversacion {
  id: string; tipo: 'directo' | 'canal_departamento' | 'canal_interdepartamental' | 'canal_institucional' | 'grupo_temporal' | 'reunion'
  titulo: string; agente_id: string | null; departamento_id: string | null; tarea_id: string | null; archivada: boolean; created_at: string
}
export interface Mensaje {
  id: number; conversacion_id: string; autor_tipo: 'humano' | 'agente' | 'sistema'; autor_id: string; contenido: string
  modo: 'real' | 'simulacion_local'; responde_a: number | null; created_at: string
}
export interface Reunion {
  id: string; titulo: string; inicio: string; fin: string | null; participantes: string[]; agenda: string; acta: string
  estado: 'programada' | 'en_curso' | 'realizada' | 'cancelada'
}
export interface Notificacion {
  id: string; tipo: 'info' | 'tarea' | 'alerta' | 'aprobacion' | 'reunion'; severidad: 'info' | 'importante' | 'critica'
  titulo: string; detalle: string; origen: string; enlace: string | null; leida: boolean; created_at: string
}
export interface Documento {
  id: string; titulo: string; tipo: 'nota' | 'politica' | 'procedimiento' | 'informe' | 'acta' | 'contrato' | 'otro'; contenido: string
  departamento_id: string | null; version: number; confiabilidad: 'alta' | 'media' | 'baja'; procedencia: string; updated_at: string
}
export interface Memoria {
  id: string; capa: 'operativa' | 'permanente' | 'institucional' | 'historica'; titulo: string; contenido: string
  departamento_id: string | null; restaurante_id: string | null; version: number; procedencia: string
  confiabilidad: 'alta' | 'media' | 'baja'; vigente_hasta: string | null; updated_at: string
}
export interface Integracion {
  id: string; nombre: string; descripcion: string; estado: 'no_conectada' | 'pendiente_autorizacion' | 'activa'
  adaptador: 'ninguno' | 'mock_local' | 'real'; scopes: string[]; notas: string; autorizada_en: string | null
}
export interface Consumo { id: number; agente_id: string; periodo: string; proveedor: string; tokens: number; costo: number }
export interface Ubicacion { restaurante_id: string; ciudad: string; pais: string; lat: number; lng: number }
export interface RestauranteCentral {
  id: string; nombre: string; slug: string | null; pais: string | null; activo: boolean; plan: string | null
  suscripcion: string | null; periodo_hasta: string | null; prueba_hasta: string | null; creado: string
  ciudad: string | null; lat: number | null; lng: number | null; pedidos_hoy: number; cobrado_hoy: number
}
export interface EventoAuditoria {
  id: number; created_at: string; actor_tipo: string; actor_id: string | null; agente_id: string | null; accion: string
  recurso: string | null; nivel: string | null; aprobador_id: string | null; resultado: string; detalle: Record<string, unknown> | null
}

export const ETIQUETA_CICLO: Record<Ciclo, string> = {
  disenado: 'Diseñado', configuracion: 'En configuración', pruebas: 'En pruebas', activo: 'Activo',
  suspendido: 'Suspendido', en_revision: 'En revisión', retirado: 'Retirado',
}
export const ETIQUETA_PROVEEDOR: Record<Proveedor, string> = {
  no_conectado: 'No conectado', simulacion_local: 'Simulación local', pendiente_configuracion: 'Pendiente de configuración', activo: 'Conectado',
}
export const ETIQUETA_ESTADO_TAREA: Record<EstadoTarea, string> = {
  propuesta: 'Propuesta', pendiente_aprobacion: 'Pendiente de aprobación', aprobada: 'Aprobada', en_ejecucion: 'En ejecución',
  bloqueada: 'Bloqueada', completada: 'Completada', rechazada: 'Rechazada', cancelada: 'Cancelada',
}
export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  P0: 'P0 · Crítica', P1: 'P1 · Alta', P2: 'P2 · Media', P3: 'P3 · Normal', P4: 'P4 · Baja',
}
export const ETIQUETA_ROL: Record<Agente['rol'], string> = { chef_mayor: 'Chef Mayor', jefe: 'Jefe de departamento', subordinado: 'Agente', asistente: 'Asistente personal' }
export const ETIQUETA_ANILLO: Record<number, string> = { 1: 'Núcleo · RestaurantOS', 2: 'Anillo 2 · Dirección y supervisión', 3: 'Anillo 3 · Departamentos', 4: 'Anillo 4 · Servicios y bienestar' }

export const NIVELES_INFO: Record<Nivel, { titulo: string; resumen: string; quien: string }> = {
  N0: { titulo: 'N0 · Solo lectura', resumen: 'Leer, analizar, resumir y proponer. No cambia nada.', quien: 'Cualquier agente' },
  N1: { titulo: 'N1 · Autonomía controlada', resumen: 'Acciones reversibles ya aprobadas, dentro de su presupuesto.', quien: 'Agentes que tú subas a N1' },
  N2: { titulo: 'N2 · Requiere tu aprobación', resumen: 'Precios, descuentos, contratos, mensajes, dinero, configuración y acciones sobre clientes.', quien: 'Agente propone, tú apruebas' },
  N3: { titulo: 'N3 · Solo humano', resumen: 'Borrado destructivo, seguridad, dinero crítico, cuenta principal y despliegues a producción.', quien: 'Solo tú' },
}

/** Un trabajo reciente de un agente (cola de trabajos del servidor). Solo lo necesario para saber si está trabajando. */
export interface TrabajoReciente { agente_id: string; estado: string; updated_at: string }
const DIA_MS = 86_400_000
/** ¿El agente está trabajando de verdad? Sí si tiene un trabajo en marcha o uno terminado bien en las últimas 24 horas. */
export function agenteTrabajando(agenteId: string, trabajos: TrabajoReciente[], ahora: number = Date.now()): boolean {
  return trabajos.some(t => t.agente_id === agenteId && (t.estado === 'running' || (t.estado === 'succeeded' && ahora - new Date(t.updated_at).getTime() < DIA_MS)))
}

/** Estado visual de un agente (Activo, Trabajando, Atención, Razonamiento, Incidencia, Inactivo): sale de su ciclo y de su trabajo real, nunca se inventa. */
export interface EstadoVisual { id: 'activo' | 'trabajando' | 'atencion' | 'razonamiento' | 'incidencia' | 'inactivo'; etiqueta: string; color: string }
export const ESTADOS_VISUALES: EstadoVisual[] = [
  { id: 'activo', etiqueta: 'Activo', color: '#34C759' },
  { id: 'trabajando', etiqueta: 'Trabajando', color: '#34C759' },
  { id: 'atencion', etiqueta: 'Atención', color: '#FACC15' },
  { id: 'razonamiento', etiqueta: 'Razonamiento', color: '#A855F7' },
  { id: 'incidencia', etiqueta: 'Incidencia', color: '#EF4444' },
  { id: 'inactivo', etiqueta: 'Inactivo', color: '#9CA3AF' },
]
export function estadoVisual(a: Pick<Agente, 'ciclo' | 'proveedor_estado' | 'trabajando'>): EstadoVisual {
  const por = (id: EstadoVisual['id']) => ESTADOS_VISUALES.find(e => e.id === id) as EstadoVisual
  if (a.ciclo === 'suspendido') return por('incidencia')
  if (a.trabajando && a.proveedor_estado === 'activo') return por('trabajando')   // trabaja de verdad (trabajo en marcha o terminado hoy), aunque su ciclo siga en «diseñado»
  if (a.ciclo === 'activo') return por(a.proveedor_estado === 'activo' ? 'activo' : 'razonamiento')   // en simulación local no es un agente real
  if (a.ciclo === 'configuracion' || a.ciclo === 'pruebas' || a.ciclo === 'en_revision') return por('atencion')
  return por('inactivo')
}

/** Primera letra en mayúscula y sin espacios sobrantes. */
export const titular = (s: string) => s.trim().replace(/^./, c => c.toUpperCase())
export const dinero = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
/** Gasto de IA: los proveedores cobran en dólares, así que presupuestos y consumo de modelos van en USD. */
export const usd = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
export const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })
export const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' })
export function hace(iso: string, ahora = Date.now()): string {
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `hace ${Math.floor(s / 86400)} d`
}
