// Pruebas de las funciones puras de WhatsApp (sin red). Correr con:  node supabase/functions/_shared/whatsapp.test.ts
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  verificarFirmaMeta, normalizar, esBaja, pideEstado, diceEntregado, extraerCodigo, parsearPayload, construirEnvio, recortarError, type MensajeCola,
} from './whatsapp.ts'

// Firma: válida, alterada, sin cabecera, mal formada
{
  const cuerpo = '{"a":1}', secreto = 'secreto-de-prueba'
  const firma = 'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex')
  assert.equal(await verificarFirmaMeta(secreto, cuerpo, firma), true)
  assert.equal(await verificarFirmaMeta(secreto, cuerpo + ' ', firma), false)
  assert.equal(await verificarFirmaMeta('otro', cuerpo, firma), false)
  assert.equal(await verificarFirmaMeta(secreto, cuerpo, null), false)
  assert.equal(await verificarFirmaMeta(secreto, cuerpo, 'sha256=zz'), false)
  assert.equal(await verificarFirmaMeta(secreto, cuerpo, firma.slice(0, -2)), false)
  assert.equal(await verificarFirmaMeta('', cuerpo, firma), false)
}
// Texto
assert.equal(normalizar('  ¡BAJA!  '), 'baja')
for (const t of ['BAJA', 'baja.', ' Stop ', 'Dar de baja', 'Bája']) assert.equal(esBaja(t), true, t)
for (const t of ['bajar', 'no quiero la baja de precio', '', null]) assert.equal(esBaja(t as any), false, String(t))
assert.equal(pideEstado('Estado'), true); assert.equal(pideEstado('¿Dónde está mi pedido?'), true); assert.equal(pideEstado('hola'), false)
assert.equal(diceEntregado('Entregado'), true); assert.equal(diceEntregado('Ya entregué'), true); assert.equal(diceEntregado('listo!'), true)
assert.equal(extraerCodigo('1234'), '1234'); assert.equal(extraerCodigo('Código 0042'), '0042'); assert.equal(extraerCodigo('12345'), null)
assert.equal(extraerCodigo('1234 5678'), null); assert.equal(extraerCodigo('mi pedido es el 1234 por favor gracias'), null); assert.equal(extraerCodigo('hola'), null)
// Payload
{
  const p = parsearPayload({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
    metadata: { phone_number_id: '111' }, contacts: [{ wa_id: '573001112233', profile: { name: 'Ana' } }],
    messages: [{ id: 'wamid.1', from: '573001112233', type: 'text', text: { body: 'Hola' } },
               { id: 'wamid.2', from: '573001112233', type: 'image', image: { id: 'm1', mime_type: 'image/jpeg', caption: 'pago' } }],
    statuses: [{ id: 'wamid.9', status: 'delivered' }, { id: 'wamid.8', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement' }] }, { id: 'x', status: 'raro' }],
  } }] }] })
  assert.equal(p.length, 1); assert.equal(p[0].phoneNumberId, '111')
  assert.deepEqual(p[0].mensajes.map(m => [m.tipo, m.texto, m.mediaId, m.nombre]), [['texto', 'Hola', null, 'Ana'], ['imagen', 'pago', 'm1', 'Ana']])
  assert.deepEqual(p[0].estados.map(s => s.estado), ['entregado', 'fallido']); assert.match(p[0].estados[1].error!, /131047/)
  assert.deepEqual(parsearPayload({ object: 'otra' }), []); assert.deepEqual(parsearPayload(null), [])
  assert.deepEqual(parsearPayload({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ id: 'a', from: 'b' }] } }] }] }), [])   // sin phone_number_id
}
// Cuerpo de envío
{
  const base: MensajeCola = { id: 'i', restaurant_id: 'r', telefono: '573001112233', tipo: 'texto', contenido: { texto: 'Hola' }, intentos: 0, phone_number_id: '111', dentro_ventana: true, plantilla: null }
  const t = construirEnvio(base) as any
  assert.equal(t.cuerpo.type, 'text'); assert.equal(t.cuerpo.text.body, 'Hola')
  assert.match((construirEnvio({ ...base, dentro_ventana: false }) as any).fallo, /24 horas/)
  const plan = construirEnvio({ ...base, tipo: 'plantilla', dentro_ventana: false, contenido: { vars: { nombre: 'Ana\nPérez', eta_min: null, extra: 'x' } },
    plantilla: { nombre: 'dom_en_camino', idioma: 'es', variables: ['nombre', 'eta_min'], aprobada: true } }) as any
  assert.equal(plan.cuerpo.type, 'template'); assert.equal(plan.cuerpo.template.name, 'dom_en_camino')
  assert.deepEqual(plan.cuerpo.template.components[0].parameters, [{ type: 'text', text: 'Ana Pérez' }, { type: 'text', text: '-' }])   // en orden; sin saltos; vacío → "-"
  assert.match((construirEnvio({ ...base, tipo: 'plantilla', plantilla: null }) as any).fallo, /plantilla/)
  assert.match((construirEnvio({ ...base, tipo: 'plantilla', plantilla: { nombre: 'x', idioma: 'es', variables: [], aprobada: false } }) as any).fallo, /aprobada/)
  const sinVars = construirEnvio({ ...base, tipo: 'plantilla', plantilla: { nombre: 'x', idioma: 'es', variables: [], aprobada: true } }) as any
  assert.equal(sinVars.cuerpo.template.components, undefined)
}
// Errores sin secretos
{
  const e = recortarError(new Error('fallo Bearer EAAGabcdefghijklmnopqrstuvwxyz123 y token EAAGabcdefghijklmnopqrstuvwxyz123'))
  assert.ok(!e.includes('EAAG')); assert.ok(recortarError('x'.repeat(900)).length <= 500)
}
