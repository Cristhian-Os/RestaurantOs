// Prueba:  node supabase/functions/_shared/central_llaves.test.ts
import assert from 'node:assert/strict'
import { SECRETOS, filaDe, validarSecreto } from './central_llaves.ts'

assert.equal(filaDe('CENTRAL_CLAVE_CLAUDE'), 'central_clave_claude')
assert.equal(SECRETOS.length, 9)
assert.equal(validarSecreto("CENTRAL_CLAVE_OPENROUTER", "sk-or-v1-abcdefghijklmnop1234"), null)
assert.equal(validarSecreto('CENTRAL_CLAVE_CLAUDE', 'sk-ant-abcdefghijklmnop'), null)
assert.equal(validarSecreto('CENTRAL_TELEGRAM_TOKEN', '123456789:AAH-abc_DEF123'), null)
assert.equal(validarSecreto('CENTRAL_TELEGRAM_CHAT_ID', '-1001234567890'), null)
assert.equal(validarSecreto('CENTRAL_TELEGRAM_CHAT_ID', '123456789'), null)
assert.ok(validarSecreto('CENTRAL_TELEGRAM_CHAT_ID', 'abc'))          // no es número
assert.ok(validarSecreto('CENTRAL_CLAVE_CLAUDE', 'corta'))            // incompleta
assert.ok(validarSecreto('CENTRAL_CLAVE_CLAUDE', 'sk-ant con espacio'))
assert.ok(validarSecreto('CENTRAL_CLAVE_CLAUDE', 'sk-ant-\nsalto-de-linea'))
assert.ok(validarSecreto('CENTRAL_CLAVE_CLAUDE', 'x'.repeat(401)))
assert.ok(validarSecreto('CENTRAL_CLAVE_CLAUDE', 123 as never))
assert.ok(validarSecreto('CUALQUIER_OTRO', 'sk-ant-abcdefghijklmnop'))  // solo los 5 nombres permitidos
assert.equal(validarSecreto('CENTRAL_CLAVE_NVIDIA', '  nvapi-abcdefghijk  '), null)  // se recorta
console.log('central_llaves: TODO OK')
