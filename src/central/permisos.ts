/**
 * permisos.ts — motor de niveles N0–N3 en el navegador (sin red ni React).
 * Es el MISMO criterio que central_permite() en la base (supabase/migrations/20261114140000_central_nucleo.sql): aquí solo sirve para
 * orientar la pantalla (qué botón mostrar); quien lo hace cumplir de verdad es la base, con disparadores.
 */
import type { Nivel, NivelAgente } from './catalogo.ts'

export type Decision = 'ejecutar' | 'requiere_aprobacion' | 'prohibido'

export function permite(nivelAgente: string | null | undefined, nivelAccion: string, hayAprobacion = false): Decision {
  if (nivelAccion === 'N0') return 'ejecutar'                       // leer y analizar
  if (nivelAccion === 'N3') return 'prohibido'                      // exclusivamente humano
  if (nivelAgente !== 'N1' && nivelAgente !== 'N2') return 'prohibido'   // N0 (o desconocido): solo lectura
  if (nivelAccion === 'N1') return 'ejecutar'
  if (nivelAccion === 'N2') return hayAprobacion ? 'ejecutar' : 'requiere_aprobacion'
  return 'prohibido'
}

/** ¿Puede este agente ser responsable de una tarea de este nivel? (la base aplica la misma regla al guardar) */
export const puedeSerResponsable = (nivelAgente: NivelAgente, nivelTarea: Nivel): boolean => permite(nivelAgente, nivelTarea, true) !== 'prohibido'

/** Una tarea necesita tu aprobación antes de ejecutarse si es N2 o N3. */
export const exigeAprobacion = (nivelTarea: Nivel): boolean => nivelTarea === 'N2' || nivelTarea === 'N3'
