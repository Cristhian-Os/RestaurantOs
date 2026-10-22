// Prueba del modo landing de Resti. Correr con:  node supabase/functions/chat-support/landing.test.ts
import assert from 'node:assert/strict'
import { filtrarRespuesta, validarLead, planesTexto, cifrasPermitidas, refValido, sesionValida, sinTelefonos, SYSTEM_LANDING, FALLBACK_COBRO, FALLBACK_PRECIO, type PlanPublico } from './landing.ts'

const planes: PlanPublico[] = [
  { id: 'emprende', nombre: 'Esencial', disponible: true, max_mesas: 22, mensual: { total_cop: 160000, base_cop: 134454 }, anual: { total_cop: 1680000, base_cop: 1411765 } },
  { id: 'pro', nombre: 'Pro', disponible: true, max_mesas: null, mensual: { total_cop: 260000, base_cop: 218487 }, anual: { total_cop: 2730000, base_cop: 2294118 } },
  { id: 'premium', nombre: 'Premium', disponible: false, sede_extra_cop: 65000, mensual: { total_cop: 325000, base_cop: 273109 }, anual: { total_cop: 3412500, base_cop: 2867647 } },
]

// Los precios del prompt salen de la tabla y Premium (no disponible) NO aparece
const t = planesTexto(planes)
assert.match(t, /Esencial: \$160\.000/); assert.match(t, /Pro: \$260\.000/); assert.doesNotMatch(t, /Premium|325/)
assert.ok(cifrasPermitidas(planes).has(160000) && !cifrasPermitidas(planes).has(325000))
assert.match(SYSTEM_LANDING(t), /No existe prueba gratis/)

// Respuestas buenas pasan
const ok = (s: string) => assert.equal(filtrarRespuesta(s, planes).filtrada, false, s)
ok('Para 10 mesas te recomiendo Esencial: $160.000 al mes con IVA incluido.')
ok('El plan Pro cuesta $260.000 al mes, o $2.730.000 al año prepagado.')
ok('Esencial sirve hasta 22 mesas. ¿Qué usas hoy para tomar pedidos?')
ok('Pro: 260 mil pesos al mes.'.replace('260 mil pesos', '$260.000'))
// "gratis", promociones y descuentos inventados se cortan
for (const s of ['Tenemos prueba gratis de 7 días.', 'Te lo damos gratis el primer mes.', 'Hoy hay una promoción del 50%.', 'Premium gratis para ti, por ser tú.', 'Es sin costo para ti.', 'Te hago un 20% de descuento.'])
  assert.equal(filtrarRespuesta(s, planes).texto === FALLBACK_COBRO || filtrarRespuesta(s, planes).texto === FALLBACK_PRECIO, true, s)
// Precios distintos a la tabla se cortan (incluido el de Premium y formas con "mil")
for (const s of ['El plan Pro cuesta $199.000 al mes.', 'Premium vale $325.000 al mes.', 'Son 200000 pesos mensuales.', 'Cuesta 200 mil pesos.', 'Sale en 150 mil al mes.', 'Esencial cuesta $160.000 y Pro $250.000.'])
  assert.equal(filtrarRespuesta(s, planes).filtrada, true, s)
assert.equal(filtrarRespuesta('Tenemos más de 5 mil clientes felices.', planes).filtrada, false)   // "mil" sin precio no es un precio
// Frases evasivas y cifras con letras
for (const s of ['Te lo dejo a la mitad de precio.', 'Cero costo el primer mes.', 'Puedes hacer una prueba sin compromiso.', 'Vale 20 dólares.', 'Cuesta ciento sesenta mil pesos.', 'Son quince mil al mes.', 'Te regalamos la instalación.', 'Cuesta 30 USD.', 'Un diez por ciento menos.'])
  assert.equal(filtrarRespuesta(s, planes).filtrada, true, s)
ok('Comprueba que tu menú esté completo antes de abrir.')
ok('Tu equipo tiene treinta días de garantía sobre el primer pago.')

// Leads: nombre y WhatsApp obligatorios; se normaliza y se acota
const l = validarLead({ nombre: ' Ana  <b>Pérez</b> ', whatsapp: '300 111 2222', restaurante: 'Heladería Ana', mesas: 12, interes: 'pro', resumen: 'x'.repeat(2000) })
assert.ok(!('error' in l)); if (!('error' in l)) { assert.equal(l.whatsapp, '573001112222'); assert.equal(l.nombre, 'Ana b Pérez /b'); assert.equal(l.resumen?.length, 1000); assert.equal(l.interes, 'pro'); assert.equal(l.mesas, 12) }
assert.ok('error' in validarLead({ nombre: 'Ana', whatsapp: 'abc' }))
assert.ok('error' in validarLead({ nombre: '', whatsapp: '3001112222' }))
assert.ok('error' in validarLead(null))
const l2 = validarLead({ nombre: 'Bob', whatsapp: '3109998888', interes: 'gratis', mesas: -4 })
assert.ok(!('error' in l2)); if (!('error' in l2)) { assert.equal(l2.interes, 'otro'); assert.equal(l2.mesas, null) }

// ref, sesión y teléfonos
assert.equal(refValido('promo-1_a'), 'promo-1_a'); assert.equal(refValido('x y'), null); assert.equal(refValido('<script>'), null); assert.equal(refValido('a'.repeat(41)), null)
assert.equal(sesionValida('abcdef123456'), 'abcdef123456'); assert.equal(sesionValida('corto'), null)
assert.equal(sinTelefonos('Mi cel es +57 300 111 2222 y el fijo 606 123 4567'), 'Mi cel es [número] y el fijo [número]')
console.log('landing.test OK')
