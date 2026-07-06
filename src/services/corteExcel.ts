/**
 * corteExcel.ts — Genera y descarga el corte de caja en Excel (.xlsx)
 * Muestra los productos vendidos, cantidades y el resumen de pagos.
 */
export interface CorteProducto {
  producto:    string
  cantidad:    number
  precio_unit: number
  subtotal:    number
}

export interface CorteTotales {
  total_efectivo:      number
  total_transferencia: number
  total_general:       number
  total_ordenes:       number
  fecha?:              string
}

export async function descargarCorteExcel(opts: {
  restauranteNombre: string
  totales:           CorteTotales
  productos:         CorteProducto[]
}) {
  const XLSX = await import('xlsx')
  const { restauranteNombre, totales, productos } = opts
  const fecha = totales.fecha ?? new Date().toISOString().slice(0, 10)

  const n = (v: unknown) => Number(v ?? 0)
  const totalUnidades  = productos.reduce((s, p) => s + n(p.cantidad), 0)
  const totalProductos = productos.reduce((s, p) => s + n(p.subtotal), 0)

  const rows: (string | number)[][] = []
  rows.push([restauranteNombre])
  rows.push([`Corte de caja · ${fecha}`])
  rows.push([])
  rows.push(['Producto', 'Cantidad', 'Precio unit.', 'Subtotal'])
  for (const p of productos) {
    rows.push([p.producto, n(p.cantidad), n(p.precio_unit), n(p.subtotal)])
  }
  rows.push(['TOTAL PRODUCTOS', totalUnidades, '', totalProductos])
  rows.push([])
  rows.push(['RESUMEN DE PAGOS', '', '', ''])
  rows.push(['Efectivo',       '', '', n(totales.total_efectivo)])
  rows.push(['Transferencia',  '', '', n(totales.total_transferencia)])
  rows.push(['Total general',  '', '', n(totales.total_general)])
  rows.push(['Órdenes',        n(totales.total_ordenes), '', ''])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 14 }, { wch: 16 }]
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
  ]

  // Formato de moneda para columnas de precio/subtotal
  const money = '#,##0'
  for (let r = 4; r < rows.length; r++) {
    for (const c of [2, 3]) {
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
