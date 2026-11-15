// Prueba del acceso a RestaurantOS Central. Correr con:  node src/central/acceso.test.ts
// (La protección real está en la base: supabase/tests/central_acceso.sql)
import assert from 'node:assert/strict'
import { decidirAcceso, interpretarVerificacion } from './acceso.ts'

// 1) Qué pantalla ve cada quien
assert.equal(decidirAcceso({ haySesion: false, rol: null, aal: null }), 'sin_sesion', 'sin sesión no entra')
assert.equal(decidirAcceso({ haySesion: false, rol: 'super_admin', aal: 'aal2' }), 'sin_sesion', 'sin sesión no entra aunque diga ser el dueño')
for (const rol of ['admin', 'waiter', 'kitchen', 'cashier', 'client', '', 'SUPER_ADMIN', 'super_admin ', null, undefined]) {
  assert.equal(decidirAcceso({ haySesion: true, rol, aal: 'aal2' }), 'sin_permiso', `el rol ${JSON.stringify(rol)} no entra, ni con código de 2 pasos`)
}
for (const aal of ['aal1', '', 'AAL2', 'aal3', null, undefined]) {
  assert.equal(decidirAcceso({ haySesion: true, rol: 'super_admin', aal }), 'requiere_mfa', `el dueño con nivel ${JSON.stringify(aal)} debe pasar el código de 2 pasos`)
}
assert.equal(decidirAcceso({ haySesion: true, rol: 'super_admin', aal: 'aal2' }), 'permitido', 'el dueño con código de 2 pasos entra')

// 2) El servidor manda: solo un "sí" explícito abre Central
assert.equal(interpretarVerificacion({ permitido: true }, null), 'permitido')
assert.equal(interpretarVerificacion({ permitido: false, motivo: 'sin_permiso' }, null), 'sin_permiso')
assert.equal(interpretarVerificacion({ permitido: false, motivo: 'requiere_mfa' }, null), 'requiere_mfa')
assert.equal(interpretarVerificacion({ permitido: false, motivo: 'sin_sesion' }, null), 'sin_sesion')
for (const raro of [{ permitido: 'true' }, { permitido: 1 }, { ok: true }, {}, [], { permitido: false }, { permitido: false, motivo: 'otro' }]) {
  assert.notEqual(interpretarVerificacion(raro, null), 'permitido', `una respuesta rara (${JSON.stringify(raro)}) nunca abre Central`)
}
for (const vacio of [null, undefined, '', 0, true, 'permitido']) {
  assert.equal(interpretarVerificacion(vacio, null), 'no_disponible', `sin respuesta útil (${JSON.stringify(vacio)}) Central queda cerrado`)
}

// 3) Errores: nunca abren, y se distingue "no instalado" de "sin permiso"
assert.equal(interpretarVerificacion(null, { code: 'PGRST202', message: 'Could not find the function public.central_verificar_acceso' }), 'no_disponible')
assert.equal(interpretarVerificacion(null, { code: '42883', message: 'function central_verificar_acceso() does not exist' }), 'no_disponible')
assert.equal(interpretarVerificacion(null, { code: '42501', message: 'permission denied for function central_verificar_acceso' }), 'sin_permiso')
assert.equal(interpretarVerificacion(null, { message: 'TypeError: Failed to fetch' }), 'error')
assert.equal(interpretarVerificacion({ permitido: true }, { message: 'cualquier error' }), 'error', 'si hay error, un "sí" en los datos no cuenta')

console.log('acceso.test.ts: todo OK')
