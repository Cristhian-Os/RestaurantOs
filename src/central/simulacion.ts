/**
 * simulacion.ts — respuestas "Simulación local" de los agentes (sin red, sin modelo de IA).
 * Mientras no haya un proveedor de modelos configurado y autorizado, un agente NUNCA responde como si fuera real:
 * esto arma un texto determinista con los conteos reales de Central y lo marca siempre como simulación.
 * Se prueba con `node src/central/simulacion.test.ts`.
 */
import type { Agente, Departamento } from './catalogo.ts'

export const MARCA_SIMULACION = '(Simulación local · sin modelo de IA conectado)'

export interface ContextoSimulacion { tareasAbiertas: number; tareasDelArea: number; aprobacionesPendientes: number; restaurantesActivos: number; restaurantesTotal: number }

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function respuestaSimulada(agente: Pick<Agente, 'nombre' | 'especialidad' | 'nivel'>, area: Pick<Departamento, 'nombre'> | undefined, pregunta: string, c: ContextoSimulacion): string {
  const q = sinTildes(pregunta)
  const nombreArea = area?.nombre ?? 'mi área'
  let cuerpo: string
  if (/tarea|pendiente|trabajo|que hay/.test(q)) {
    cuerpo = `En Central hay ${plural(c.tareasAbiertas, 'tarea abierta', 'tareas abiertas')}; ${c.tareasDelArea} ${c.tareasDelArea === 1 ? 'es' : 'son'} de ${nombreArea}. Puedes verlas en la sección Tareas.`
  } else if (/aprob|autoriz|permiso/.test(q)) {
    cuerpo = c.aprobacionesPendientes
      ? `Hay ${plural(c.aprobacionesPendientes, 'aprobación pendiente', 'aprobaciones pendientes')} esperando tu decisión en Tareas → Aprobaciones. Yo no puedo aprobarlas.`
      : 'No hay aprobaciones pendientes ahora mismo.'
  } else if (/restaurante|cliente|negocio|sede/.test(q)) {
    cuerpo = `RestaurantOS tiene ${plural(c.restaurantesTotal, 'restaurante', 'restaurantes')} (${c.restaurantesActivos} activos). Todavía no tengo acceso a sus datos: solo tú los ves desde el panel.`
  } else if (/quien eres|que haces|ayuda|puedes|hola/.test(q)) {
    cuerpo = `Soy ${agente.nombre}, del área ${nombreArea}${agente.especialidad ? ` (${agente.especialidad.toLowerCase()})` : ''}. Hoy estoy en nivel ${agente.nivel}: ${agente.nivel === 'N0' ? 'solo leo y propongo, no cambio nada' : 'solo hago lo reversible que ya aprobaste'}. Pregúntame por tareas, aprobaciones o restaurantes.`
  } else {
    cuerpo = 'Todavía no tengo un modelo de IA conectado, así que no puedo razonar sobre eso. Queda anotado en la conversación; cuando conectes y autorices un proveedor podré responder de verdad.'
  }
  return `${MARCA_SIMULACION} ${cuerpo}`
}
