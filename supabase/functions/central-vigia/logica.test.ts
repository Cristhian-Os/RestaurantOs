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
assert.equal(resumenTelegram([], 5), '')
assert.match(resumenTelegram(h, 4), /Central revisó/)
console.log('central-vigia: todo OK')
