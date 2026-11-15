/**
 * entorno.ts — lo que rodea el edificio: pasto, plaza empedrada, fuente de entrada, palmeras, vía circular, parqueaderos con autos,
 * farolas y el bosque del fondo. Todo procedural y fundido en pocas mallas (ver kit.ts). Cantidad de detalle según la calidad.
 */
import { BufferGeometry, CircleGeometry, ConeGeometry, DoubleSide, Group, Material, RingGeometry, TorusGeometry } from 'three'
import { azar, Lote, type Formas, type Materiales } from './kit.ts'
import type { NivelCalidad } from './calidad.ts'
import { texAdoquin, texAsfalto, texPasto } from './texturas.ts'

export const ENTRADA = Math.PI / 2          // la entrada principal mira hacia +z
const DOS_PI = Math.PI * 2

/** Hoja de palmera: un cono bajo y plano. Compartido por todas las palmeras. */
export const crearHoja = () => new ConeGeometry(1, 1, 5)

/** Una palmera: tronco curvo en tramos y hojas arqueadas (dos tramos cada una). */
export function palma(L: Lote, F: Formas, X: Materiales, hoja: ConeGeometry, x: number, z: number, alto: number, rng: () => number) {
  const tronco = X.std('tronco', '#8A6A45', { roughness: 0.95 })
  const verdes = [X.std('hoja1', '#2E8B3E', { roughness: 0.8, side: DoubleSide }), X.std('hoja2', '#43A24A', { roughness: 0.8, side: DoubleSide })]
  const seg = alto / 4, lean = rng() * DOS_PI, off = 0.1 * (0.6 + rng() * 0.8)
  const lx = Math.cos(lean) * off, lz = Math.sin(lean) * off
  for (let i = 0; i < 4; i++) {
    const r = 0.34 - i * 0.045
    L.add(F.cil, tronco, [x + lx * (i + 0.5) * seg, seg * (i + 0.5), z + lz * (i + 0.5) * seg], [r, seg * 1.08, r])
  }
  const top: [number, number, number] = [x + lx * 4 * seg, alto, z + lz * 4 * seg]
  const n = 8, fase = rng() * DOS_PI
  for (let k = 0; k < n; k++) {
    const phi = fase + (k * DOS_PI) / n + (rng() - 0.5) * 0.25
    const mat = verdes[k % 2]
    const a1 = 0.95 + rng() * 0.2, la = alto * 0.34
    const d1: [number, number, number] = [Math.sin(a1) * Math.sin(phi), Math.cos(a1), Math.sin(a1) * Math.cos(phi)]
    L.add(hoja, mat, [top[0] + d1[0] * la / 2, top[1] + d1[1] * la / 2, top[2] + d1[2] * la / 2], [0.5, la, 0.1], [a1, phi, 0])
    const e1: [number, number, number] = [top[0] + d1[0] * la, top[1] + d1[1] * la, top[2] + d1[2] * la]
    const a2 = 1.95 + rng() * 0.25, lb = alto * 0.3
    const d2: [number, number, number] = [Math.sin(a2) * Math.sin(phi), Math.cos(a2), Math.sin(a2) * Math.cos(phi)]
    L.add(hoja, mat, [e1[0] + d2[0] * lb / 2, e1[1] + d2[1] * lb / 2, e1[2] + d2[2] * lb / 2], [0.36, lb, 0.08], [a2, phi, 0])
  }
}

/** Árbol de copa redonda (para el bosque del fondo y los jardines). */
export function arbol(L: Lote, F: Formas, X: Materiales, x: number, z: number, escala: number, tono: number) {
  const copas = [X.std('copa1', '#3F8F3A', { roughness: 0.9 }), X.std('copa2', '#2F7A33', { roughness: 0.9 }), X.std('copa3', '#58A33F', { roughness: 0.9 })]
  L.add(F.cil, X.std('tronco', '#8A6A45', { roughness: 0.95 }), [x, 1.4 * escala, z], [0.3 * escala, 2.8 * escala, 0.3 * escala])
  L.add(F.esf, copas[tono % 3], [x, 4.1 * escala, z], [2.4 * escala, 2.2 * escala, 2.4 * escala])
  L.add(F.esf, copas[(tono + 1) % 3], [x + 0.5 * escala, 5.7 * escala, z - 0.3 * escala], [1.6 * escala, 1.5 * escala, 1.6 * escala])
}

