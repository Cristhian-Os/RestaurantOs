/**
 * corteExcel.ts — Genera y descarga el corte de caja en Excel (.xlsx)
 * Muestra los productos vendidos, cantidades, el resumen de pagos y en qué se gastó.
 */
import { categoriaLabel, resumirPorCategoria, type Etiquetas } from './gastosResumen.ts'
import { hoyBogota } from './menuOptions.ts'

export interface CorteProducto {
  producto:    string
  metodo_pago: string
  cantidad:    number
  precio_unit: number
  subtotal:    number
}

const METODO_LABEL: Record<string, string> = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  tarjeta:       'Tarjeta',
}

export interface CorteGasto {
  concepto:    string
  monto:       number
  categoria?:  string | null
  created_at?: string
}

export interface CorteDenominacion {
  valor:    number
  cantidad: number
  subtotal: number
}

export interface CortePago {
  comensal:    string | null
  mesa:        string      // "Mesa 3", "Llevar · Ana"…
  metodo:      string
  monto:       number
  propina:     number
  referencia:  string | null
  verificada?: boolean
  hora:        string
}

export interface CorteTotales {
  total_efectivo:      number
  total_transferencia: number
  total_tarjeta?:      number
  total_general:       number
  total_ordenes:       number
  total_gastos?:       number
  total_neto?:         number
  total_propinas?:     number
  base_caja?:          number   // efectivo con el que arrancó el cajón
  efectivo_esperado?:  number   // base + aportes + efectivo + propinas en efectivo − gastos de caja − reembolsos
  gastos_de_caja?:     number
  gastos_adelantados?: number   // pagados con dinero propio de alguien (no salen del cajón)
  reembolsos_de_caja?: number
  aportes_a_caja?:     number
  fecha?:              string
}

