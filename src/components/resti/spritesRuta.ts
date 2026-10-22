/**
 * Imágenes de respaldo de Resti: capturas del MISMO modelo 3D (para que el aspecto nunca cambie si el equipo no puede mostrar 3D).
 * Una por estado, dirección (donde importa), cuadro de la caminata y luz del collar. Se generan con scripts/generar-sprites-resti.md.
 */
import type { RestiEstado3D } from './rig/restiAnim.ts'

export type LuzSprite = 'disponible' | 'procesando'
export const BASE_SPRITES = '/assets/resti/sprites'
export const LUCES_SPRITE: LuzSprite[] = ['disponible', 'procesando']
export const ESTADOS_SPRITE: RestiEstado3D[] = ['reposo', 'saludo', 'caminar', 'senalar', 'pensar', 'escuchar', 'explicar', 'ejecutar', 'listo', 'alerta', 'seguro']

const conDireccion = (e: RestiEstado3D) => e === 'caminar' || e === 'senalar'

/** Nombre del archivo: p. ej. `caminar-der-b-procesando.webp`. */
export function archivoSprite(estado: RestiEstado3D, direccion: number, luz: LuzSprite, cuadro = 0): string {
  const dir = conDireccion(estado) ? (direccion < 0 ? '-izq' : '-der') : ''
  const paso = estado === 'caminar' ? (cuadro % 2 ? '-b' : '-a') : ''
  return `${estado}${dir}${paso}-${luz}.webp`
}

export const rutaSprite = (...a: Parameters<typeof archivoSprite>) => `${BASE_SPRITES}/${archivoSprite(...a)}`

/** Todas las combinaciones que deben existir. */
export function listaSprites(): { estado: RestiEstado3D; direccion: number; luz: LuzSprite; cuadro: number; archivo: string }[] {
  const out: ReturnType<typeof listaSprites> = []
  for (const estado of ESTADOS_SPRITE) for (const luz of LUCES_SPRITE) {
    const dirs = conDireccion(estado) ? [1, -1] : [0], cuadros = estado === 'caminar' ? [0, 1] : [0]
    for (const direccion of dirs) for (const cuadro of cuadros) out.push({ estado, direccion, luz, cuadro, archivo: archivoSprite(estado, direccion, luz, cuadro) })
  }
  return out
}
