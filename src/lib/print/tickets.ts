/**
 * tickets.ts — arma el contenido de cada documento (Anexo H, 5): comanda, pre-cuenta, recibo de pago y cierre de caja.
 * Los números salen de los datos que ya calculó el sistema (pedido, pagos, corte); aquí no se recalcula nada aparte.
 */
import { COLUMNAS, cop, fechaHora, soloHora, type Ancho, type Linea, type Modelo } from './modelo.ts'

export interface Encabezado {
  nombre: string; razonSocial?: string | null; nit?: string | null; direccion?: string | null; telefono?: string | null
  mensaje?: string | null; pie?: string | null
}
export interface ItemPedido {
  id?: string | null; name: string; price: number; quantity: number; notes?: string | null; size?: string | null; toppings?: string[] | null
  cancelled?: boolean; comensal?: string | null
}
export interface Pedido {
  numero: number | null; mesa: number | null; tipo: string; cliente?: string | null; mesero?: string | null
  creado: string; items: ItemPedido[]; propina?: number
}
export interface PagoRecibo { metodo: string; monto: number; propina?: number; recibido?: number | null; cambio?: number | null; comensal?: string | null }

export const PIE_LEGAL = 'Recibo de pago, no es factura electrónica'
const TIPO_TXT: Record<string, string> = { LOCAL: 'EN MESA', LLEVAR: 'PARA LLEVAR', DOMICILIO: 'DOMICILIO', RAPPI: 'RAPPI' }
const METODO_TXT: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', mixto: 'Mixto', rappi: 'Rappi' }

const donde = (p: Pedido) => (p.mesa ? `MESA ${p.mesa}` : TIPO_TXT[p.tipo] ?? p.tipo)
const detalleItem = (it: ItemPedido): string[] => {
  const d: string[] = []
  if (it.size) d.push(`Tamaño: ${it.size}`)
  if (it.notes) d.push(it.notes)
  if (it.toppings?.length) d.push(`Toppings: ${it.toppings.join(', ')}`)
  return d
}
const activos = (items: ItemPedido[]) => items.filter(i => !i.cancelled)

/** Líneas del encabezado del negocio (recibo y pre-cuenta). */
function encabezado(e: Encabezado): Linea[] {
  const l: Linea[] = [{ k: 'titulo', texto: e.nombre || 'Mi restaurante' }]
  if (e.razonSocial) l.push({ k: 'centro', texto: e.razonSocial })
  if (e.nit) l.push({ k: 'centro', texto: `NIT ${e.nit}` })
  if (e.direccion) l.push({ k: 'centro', texto: e.direccion })
  if (e.telefono) l.push({ k: 'centro', texto: `Tel. ${e.telefono}` })
  l.push({ k: 'sep' })
  return l
}

/** Renglones de platos con cantidad, valor y (opcional) opciones debajo. */
function lineasConPrecio(items: ItemPedido[]): Linea[] {
  const l: Linea[] = []
  for (const it of activos(items)) {
    l.push({ k: 'fila', izq: `${it.quantity} x ${it.name}`, der: cop(it.price * it.quantity) })
    for (const d of detalleItem(it)) l.push({ k: 'texto', texto: d, sangria: 3 })
  }
  return l
}
const subtotalDe = (items: ItemPedido[]) => activos(items).reduce((s, i) => s + i.price * i.quantity, 0)

// ── Comanda: a cocina, barra o estación. Sin precios. ──
export type ModoComanda = 'nueva' | 'adicion' | 'reimpresion' | 'anulado' | 'cambio'
export interface DatosComanda { pedido: Pedido; estacion?: string; modo?: ModoComanda; items?: ItemPedido[] }

export function comanda(d: DatosComanda, ancho: Ancho): Modelo {
  const modo = d.modo ?? 'nueva'
  const items = d.items ?? d.pedido.items
  const l: Linea[] = []
  if (modo === 'adicion') l.push({ k: 'titulo', texto: 'ADICIÓN' })
  if (modo === 'reimpresion') l.push({ k: 'titulo', texto: 'REIMPRESIÓN' })
  if (modo === 'anulado') l.push({ k: 'titulo', texto: 'ANULADO' })
  if (modo === 'cambio') l.push({ k: 'titulo', texto: 'CAMBIO' })   // plato editado o cancelado después de salir la comanda
  l.push({ k: 'centro', texto: `COMANDA${d.estacion ? ' · ' + d.estacion.toUpperCase() : ''}`, negrita: true })
  l.push({ k: 'fila', izq: d.pedido.numero ? `Pedido #${d.pedido.numero}` : 'Pedido', der: soloHora(d.pedido.creado) })
  l.push({ k: 'texto', texto: donde(d.pedido), grande: true })
  if (d.pedido.cliente) l.push({ k: 'texto', texto: `Cliente: ${d.pedido.cliente}` })
  if (d.pedido.mesero) l.push({ k: 'texto', texto: `Atiende: ${d.pedido.mesero}` })
  l.push({ k: 'sep' })
  const lista = modo === 'anulado' || modo === 'cambio' ? items : activos(items)
  for (const it of lista) {
    const anulado = modo === 'anulado' || (modo === 'cambio' && it.cancelled === true)
    l.push({ k: 'texto', texto: `${anulado ? 'ANULADO ' : ''}${it.quantity} x ${it.name}`, grande: true })
    for (const det of detalleItem(it)) l.push({ k: 'texto', texto: det, sangria: 3, negrita: true })
    if (it.comensal) l.push({ k: 'texto', texto: `Para: ${it.comensal}`, sangria: 3 })
  }
  l.push({ k: 'sep' })
  return { ancho, titulo: 'Comanda', lineas: l }
}

