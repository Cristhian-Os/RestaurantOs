// Prueba de los cambios de pedidos y equipo. Correr con:  node src/lib/resti/pedidosEquipoCambios.test.ts
import assert from 'node:assert/strict'
import { proponerCambiosPedidos, proponerCambiosEquipo, buscarPedidos, type PedidoFila, type PersonaFila } from './pedidosEquipoCambios.ts'

const pedidos: PedidoFila[] = [
  { id: 'a', order_number_today: 12, table_num: 4, status: 'cooking', customer_name: 'Ana', items: '[{"name":"Cholao","quantity":2}]', total: 24000 },
  { id: 'b', order_number_today: 13, table_num: 5, status: 'pending', customer_name: null, items: [{ name: 'Malteada', quantity: 1 }], total: 9000 },
  { id: 'c', order_number_today: 14, table_num: 5, status: 'ready', customer_name: 'Luis Gómez', items: '[]', total: 5000 },
  { id: 'd', order_number_today: 9, table_num: 1, status: 'completed', customer_name: null, items: '[]', total: 1 },
]
let r = proponerCambiosPedidos([{ type: 'order_status', mesa: 4, status: 'ready' }], pedidos)[0]
assert.deepEqual(r.change, { op: 'order_status', orderId: 'a', status: 'ready' }); assert.equal(r.detail, 'En cocina → Listo'); assert.equal(r.title, 'Pedido #12 · mesa 4')
r = proponerCambiosPedidos([{ type: 'order_cancel', numero: 12 }], pedidos)[0]; assert.deepEqual(r.change, { op: 'order_cancel', orderId: 'a' }); assert.equal(r.riesgo, 'alto'); assert.match(r.detail, /2 productos · \$24\.000/)
r = proponerCambiosPedidos([{ type: 'order_cancel', mesa: 5 }], pedidos)[0]; assert.equal(r.change, null); assert.match(r.problem!, /2 pedidos abiertos.*#13, #14/)
r = proponerCambiosPedidos([{ type: 'order_cancel', numero: 9 }], pedidos)[0]; assert.equal(r.change, null, 'un pedido completado no se cancela'); assert.match(r.problem!, /No encontré/)
r = proponerCambiosPedidos([{ type: 'order_status', cliente: 'luis', status: 'ready' }], pedidos)[0]; assert.equal(r.change, null); assert.match(r.problem!, /Ya está listo/)
assert.equal(buscarPedidos({ cliente: 'gomez' }, pedidos).length, 1)
const dos = proponerCambiosPedidos([{ type: 'order_status', numero: 13, status: 'cooking' }, { type: 'order_status', numero: 13, status: 'cooking' }], pedidos); assert.ok(dos[0].change); assert.match(dos[1].problem!, /Ya está en cocina/)

const gente: PersonaFila[] = [{ id: 'p1', full_name: 'Juan Pérez', role: 'waiter', active: true }, { id: 'p2', full_name: 'Juana Ruiz', role: 'kitchen', active: false }, { id: 'p3', full_name: 'Carlos Admin', role: 'admin', active: true }, { id: 'p4', full_name: 'Marta Soto', role: 'cashier', active: true }]
let e = proponerCambiosEquipo([{ type: 'staff_active', nombre: 'Marta', active: false }], gente, 'Cholaos')[0]; assert.deepEqual(e.change, { op: 'staff_active', profileId: 'p4', active: false }); assert.equal(e.riesgo, 'alto')
e = proponerCambiosEquipo([{ type: 'staff_active', nombre: 'Juan', active: false }], gente, null)[0]; assert.equal(e.change, null); assert.match(e.problem!, /varias personas/)
e = proponerCambiosEquipo([{ type: 'staff_active', nombre: 'Juana Ruiz', active: true }], gente, null)[0]; assert.equal((e.change as any).profileId, 'p2'); assert.equal(e.riesgo, undefined)
e = proponerCambiosEquipo([{ type: 'staff_active', nombre: 'Carlos Admin', active: false }], gente, null)[0]; assert.match(e.problem!, /administrador/)
e = proponerCambiosEquipo([{ type: 'staff_active', nombre: 'Pedro', active: false }], gente, null)[0]; assert.match(e.problem!, /No encontré/)
e = proponerCambiosEquipo([{ type: 'staff_active', nombre: 'Marta Soto', active: true }], gente, null)[0]; assert.match(e.problem!, /Ya está activo/)
e = proponerCambiosEquipo([{ type: 'biz_name', value: 'Super Cholao' }], gente, 'Cholaos')[0]; assert.deepEqual(e.change, { op: 'biz_name', name: 'Super Cholao' }); assert.equal(e.detail, '«Cholaos» → «Super Cholao»')
console.log('pedidosEquipoCambios.test OK')
