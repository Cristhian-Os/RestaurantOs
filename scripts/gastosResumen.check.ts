// Chequeo rápido de gastosResumen (sin framework):
//   node --experimental-strip-types scripts/gastosResumen.check.ts
import assert from 'node:assert/strict'
import {
  categoriaKey, categoriaLabel, resumirPorCategoria, totalGastos, rangoGastosBogota, SIN_CATEGORIA,
  claveDesdeNombre, claveUnica, nombreIgual,
} from '../src/services/gastosResumen.ts'

// Llaves y etiquetas
assert.equal(categoriaKey(null), SIN_CATEGORIA)
assert.equal(categoriaKey('  '), SIN_CATEGORIA)
assert.equal(categoriaKey(' Insumos '), 'insumos')
assert.equal(categoriaLabel('proveedor'), 'Compras a proveedor')
assert.equal(categoriaLabel(null), 'Sin categoría')
assert.equal(categoriaLabel('nomina'), 'Nómina y pagos al equipo')
assert.equal(categoriaLabel('gasolina'), 'Gasolina') // desconocida: se muestra tal cual

// Resumen por categoría: suma, cuenta, ordena de mayor a menor, porcentajes
const gastos = [
  { concepto: 'Hielo',      monto: 20000,   categoria: 'insumos' },
  { concepto: 'Fruta',      monto: '30000', categoria: 'insumos' },
  { concepto: 'Luz',        monto: 80000,   categoria: 'servicios' },
  { concepto: 'Compra X',   monto: 50000,   categoria: 'proveedor' },
  { concepto: 'Viejo',      monto: 20000,   categoria: null },
  { concepto: 'Monto malo', monto: 0,       categoria: 'otros' },     // se ignora
  { concepto: 'Texto malo', monto: 'abc',   categoria: 'otros' },     // se ignora
]
const r = resumirPorCategoria(gastos)
assert.deepEqual(r.map(x => [x.key, x.total, x.cantidad]), [
  ['servicios', 80000, 1],
  ['proveedor', 50000, 1],   // empate en total: orden alfabético por etiqueta
  ['insumos', 50000, 2],
  [SIN_CATEGORIA, 20000, 1],
])
assert.equal(Math.round(r.reduce((s, x) => s + x.porcentaje, 0)), 100)
assert.equal(Math.round(r[0].porcentaje), 40) // 80.000 de 200.000

assert.deepEqual(resumirPorCategoria([]), [])
assert.equal(totalGastos(gastos), 200000)

// Rango del mes en hora de Colombia: del 1 00:00 (-05:00) hasta el fin del último día incluido
assert.deepEqual(rangoGastosBogota('2026-10-01', '2026-10-15'), {
  from: '2026-10-01T05:00:00.000Z', to: '2026-10-16T05:00:00.000Z',
})
assert.deepEqual(rangoGastosBogota('2026-10-01', '2026-10-31'), {
  from: '2026-10-01T05:00:00.000Z', to: '2026-11-01T05:00:00.000Z',
})

// Nombres personalizados del restaurante: tienen prioridad sobre los sugeridos
assert.equal(categoriaLabel('insumos', { insumos: ' Mercado ' }), 'Mercado')
assert.equal(categoriaLabel('insumos', {}), 'Insumos y mercado')
assert.equal(categoriaLabel('insumos', { insumos: '  ' }), 'Insumos y mercado') // nombre vacío: cae al sugerido
assert.equal(categoriaLabel('publicidad', { publicidad: 'Publicidad y redes' }), 'Publicidad y redes')
assert.equal(categoriaLabel(null, { [SIN_CATEGORIA]: 'x' }), 'x')
const rr = resumirPorCategoria([{ concepto: 'a', monto: 10, categoria: 'insumos' }], { insumos: 'Mercado' })
assert.equal(rr[0].label, 'Mercado')

// Claves de categorías nuevas
assert.equal(claveDesdeNombre('Publicidad y Redes'), 'publicidad_y_redes')
assert.equal(claveDesdeNombre('  Papelería & Útiles  '), 'papeleria_utiles')
assert.equal(claveDesdeNombre('!!!'), 'categoria')
assert.equal(claveDesdeNombre('a'.repeat(80)).length, 36)
assert.match(claveDesdeNombre('Ñandú ñ'), /^[a-z0-9_]{1,40}$/)
assert.equal(claveUnica('Gas', []), 'gas')
assert.equal(claveUnica('Gas', ['gas']), 'gas_2')
assert.equal(claveUnica('Gas', ['gas', 'gas_2']), 'gas_3')
assert.equal(claveUnica('Proveedor', []), 'proveedor_2')               // reservada del sistema
assert.equal(claveUnica('Sin categoría', []), 'sin_categoria_2')       // reservada del sistema
assert.equal(nombreIgual(' Gas ', 'gas'), true)
assert.equal(nombreIgual('Gas', 'Gasolina'), false)

console.log('gastosResumen: OK')