// ── Pre-cuenta: la cuenta que se lleva a la mesa antes de pagar. ──
export interface DatosPrecuenta { encabezado: Encabezado; pedido: Pedido; propinaSugeridaPct?: number | null }

export function precuenta(d: DatosPrecuenta, ancho: Ancho): Modelo {
  const sub = subtotalDe(d.pedido.items)
  const l: Linea[] = [...encabezado(d.encabezado), { k: 'centro', texto: 'PRE-CUENTA', negrita: true }]
  l.push({ k: 'fila', izq: donde(d.pedido), der: fechaHora(d.pedido.creado) })
  if (d.pedido.numero) l.push({ k: 'texto', texto: `Pedido #${d.pedido.numero}` })
  l.push({ k: 'sep' }, ...lineasConPrecio(d.pedido.items), { k: 'sep' })
  l.push({ k: 'fila', izq: 'Subtotal', der: cop(sub) })
  let total = sub
  const pct = Number(d.propinaSugeridaPct) || 0
  if (pct > 0) {
    const prop = Math.round(sub * pct / 100)
    l.push({ k: 'fila', izq: `Propina sugerida ${pct}% (voluntaria)`, der: cop(prop) })
    total += prop
  }
  l.push({ k: 'fila', izq: pct > 0 ? 'TOTAL con propina' : 'TOTAL', der: cop(total), negrita: true }, { k: 'sep' })
  l.push({ k: 'centro', texto: 'Esta no es su factura' })
  return { ancho, titulo: 'Pre-cuenta', lineas: l }
}

// ── Recibo de pago: lo que se entrega después de cobrar. No es factura electrónica. ──
export interface DatosRecibo {
  encabezado: Encabezado; pedido: Pedido; pagos: PagoRecibo[]; numeroRecibo: number | null; pagadoEn: string
}

export function recibo(d: DatosRecibo, ancho: Ancho): Modelo {
  const sub = subtotalDe(d.pedido.items)
  const propina = d.pagos.reduce((s, p) => s + (Number(p.propina) || 0), 0)
  const l: Linea[] = [...encabezado(d.encabezado), { k: 'centro', texto: 'RECIBO DE PAGO', negrita: true }]
  l.push({ k: 'fila', izq: d.numeroRecibo ? `Recibo N.º ${String(d.numeroRecibo).padStart(6, '0')}` : 'Recibo', der: donde(d.pedido) })
  l.push({ k: 'texto', texto: fechaHora(d.pagadoEn) })
  if (d.pedido.numero) l.push({ k: 'texto', texto: `Pedido #${d.pedido.numero}` })
  l.push({ k: 'sep' }, ...lineasConPrecio(d.pedido.items), { k: 'sep' })
  l.push({ k: 'fila', izq: 'Subtotal', der: cop(sub) })
  if (propina > 0) l.push({ k: 'fila', izq: 'Propina', der: cop(propina) })
  l.push({ k: 'fila', izq: 'TOTAL', der: cop(sub + propina), negrita: true }, { k: 'sep' })
  l.push({ k: 'texto', texto: 'PAGOS', negrita: true })
  for (const p of d.pagos) {
    const nombre = (METODO_TXT[p.metodo] ?? p.metodo) + (p.comensal ? ` (${p.comensal})` : '')
    l.push({ k: 'fila', izq: nombre, der: cop(p.monto + (Number(p.propina) || 0)) })
    if (p.metodo === 'efectivo' && p.recibido) l.push({ k: 'fila', izq: '  Recibido', der: cop(p.recibido) })
    if ((p.cambio ?? 0) > 0) l.push({ k: 'fila', izq: '  Cambio', der: cop(p.cambio ?? 0) })
  }
  l.push({ k: 'sep' })
  if (d.encabezado.mensaje) l.push({ k: 'centro', texto: d.encabezado.mensaje })
  l.push({ k: 'centro', texto: d.encabezado.pie || PIE_LEGAL })
  return { ancho, titulo: 'Recibo de pago', lineas: l }
}

// ── Cierre de caja: las mismas cifras de la pantalla del corte. ──
export interface DatosCierre {
  encabezado: Encabezado; fecha: string; cerradoPor?: string | null
  efectivoEsperado: number; efectivoContado?: number | null
  ventas: { efectivo: number; transferencia: number; tarjeta: number; total: number; ordenes: number }
  propinas?: number; baseCaja?: number; aportes?: number
  gastosDeCaja?: number; gastosAdelantados?: number; reembolsos?: number; gastosTotal?: number; neto?: number
}

