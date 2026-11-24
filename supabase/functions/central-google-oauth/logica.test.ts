// Pruebas de central-google-oauth (sin red ni base).  Correr con:  node supabase/functions/central-google-oauth/logica.test.ts
import assert from 'node:assert/strict'
import { SCOPES, VIGENCIA_ESTADO_MS, correoDeIdToken, crearEstado, estadoValido, iguales, paginaResultado, urlAutorizacion, validarCliente } from './logica.ts'

// Cliente OAuth
assert.equal(validarCliente('123456789012-abcdefghij1234.apps.googleusercontent.com', 'GOCSPX-abcdefghijklmnop'), null)
assert.ok(validarCliente('mi-id', 'GOCSPX-abcdefghijklmnop'))
assert.ok(validarCliente('123456789012-abcdefghij1234.apps.googleusercontent.com', 'corto'))
assert.ok(validarCliente('123456789012-abcdefghij1234.apps.googleusercontent.com', 'tiene espacios 1234567890'))
assert.ok(validarCliente(null, undefined))

// URL: pide acceso offline, fuerza el consentimiento y lleva solo los permisos necesarios
const u = new URL(urlAutorizacion('cid.apps.googleusercontent.com', 'https://x.supabase.co/functions/v1/central-google-oauth', 'est|1'))
assert.equal(u.host, 'accounts.google.com')
assert.equal(u.searchParams.get('access_type'), 'offline'); assert.equal(u.searchParams.get('prompt'), 'consent')
assert.equal(u.searchParams.get('state'), 'est|1'); assert.equal(u.searchParams.get('response_type'), 'code')
assert.deepEqual(u.searchParams.get('scope')!.split(' '), SCOPES)
assert.ok(!SCOPES.some(s => /gmail\.(modify|compose)|mail\.google\.com|drive/.test(s)), 'sin permisos de más: no puede borrar ni modificar correos ni ver Drive')

// Estado: de un solo uso, con vigencia y comparación segura
const ahora = 1_800_000_000_000
const g = crearEstado('abcd1234', ahora)
assert.equal(estadoValido(g, 'abcd1234|x', ahora + 60_000), true)
assert.equal(estadoValido(g, 'abcd1234', ahora + 60_000), true)
assert.equal(estadoValido(g, 'abcd1235', ahora + 60_000), false)
assert.equal(estadoValido(g, 'abcd1234', ahora + VIGENCIA_ESTADO_MS + 1), false, 'caduca')
assert.equal(estadoValido(g, 'abcd1234', ahora - 1), false, 'no vale una hora futura')
assert.equal(estadoValido(null, 'abcd1234', ahora), false); assert.equal(estadoValido(g, '', ahora), false)
assert.equal(iguales('a', 'ab'), false); assert.equal(iguales('', ''), false)

// id_token
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
assert.equal(correoDeIdToken(`x.${b64({ email: 'Ventas@Mi-Negocio.com', email_verified: true })}.y`), 'ventas@mi-negocio.com')
assert.equal(correoDeIdToken(`x.${b64({ email: 'a@b.com', email_verified: false })}.y`), null)
assert.equal(correoDeIdToken(`x.${b64({ otro: 1 })}.y`), null); assert.equal(correoDeIdToken('basura'), null); assert.equal(correoDeIdToken(null), null)

// Página: escapa el texto
assert.ok(!paginaResultado(false, '<script>alert(1)</script>').includes('<script>'))
assert.match(paginaResultado(true, 'ok'), /Listo/)
console.log('central-google-oauth: todo OK')
