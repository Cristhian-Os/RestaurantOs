// Pruebas de central-trabajador (sin red ni base).  Correr con:  node supabase/functions/central-trabajador/logica.test.ts
import assert from 'node:assert/strict'
import { MAX_POR_CORRIDA, armarPedido, citasDeRespuesta, claveTrabajoDiario, costoCorrida, cupoRestante, extraerJson, hostDe, urlNorm, validarCandidatos } from './logica.ts'

// Cupo: respeta el máximo de la campaña y el tope por corrida; sin máximo no busca
assert.equal(cupoRestante(30, 0), MAX_POR_CORRIDA)
assert.equal(cupoRestante(30, 28), 2)
assert.equal(cupoRestante(30, 30), 0)
assert.equal(cupoRestante(0, 0), 0)
assert.equal(cupoRestante('x', 0), 0)
assert.equal(cupoRestante(undefined, 0), 0)

// URLs
assert.equal(hostDe('https://www.Ejemplo.com/menu'), 'ejemplo.com')
assert.equal(hostDe('javascript:alert(1)'), null)
assert.equal(hostDe('no es url'), null)
assert.equal(urlNorm('https://www.a.com/x/#top'), urlNorm('https://a.com/x'))

// Clave diaria estable (misma campaña y día = mismo trabajo)
assert.equal(claveTrabajoDiario('abc', '2026-11-24'), claveTrabajoDiario('abc', '2026-11-24'))
assert.notEqual(claveTrabajoDiario('abc', '2026-11-24'), claveTrabajoDiario('abc', '2026-11-25'))

// Pedido: ordena tratar la web como dato no confiable y no pedir teléfonos
const p = armarPedido({ ciudad: 'Armenia', segmento: 'pizzerías', criterios_exclusion: 'cadenas' }, 3)
assert.match(p.sistema, /NO confiable/)
assert.match(p.sistema, /No pongas teléfonos/)
assert.match(p.usuario, /hasta 3/)
assert.match(p.usuario, /Armenia/)

// JSON con ``` y con texto alrededor
assert.deepEqual(extraerJson('```json\n{"candidatos":[]}\n```'), { candidatos: [] })
assert.deepEqual(extraerJson('Claro: {"candidatos":[]} listo'), { candidatos: [] })
assert.equal(extraerJson('sin json'), null)
assert.equal(extraerJson('{roto'), null)

// Validación: SOLO pasa lo que tiene una fuente realmente citada
const citas = [{ url: 'https://directorio.co/pizzeria-roma', title: 'Roma' }, { url: 'https://www.sabor.com/', title: 'Sabor' }]
const crudo = { candidatos: [
  { nombre_comercial: 'Pizzería Roma', segmento: 'pizzería', ciudad: 'Armenia', ubicacion_publica: 'Barrio Centro', fuente_url: 'https://directorio.co/pizzeria-roma', web: 'https://pizzeriaroma.co' },
  { nombre_comercial: 'Sabor', segmento: 'restaurante', fuente_url: 'https://sabor.com', web: 'https://www.sabor.com/inicio' },
  { nombre_comercial: 'Inventado SAS', fuente_url: 'https://no-aparecio.com/x' },
  { nombre_comercial: 'pizzería roma', fuente_url: 'https://directorio.co/pizzeria-roma' },
  { nombre_comercial: 'X', fuente_url: 'https://directorio.co/pizzeria-roma' },
  { nombre_comercial: 'Malicioso', fuente_url: 'javascript:alert(1)' },
] }
const v = validarCandidatos(crudo, citas, { ciudad: 'Armenia' }, 5)
assert.deepEqual(v.aceptados.map(c => c.nombre_comercial), ['Pizzería Roma', 'Sabor'])
assert.equal(v.aceptados[0].web, null, 'una web que no apareció en la búsqueda no se guarda')
assert.equal(v.aceptados[1].web, 'https://www.sabor.com/inicio', 'una web con dominio citado sí')
assert.equal(v.aceptados[1].ciudad, 'Armenia', 'sin ciudad usa la de la campaña')
assert.ok(v.aceptados[0].fuente.includes('Sin verificar'))
assert.deepEqual(v.descartados.map(d => d.motivo).sort(), ['fuente_no_verificada', 'fuente_no_verificada', 'repetido', 'sin_nombre'].sort())

