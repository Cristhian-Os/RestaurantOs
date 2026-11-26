// Prueba de los niveles de Central. Correr con:  node src/central/permisos.test.ts
// (La protección real está en la base: supabase/tests/central_nucleo.sql, casos 4 a 6)
import assert from 'node:assert/strict'
import { permite, puedeSerResponsable, exigeAprobacion } from './permisos.ts'
import { agenteTrabajando, estadoVisual, hace } from './catalogo.ts'

// N0: leer lo puede todo agente; escribir, ninguno de nivel N0
assert.equal(permite('N0', 'N0'), 'ejecutar')
for (const accion of ['N1', 'N2']) assert.equal(permite('N0', accion, true), 'prohibido', `un agente N0 no hace acciones ${accion}, ni con aprobación`)
// N1 y N2
assert.equal(permite('N1', 'N1'), 'ejecutar')
assert.equal(permite('N1', 'N2'), 'requiere_aprobacion')
assert.equal(permite('N1', 'N2', true), 'ejecutar')
assert.equal(permite('N2', 'N2'), 'requiere_aprobacion', 'N2 sigue pidiendo aprobación')
// N3 es solo humano, ni con aprobación ni con el nivel más alto
for (const agente of ['N0', 'N1', 'N2', null, undefined, 'N3', '']) assert.equal(permite(agente, 'N3', true), 'prohibido', `N3 prohibido para ${JSON.stringify(agente)}`)
// Valores raros: se cierra
assert.equal(permite('N1', 'N9'), 'prohibido')
assert.equal(permite(undefined, 'N1'), 'prohibido')
assert.equal(permite('n1', 'N1'), 'prohibido', 'las mayúsculas importan')

assert.equal(puedeSerResponsable('N0', 'N0'), true)
assert.equal(puedeSerResponsable('N0', 'N1'), false)
assert.equal(puedeSerResponsable('N1', 'N2'), true)
assert.equal(puedeSerResponsable('N2', 'N3'), false)
assert.equal(exigeAprobacion('N1'), false)
assert.equal(exigeAprobacion('N2'), true)
assert.equal(exigeAprobacion('N3'), true)

// Estado visual: sale del ciclo real; un agente en simulación no se muestra como "Activo"
assert.equal(estadoVisual({ ciclo: 'disenado', proveedor_estado: 'no_conectado' }).id, 'inactivo')
assert.equal(estadoVisual({ ciclo: 'activo', proveedor_estado: 'simulacion_local' }).id, 'razonamiento')
assert.equal(estadoVisual({ ciclo: 'activo', proveedor_estado: 'activo' }).id, 'activo')
assert.equal(estadoVisual({ ciclo: 'suspendido', proveedor_estado: 'activo' }).id, 'incidencia')
assert.equal(estadoVisual({ ciclo: 'pruebas', proveedor_estado: 'simulacion_local' }).id, 'atencion')
// Un agente que trabaja de verdad se ve "Trabajando" aunque su ciclo siga en «diseñado»; sin conexión real o suspendido, no
assert.equal(estadoVisual({ ciclo: 'disenado', proveedor_estado: 'activo', trabajando: true }).id, 'trabajando')
assert.equal(estadoVisual({ ciclo: 'disenado', proveedor_estado: 'activo', trabajando: false }).id, 'inactivo')
assert.equal(estadoVisual({ ciclo: 'disenado', proveedor_estado: 'simulacion_local', trabajando: true }).id, 'inactivo')
assert.equal(estadoVisual({ ciclo: 'suspendido', proveedor_estado: 'activo', trabajando: true }).id, 'incidencia')

// ¿Está trabajando? Trabajo en marcha, o terminado bien en las últimas 24 h. Fallidos, pendientes, viejos o de otro agente no cuentan.
const t0 = Date.parse('2026-11-26T15:00:00Z')
const trab = (agente_id: string, estado: string, updated_at: string) => ({ agente_id, estado, updated_at })
assert.equal(agenteTrabajando('mateo', [trab('mateo', 'succeeded', '2026-11-26T12:50:00Z')], t0), true)
assert.equal(agenteTrabajando('mateo', [trab('mateo', 'running', '2026-11-20T00:00:00Z')], t0), true, 'en marcha cuenta aunque sea viejo')
assert.equal(agenteTrabajando('nico', [trab('nico', 'succeeded', '2026-11-25T12:30:00Z')], t0), false, 'terminó hace más de 24 h')
assert.equal(agenteTrabajando('mateo', [trab('mateo', 'failed', '2026-11-26T14:00:00Z'), trab('mateo', 'pending', '2026-11-26T14:00:00Z')], t0), false, 'fallar o esperar no es trabajar')
assert.equal(agenteTrabajando('nico', [trab('mateo', 'succeeded', '2026-11-26T14:00:00Z')], t0), false, 'el trabajo de otro agente no cuenta')
assert.equal(agenteTrabajando('nico', [], t0), false)

// "hace …"
const ahora = Date.parse('2026-11-14T12:00:00Z')
assert.equal(hace('2026-11-14T11:59:50Z', ahora), 'hace un momento')
assert.equal(hace('2026-11-14T11:30:00Z', ahora), 'hace 30 min')
assert.equal(hace('2026-11-14T09:00:00Z', ahora), 'hace 3 h')
assert.equal(hace('2026-11-12T12:00:00Z', ahora), 'hace 2 d')

console.log('permisos: todo OK')
