// Prueba de los mensajes de error en lenguaje claro. Correr con:  node src/lib/resti/motivos.test.ts
import assert from 'node:assert/strict'
import { motivoClaro, cantidadTxt } from './motivos.ts'

assert.match(motivoClaro('duplicate key value violates unique constraint "x"'), /Ya existe/)
assert.match(motivoClaro('null value in column "nombre" violates not-null constraint'), /Falta un dato/)
assert.match(motivoClaro('El precio no es un numero valido'), /precio no es un número válido/)
assert.match(motivoClaro('Un numero no es valido'), /número mal escrito/)
assert.match(motivoClaro('Un valor esta fuera de rango (no se aceptan negativos)'), /fuera de rango/)
assert.match(motivoClaro('Unidad no valida (usa kg, gramo, litro, ml, pieza o paquete)'), /unidad no es válida/)
assert.match(motivoClaro('El nombre debe tener entre 2 y 100 letras'), /entre 2 y 100/)
assert.match(motivoClaro(''), /No pude guardar/)
assert.equal(motivoClaro('x'.repeat(300)).length, 138)               // lo desconocido se muestra, pero acotado
assert.equal(motivoClaro('Algo raro del servidor'), 'Algo raro del servidor')
assert.equal(cantidadTxt(1, 'mesa', 'mesas'), '1 mesa'); assert.equal(cantidadTxt(12, 'mesa', 'mesas'), '12 mesas')
console.log('motivos.test OK')
