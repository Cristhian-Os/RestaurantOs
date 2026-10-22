/**
 * Cambios de PEDIDOS y de EQUIPO que Resti propone. Parte pura (sin red): a partir de lo entendido por la IA y de los datos reales
 * arma el «antes → después» y el cambio exacto. Aplicar es `applyChange` con los permisos del administrador y solo tras su confirmación.
 */
import { norm } from './menuCambios.ts'

export interface PedidoFila { id: string; order_number_today: number | null; table_num: number | null; status: string; customer_name: string | null; items: unknown; total: number }
export interface PersonaFila { id: string; full_name: string | null; role: string; active: boolean | null }
export type AccionPedido =
  | { type: 'order_status'; mesa?: number; numero?: number; cliente?: string; status: 'pending' | 'cooking' | 'ready' }
  | { type: 'order_cancel'; mesa?: number; numero?: number; cliente?: string }
export type AccionEquipo = { type: 'staff_active'; nombre: string; active: boolean } | { type: 'biz_name'; value: string }

export type CambioOp =
  | { op: 'order_status'; orderId: string; status: 'pending' | 'cooking' | 'ready' }
  | { op: 'order_cancel'; orderId: string }
  | { op: 'staff_active'; profileId: string; active: boolean }
  | { op: 'biz_name'; name: string }
export interface Propuesta { index: number; title: string; detail: string; change: CambioOp | null; problem?: string; riesgo?: 'alto' }

const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const ESTADO: Record<string, string> = { pending: 'Pendiente', cooking: 'En cocina', ready: 'Listo', completed: 'Completado', cancelled: 'Cancelado' }
const nProductos = (raw: unknown) => { let v = raw; if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return 0 } } return Array.isArray(v) ? v.reduce((n: number, i: { quantity?: number }) => n + (Number(i?.quantity) || 1), 0) : 0 }

/** Pedidos abiertos que encajan con la referencia dicha (número del día, mesa o nombre). */
export function buscarPedidos(ref: { mesa?: number; numero?: number; cliente?: string }, ps: PedidoFila[]): PedidoFila[] {
  if (ref.numero !== undefined) return ps.filter(p => p.order_number_today === ref.numero)
  if (ref.mesa !== undefined) return ps.filter(p => p.table_num === ref.mesa)
  const c = norm(ref.cliente ?? ''); return c ? ps.filter(p => norm(p.customer_name ?? '').includes(c)) : []
}

export function proponerCambiosPedidos(acciones: AccionPedido[], pedidos: PedidoFila[]): Propuesta[] {
  const abiertos = pedidos.filter(p => ['pending', 'cooking', 'ready'].includes(p.status))
  const estado = new Map(abiertos.map(p => [p.id, p.status]))
  return acciones.map((a, index): Propuesta => {
    const ref = a.numero !== undefined ? `pedido #${a.numero}` : a.mesa !== undefined ? `pedido de la mesa ${a.mesa}` : `pedido de ${a.cliente}`
    const hallados = buscarPedidos(a, abiertos)
    if (hallados.length === 0) return { index, title: `Cancelar o cambiar ${ref}`, detail: '', change: null, problem: `No encontré un ${ref} abierto.` }
    if (hallados.length > 1) return { index, title: `Cambiar ${ref}`, detail: '', change: null, problem: `Hay ${hallados.length} pedidos abiertos para eso (${hallados.map(p => '#' + (p.order_number_today ?? '?')).join(', ')}). Dime el número.` }
    const p = hallados[0], nombre = `Pedido #${p.order_number_today ?? '?'}${p.table_num ? ` · mesa ${p.table_num}` : ''}`
    const actual = estado.get(p.id) ?? p.status
    if (a.type === 'order_cancel') return { index, title: `Cancelar ${nombre}`, detail: `${nProductos(p.items)} productos · ${cop(p.total)} · estaba ${ESTADO[actual]?.toLowerCase() ?? actual}`, change: { op: 'order_cancel', orderId: p.id }, riesgo: 'alto' }
    if (actual === a.status) return { index, title: nombre, detail: '', change: null, problem: `Ya está ${ESTADO[actual]?.toLowerCase() ?? actual}.` }
    estado.set(p.id, a.status)
    return { index, title: nombre, detail: `${ESTADO[actual] ?? actual} → ${ESTADO[a.status]}`, change: { op: 'order_status', orderId: p.id, status: a.status } }
  })
}

export function proponerCambiosEquipo(acciones: AccionEquipo[], gente: PersonaFila[], nombreActual: string | null): Propuesta[] {
  const estado = new Map(gente.map(p => [p.id, p.active !== false]))
  return acciones.map((a, index): Propuesta => {
    if (a.type === 'biz_name') return { index, title: 'Nombre del restaurante', detail: `«${nombreActual ?? '—'}» → «${a.value}»`, change: { op: 'biz_name', name: a.value }, riesgo: 'alto' }
    const n = norm(a.nombre)
    const cand = gente.filter(p => p.full_name && (norm(p.full_name) === n || norm(p.full_name).includes(n) || n.includes(norm(p.full_name))))
    if (cand.length === 0) return { index, title: `${a.active ? 'Activar' : 'Desactivar'} a ${a.nombre}`, detail: '', change: null, problem: `No encontré a «${a.nombre}» en el equipo.` }
    if (cand.length > 1) return { index, title: `${a.active ? 'Activar' : 'Desactivar'} a ${a.nombre}`, detail: '', change: null, problem: `Hay varias personas que encajan (${cand.map(p => p.full_name).join(', ')}). Dime el nombre completo.` }
    const p = cand[0]
    if (p.role === 'admin') return { index, title: `${a.active ? 'Activar' : 'Desactivar'} a ${p.full_name}`, detail: '', change: null, problem: 'No se puede cambiar al administrador.' }
    const ahora = estado.get(p.id) ?? true
    if (ahora === a.active) return { index, title: p.full_name!, detail: '', change: null, problem: `Ya está ${a.active ? 'activo' : 'desactivado'}.` }
    estado.set(p.id, a.active)
    return { index, title: `${a.active ? 'Activar' : 'Desactivar'} a ${p.full_name}`, detail: a.active ? 'Desactivado → Activo (vuelve a entrar al sistema)' : 'Activo → Desactivado (ya no puede entrar al sistema)', change: { op: 'staff_active', profileId: p.id, active: a.active }, riesgo: a.active ? undefined : 'alto' }
  })
}