export function cierre(d: DatosCierre, ancho: Ancho): Modelo {
  const l: Linea[] = [...encabezado(d.encabezado), { k: 'centro', texto: 'CIERRE DE CAJA', negrita: true }]
  l.push({ k: 'texto', texto: d.fecha })
  if (d.cerradoPor) l.push({ k: 'texto', texto: `Cerró: ${d.cerradoPor}` })
  l.push({ k: 'sep' }, { k: 'texto', texto: 'VENTAS', negrita: true })
  l.push({ k: 'fila', izq: 'Efectivo', der: cop(d.ventas.efectivo) }, { k: 'fila', izq: 'Transferencia', der: cop(d.ventas.transferencia) }, { k: 'fila', izq: 'Tarjeta', der: cop(d.ventas.tarjeta) })
  l.push({ k: 'fila', izq: `Total (${d.ventas.ordenes} pedidos)`, der: cop(d.ventas.total), negrita: true })
  if (d.propinas) l.push({ k: 'fila', izq: 'Propinas', der: cop(d.propinas) })
  const gastos: Linea[] = []
  if (d.gastosDeCaja) gastos.push({ k: 'fila', izq: 'Pagados de la caja', der: cop(d.gastosDeCaja) })
  if (d.gastosAdelantados) gastos.push({ k: 'fila', izq: 'Con dinero de otra persona', der: cop(d.gastosAdelantados) })
  if (d.reembolsos) gastos.push({ k: 'fila', izq: 'Reembolsos de la caja', der: cop(d.reembolsos) })
  if (gastos.length) l.push({ k: 'sep' }, { k: 'texto', texto: 'GASTOS', negrita: true }, ...gastos)
  if (d.gastosTotal != null) l.push({ k: 'fila', izq: 'Gastos del día', der: cop(d.gastosTotal) })
  if (d.neto != null) l.push({ k: 'fila', izq: 'Neto del día', der: cop(d.neto), negrita: true })
  l.push({ k: 'sep' }, { k: 'texto', texto: 'EFECTIVO EN EL CAJÓN', negrita: true })
  if (d.baseCaja) l.push({ k: 'fila', izq: 'Base', der: cop(d.baseCaja) })
  if (d.aportes) l.push({ k: 'fila', izq: 'Aportes a la caja', der: cop(d.aportes) })
  l.push({ k: 'fila', izq: 'Esperado', der: cop(d.efectivoEsperado), negrita: true })
  if (d.efectivoContado != null) {
    const dif = d.efectivoContado - d.efectivoEsperado
    l.push({ k: 'fila', izq: 'Contado', der: cop(d.efectivoContado) }, { k: 'fila', izq: dif === 0 ? 'Diferencia' : dif > 0 ? 'Sobra' : 'Falta', der: cop(Math.abs(dif)), negrita: true })
  }
  l.push({ k: 'sep' })
  return { ancho, titulo: 'Cierre de caja', lineas: l }
}

// ── Página de prueba: una línea de cada tipo, con tildes y ñ, para revisar la impresora. ──
export function paginaPrueba(ancho: Ancho, impresora: string): Modelo {
  const l: Linea[] = [
    { k: 'titulo', texto: 'PÁGINA DE PRUEBA' },
    { k: 'centro', texto: `${impresora} · ${ancho} mm`, negrita: true },
    { k: 'sep' },
    { k: 'texto', texto: 'Normal: Piña colada, canelón, ñapa, café' },
    { k: 'texto', texto: 'NEGRITA: ABCDEFGHIJ 0123456789', negrita: true },
    { k: 'texto', texto: 'Letra grande', grande: true },
    { k: 'fila', izq: 'Producto de ejemplo', der: cop(12500) },
    { k: 'fila', izq: 'TOTAL', der: cop(12500), negrita: true },
    { k: 'sep' },
    { k: 'centro', texto: `Ancho: ${COLUMNAS[ancho]} caracteres por línea` },
    { k: 'centro', texto: '12345678901234567890123456789012'.padEnd(COLUMNAS[ancho], '3456789012') },
    { k: 'centro', texto: 'Si lees bien las tildes y la ñ, todo está listo' },
    { k: 'sep' },
  ]
  return { ancho, titulo: 'Página de prueba', lineas: l }
}

export type TipoTicket = 'comanda' | 'precuenta' | 'recibo' | 'cierre'
export function buildTicket(tipo: 'comanda', d: DatosComanda, ancho: Ancho): Modelo
export function buildTicket(tipo: 'precuenta', d: DatosPrecuenta, ancho: Ancho): Modelo
export function buildTicket(tipo: 'recibo', d: DatosRecibo, ancho: Ancho): Modelo
export function buildTicket(tipo: 'cierre', d: DatosCierre, ancho: Ancho): Modelo
export function buildTicket(tipo: TipoTicket, d: never, ancho: Ancho): Modelo {
  switch (tipo) {
    case 'comanda': return comanda(d, ancho)
    case 'precuenta': return precuenta(d, ancho)
    case 'recibo': return recibo(d, ancho)
    case 'cierre': return cierre(d, ancho)
  }
}

export { COLUMNAS }
