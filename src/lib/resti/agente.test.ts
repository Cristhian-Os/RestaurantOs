// Prueba de la parte pura del agente de Resti. Correr con:  node src/lib/resti/agente.test.ts
import assert from 'node:assert/strict'
import { esOrdenDeCambio, esCambioDeMenu, esConfirmacion, esCancelacion, resumenParaDecir, resumenAplicado } from './agente.ts'

for (const f of ['Desactiva el helado de vainilla, que se agotó.', 'se acabó el helado de vainilla', 'sube el precio de la hamburguesa a dieciocho mil', 'marca la mesa 4 como ocupada', 'ya no hay leche de avena', 'agrégale 3 kilos al limón', 'registra un gasto de 50 mil en gas', 'volvió el sabor mora', 'agrégale topping de oreo al cholao', 'que el cholao lleve 3 bolas de helado', 'cambia la descripción del salpicón', 'crea un plato nuevo brownie a nueve mil', 'quita el salpicón de la carta', 'ponle un tamaño gigante a la copa a 20 mil'])
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
for (const f of ['agrégale topping de oreo al cholao', 'que el cholao lleve 3 bolas', 'cambia la descripción del salpicón', 'crea un plato nuevo brownie a nueve mil', 'quita el salpicón de la carta', 'agrega un tamaño gigante a la copa'])
  assert.equal(esCambioDeMenu(f), true, 'menú: ' + f)
for (const f of ['desactiva el helado de vainilla', 'sube el precio de la hamburguesa a 18 mil', 'mesa 4 ocupada', 'se acabó la fresa']) assert.equal(esCambioDeMenu(f), false, 'no es menú: ' + f)
import { ambitoDe, esConfirmacionReforzada } from './agente.ts'
assert.equal(ambitoDe('cancela el pedido de la mesa 4'), 'pedidos'); assert.equal(ambitoDe('marca listo el pedido 12'), 'pedidos'); assert.equal(ambitoDe('pasa a cocina el pedido de la mesa 2'), 'pedidos')
assert.equal(ambitoDe('desactiva a la mesera Marta'), 'equipo'); assert.equal(ambitoDe('cambia el nombre del restaurante a Super Cholao'), 'equipo')
assert.equal(ambitoDe('agrégale topping de oreo al cholao'), 'menu'); assert.equal(ambitoDe('desactiva el helado de vainilla'), 'comando'); assert.equal(ambitoDe('sube el precio del cholao a 15 mil'), 'comando'); assert.equal(ambitoDe('quiero tomar un nuevo pedido'), 'comando')
for (const f of ['cancela el pedido de la mesa 4', 'desactiva a la mesera Marta', 'cambia el nombre del restaurante a Super Cholao', 'marca listo el pedido 12']) assert.equal(esOrdenDeCambio(f), true, f)
assert.equal(esConfirmacionReforzada('sí'), false); assert.equal(esConfirmacionReforzada('sí, cancélalo'), true); assert.equal(esConfirmacionReforzada('dale, desactívala'), true); assert.equal(esConfirmacionReforzada('cancela'), false)
assert.equal(ambitoDe('corrige el gasto del gas, eran 60 mil'), 'operaciones'); assert.equal(ambitoDe('elimina el gasto de frutas de 80 mil'), 'operaciones'); assert.equal(ambitoDe('registra un gasto de gas de 50 mil'), 'comando')
assert.equal(ambitoDe('elimina el proveedor Frutas Pérez'), 'operaciones'); assert.equal(ambitoDe('agrega un proveedor nuevo que se llama Lácteos'), 'comando')
assert.equal(ambitoDe('agrega una mesera nueva Ana Ruiz, correo ana@mail.com'), 'operaciones'); assert.equal(ambitoDe('cambia el rol de Luis a cajero'), 'operaciones'); assert.equal(ambitoDe('cambia el teléfono de Ana a 300 123 4567'), 'operaciones')
assert.equal(ambitoDe('marca como completada la tarea limpiar nevera'), 'operaciones'); assert.equal(ambitoDe('cambia la prioridad de la tarea limpiar a urgente'), 'operaciones'); assert.equal(ambitoDe('crea una tarea para Ana que limpie la nevera'), 'comando')
assert.equal(ambitoDe('crea el ingrediente mora en kilos'), 'operaciones'); assert.equal(ambitoDe('cambia el costo de la fresa a 8500'), 'operaciones'); assert.equal(ambitoDe('le quedan 3 kilos de fresa, actualiza el inventario del ingrediente'), 'comando')
assert.equal(ambitoDe('agrega la mesa 13 con capacidad para 6'), 'operaciones'); assert.equal(ambitoDe('quita la mesa 13'), 'operaciones'); assert.equal(ambitoDe('pon la mesa 3 como ocupada'), 'comando')
assert.ok(esOrdenDeCambio('corrige el gasto del gas, eran 60 mil')); assert.ok(esOrdenDeCambio('agrega la mesa 13 con capacidad para 6')); assert.ok(esOrdenDeCambio('marca como completada la tarea limpiar nevera'))
// Confirmación por voz (A1): solo frases cortas y completas; cualquier «no»/«cancela» cancela y se evalúa antes
for (const f of ['claro que no', 'sí pero no', 'sí, pero cambia el precio de la pizza', 'dale, mejor no', 'si claro que si lo apliquemos ya', 'no sé', 'cancela']) assert.equal(esConfirmacion(f), false, f)
for (const f of ['claro que no', 'sí pero no', 'dale, mejor no', 'no creo', 'sí, cancélalo']) assert.equal(esCancelacion(f), true, f)
assert.equal(esConfirmacion('sí, confírmalo'), true)
assert.equal(esConfirmacionReforzada('sí, confírmalo'), true); assert.equal(esConfirmacionReforzada('sí, confírmalo pero no'), false); assert.equal(esConfirmacionReforzada('sí, cancela el pedido de la mesa 4'), false)
console.log('agente.test OK')
