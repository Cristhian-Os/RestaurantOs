/**
 * rutas.ts — las pantallas de Central viven en /central/<seccion>[/<id>] (sin red ni React; se prueba con `node src/central/rutas.test.ts`).
 * vercel.json ya manda todo a index.html, así que un enlace directo o recargar la página funciona.
 */
export type Seccion =
  | 'inicio' | 'oficina' | 'mundo' | 'departamentos' | 'agentes' | 'conversaciones' | 'tareas' | 'reuniones' | 'crecimiento' | 'prospectos'
  | 'biblioteca' | 'memoria' | 'integraciones' | 'presupuestos' | 'auditoria' | 'configuracion'

export interface SeccionInfo { id: Seccion; etiqueta: string; grupo: 'Oficina' | 'Trabajo' | 'Conocimiento' | 'Gobierno'; icono: string; principal?: boolean }

export const SECCIONES: SeccionInfo[] = [
  { id: 'inicio', etiqueta: 'Inicio', grupo: 'Oficina', icono: 'inicio', principal: true },
  { id: 'oficina', etiqueta: 'Oficina', grupo: 'Oficina', icono: 'oficina', principal: true },
  { id: 'mundo', etiqueta: 'Mundo', grupo: 'Oficina', icono: 'mundo' },
  { id: 'departamentos', etiqueta: 'Departamentos', grupo: 'Trabajo', icono: 'departamentos' },
  { id: 'agentes', etiqueta: 'Agentes', grupo: 'Trabajo', icono: 'agentes', principal: true },
  { id: 'conversaciones', etiqueta: 'Conversaciones', grupo: 'Trabajo', icono: 'chat' },
  { id: 'tareas', etiqueta: 'Tareas', grupo: 'Trabajo', icono: 'tareas', principal: true },
  { id: 'reuniones', etiqueta: 'Reuniones', grupo: 'Trabajo', icono: 'reuniones' },
  { id: 'prospectos', etiqueta: 'Prospectos', grupo: 'Trabajo', icono: 'agentes' },
  { id: 'crecimiento', etiqueta: 'Crecimiento', grupo: 'Trabajo', icono: 'dinero' },
  { id: 'biblioteca', etiqueta: 'Biblioteca', grupo: 'Conocimiento', icono: 'biblioteca' },
  { id: 'memoria', etiqueta: 'Memoria', grupo: 'Conocimiento', icono: 'memoria' },
  { id: 'integraciones', etiqueta: 'Integraciones', grupo: 'Gobierno', icono: 'integraciones' },
  { id: 'presupuestos', etiqueta: 'Presupuestos', grupo: 'Gobierno', icono: 'dinero' },
  { id: 'auditoria', etiqueta: 'Auditoría', grupo: 'Gobierno', icono: 'escudo' },
  { id: 'configuracion', etiqueta: 'Configuración', grupo: 'Gobierno', icono: 'ajustes' },
]

export interface Ruta { seccion: Seccion; id: string | null }

const CONOCIDAS = new Set<string>(SECCIONES.map(s => s.id))
const ID_VALIDO = /^[a-zA-Z0-9_-]{1,64}$/

/** /central → inicio. Una sección que no existe cae en inicio (nunca en una pantalla en blanco). */
export function parseRuta(pathname: string): Ruta {
  const partes = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean)
  if (partes[0] !== 'central') return { seccion: 'inicio', id: null }
  const s = partes[1] ?? 'inicio'
  const id = partes[2] ?? null
  return { seccion: CONOCIDAS.has(s) ? (s as Seccion) : 'inicio', id: id && ID_VALIDO.test(id) ? id : null }
}

export function rutaAPath(seccion: Seccion, id?: string | null): string {
  if (seccion === 'inicio') return '/central'      // Inicio no tiene detalle: un id aquí se confundiría con otra sección
  const base = `/central/${seccion}`
  return id && ID_VALIDO.test(id) ? `${base}/${id}` : base
}
