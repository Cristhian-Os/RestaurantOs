// Prueba de la parte pura del agente de Resti. Correr con:  node src/lib/resti/agente.test.ts
import assert from 'node:assert/strict'
import { esOrdenDeCambio, esConfirmacion, esCancelacion, resumenParaDecir, resumenAplicado } from './agente.ts'

for (const f of ['Desactiva el helado de vainilla, que se agotó.', 'se acabó el helado de vainilla', 'sube el precio de la hamburguesa a dieciocho mil', 'marca la mesa 4 como ocupada', 'ya no hay leche de avena', 'agrégale 3 kilos al limón', 'registra un gasto de 50 mil en gas', 'volvió el sabor mora'])
  assert.equal(esOrdenDeCambio(f), true, f)
for (const f of ['cuánto vendí hoy', '¿Qué platos se agotaron?', 'llévame a las mesas', 'hola Resti', 'cómo funciona el inventario', 'gracias', 'sí'])
  assert.equal(esOrdenDeCambio(f), false, f)

for (const f of ['sí', 'Sí, aplícalo', 'dale', 'confirmo', 'hazlo ya', 'Claro que sí', 'de una']) assert.equal(esConfirmacion(f), true, f)
for (const f of ['no', 'cancela eso', 'mejor no', 'déjalo así', 'olvídalo']) assert.equal(esCancelacion(f), true, f)
assert.equal(esConfirmacion('no, mejor no'), false); assert.equal(esCancelacion('sí dale'), false)
assert.equal(esConfirmacion('sinceramente no sé'), false, 'solo la palabra, no el comienzo de otra')
assert.equal(esConfirmacion('sube el precio'), false)

assert.equal(resumenParaDecir([{ title: 'Vainilla · Sabores de helado', detail: 'Disponible → Agotado', change: {} }]), 'Vainilla, Sabores de helado: de Disponible a Agotado. ¿Lo aplico?')
assert.match(resumenParaDecir([{ title: 'a', detail: '', change: {} }, { title: 'b', detail: '', change: {} }]), /2 cambios/)
assert.equal(resumenParaDecir([{ title: 'x', detail: '', change: null, problem: 'no existe' }]), 'No pude preparar ese cambio.')
assert.equal(resumenAplicado(1, []), 'Listo, ya lo apliqué.'); assert.match(resumenAplicado(0, ['sin permiso']), /sin permiso/); assert.match(resumenAplicado(2, ['falló']), /Apliqué 2/)
console.log('agente.test OK')
