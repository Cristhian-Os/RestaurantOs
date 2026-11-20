// Prueba:  node supabase/functions/central-mision/logica.test.ts
import assert from 'node:assert/strict'
import { elegirMision, textoCierre, type Datos } from './logica.ts'

const ahora = new Date('2026-11-20T12:00:00Z')
const base: Datos = { ahora, prospectos: [], citasHoy: [], tareasUrgentes: [], campanaVigente: false, ayerBloqueada: false }
const p = (o: object) => ({ id: 'x', nombre: 'Rest', etapa: 'prospecto_identificado', proxima_accion: '', proxima_accion_en: null, tiene_expediente: false, ...o })

assert.match(elegirMision(base).mision, /primeros 5 restaurantes reales/, 'sin prospectos')
assert.match(elegirMision({ ...base, prospectos: [p({})] }).mision, /Investigar/, 'identificado sin expediente')
assert.match(elegirMision({ ...base, prospectos: [p({ etapa: 'investigado' })] }).mision, /primera campaña/, 'investigado sin campaña')
assert.match(elegirMision({ ...base, prospectos: [p({ etapa: 'contactado', proxima_accion_en: '2026-11-19T10:00:00Z', proxima_accion: 'Llamar' })] }).mision, /acción vencida/, 'vencido')
assert.match(elegirMision({ ...base, tareasUrgentes: [{ titulo: 'Caída', prioridad: 'P0' }] }).mision, /urgente/, 'urgente')
const cita = elegirMision({ ...base, tareasUrgentes: [{ titulo: 'Caída', prioridad: 'P0' }], citasHoy: [{ nombre: 'Rest', hora: '3:00 p. m.' }] })
assert.match(cita.mision, /cita de hoy/, 'la cita gana a lo urgente')
const dividida = elegirMision({ ...base, ayerBloqueada: true })
assert.ok(dividida.tareas.length <= 1 && dividida.minutos <= 20, 'ayer bloqueada: más pequeña')
assert.ok(elegirMision({ ...base, tareasUrgentes: Array(6).fill({ titulo: 't', prioridad: 'P1' }) }).tareas.length <= 3, 'máx 3 tareas')
assert.ok(elegirMision({ ...base, prospectos: [p({ etapa: 'cliente_activado' })] }).mision.length > 0, 'cerrados no cuentan')
assert.match(textoCierre({ tareas_completadas: 0, cambios_de_etapa: 0, notas: 0, citas_realizadas: 0, prospectos_creados: 0, pendientes: [] }, null, null), /no hubo misión/)
console.log('central-mision: ok')
