// Prueba del intérprete de pedidos. Correr con:  node supabase/functions/resti-acciones/pedidos.test.ts
import assert from 'node:assert/strict'
import { validarAccionesPedidos, contextoPedidos } from './pedidos.ts'
const v = (a: unknown[]) => validarAccionesPedidos({ actions: a })
assert.deepEqual(v([{ type: 'order_status', mesa: 4, status: 'ready' }]), [{ type: 'order_status', mesa: 4, status: 'ready' }])
assert.deepEqual(v([{ type: 'order_cancel', numero: 12 }]), [{ type: 'order_cancel', numero: 12 }])
assert.deepEqual(v([{ type: 'order_cancel', cliente: 'Ana' }]), [{ type: 'order_cancel', cliente: 'Ana' }])
assert.equal(v([{ type: 'order_cancel' }]).length, 0, 'sin referencia no se propone nada')
assert.equal(v([{ type: 'order_status', mesa: 4, status: 'completed' }]).length, 0, 'cobrar/entregar no se hace aquí')
assert.equal(v([{ type: 'order_status', mesa: -1, status: 'ready' }]).length, 0); assert.equal(v([{ type: 'drop', mesa: 1 }, null, 7]).length, 0)
assert.match(contextoPedidos([{ numero: 12, mesa: 4, status: 'cooking', cliente: 'Ana', resumen: '2 Cholao', total: 24000 }]), /#12 · mesa 4 · cooking · Ana · 2 Cholao · \$24000/)
console.log('pedidos.test OK')
