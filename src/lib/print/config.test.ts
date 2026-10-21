// Prueba de la configuración y del reparto por impresora. Correr con:  node src/lib/print/config.test.ts
import assert from 'node:assert/strict'
import { CONFIG_INICIAL, normalizarConfig, repartirPorImpresora, type Impresora } from './configModelo.ts'
import type { ItemPedido } from './tickets.ts'

// 1) Normalizar: lo raro se acota, lo faltante toma valores por defecto
assert.deepEqual(normalizarConfig(null), CONFIG_INICIAL)
assert.deepEqual(normalizarConfig('basura'), CONFIG_INICIAL)
const n = normalizarConfig({ impresoras: [{ id: 'a', nombre: 'Cocina\u0000', ancho: 80, categorias: ['comidas', '', 'x'.repeat(200)], copias: 99 }, { nombre: '', ancho: 72, activa: false }],
  recibo: 'siempre', propinaSugeridaPct: 99, comandaAutomatica: 'si', mensaje: 'Gracias', pie: 'p'.repeat(500) })
assert.equal(n.impresoras[0].nombre, 'Cocina'); assert.equal(n.impresoras[0].ancho, 80); assert.equal(n.impresoras[0].copias, 5)
assert.equal(n.impresoras[0].categorias.length, 2); assert.equal(n.impresoras[0].categorias[1].length, 60)
assert.equal(n.impresoras[1].ancho, 58, 'un ancho raro vuelve a 58'); assert.equal(n.impresoras[1].activa, false); assert.equal(n.impresoras[1].nombre, 'Impresora 2')
assert.equal(n.recibo, 'siempre'); assert.equal(n.propinaSugeridaPct, 30); assert.equal(n.comandaAutomatica, false, 'solo true real activa lo automático'); assert.equal(n.pie.length, 160)
assert.equal(normalizarConfig({ impresoras: Array.from({ length: 40 }, () => ({})) }).impresoras.length, 12, 'máximo 12 impresoras')
assert.equal(normalizarConfig({ anchoRecibo: 58 }).anchoRecibo, 58); assert.equal(normalizarConfig({ anchoRecibo: 72 }).anchoRecibo, 80, 'ancho raro del recibo vuelve a 80'); assert.equal(CONFIG_INICIAL.anchoRecibo, 80)

// 2) Reparto: bebidas a barra, comidas a cocina; un pedido con ambas sale en dos comandas
const it = (name: string, cat: string): ItemPedido & { cat: string } => ({ name, price: 1000, quantity: 1, cat })
const cocina: Impresora = { id: 'c', nombre: 'Cocina', ancho: 58, activa: true, categorias: [], copias: 1 }        // todo lo demás
const barra: Impresora = { id: 'b', nombre: 'Barra', ancho: 58, activa: true, categorias: ['bebidas'], copias: 1 }
const items = [it('Hamburguesa', 'comidas'), it('Limonada', 'bebidas'), it('Papas', 'comidas'), it('Jugo', 'bebidas')]
const r = repartirPorImpresora(items, [cocina, barra], x => x.cat)
assert.equal(r.length, 2, 'dos comandas')
assert.deepEqual(r.find(x => x.impresora.id === 'b')!.items.map(x => x.name), ['Limonada', 'Jugo'])
assert.deepEqual(r.find(x => x.impresora.id === 'c')!.items.map(x => x.name), ['Hamburguesa', 'Papas'], 'las bebidas NO se repiten en cocina')

// 3) Solo bebidas: no sale comanda vacía en cocina; sin impresoras activas no se reparte nada
const soloBebidas = repartirPorImpresora([it('Jugo', 'bebidas')], [cocina, barra], x => x.cat)
assert.equal(soloBebidas.length, 1); assert.equal(soloBebidas[0].impresora.id, 'b')
assert.deepEqual(repartirPorImpresora(items, [{ ...cocina, activa: false }], x => x.cat), [])
assert.deepEqual(repartirPorImpresora([], [cocina, barra], x => x.cat), [])

// 4) Un plato sin categoría conocida va a la impresora "todo"; con una sola impresora "todo" sale todo junto
const sinCat = repartirPorImpresora([it('Misterio', ''), it('Jugo', 'bebidas')], [cocina, barra], x => x.cat || null)
assert.deepEqual(sinCat.find(x => x.impresora.id === 'c')!.items.map(x => x.name), ['Misterio'])
assert.equal(repartirPorImpresora(items, [cocina], x => x.cat)[0].items.length, 4)

// 5) Varias impresoras "todo" (por ejemplo cocina y caja de respaldo) reciben lo mismo; categorías compartidas llegan a las dos específicas
const dos = repartirPorImpresora(items, [cocina, { ...cocina, id: 'c2', nombre: 'Cocina 2' }], x => x.cat)
assert.equal(dos.length, 2); assert.equal(dos[0].items.length, 4)
const compartida = repartirPorImpresora(items, [barra, { ...barra, id: 'b2', nombre: 'Barra 2' }], x => x.cat)
assert.equal(compartida.length, 2, 'dos impresoras con la misma categoría imprimen la misma comanda')

console.log('config.test.ts: todo OK')
