/**
 * shared.ts — helpers que antes se repetían en Caja, Cocina, Historial y modales.
 */
export { esRappi } from '../../services/salesHistory'

/** Pesos colombianos: $12.500 */
export const fmt = (n: number | string | null | undefined) => '$' + Math.round(Number(n ?? 0)).toLocaleString('es-CO')

/** Número del pedido: secuencial del día; los anteriores a ese cambio usan el id corto. */
export const orderRef = (o: { id: string; order_number_today?: number | null }) =>
  `#${o.order_number_today ?? o.id.slice(0, 8)}`

/** Hora (HH:MM) en hora de Colombia, sin importar la zona horaria del equipo. */
export const horaBogota = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : ''
