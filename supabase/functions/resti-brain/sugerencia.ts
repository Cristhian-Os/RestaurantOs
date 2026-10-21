// Sugerencias de mejora que el administrador le cuenta a Resti. El modelo solo aporta el resumen y el módulo;
// restaurante, usuario y rol salen de la SESIÓN, y el texto original es el que escribió la persona (no el del modelo).
export const MODULOS = ['pedidos', 'cocina', 'caja', 'inventario', 'menu', 'menu_publico', 'equipo', 'pagos', 'otro'] as const
export const ANOTADO = 'Anotado, lo pasé al equipo.'

export interface SugerenciaSegura {
  tipo: 'mejora'; modulo: (typeof MODULOS)[number]; urgencia: 'baja'; titulo: string; detalle: string
}

// eslint-disable-next-line no-control-regex
const limpiar = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Devuelve la sugerencia lista para guardar, o null si no hay una sugerencia clara. La urgencia siempre es "baja": una idea no es un bloqueo. */
export function validarSugerencia(raw: unknown, textoAdmin: string): SugerenciaSegura | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const titulo = limpiar(s.summary, 140)
  if (titulo.length < 3) return null
  const original = limpiar(textoAdmin, 4000)
  if (original.length < 3) return null
  const modulo = (MODULOS as readonly string[]).includes(String(s.category)) ? String(s.category) as SugerenciaSegura['modulo'] : 'otro'
  return { tipo: 'mejora', modulo, urgencia: 'baja', titulo, detalle: original }
}
