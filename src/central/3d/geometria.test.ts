// Prueba de la planta, la calidad gráfica y la máscara de continentes. Correr con:  node src/central/3d/geometria.test.ts
import assert from 'node:assert/strict'
import { ANILLOS, calcularSectores, puestosDeAgentes, sectorEn, trazadoSector, type EntradaSector } from './geometria.ts'
import { calidadPara, elegirNivel } from './calidad.ts'
import { hayTierraEn, puntosDeTierra } from './tierra.ts'

// 19 espacios como los de Central: 4 + 10 + 5 repartidos en los anillos 2, 3 y 4
const entradas: EntradaSector[] = [
  ...[1, 2, 3, 4].map(i => ({ id: `a2-${i}`, anillo: 2 as const, orden: i, color: '#FF7A1A' })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `a3-${i}`, anillo: 3 as const, orden: i + 1, color: '#3D8BFF' })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `a4-${i}`, anillo: 4 as const, orden: i + 1, color: '#F59E0B' })),
]
const sectores = calcularSectores(entradas)
assert.equal(sectores.length, 19)

// Cada sector está dentro de su anillo, no se pisa con el vecino y el anillo no se pasa de una vuelta
for (const anillo of [2, 3, 4] as const) {
  const s = sectores.filter(x => x.anillo === anillo).sort((a, b) => a.a0 - b.a0)
  for (const x of s) { assert.ok(x.a1 > x.a0, 'sector con ángulo positivo'); assert.equal(x.r0, ANILLOS[anillo].r0); assert.equal(x.r1, ANILLOS[anillo].r1) }
  for (let i = 1; i < s.length; i++) assert.ok(s[i].a0 > s[i - 1].a1, `los sectores del anillo ${anillo} no se pisan`)
  assert.ok(s[s.length - 1].a1 - s[0].a0 < Math.PI * 2, 'no pasa de una vuelta')
}
// Los anillos no se tocan entre sí
assert.ok(ANILLOS[2].r1 < ANILLOS[3].r0 && ANILLOS[3].r1 < ANILLOS[4].r0)

// Los puestos de los agentes caen dentro de su propio sector y miran al centro
for (const n of [1, 2, 3, 5, 8]) {
  for (const s of sectores.slice(0, 5)) {
    const puestos = puestosDeAgentes(s, n)
    assert.equal(puestos.length, n)
    for (const p of puestos) {
      assert.equal(sectorEn(sectores, p.x, p.z)?.id, s.id, `puesto dentro de ${s.id} (n=${n})`)
      // mirando al núcleo: avanzar un poco en la dirección del giro acerca al centro
      const antes = Math.hypot(p.x, p.z), despues = Math.hypot(p.x + Math.sin(p.giro) * 0.5, p.z + Math.cos(p.giro) * 0.5)
      assert.ok(despues < antes, 'mira hacia el núcleo')
    }
  }
}
assert.deepEqual(puestosDeAgentes(sectores[0], 0), [])
assert.equal(sectorEn(sectores, 0, 0), null, 'el núcleo no es un sector')
assert.equal(sectorEn(sectores, 200, 0), null, 'fuera de la oficina no hay sector')
assert.match(trazadoSector(sectores[0], 10, 20, 5), /^M .* Z$/)

// Calidad: lo desconocido no se toma por potente; un celular recibe menos
assert.equal(elegirNivel({ hilos: null, memoriaGB: null, tactil: false, anchoPantalla: 1920, ratioPixel: 1 }), 'media')
assert.equal(elegirNivel({ hilos: 12, memoriaGB: 8, tactil: false, anchoPantalla: 1920, ratioPixel: 1 }), 'alta')
assert.equal(elegirNivel({ hilos: 8, memoriaGB: 8, tactil: true, anchoPantalla: 390, ratioPixel: 3 }), 'media')
assert.equal(elegirNivel({ hilos: 4, memoriaGB: 2, tactil: true, anchoPantalla: 360, ratioPixel: 2 }), 'baja')
assert.equal(calidadPara('baja', { ratioPixel: 3 }).ratioPixel, 1)
assert.equal(calidadPara('alta', { ratioPixel: 3 }).ratioPixel, 2)
assert.ok(calidadPara('baja', { ratioPixel: 1 }).fpsMax < calidadPara('alta', { ratioPixel: 1 }).fpsMax)

// Continentes: ciudades reales sobre tierra, mares sin tierra
assert.ok(hayTierraEn(4.5339, -75.6811), 'Armenia, Colombia')
assert.ok(hayTierraEn(4.7110, -74.0721), 'Bogotá')
assert.ok(hayTierraEn(40.4168, -3.7038), 'Madrid')
assert.ok(hayTierraEn(-33.4489, -70.6693), 'Santiago de Chile')
assert.ok(!hayTierraEn(0, -30), 'Atlántico')
assert.ok(!hayTierraEn(-30, -140), 'Pacífico sur')
assert.ok(puntosDeTierra(2).length > 4000 && puntosDeTierra(2).length < puntosDeTierra(1).length / 3)

console.log('geometria/calidad/tierra: todo OK')