// Respeta el cupo y tolera basura
assert.equal(validarCandidatos(crudo, citas, {}, 1).aceptados.length, 1)
assert.equal(validarCandidatos(null, citas, {}, 5).aceptados.length, 0)
assert.equal(validarCandidatos({ candidatos: 'x' }, citas, {}, 5).aceptados.length, 0)
assert.equal(validarCandidatos(crudo, [], {}, 5).aceptados.length, 0, 'sin citas no se acepta nada')

// Caracteres de control fuera del nombre
const lim = validarCandidatos({ candidatos: [{ nombre_comercial: 'Bar\u0000 Uno\n', fuente_url: 'https://directorio.co/pizzeria-roma' }] }, citas, {}, 5)
assert.equal(lim.aceptados[0].nombre_comercial, 'Bar Uno')

// Citas de la respuesta del proveedor
assert.deepEqual(citasDeRespuesta({ annotations: [{ type: 'url_citation', url_citation: { url: 'https://a.com/x', title: 'A' } }, { type: 'otra' }, { type: 'url_citation', url_citation: { url: 'ftp://malo' } }] }).map(c => c.url), ['https://a.com/x'])
assert.deepEqual(citasDeRespuesta(null), [])

// Costo: siempre incluye la búsqueda web
assert.ok(costoCorrida(0) > 0)
assert.ok(costoCorrida(0.01) > costoCorrida(0))

console.log('central-trabajador: todo OK')

// ── Nico: borradores de contenido ──
import { PROHIBIDO, armarPedidoContenido, textoDocumento, validarPieza } from './logica.ts'
const buena = { titulo: 'Tres errores al contar el inventario', pilar: 'educacion', canal: 'instagram', formato: 'carrusel', copy: 'Contar el inventario una vez por semana y anotar lo que se bota evita sorpresas a fin de mes.', cta: 'Cuéntanos cómo lo haces hoy.', idea_visual: 'Hoja de conteo sobre una mesa de cocina.' }
assert.ok('pieza' in validarPieza(buena))
assert.deepEqual(validarPieza({ ...buena, copy: 'Con nosotros emites factura electrónica DIAN sin esfuerzo y con garantía' }), { motivo: 'promesa_no_permitida' })
for (const t of ['Funciona sin internet', 'Gratis por un mes', '20% de descuento', 'Ingresos pasivos para tu negocio', 'Somos el mejor sistema', 'Sistema multisede'])
  assert.deepEqual(validarPieza({ ...buena, copy: `Texto largo de prueba. ${t}. Fin del texto.` }), { motivo: 'promesa_no_permitida' }, t)
assert.deepEqual(validarPieza({ ...buena, pilar: 'ventas' }), { motivo: 'pilar_invalido' })
assert.deepEqual(validarPieza({ ...buena, canal: 'myspace' }), { motivo: 'canal_o_formato_invalido' })
assert.deepEqual(validarPieza({ titulo: 'x' }), { motivo: 'incompleto' })
assert.deepEqual(validarPieza(null), { motivo: 'incompleto' })
assert.ok(!PROHIBIDO.test('Anota lo que se bota cada semana'))
const pedido = armarPedidoContenido({ ciudad: 'Armenia', segmento: 'cafeterías' }, [{ nombre: 'Planes y precios', limitaciones: '' }])
assert.match(pedido.sistema, /Planes y precios/)
assert.match(pedido.sistema, /NO se publica/)
assert.match(armarPedidoContenido({}, []).sistema, /ninguna verificada/)
assert.match(textoDocumento((validarPieza(buena) as { pieza: never }).pieza, '2026-11-24'), /NO PUBLICADO/)
console.log('central-trabajador (Nico): todo OK')