export function construirEntorno(F: Formas, X: Materiales, nivel: NivelCalidad): Group {
  const g = new Group()
  const suelo = new Lote(), obj = new Lote()
  const rng = azar(20261114)
  const f = nivel === 'alta' ? 1 : nivel === 'media' ? 0.7 : 0.4
  const plano = (geo: BufferGeometry, mat: Material, y: number) => suelo.add(geo, mat, [0, y, 0], 1, [-Math.PI / 2, 0, 0])
  const hoja = crearHoja()

  // Terreno, plaza y vía circular
  const tp = texPasto(); tp.repeat.set(150, 150)
  const pasto = X.tinte(X.std('pasto', '#FFFFFF', { map: tp, roughness: 0.96 }), '#E4EDDA', '#42527A')
  plano(new CircleGeometry(430, 64), pasto, -0.3)
  const ta = texAdoquin(); ta.repeat.set(22, 22)
  const adoquin = X.tinte(X.std('adoquin', '#FFFFFF', { map: ta, roughness: 0.8 }), '#FFFFFF', '#6A7396')
  plano(new CircleGeometry(48.5, 96), adoquin, -0.12)
  const tr = texAsfalto(); tr.repeat.set(14, 14)
  const asfalto = X.tinte(X.std('asfalto', '#FFFFFF', { map: tr, roughness: 0.9 }), '#FFFFFF', '#4B5470')
  plano(new RingGeometry(50, 58, 128), asfalto, -0.1)
  const bordillo = X.tinte(X.std('bordillo', '#CFC8B8', { roughness: 0.8 }), '#CFC8B8', '#5C6486')
  plano(new RingGeometry(48.5, 50, 128), bordillo, -0.1)
  plano(new RingGeometry(58, 58.5, 128), bordillo, -0.1)
  const raya = X.std('raya', '#F1F1EA', { roughness: 0.7 })
  for (let i = 0; i < 90; i++) {                       // línea central discontinua
    const a = (i / 90) * DOS_PI
    suelo.add(F.caja, raya, [54 * Math.cos(a), -0.08, 54 * Math.sin(a)], [2.4, 0.02, 0.2], [0, -a - Math.PI / 2, 0])
  }

  // Parqueaderos (cuatro arcos; queda libre el frente de la entrada) con autos
  const arcos: [number, number][] = [[0.2, 1.15], [1.99, 2.94], [3.6, 4.5], [5.0, 5.95]]
  const colores = ['#C9CED6', '#1F2430', '#E8E8EA', '#9A2B2B', '#2F5D8C', '#C58B2A']
  const autos = colores.map((c, i) => X.std('auto' + i, c, { roughness: 0.35, metalness: 0.55 }))
  const vidrioAuto = X.std('vidrioAuto', '#141A26', { roughness: 0.15, metalness: 0.6 })
  const llanta = X.std('llanta', '#121316', { roughness: 0.9 })
  const pintura = X.tinte(X.std('estacionamiento', '#FFFFFF', { map: tr, roughness: 0.92 }), '#FFFFFF', '#454E69')
  for (const [a0, a1] of arcos) {
    suelo.add(new RingGeometry(59, 68, 48, 1, -a1, a1 - a0), pintura, [0, -0.1, 0], 1, [-Math.PI / 2, 0, 0])
    for (let a = a0; a <= a1 + 0.001; a += 0.047) suelo.add(F.caja, raya, [63.5 * Math.cos(a), -0.075, 63.5 * Math.sin(a)], [0.14, 0.02, 5], [0, Math.PI / 2 - a, 0])
    for (let a = a0 + 0.0235; a < a1 - 0.01; a += 0.047) {
      if (rng() > 0.58 * (0.6 + f * 0.4)) continue
      const sentido = rng() > 0.5 ? 1 : -1
      const b = { x: 63.5 * Math.cos(a), z: 63.5 * Math.sin(a), phi: Math.PI / 2 - a + (sentido > 0 ? 0 : Math.PI) }
      const mat = autos[Math.floor(rng() * autos.length)]
      obj.addEn(b, F.caja, mat, [0, 0.62, 0], [1.8, 0.62, 4.2])
      obj.addEn(b, F.caja, vidrioAuto, [0, 1.17, -0.2], [1.55, 0.5, 2.2])
      for (const [lx, lz] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) obj.addEn(b, F.cil, llanta, [lx, 0.36, lz], [0.36, 0.28, 0.36], [0, 0, Math.PI / 2])
    }
  }

  // Palmeras de la plaza (queda un claro frente a la entrada para la fuente)
  const pasos = Math.round(30 * Math.max(0.5, f))
  for (let i = 0; i < pasos; i++) {
    const a = (i / pasos) * DOS_PI + 0.05
    if (Math.abs(Math.atan2(Math.sin(a - ENTRADA), Math.cos(a - ENTRADA))) < 0.3) continue
    palma(obj, F, X, hoja, 45.5 * Math.cos(a), 45.5 * Math.sin(a), 6.2 + rng() * 2.4, rng)
  }
  // Setos y flores junto a la fachada
  const seto = X.std('seto', '#3C8A38', { roughness: 0.9 })
  const flores = ['#F4A6C0', '#FFD25A', '#FF7A1A', '#FFFFFF'].map((c, i) => X.std('flor' + i, c, { roughness: 0.7 }))
  const nSetos = Math.round(72 * Math.max(0.5, f))
  for (let i = 0; i < nSetos; i++) {
    const a = (i / nSetos) * DOS_PI
    if (Math.abs(Math.atan2(Math.sin(a - ENTRADA), Math.cos(a - ENTRADA))) < 0.2) continue
    const x = 41.6 * Math.cos(a), z = 41.6 * Math.sin(a)
    obj.add(F.esf, seto, [x, 0.45, z], [1.1, 0.75, 1.1])
    if (rng() > 0.45) obj.add(F.esf, flores[Math.floor(rng() * flores.length)], [x + (rng() - 0.5) * 0.7, 1.05, z + (rng() - 0.5) * 0.7], 0.28)
  }

  // Farolas
  const farola = X.std('farola', '#2B313D', { roughness: 0.5, metalness: 0.5 })
  const luzFarola = X.luz('luzFarola', '#FFD9A0', 0.25, 3.4)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * DOS_PI + 0.13, x = 49 * Math.cos(a), z = 49 * Math.sin(a)
    obj.add(F.cil, farola, [x, 1.9, z], [0.07, 3.8, 0.07])
    obj.add(F.esf, luzFarola, [x, 3.95, z], 0.3)
  }

  // Fuente frente a la entrada
  const fx = 45 * Math.cos(ENTRADA), fz = 45 * Math.sin(ENTRADA)
  const piedra = X.std('piedra', '#D9D2C2', { roughness: 0.6 })
  obj.add(F.cil, piedra, [fx, 0.3, fz], [3.6, 0.6, 3.6])
  const agua = X.luz('agua', '#5FC4FF', 0.25, 1.4, { transparent: true, opacity: 0.88, roughness: 0.1 })
  obj.add(F.cil, agua, [fx, 0.58, fz], [3.2, 0.1, 3.2])
  const aroFuente = X.luz('aroFuente', '#FF7A1A', 0.9, 3.2)
  obj.add(new TorusGeometry(3.7, 0.1, 8, 48), aroFuente, [fx, 0.62, fz], 1, [Math.PI / 2, 0, 0])
  obj.add(F.cono, X.std('chorro', '#CFEFFF', { transparent: true, opacity: 0.55, roughness: 0.2 }), [fx, 1.9, fz], [0.55, 2.6, 0.55])

  // Bosque del fondo
  const nArboles = Math.round(300 * f)
  for (let i = 0; i < nArboles; i++) {
    const a = rng() * DOS_PI, r = 74 + Math.pow(rng(), 0.8) * 190
    arbol(obj, F, X, r * Math.cos(a), r * Math.sin(a), 0.9 + rng() * 0.9 + r / 120, Math.floor(rng() * 3))
  }
  const nPalmas = Math.round(24 * f)
  for (let i = 0; i < nPalmas; i++) {
    const a = rng() * DOS_PI, r = 70 + rng() * 14
    palma(obj, F, X, hoja, r * Math.cos(a), r * Math.sin(a), 6 + rng() * 3, rng)
  }

  g.add(suelo.construir(false, true), obj.construir(nivel !== 'baja', true))
  g.userData.hoja = hoja
  return g
}
