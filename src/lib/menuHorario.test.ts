// Prueba de la lógica de menús por horario. Correr con:  node src/lib/menuHorario.test.ts
import assert from 'node:assert/strict'
import {
  aplicarMenuHorario, msHastaCambio, formatoHora, rangoHoras, resumenDias, duracionLegible,
  programacionSemanal, solapamientos, cuandoLegible, cambioLocal, type MenuHorarioEstado, type MenuHorarioFila, type FranjaFila, type PlatoBase,
} from './menuHorario.ts'

const platos: (PlatoBase & { name: string })[] = [
  { id: 'huevos', name: 'Huevos', price: 14000 },
  { id: 'bandeja', name: 'Bandeja', price: 20000, has_sizes: true, sizes: [{ nombre: 'Pequeño', precio: 9000 }, { nombre: 'Grande', precio: 14000 }] },
  { id: 'gaseosa', name: 'Gaseosa', price: 4000 },
  { id: 'cena', name: 'Cena', price: 30000 },
]
const base: MenuHorarioEstado = { activo: true, hora_servidor: '2026-11-20T13:30:00Z' }

// ─── Interruptor apagado: la lista queda EXACTAMENTE igual (misma referencia) ───
assert.equal(aplicarMenuHorario(platos, { activo: false, hora_servidor: base.hora_servidor }), platos)
assert.equal(aplicarMenuHorario(platos, null), platos)
assert.equal(aplicarMenuHorario(platos, undefined), platos)

// ─── Encendido: solo platos del menú vigente (o todo el día), con precio de menú ───
const estado: MenuHorarioEstado = {
  ...base,
  platos: [
    { dish_id: 'huevos', menu_id: 'm1', menu_nombre: 'Desayunos', precio_especial: 12000 },
    { dish_id: 'bandeja', menu_id: 'm1', menu_nombre: 'Desayunos', precios_tamano: { Pequeño: 8000 } },
    { dish_id: 'gaseosa', todo_el_dia: true },
  ],
}
const r = aplicarMenuHorario(platos, estado)
assert.deepEqual(r.map(d => d.id), ['huevos', 'bandeja', 'gaseosa'])        // 'cena' no pertenece al menú vigente
assert.equal(r[0].price, 12000)                                              // precio de menú
assert.deepEqual(r[1].sizes, [{ nombre: 'Pequeño', precio: 8000 }, { nombre: 'Grande', precio: 14000 }])  // solo cambia el tamaño con precio de menú
assert.equal(r[1].price, 20000)
assert.equal(r[2], platos[2])                                                // todo el día sin precio de menú: intacto
assert.equal(platos[0].price, 14000)                                         // no muta el original

// precio_especial de un plato con tamaños no se usa (el precio va por tamaño)
const r2 = aplicarMenuHorario(platos, { ...base, platos: [{ dish_id: 'bandeja', precio_especial: 1 }] })
assert.equal(r2[0].price, 20000)

// sin ningún plato vigente (hueco entre menús): solo se ve lo de todo el día
assert.deepEqual(aplicarMenuHorario(platos, { ...base, platos: [{ dish_id: 'gaseosa', todo_el_dia: true }] }).map(d => d.id), ['gaseosa'])
assert.deepEqual(aplicarMenuHorario(platos, { ...base, platos: [] }).map(d => d.id), [])

// personal con autorización del admin: se ven todos, y los de menú llevan su precio
const todos = aplicarMenuHorario(platos, estado, { mostrarTodo: true })
assert.deepEqual(todos.map(d => d.id), ['huevos', 'bandeja', 'gaseosa', 'cena'])
assert.equal(todos[0].price, 12000)
assert.equal(todos[3].price, 30000)

// ─── Próximo cambio con el reloj del SERVIDOR, no el del dispositivo ───
// El servidor dice que son las 13:30Z; el dispositivo cree que son las 18:00Z (reloj adelantado 4 h 30 min).
const e2: MenuHorarioEstado = { ...base, cambia_en: '2026-11-20T16:00:00Z' }
const recibido = Date.parse('2026-11-20T18:00:00Z')
assert.equal(msHastaCambio(e2, recibido, recibido), 2.5 * 3600 * 1000)               // faltan 2 h 30 min reales
assert.equal(msHastaCambio(e2, recibido + 60_000, recibido), 2.5 * 3600 * 1000 - 60_000)  // pasó 1 min en el dispositivo
assert.equal(msHastaCambio(e2, recibido + 10 * 3600 * 1000, recibido), 0)             // ya pasó: nunca negativo
assert.equal(msHastaCambio({ ...base, cambia_en: null }, recibido, recibido), null)
assert.equal(msHastaCambio({ activo: false, hora_servidor: base.hora_servidor, cambia_en: '2026-11-20T16:00:00Z' }, recibido, recibido), null)
assert.equal(msHastaCambio(null, recibido, recibido), null)

// ─── Presentación ───
assert.equal(formatoHora('06:00:00'), '6:00 a. m.')
assert.equal(formatoHora('12:00'), '12:00 p. m.')
assert.equal(formatoHora('00:30'), '12:30 a. m.')
assert.equal(formatoHora('23:00:00'), '11:00 p. m.')
assert.equal(rangoHoras('18:00:00', '02:00:00'), '6:00 p. m. – 2:00 a. m.')
assert.equal(rangoHoras('00:00:00', '00:00:00'), '24 horas')
assert.equal(resumenDias([0, 1, 2, 3, 4, 5, 6]), 'Todos los días')
assert.equal(resumenDias([1, 2, 3, 4, 5]), 'Lun a Vie')
assert.equal(resumenDias([6, 0]), 'Sáb y Dom')
assert.equal(resumenDias([5, 6]), 'Vie y Sáb')
assert.equal(resumenDias([1, 2, 3, 4, 5, 6]), 'Lun a Sáb')
assert.equal(resumenDias([1, 3, 6]), 'Lun, Mié y Sáb')
assert.equal(resumenDias([]), 'Sin días')
assert.equal(duracionLegible(90 * 60000), '1 h 30 min')
assert.equal(duracionLegible(30 * 60000), '30 min')
assert.equal(duracionLegible(2 * 3600000), '2 h')

