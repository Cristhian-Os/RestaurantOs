/**
 * corteExcel.ts — Genera y descarga el corte de caja en Excel (.xlsx)
 * Muestra los productos vendidos, cantidades y el resumen de pagos.
 */
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
  concepto: string
  monto:    number
}

export interface CorteDenominacion {
  valor:    number
  cantidad: number
  subtotal: number
}

export interface CorteTotales {
  total_efectivo:      number
  total_transferencia: number
  total_general:       number
  total_ordenes:       number
  total_gastos?:       number
  total_neto?:         number
  total_propinas?:     number
  base_caja?:          number   // efectivo con el que arrancó el cajón
  efectivo_esperado?:  number   // base + ventas en efectivo + propinas en efectivo
  fecha?:              string
}

export async function descargarCorteExcel(opts: {
  restauranteNombre: string
  totales:           CorteTotales
  productos:         CorteProducto[]
  gastos?:           CorteGasto[]
  denominaciones?:   CorteDenominacion[]
}) {
  const XLSX = await import('xlsx')
  const { restauranteNombre, totales, productos, gastos = [], denominaciones = [] } = opts
  const fecha = totales.fecha ?? new Date().toISOString().slice(0, 10)

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
  rows.push(['Ganancias (ventas)', '', '', '', n(totales.total_general)])
  rows.push(['Órdenes',        '', n(totales.total_ordenes), '', ''])
  if (n(totales.total_propinas) > 0) {
    rows.push(['Propinas (NO es venta, se reparte al equipo)', '', '', '', n(totales.total_propinas)])
  }
  const efectivoEsperado = totales.efectivo_esperado ?? n(totales.total_efectivo)
  rows.push([])
  rows.push(['Base de caja (efectivo inicial)', '', '', '', n(totales.base_caja)])
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
    rows.push(['GASTOS DEL DÍA', '', '', '', ''])
    for (const g of gastos) rows.push([g.concepto, '', '', '', -n(g.monto)])
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

  const slug = restauranteNombre.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  XLSX.writeFile(wb, `corte_${slug || 'restaurante'}_${fecha}.xlsx`)
}
