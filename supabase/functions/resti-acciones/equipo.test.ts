// Prueba del intérprete de equipo. Correr con:  node supabase/functions/resti-acciones/equipo.test.ts
import assert from 'node:assert/strict'
import { validarAccionesEquipo, contextoEquipo } from './equipo.ts'
const v = (a: unknown[]) => validarAccionesEquipo({ actions: a })
assert.deepEqual(v([{ type: 'staff_active', nombre: 'Juan Pérez', active: false }]), [{ type: 'staff_active', nombre: 'Juan Pérez', active: false }])
assert.equal(v([{ type: 'staff_active', nombre: 'Juan', active: 'no' }]).length, 0, 'active debe ser booleano')
assert.deepEqual(v([{ type: 'biz_name', value: ' Super Cholao ' }]), [{ type: 'biz_name', value: 'Super Cholao' }]); assert.equal(v([{ type: 'biz_name', value: 'x' }]).length, 0)
assert.equal(v([{ type: 'set_role', nombre: 'Juan', role: 'admin' }, { type: 'delete_user' }, null]).length, 0, 'roles y borrados no existen')
assert.match(contextoEquipo([{ nombre: 'Juan', rol: 'waiter', activo: true }]), /Juan \(waiter, activo\)/)
console.log('equipo.test OK')
