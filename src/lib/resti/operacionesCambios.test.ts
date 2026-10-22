// Prueba de los cambios de operación. Correr con:  node src/lib/resti/operacionesCambios.test.ts
import assert from 'node:assert/strict'
import { proponerCambiosOp, claveTemporal, type DatosOp } from './operacionesCambios.ts'

const d: DatosOp = {
  gastos: [{ id: 'g1', concepto: 'Gas', monto: 50000, categoria: null }, { id: 'g2', concepto: 'Frutas', monto: 80000, categoria: 'proveedor' }, { id: 'g3', concepto: 'Gas domicilio', monto: 20000, categoria: null }],
  proveedores: [{ id: 'p1', nombre: 'Frutas Pérez' }, { id: 'p2', nombre: 'Lácteos del Valle' }],
  equipo: [{ id: 'e1', full_name: 'Ana Ruiz', role: 'waiter', phone: '300' }, { id: 'e2', full_name: 'Luis Soto', role: 'kitchen' }, { id: 'e3', full_name: 'Carlos Admin', role: 'admin' }],
  tareas: [{ id: 't1', title: 'Limpiar nevera', status: 'pending', priority: 'low' }, { id: 't2', title: 'Limpiar piso', status: 'completed' }],
  ingredientes: [{ id: 'i1', nombre: 'Fresa', unidad_medida: 'kg', costo_unitario: 8000, stock_minimo: 2 }],
  mesas: [{ id: 'm1', numero: 1, capacidad: 4 }, { id: 'm2', numero: 2, capacidad: 2 }],
}
const p = (a: any[]) => proponerCambiosOp(a, d)
let r = p([{ type: 'expense_edit', ref: { concepto: 'frutas' }, set: { monto: 90000 } }])[0]
assert.deepEqual(r.change, { op: 'expense_patch', gastoId: 'g2', patch: { monto: 90000 } }); assert.equal(r.detail, '$80.000 → $90.000'); assert.equal(r.riesgo, undefined)
r = p([{ type: 'expense_edit', ref: { concepto: 'gas' }, set: { monto: 1 } }])[0]; assert.equal(r.change, null); assert.match(r.problem!, /varios/)
r = p([{ type: 'expense_edit', ref: { concepto: 'gas', monto: 50000 }, set: { monto: 60000 } }])[0]; assert.equal((r.change as any).gastoId, 'g1')
r = p([{ type: 'expense_edit', ref: { monto: 80000 }, set: { monto: 80000 } }])[0]; assert.match(r.problem!, /Ya está así/)
r = p([{ type: 'expense_delete', ref: { monto: 80000 } }])[0]; assert.deepEqual(r.change, { op: 'expense_delete', gastoId: 'g2' }); assert.equal(r.riesgo, 'alto')
const dos = p([{ type: 'expense_delete', ref: { monto: 80000 } }, { type: 'expense_delete', ref: { monto: 80000 } }]); assert.ok(dos[0].change); assert.match(dos[1].problem!, /No encontré/)
r = p([{ type: 'supplier_delete', proveedor: 'lacteos' }])[0]; assert.deepEqual(r.change, { op: 'supplier_delete', supplierId: 'p2' }); assert.equal(r.riesgo, 'alto')
r = p([{ type: 'supplier_delete', proveedor: 'Pescados' }])[0]; assert.match(r.problem!, /No encontré/)
r = p([{ type: 'staff_add', nombre: 'Marta Díaz', email: 'm@x.co', rol: 'cashier', telefono: '311' }])[0]
assert.equal((r.change as any).op, 'staff_create'); assert.equal((r.change as any).rol, 'cashier'); assert.ok((r.change as any).password.length >= 10); assert.doesNotMatch(r.detail + r.title, new RegExp((r.change as any).password.replace(/[$^*+?.()|[\]{}\\]/g, '\\$&')), 'la clave no sale en el texto')
assert.match(p([{ type: 'staff_add', nombre: 'ana ruiz', email: 'a@x.co', rol: 'waiter' }])[0].problem!, /Ya hay alguien/)
r = p([{ type: 'staff_edit', nombre: 'Ana', field: 'rol', value: 'cashier' }])[0]; assert.deepEqual(r.change, { op: 'staff_update', profileId: 'e1', rol: 'cashier' }); assert.equal(r.detail, 'mesero → cajero'); assert.equal(r.riesgo, 'alto')
r = p([{ type: 'staff_edit', nombre: 'Luis', field: 'telefono', value: '315 1' }])[0]; assert.deepEqual(r.change, { op: 'staff_update', profileId: 'e2', telefono: '315 1' })
assert.match(p([{ type: 'staff_edit', nombre: 'Carlos', field: 'nombre', value: 'X' }])[0].problem!, /administrador/)
r = p([{ type: 'task_status', tarea: 'nevera', status: 'completed' }])[0]; assert.deepEqual(r.change, { op: 'task_patch', taskId: 't1', patch: { status: 'completed' } }); assert.equal(r.detail, 'Pendiente → Completada')
assert.match(p([{ type: 'task_status', tarea: 'Limpiar', status: 'completed' }])[0].problem!, /varios/); assert.match(p([{ type: 'task_status', tarea: 'piso', status: 'completed' }])[0].problem!, /Ya está completada/)
r = p([{ type: 'task_edit', tarea: 'nevera', field: 'priority', value: 'urgent' }])[0]; assert.equal(r.detail, 'Prioridad: baja → urgente')
r = p([{ type: 'ingredient_add', nombre: 'Mora', unidad_medida: 'kg', stock_actual: 3, costo_unitario: 9000 }])[0]; assert.deepEqual((r.change as any).row, { nombre: 'Mora', unidad_medida: 'kg', stock_actual: 3, stock_minimo: 0, costo_unitario: 9000 })
assert.match(p([{ type: 'ingredient_add', nombre: 'fresa', unidad_medida: 'kg' }])[0].problem!, /Ya existe/)
r = p([{ type: 'ingredient_edit', ingrediente: 'fresa', field: 'costo', value: '8500' }])[0]; assert.deepEqual(r.change, { op: 'ingredient_patch', ingredientId: 'i1', patch: { costo_unitario: 8500 } }); assert.equal(r.detail, '$8.000 → $8.500')
r = p([{ type: 'table_add', numero: 3, capacidad: 6 }])[0]; assert.deepEqual(r.change, { op: 'table_insert', numero: 3, capacidad: 6 }); assert.match(p([{ type: 'table_add', numero: 2, capacidad: 4 }])[0].problem!, /Ya existe/)
r = p([{ type: 'table_remove', numero: 2 }])[0]; assert.deepEqual(r.change, { op: 'table_disable', mesaId: 'm2' }); assert.equal(r.riesgo, 'alto'); assert.match(p([{ type: 'table_remove', numero: 9 }])[0].problem!, /No encontré/)
const c = claveTemporal(); assert.ok(c.length >= 10 && /[A-Z]/.test(c) && /[a-z]/.test(c) && /\d/.test(c) && /[!@#$%]/.test(c)); assert.notEqual(claveTemporal(), claveTemporal())
console.log('operacionesCambios.test OK')
