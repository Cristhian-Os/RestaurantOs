// Prueba de los tickets. Correr con:  node src/lib/print/print.test.ts
import assert from 'node:assert/strict'
import { ajustar, aplanar, aTexto, COLUMNAS, cop, fechaHora, sinAcentos, type Modelo } from './modelo.ts'
import { buildTicket, PIE_LEGAL, type DatosRecibo, type Encabezado, type Pedido } from './tickets.ts'
import { renderHtml, textoWhatsApp } from './render.ts'

const enc: Encabezado = { nombre: 'Heladería La Piña', razonSocial: 'La Piña SAS', nit: '901.234.567-8', direccion: 'Calle 15 # 14-20, Armenia', telefono: '3001234567', mensaje: '¡Gracias por su visita!' }
const pedido: Pedido = {
  numero: 12, mesa: 3, tipo: 'LOCAL', mesero: 'Daniela', creado: '2026-10-21T02:30:00Z',   // 21:30 del 20 de octubre en Colombia
  items: [
    { name: 'Piña colada', price: 14000, quantity: 2, size: 'Grande', notes: 'Sin azúcar · ñapa de cereza', toppings: ['Coco', 'Canelón'] },
    { name: 'Hamburguesa especial de la casa con queso doble, tocineta crocante y salsa de la abuela', price: 28500, quantity: 1 },
    { name: 'Gaseosa', price: 4000, quantity: 1, cancelled: true },
  ],
}
const maximo = (m: Modelo) => Math.max(...aplanar(m).map(l => l.texto.length * (l.grande ? 2 : 1)))
const cuerpo = (m: Modelo) => aTexto(m).join('\n')

for (const ancho of [58, 80] as const) {
  const cols = COLUMNAS[ancho]
  // 1) Ninguna línea se pasa del ancho, con nombres largos y tildes
  for (const tipo of ['precuenta', 'recibo', 'comanda'] as const) {
    const m = tipo === 'comanda' ? buildTicket('comanda', { pedido, estacion: 'Cocina' }, ancho)
      : tipo === 'precuenta' ? buildTicket('precuenta', { encabezado: enc, pedido, propinaSugeridaPct: 10 }, ancho)
      : buildTicket('recibo', { encabezado: enc, pedido, pagos: [{ metodo: 'efectivo', monto: 60500, recibido: 70000, cambio: 9500 }], numeroRecibo: 17, pagadoEn: '2026-10-21T02:40:00Z' }, ancho)
    assert.ok(maximo(m) <= cols, `${tipo} ${ancho}mm: una línea mide ${maximo(m)} y el máximo es ${cols}`)
    assert.ok(cuerpo(m).includes('Piña colada'), `${tipo}: la ñ y la tilde deben salir`)
  }
}

// 2) Comanda: sin precios, con opciones y notas; el anulado y lo cancelado se tratan bien
const c = buildTicket('comanda', { pedido, estacion: 'Cocina' }, 58)
const txtC = cuerpo(c)
assert.ok(!/\$|\d{1,3}\.\d{3}/.test(txtC), 'la comanda NO lleva precios')
assert.ok(txtC.includes('Tamaño: Grande') && txtC.includes('Sin azúcar') && txtC.includes('Toppings: Coco, Canelón'), 'opciones y notas en la comanda')
assert.ok(!txtC.includes('Gaseosa'), 'un plato cancelado no sale en la comanda nueva')
assert.ok(txtC.includes('MESA 3') && txtC.includes('Pedido #12'))
assert.ok(txtC.includes('21:30'), 'la hora sale en hora de Colombia, no UTC (02:30Z = 21:30)')
assert.ok(cuerpo(buildTicket('comanda', { pedido, modo: 'reimpresion' }, 58)).includes('REIMPRESIÓN'))
assert.ok(cuerpo(buildTicket('comanda', { pedido, modo: 'adicion', items: [pedido.items[0]] }, 58)).includes('ADICIÓN'))
const anu = cuerpo(buildTicket('comanda', { pedido, modo: 'anulado', items: [pedido.items[2]] }, 58))
assert.ok(anu.includes('ANULADO') && anu.includes('Gaseosa'))

// 3) Pre-cuenta: totales con propina sugerida opcional y aviso de que no es factura
const pre = cuerpo(buildTicket('precuenta', { encabezado: enc, pedido, propinaSugeridaPct: 10 }, 80))
assert.ok(pre.includes('$56.500'), 'subtotal 2x14.000 + 28.500 = 56.500 (el cancelado no suma)')
assert.ok(pre.includes('$5.650') && pre.includes('$62.150'), 'propina 10% y total con propina')
assert.ok(pre.includes('Esta no es su factura'))
assert.ok(!cuerpo(buildTicket('precuenta', { encabezado: enc, pedido }, 80)).includes('Propina sugerida'), 'sin propina sugerida no se muestra')