// ─── Programación semanal (mismos datos que las pruebas del servidor) ───
const menus: MenuHorarioFila[] = ['Desayunos', 'Almuerzos', 'Brunch', 'Nocturno', 'Pausado'].map((nombre, i) => ({
  id: 'm' + i, nombre, descripcion: null, estado: nombre === 'Pausado' ? 'pausado' : 'activo',
  mostrar_en_qr: true, fecha_inicio: null, fecha_fin: null, prioridad: 100, color: null,
}))
const f = (menu_id: string, dias: number[], ini: string, fin: string, esp: string | null = null): FranjaFila =>
  ({ id: menu_id + ini, menu_id, dias, dia_especial_id: esp, hora_inicio: ini, hora_fin: fin })
const franjas: FranjaFila[] = [
  f('m0', [0, 1, 2, 3, 4, 5, 6], '06:00:00', '11:00:00'),
  f('m1', [1, 2, 3, 4, 5, 6], '11:00:00', '15:00:00'),
  f('m2', [0, 1, 2, 3, 4, 5, 6], '15:00:00', '18:00:00'),
  f('m3', [5, 6], '18:00:00', '02:00:00'),        // viernes y sábado, cruza la medianoche
  f('m4', [1], '09:00:00', '10:00:00'),            // menú pausado: no se dibuja
  f('m0', [], '10:00:00', '20:00:00', 'esp1'),     // franja de día especial: no se dibuja aquí
]
const sem = programacionSemanal(menus, franjas)
// El viernes (5): desayuno, almuerzo, brunch y nocturno desde las 18:00 hasta la medianoche
assert.deepEqual(sem[5].map(s => [s.menuId, s.ini, s.fin]), [['m0', 360, 660], ['m1', 660, 900], ['m2', 900, 1080], ['m3', 1080, 1440]])
// El sábado (6) empieza con la cola del nocturno del viernes (00:00–02:00) y también tiene su propio nocturno
assert.deepEqual(sem[6].map(s => [s.menuId, s.ini, s.fin]), [['m3', 0, 120], ['m0', 360, 660], ['m1', 660, 900], ['m2', 900, 1080], ['m3', 1080, 1440]])
// El domingo (0) recibe la cola del nocturno del sábado; no tiene almuerzo (días 1-6)
assert.deepEqual(sem[0].map(s => [s.menuId, s.ini, s.fin]), [['m3', 0, 120], ['m0', 360, 660], ['m2', 900, 1080]])
// El lunes (1) NO recibe cola: el domingo no tiene nocturno
assert.ok(!sem[1].some(s => s.menuId === 'm3'))
// Menú pausado y franjas de día especial no aparecen
assert.ok(Object.values(sem).every(l => l.every(s => s.menuId !== 'm4')))

// 24 horas (ini === fin): todo el día de inicio, sin cola
const s24 = programacionSemanal(menus, [f('m0', [2], '00:00:00', '00:00:00')])
assert.deepEqual(s24[2], [{ menuId: 'm0', ini: 0, fin: 1440 }])
assert.equal(s24[3].length, 0)

// Solapamientos
assert.deepEqual(solapamientos(menus, franjas), [])
const sol = solapamientos(menus, [...franjas, f('m2', [1], '14:00:00', '16:00:00')])   // brunch invade el almuerzo del lunes
assert.equal(sol.length, 1)
assert.deepEqual([sol[0].a, sol[0].b].sort(), ['m1', 'm2'])
assert.equal(sol[0].dia, 1)

// ─── Frases del aviso (horas LOCALES del restaurante) ───
assert.equal(cuandoLegible('2026-11-19T19:39:57', '2026-11-20T06:00'), 'mañana a las 6:00 a. m.')
assert.equal(cuandoLegible('2026-11-20T08:30:00', '2026-11-20T11:00'), 'hoy a las 11:00 a. m.')
assert.equal(cuandoLegible('2026-11-20T08:30:00', '2026-11-20T13:00'), 'hoy a la 1:00 p. m.')
assert.equal(cuandoLegible('2026-11-20T20:00:00', '2026-11-23T06:00'), 'el lunes a las 6:00 a. m.')   // 23 nov 2026 es lunes
assert.equal(cuandoLegible('2026-12-31T23:00:00', '2027-01-01T07:00'), 'mañana a las 7:00 a. m.')       // cruza el año
const eLoc: MenuHorarioEstado = { activo: true, hora_servidor: '2026-11-20T13:30:00Z', hora_local: '2026-11-20T08:30:00', cambia_en: '2026-11-20T16:00:00Z' }
assert.equal(cambioLocal(eLoc), '2026-11-20T11:00')                       // 2 h 30 min después de las 8:30 locales
assert.equal(cambioLocal({ ...eLoc, cambia_en: null }), null)
assert.equal(cambioLocal({ ...eLoc, activo: false }), null)
assert.equal(cambioLocal(null), null)

console.log('menuHorario: todas las pruebas pasan')