export async function descargarCorteExcel(opts: {
  restauranteNombre: string
  totales:           CorteTotales
  productos:         CorteProducto[]
  gastos?:           CorteGasto[]
  denominaciones?:   CorteDenominacion[]
  pagos?:            CortePago[]
  /** Nombres personalizados de las categorías de gastos (clave → nombre). */
  etiquetas?:        Etiquetas
}) {
  const XLSX = await import('xlsx')
  const { restauranteNombre, totales, productos, gastos = [], denominaciones = [], pagos = [], etiquetas } = opts
  const fecha = totales.fecha ?? hoyBogota()

  const n = (v: unknown) => Number(v ?? 0)
  const totalUnidades  = productos.reduce((s, p) => s + n(p.cantidad), 0)
  const totalProductos = productos.reduce((s, p) => s + n(p.subtotal), 0)

  const metodoLabel = (m: string) => METODO_LABEL[m] ?? (m || 'Sin especificar')

  const rows: (string | number)[][] = []
  rows.push([restauranteNombre])
  rows.push([`Corte de caja · ${fecha}`])
  rows.push([])
  rows.push(['Producto', 'Método de pago', 'Cantidad', 'Precio unit.', 'Subtotal'])
  for (const p of productos) {
    rows.push([p.producto, metodoLabel(p.metodo_pago), n(p.cantidad), n(p.precio_unit), n(p.subtotal)])
  }
  rows.push(['TOTAL PRODUCTOS', '', totalUnidades, '', totalProductos])
  rows.push([])
  rows.push(['RESUMEN DE PAGOS', '', '', '', ''])
  rows.push(['Efectivo',       '', '', '', n(totales.total_efectivo)])
  rows.push(['Transferencia',  '', '', '', n(totales.total_transferencia)])
  if (n(totales.total_tarjeta) > 0) rows.push(['Tarjeta', '', '', '', n(totales.total_tarjeta)])
  rows.push(['Ganancias (ventas)', '', '', '', n(totales.total_general)])
  rows.push(['Órdenes',        '', n(totales.total_ordenes), '', ''])
  if (n(totales.total_propinas) > 0) {
    rows.push(['Propinas (NO es venta, se reparte al equipo)', '', '', '', n(totales.total_propinas)])
  }
  const efectivoEsperado = totales.efectivo_esperado ?? n(totales.total_efectivo)
  rows.push([])
  rows.push(['Base de caja (efectivo inicial)', '', '', '', n(totales.base_caja)])
  if (n(totales.aportes_a_caja) > 0)     rows.push(['+ Aportes a la caja', '', '', '', n(totales.aportes_a_caja)])
  if (n(totales.gastos_de_caja) > 0)     rows.push(['− Gastos pagados con efectivo de la caja', '', '', '', -n(totales.gastos_de_caja)])
  if (n(totales.reembolsos_de_caja) > 0) rows.push(['− Reembolsos pagados de la caja', '', '', '', -n(totales.reembolsos_de_caja)])
  if (n(totales.gastos_adelantados) > 0) rows.push(['(Gastos adelantados con dinero propio: no salen del cajón)', '', '', '', n(totales.gastos_adelantados)])
  rows.push(['Efectivo esperado en caja', '', '', '', efectivoEsperado])

  if (denominaciones.length > 0) {
    const totalContado = denominaciones.reduce((s, d) => s + n(d.subtotal), 0)
    const diferencia = totalContado - efectivoEsperado
    rows.push([])
    rows.push(['CONTEO DE EFECTIVO', 'Cantidad', '', '', 'Subtotal'])
    for (const d of denominaciones) {
      rows.push([`$${d.valor.toLocaleString('es-CO')}`, n(d.cantidad), '', '', n(d.subtotal)])
    }
    rows.push(['Total contado', '', '', '', totalContado])
    rows.push(['Efectivo esperado (sistema)', '', '', '', efectivoEsperado])
    rows.push([diferencia === 0 ? 'Cuadra' : 'Diferencia', '', '', '', diferencia])
  }

  const totalGastos = totales.total_gastos ?? gastos.reduce((s, g) => s + n(g.monto), 0)
  const totalNeto = totales.total_neto ?? n(totales.total_general) - totalGastos

  if (gastos.length > 0) {
    rows.push([])
    rows.push(['GASTOS DEL DÍA', 'Categoría', '', '', 'Monto'])
    for (const g of gastos) rows.push([g.concepto, categoriaLabel(g.categoria, etiquetas), '', '', -n(g.monto)])
    const porCategoria = resumirPorCategoria(gastos, etiquetas)
    if (porCategoria.length > 0) {
      rows.push([])
      rows.push(['GASTOS POR CATEGORÍA', 'Gastos', '', '', 'Total'])
      for (const c of porCategoria) rows.push([c.label, c.cantidad, '', '', -c.total])
    }
  }
  rows.push([])
  rows.push(['Total gastos', '', '', '', -totalGastos])
  rows.push(['BENEFICIO NETO', '', '', '', totalNeto])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 16 }]
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ]

  // Formato de moneda para columnas de precio/subtotal (col 3 y 4)
  const money = '#,##0'
  for (let r = 4; r < rows.length; r++) {
    for (const c of [3, 4]) {
      const ref = XLSX.utils.encode_cell({ r, c })
      const cell = ws[ref]
      if (cell && typeof cell.v === 'number') cell.z = money
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Corte de caja')

  // Hoja con cada pago individual: quién pagó, cómo y cuánto (para encontrar un descuadre).
  if (pagos.length > 0) {
    const pagoRows: (string | number)[][] = [['Hora', 'Mesa / pedido', 'Persona', 'Método', 'Monto', 'Propina', 'Referencia', 'Verificada']]
    for (const p of pagos) {
      pagoRows.push([p.hora, p.mesa, p.comensal ?? '', metodoLabel(p.metodo), n(p.monto), n(p.propina), p.referencia ?? '',
        p.metodo === 'transferencia' ? (p.verificada ? 'Sí' : 'No') : ''])
    }
    const wp = XLSX.utils.aoa_to_sheet(pagoRows)
    wp['!cols'] = [{ wch: 8 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 10 }]
    for (let r = 1; r < pagoRows.length; r++) {
      for (const c of [4, 5]) {
        const cell = wp[XLSX.utils.encode_cell({ r, c })]
        if (cell && typeof cell.v === 'number') cell.z = money
      }
    }
    XLSX.utils.book_append_sheet(wb, wp, 'Pagos')
  }

  const slug = restauranteNombre.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  XLSX.writeFile(wb, `corte_${slug || 'restaurante'}_${fecha}.xlsx`)
}

// ─── Corte mensual ──────────────────────────────────────────────────────
export interface CorteMensualDia {
  fecha:         string
  efectivo:      number
  transferencia: number
  tarjeta?:      number
  total:         number
  ordenes:       number
  gastos:        number
}

export interface CorteMensualTotales {
  mes:                 string   // 'YYYY-MM'
  desde:               string   // 'YYYY-MM-DD'
  hasta:               string   // 'YYYY-MM-DD'
  total_efectivo:      number
  total_transferencia: number
  total_tarjeta?:      number
  total_general:       number
  total_ordenes:       number
  total_propinas:      number
  total_gastos:        number
  total_neto:          number
  dias:                CorteMensualDia[]
}

export async function descargarCorteMensualExcel(opts: {
  restauranteNombre: string
  corte:             CorteMensualTotales
  /** Gastos del mes (con categoría) para el desglose "en qué se gastó". Opcional. */
  gastos?:           CorteGasto[]
  /** Nombres personalizados de las categorías de gastos (clave → nombre). */
  etiquetas?:        Etiquetas
}) {
  const XLSX = await import('xlsx')
  const { restauranteNombre, corte, gastos = [], etiquetas } = opts
  const n = (v: unknown) => Number(v ?? 0)

  const mesLabel = new Date(corte.desde + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  const mesLabelCap = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)

  const rows: (string | number)[][] = []
  const moneyCells: [number, number][] = []   // [fila, columna] a formatear como moneda

  const pushMoneyRow = (label: string, valor: number) => {
    rows.push([label, '', '', '', n(valor)])
    moneyCells.push([rows.length - 1, 4])
  }

  rows.push([restauranteNombre])
  rows.push([`Corte mensual · ${mesLabelCap} · sin Rappi`])
  rows.push([`Del ${corte.desde} al ${corte.hasta}`])
  rows.push([])
  rows.push(['RESUMEN DEL MES', '', '', '', ''])
  pushMoneyRow('Efectivo', corte.total_efectivo)
  pushMoneyRow('Transferencia', corte.total_transferencia)
  if (n(corte.total_tarjeta) > 0) pushMoneyRow('Tarjeta', corte.total_tarjeta ?? 0)
  pushMoneyRow('Ventas del mes', corte.total_general)
  if (n(corte.total_propinas) > 0) {
    pushMoneyRow('Propinas (NO es venta, se reparte al equipo)', corte.total_propinas)
  }
  pushMoneyRow('Gastos del mes', -n(corte.total_gastos))
  pushMoneyRow('BENEFICIO NETO DEL MES', corte.total_neto)
  rows.push(['Órdenes', '', '', '', n(corte.total_ordenes)])

  if (corte.dias.length > 0) {
    rows.push([])
    rows.push(['DÍA', 'Efectivo', 'Transferencia', 'Tarjeta', 'Total', 'Órdenes'])
    for (const d of corte.dias) {
      const diaLabel = new Date(d.fecha + 'T12:00:00')
        .toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })
      const r = rows.length
      rows.push([diaLabel.charAt(0).toUpperCase() + diaLabel.slice(1), n(d.efectivo), n(d.transferencia), n(d.tarjeta), n(d.total), n(d.ordenes)])
      moneyCells.push([r, 1], [r, 2], [r, 3], [r, 4])
    }
    const totalRow = rows.length
    rows.push(['TOTAL', n(corte.total_efectivo), n(corte.total_transferencia), n(corte.total_tarjeta), n(corte.total_general), n(corte.total_ordenes)])
    moneyCells.push([totalRow, 1], [totalRow, 2], [totalRow, 3], [totalRow, 4])
  }

  // ¿En qué se gastó? Primero el resumen por categoría y luego cada gasto con su fecha.
  const porCategoria = resumirPorCategoria(gastos, etiquetas)
  if (porCategoria.length > 0) {
    rows.push([])
    rows.push(['GASTOS POR CATEGORÍA', 'Gastos', '', '% del total', 'Total'])
    for (const c of porCategoria) {
      const r = rows.length
      rows.push([c.label, c.cantidad, '', `${Math.round(c.porcentaje)}%`, -c.total])
      moneyCells.push([r, 4])
    }
    rows.push([])
    rows.push(['DETALLE DE GASTOS', 'Categoría', 'Fecha', '', 'Monto'])
    for (const g of [...gastos].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))) {
      const r = rows.length
      const fecha = g.created_at
        ? new Date(g.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
        : ''
      rows.push([g.concepto, categoriaLabel(g.categoria, etiquetas), fecha, '', -n(g.monto)])
      moneyCells.push([r, 4])
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 10 }]
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
  ]

  const money = '#,##0'
  for (const [r, c] of moneyCells) {
    const ref = XLSX.utils.encode_cell({ r, c })
    const cell = ws[ref]
    if (cell && typeof cell.v === 'number') cell.z = money
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Corte mensual')

  const slug = restauranteNombre.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  XLSX.writeFile(wb, `corte_mensual_${slug || 'restaurante'}_${corte.mes}.xlsx`)
}