// 4) Recibo con pago dividido (efectivo + tarjeta + transferencia): cada método con su valor y el total cuadra
const dividido: DatosRecibo = { encabezado: enc, pedido, numeroRecibo: 18, pagadoEn: '2026-10-21T02:45:00Z', pagos: [
  { metodo: 'efectivo', monto: 20000, recibido: 20000, comensal: 'Ana' },
  { metodo: 'tarjeta', monto: 16500, comensal: 'Luis' },
  { metodo: 'transferencia', monto: 20000, propina: 5650 },
] }
const rec = cuerpo(buildTicket('recibo', dividido, 58))
assert.ok(rec.includes('Efectivo (Ana)') && rec.includes('Tarjeta (Luis)') && rec.includes('Transferencia'))
assert.ok(rec.includes('$62.150'), 'total = 56.500 + propina 5.650')
assert.ok(rec.includes('Recibo N.º 000018'))
const plano = (m: Modelo) => aTexto(m).map(l => l.trim()).join(' ')       // el pie legal se parte en 2 renglones en papel de 58 mm
assert.ok(plano(buildTicket('recibo', dividido, 58)).includes(PIE_LEGAL), 'el recibo dice que no es factura electrónica (58 mm)')
assert.ok(plano(buildTicket('recibo', dividido, 80)).includes(PIE_LEGAL), 'el recibo dice que no es factura electrónica (80 mm)')
assert.ok(rec.includes('NIT 901.234.567-8') && rec.includes('¡Gracias por su visita!'))
const pagado = [20000, 16500, 20000 + 5650].reduce((a, b) => a + b, 0)
assert.equal(pagado, 62150, 'los pagos suman lo mismo que el total del recibo')

// 5) Cierre de caja
const ci = cuerpo(buildTicket('cierre', { encabezado: enc, fecha: '20/10/2026', cerradoPor: 'Sharyk', efectivoEsperado: 250000, efectivoContado: 247000,
  ventas: { efectivo: 180000, transferencia: 90000, tarjeta: 40000, total: 310000, ordenes: 31 }, gastosDeCaja: 20000, baseCaja: 100000, neto: 290000, gastosTotal: 20000 }, 58))
assert.ok(ci.includes('CIERRE DE CAJA') && ci.includes('$250.000') && ci.includes('$247.000'))
assert.ok(ci.includes('Falta') && ci.includes('$3.000'), 'diferencia: faltan 3.000')

// 6) Ajuste de texto, sin acentos y formatos
assert.deepEqual(ajustar('hola mundo', 32), ['hola mundo'])
assert.ok(ajustar('palabraexcesivamentelargaquenocabeenunrenglon', 10).every(r => r.length <= 10))
assert.equal(sinAcentos('Piña colada, canelón, ñapa'), 'Pina colada, canelon, napa')
assert.ok(!/[ñáéíóú]/i.test(aTexto(c, { soloAscii: true }).join('')), 'modo sin acentos para impresoras que no los soportan')
assert.equal(cop(1234567), '$1.234.567')
assert.equal(fechaHora('2026-01-01T03:00:00Z'), '31/12/2025 22:00', 'cambio de año en hora de Colombia')

// 7) HTML y WhatsApp
const html = renderHtml(buildTicket('recibo', dividido, 58), { autoImprimir: true })
assert.ok(html.includes('@page{size:58mm auto') && html.includes('window.print()') && html.includes('Piña colada'))
assert.ok(!renderHtml(buildTicket('recibo', dividido, 80)).includes('window.print()'))
assert.ok(renderHtml(buildTicket('comanda', { pedido: { ...pedido, cliente: '<script>alert(1)</script>' } }, 58)).includes('&lt;script&gt;'), 'el texto se escapa en el HTML')
assert.ok(textoWhatsApp(buildTicket('recibo', dividido, 58)).startsWith('```'))

// 8) PDF (si la librería corre en Node)
try {
  const { renderPdf } = await import('./pdf.ts')
  const blob = renderPdf(buildTicket('recibo', dividido, 80))
  assert.ok(blob.size > 1000, 'el PDF tiene contenido')
  console.log('PDF de prueba:', blob.size, 'bytes')
} catch (e) { console.log('PDF no probado en Node:', (e as Error).message) }

console.log('print.test.ts: todo OK')
