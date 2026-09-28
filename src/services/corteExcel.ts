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

// ─── Corte mensual ──────────────────────────────────────────────────────
export interface CorteMensualDia {
  fecha:         string
  efectivo:      number
  transferencia: number
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
}) {
  const XLSX = await import('xlsx')
  const { restauranteNombre, corte } = opts
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
  pushMoneyRow('Ventas del mes', corte.total_general)
  if (n(corte.total_propinas) > 0) {
    pushMoneyRow('Propinas (NO es venta, se reparte al equipo)', corte.total_propinas)
  }
  pushMoneyRow('Gastos del mes', -n(corte.total_gastos))
  pushMoneyRow('BENEFICIO NETO DEL MES', corte.total_neto)
  rows.push(['Órdenes', '', '', '', n(corte.total_ordenes)])

  if (corte.dias.length > 0) {
    rows.push([])
    rows.push(['DÍA', 'Efectivo', 'Transferencia', 'Órdenes', 'Total'])
    for (const d of corte.dias) {
      const diaLabel = new Date(d.fecha + 'T12:00:00')
        .toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })
      const r = rows.length
      rows.push([diaLabel.charAt(0).toUpperCase() + diaLabel.slice(1), n(d.efectivo), n(d.transferencia), n(d.ordenes), n(d.total)])
      moneyCells.push([r, 1], [r, 2], [r, 4])
    }
    const totalRow = rows.length
    rows.push(['TOTAL', n(corte.total_efectivo), n(corte.total_transferencia), n(corte.total_ordenes), n(corte.total_general)])
    moneyCells.push([totalRow, 1], [totalRow, 2], [totalRow, 4])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }]
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