// ── Sincronización de funciones: lo automático solo baja o avisa ──
import { conHuella, evidenciaAuto, huellaDe, manifiestoValido, planSincronizacion } from './logica.ts'
const F = (id: string, huella: string, existe = true) => ({ id, nombre: `Función ${id}`, area: 'Operación', evidencia: [`src/${id}.tsx`], existe, huella })
const H1 = 'aaaaaaaaaaaa', H2 = 'bbbbbbbbbbbb'
// nueva: entra como "parcial" con evidencia y huella; nunca como producción
let plan: ReturnType<typeof planSincronizacion> = planSincronizacion([F('mesas', H1)], [], '2026-11-24')
assert.equal(plan.insertar.length, 1); assert.equal(plan.insertar[0].estado, 'parcial'); assert.equal(huellaDe(plan.insertar[0].evidencia), H1)
assert.equal(planSincronizacion([F('mesas', H1, false)], [], '2026-11-24').insertar.length, 0, 'lo que no existe en el código no se agrega')
// sin cambios: no toca nada
const auto = evidenciaAuto(F('mesas', H1), '2026-11-24')
plan = planSincronizacion([F('mesas', H1)], [{ id: 'mesas', estado: 'parcial', evidencia: auto }], '2026-11-25')
assert.deepEqual(plan, { insertar: [], actualizar: [], bajar: [], reverificar: [] })
// cambió el código: una función "parcial" solo actualiza su evidencia
plan = planSincronizacion([F('mesas', H2)], [{ id: 'mesas', estado: 'parcial', evidencia: auto }], '2026-11-25')
assert.equal(plan.actualizar.length, 1); assert.deepEqual(plan.reverificar, []); assert.equal(huellaDe(plan.actualizar[0].evidencia), H2)
// cambió el código de una "En producción": se actualiza la huella Y se pide volver a verificar; el estado no se toca (no hay campo estado en el plan)
plan = planSincronizacion([F('mesas', H2)], [{ id: 'mesas', estado: 'produccion', evidencia: `Verificado a mano por Cristhian. [huella:${H1}]` }], '2026-11-25')
assert.deepEqual(plan.reverificar, ['mesas']); assert.ok(plan.actualizar[0].evidencia.startsWith('Verificado a mano por Cristhian.')); assert.equal(huellaDe(plan.actualizar[0].evidencia), H2)
// evidencia manual sin huella: se empieza a seguir, sin alarma
plan = planSincronizacion([F('mesas', H1)], [{ id: 'mesas', estado: 'produccion', evidencia: 'Probado en Cholaos el 2026-11-01' }], '2026-11-25')
assert.deepEqual(plan.reverificar, []); assert.equal(huellaDe(plan.actualizar[0].evidencia), H1)
// desapareció del código: baja (la dirección segura)
plan = planSincronizacion([F('mesas', H1, false)], [{ id: 'mesas', estado: 'produccion', evidencia: 'x'.repeat(10) }], '2026-11-25')
assert.deepEqual(plan.bajar, ['mesas'])
assert.deepEqual(planSincronizacion([F('mesas', H1, false)], [{ id: 'mesas', estado: 'desarrollo', evidencia: '' }], '2026-11-25').bajar, [])
// filas que el manifiesto no menciona se dejan en paz
assert.deepEqual(planSincronizacion([], [{ id: 'planes_precios', estado: 'produccion', evidencia: 'tabla planes' }], '2026-11-25'), { insertar: [], actualizar: [], bajar: [], reverificar: [] })
// conHuella respeta el límite y reemplaza
assert.equal(conHuella(`texto [huella:${H1}]`, H2), `texto [huella:${H2}]`)
assert.ok(conHuella('y'.repeat(1000), H1).length <= 1000)
// el manifiesto viene de internet: se filtra lo malformado
const manifiestoCrudo = { funciones: [F('ok_uno', H1), { ...F('Mal Id', H1) }, { ...F('sin_huella', H1), huella: 'zz' }, { ...F('ruta_mala', H1), evidencia: ['../../etc/passwd'] }, 'basura', null] }
assert.deepEqual(manifiestoValido(manifiestoCrudo).map(f => f.id), ['ok_uno'])
assert.deepEqual(manifiestoValido(null), [])
console.log('central-trabajador (funciones): todo OK')

