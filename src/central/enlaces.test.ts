// Prueba de los enlaces de "un clic". Correr con:  node src/central/enlaces.test.ts
import assert from 'node:assert/strict'
import { enlaceCorreo, enlaceWhatsapp, telefonoWhatsapp } from './enlaces.ts'

// Teléfonos: un celular colombiano de 10 dígitos lleva el 57; ya con indicativo se respeta; fijos, vacíos y basura no
assert.equal(telefonoWhatsapp('300 123 4567'), '573001234567')
assert.equal(telefonoWhatsapp('(300) 123-4567'), '573001234567')
assert.equal(telefonoWhatsapp('+57 300 123 4567'), '573001234567')
assert.equal(telefonoWhatsapp('573001234567'), '573001234567')
assert.equal(telefonoWhatsapp('0057 300 123 4567'), '573001234567')
assert.equal(telefonoWhatsapp('+1 415 555 0132'), '14155550132', 'otros países con indicativo pasan tal cual')
for (const malo of ['606 741 2345', '7412345', '', '   ', 'sin teléfono', null, undefined]) assert.equal(telefonoWhatsapp(malo), null, `no es WhatsApp: ${String(malo)}`)

// WhatsApp: el texto va codificado (tildes, saltos de línea, comillas, &)
const wa = enlaceWhatsapp('3001234567', 'Hola, equipo de Café & Té.\n\nSi prefiere no recibir más, responda "baja".')
assert.ok(wa?.startsWith('https://wa.me/573001234567?text='))
assert.equal(decodeURIComponent(wa!.split('?text=')[1]), 'Hola, equipo de Café & Té.\n\nSi prefiere no recibir más, responda "baja".')
assert.ok(!wa!.includes(' ') && !wa!.includes('\n'), 'el enlace no lleva espacios ni saltos crudos')
assert.equal(enlaceWhatsapp('606 741 2345', 'hola'), null)

// Correo: solo si parece un correo; asunto y cuerpo codificados
const mail = enlaceCorreo(' hola@dongino.co ', 'Una idea para Café & Té', 'Línea 1\nLínea 2')
assert.ok(mail?.startsWith('mailto:hola@dongino.co?subject='))
const q = new URLSearchParams(mail!.split('?')[1])
assert.equal(q.get('subject'), 'Una idea para Café & Té'); assert.equal(q.get('body'), 'Línea 1\nLínea 2')
for (const malo of ['', 'sin arroba', 'a@b', 'dos@correos.co, otro@x.co', 'x y@z.co', null, undefined]) assert.equal(enlaceCorreo(malo, 'a', 'b'), null, `no es un correo: ${String(malo)}`)

console.log('enlaces: todo OK')
