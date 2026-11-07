// Los respaldos de Resti deben existir para todas las combinaciones. Correr con:  node src/components/resti/sprites.test.ts
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { listaSprites, archivoSprite, rutaSprite } from './spritesRuta.ts'

const lista = listaSprites()
assert.equal(new Set(lista.map(s => s.archivo)).size, lista.length, 'nombres únicos')
for (const s of lista) {
  const f = `public/assets/resti/sprites/${s.archivo}`
  assert.ok(existsSync(f), `falta ${f}`)
  assert.ok(statSync(f).size < 60_000, `${f} pesa demasiado`)
}
assert.equal(archivoSprite('caminar', -1, 'procesando', 3), 'caminar-izq-b-procesando.webp')
assert.equal(archivoSprite('caminar', 1, 'disponible', 2), 'caminar-der-a-disponible.webp')
assert.equal(archivoSprite('reposo', -1, 'disponible'), 'reposo-disponible.webp')   // sin dirección: nunca se espeja
assert.equal(rutaSprite('senalar', 1, 'disponible'), '/assets/resti/sprites/senalar-der-disponible.webp')
console.log(`sprites.test OK (${lista.length} imágenes)`)