// ── Plan semanal ──
import { armarPlan, diasLaborales, lunesDeLaSemana } from './logica.ts'
assert.equal(lunesDeLaSemana('2026-11-22'), '2026-11-23', 'domingo → el lunes siguiente')   // 2026-11-22 es domingo
assert.equal(lunesDeLaSemana('2026-11-25'), '2026-11-23', 'miércoles → el lunes de esa semana')
assert.equal(lunesDeLaSemana('2026-11-28'), '2026-11-23', 'sábado → esa semana')
assert.equal(lunesDeLaSemana('2026-11-29'), '2026-11-30', 'domingo → el lunes siguiente')
assert.deepEqual(diasLaborales('2026-11-23'), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'])
const camp = [{ id: 'c1', nombre: 'Armenia piloto', ciudad: 'Armenia y alrededores' }]
let pl = armarPlan(camp, '2026-11-30', '2026-11-29')
assert.equal(pl.items.filter(i => i.agente_id === 'mateo').length, 6, 'Mateo de lunes a sábado')
assert.equal(pl.items.filter(i => i.agente_id === 'nico').length, 3, 'Nico lunes, miércoles y viernes')
assert.equal(pl.items.filter(i => i.tipo === 'tarea_humana').length, 3)
assert.ok(pl.items.every(i => i.tipo === 'tarea_humana' ? i.autorizacion_id === null : i.autorizacion_id === 'c1'), 'lo ejecutable siempre lleva su campaña')
assert.ok(pl.items.every(i => ['mateo', 'nico', 'chef-mayor'].includes(i.agente_id)), 'solo agentes que pueden hacer algo hoy')
assert.deepEqual([...pl.items].map(i => i.dia), [...pl.items].map(i => i.dia).sort())
assert.match(pl.resumen, /6 búsqueda/)
// A mitad de semana no se planean los días que ya pasaron
pl = armarPlan(camp, '2026-11-23', '2026-11-26')
assert.ok(pl.items.every(i => i.dia >= '2026-11-26'))
// Sin campaña no hay plan (no se inventa trabajo)
assert.deepEqual(armarPlan([], '2026-11-30', '2026-11-29').items, [])
// Con estadísticas de la semana pasada
assert.match(armarPlan(camp, '2026-11-30', '2026-11-29', { prospectosNuevos: 7, borradores: 3, gastoUsd: 0.5, fallidos: 1 }).resumen, /7 negocio\(s\) nuevo\(s\).*US\$ 0\.50/)
// Máximo 3 campañas (el plan no se infla)
assert.ok(armarPlan([...camp, { ...camp[0], id: 'c2' }, { ...camp[0], id: 'c3' }, { ...camp[0], id: 'c4' }], '2026-11-30', '2026-11-29').items.every(i => i.autorizacion_id !== 'c4'))
console.log('central-trabajador (plan semanal): todo OK')

// ── Gemini: verificación por dominio ──
import { citasGemini, dominioDeTitulo } from './logica.ts'
assert.equal(dominioDeTitulo('WWW.Ejemplo.com'), 'ejemplo.com'); assert.equal(dominioDeTitulo('Google Maps'), null); assert.equal(dominioDeTitulo('javascript:x'), null)
const chunks = [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'pizzeriaroma.co' } }, { web: { uri: 'https://x', title: 'sin dominio' } }, null, { otro: 1 }]
assert.deepEqual(citasGemini(chunks).map(c => c.title), ['pizzeriaroma.co']); assert.deepEqual(citasGemini(null), [])
const crudoG = { candidatos: [
  { nombre_comercial: 'Pizzería Roma', fuente_url: 'https://www.pizzeriaroma.co/menu', web: 'https://pizzeriaroma.co' },
  { nombre_comercial: 'Inventado', fuente_url: 'https://no-aparecio.com/x' },
  { nombre_comercial: 'Malicioso', fuente_url: 'javascript:alert(1)' } ] }
const vg = validarCandidatos(crudoG, citasGemini(chunks), {}, 5, true)
assert.deepEqual(vg.aceptados.map(c => c.nombre_comercial), ['Pizzería Roma']); assert.equal(vg.aceptados[0].web, 'https://pizzeriaroma.co')
assert.deepEqual(vg.descartados.map(d => d.motivo), ['fuente_no_verificada', 'fuente_no_verificada'])
assert.equal(validarCandidatos(crudoG, [], {}, 5, true).aceptados.length, 0, 'sin citas no se acepta nada')
console.log('central-trabajador (Gemini): todo OK')
