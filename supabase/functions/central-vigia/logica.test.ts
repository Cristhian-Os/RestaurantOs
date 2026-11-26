// Prueba:  node supabase/functions/central-vigia/logica.test.ts
import assert from 'node:assert/strict'
import { evaluar, resumenTelegram, type Datos } from './logica.ts'

const ahora = new Date('2026-11-15T15:00:00Z')
const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000).toISOString()
const en = (dias: number) => new Date(ahora.getTime() + dias * 86_400_000).toISOString()
const base: Datos = {
  ahora,
  restaurantes: [
    { id: 'a', name: 'Antiguo con pedidos', active: true, created_at: hace(60), trial_ends_at: null },
    { id: 'b', name: 'Antiguo sin pedidos', active: true, created_at: hace(60), trial_ends_at: null },
    { id: 'c', name: 'Nuevo', active: true, created_at: hace(1), trial_ends_at: en(2) },
    { id: 'd', name: 'Moroso', active: true, created_at: hace(90), trial_ends_at: null },
  ],
  suscripciones: [
    { restaurant_id: 'a', status: 'active', current_period_end: en(20), trial_ends_at: null },
    { restaurant_id: 'b', status: 'active', current_period_end: en(2), trial_ends_at: null },
    { restaurant_id: 'd', status: 'past_due', current_period_end: hace(3), trial_ends_at: null },
  ],
  pedidosPorRestaurante: { a: 40, c: 3, d: 5 },
  opiniones: [
    { numero: 7, titulo: 'No imprime', urgencia: 'alta', created_at: hace(0.1), tipo: 'error' },
    { numero: 8, titulo: 'Idea', urgencia: 'baja', created_at: hace(0.1), tipo: 'idea' },
    { numero: 9, titulo: 'Duda vieja', urgencia: 'baja', created_at: hace(1), tipo: 'duda' },
  ],
}
const h = evaluar(base)
const claves = h.map(x => x.clave)
assert.ok(claves.includes('bienvenida:c'), 'bienvenida al nuevo')
assert.ok(claves.includes('suscripcion:d:past_due'), 'suscripción en mora')
assert.ok(claves.some(c => c.startsWith('prueba:c:')), 'prueba por terminar')
assert.ok(claves.some(c => c.startsWith('renovacion:b:')), 'renovación cercana')
assert.ok(claves.includes('inactivo:b'), 'sin pedidos 3 días')
assert.ok(!claves.includes('inactivo:a'), 'el que sí tiene pedidos no se marca')
assert.ok(!claves.includes('inactivo:c'), 'el nuevo no se marca como inactivo')
assert.ok(claves.includes('opinion:7') && claves.includes('opinion:9') && !claves.includes('opinion:8'), 'opiniones urgentes o viejas')
assert.equal(h.find(x => x.clave === 'opinion:7')?.prioridad, 'P1')
assert.equal(new Set(claves).size, claves.length, 'claves únicas')
assert.equal(evaluar({ ...base, restaurantes: [], suscripciones: [], opiniones: [] }).length, 0)

// Errores de la app: una pantalla caída siempre; un error suelto de una vez no; repetido sí; ya vistos o resueltos no
const err = (huella: string, origen: string, veces: number, estado = 'nuevo') => ({ huella, origen, mensaje: `fallo ${huella}`, ruta: '/caja', veces, estado, primera_vez: hace(1), ultima_vez: hace(0.1) })
const sin = { ...base, restaurantes: [], suscripciones: [], opiniones: [] }
const e = evaluar({ ...sin, errores: [err('a', 'react', 1), err('b', 'ventana', 1), err('c', 'ventana', 3), err('d', 'promesa', 12), err('e', 'ventana', 5, 'visto'), err('f', 'react', 4, 'resuelto')] })
const ec = e.map(x => x.clave)
assert.deepEqual(ec.sort(), ['error:a', 'error:c', 'error:d'], 'react siempre, repetidos sí; sueltos, vistos y resueltos no')
assert.equal(e.find(x => x.clave === 'error:a')?.prioridad, 'P1', 'pantalla caída = P1')
assert.equal(e.find(x => x.clave === 'error:c')?.prioridad, 'P2')
assert.equal(e.find(x => x.clave === 'error:d')?.prioridad, 'P1', '10 o más veces = P1')
assert.ok(e.every(x => x.agente === 'tomi' && x.departamento === 'ingenieria'))
// Si algo explota, máximo 10 tareas de error por revisión, las más repetidas primero
const muchos = evaluar({ ...sin, errores: Array.from({ length: 25 }, (_, i) => err(`m${i}`, 'ventana', 2 + i)) })
assert.equal(muchos.length, 10); assert.equal(muchos[0].clave, 'error:m24')
assert.equal(evaluar({ ...sin }).length, 0, 'sin errores no hay hallazgos (el campo es opcional)')
assert.equal(resumenTelegram([], 5), '')
assert.match(resumenTelegram(h, 4), /Central revisó/)
console.log('central-vigia: todo OK')
