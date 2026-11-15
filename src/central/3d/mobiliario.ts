/**
 * mobiliario.ts — muebles de la oficina (escritorios con pantalla y silla, mesas, sofás, plantas, barra de café, billar, pufs…).
 * Todo se agrega a un Lote (kit.ts) para dibujarse en pocas llamadas. Un "puesto" es un punto de la planta con su giro: el eje
 * local +z mira hacia el núcleo, y +x corre a lo largo del arco.
 */
import { Color, MeshStandardMaterial, TorusGeometry } from 'three'
import type { Lote, Formas, Materiales, V3 } from './kit.ts'
import { texPantalla } from './texturas.ts'

export interface Puesto { x: number; z: number; phi: number }
export interface Kit { L: Lote; F: Formas; X: Materiales }

const mezcla = (a: string, b: string, k: number) => '#' + new Color(a).lerp(new Color(b), k).getHexString()

/** Escritorio con pantalla encendida, teclado, y silla detrás (hacia afuera). `pantalla` es el color del departamento. */
export function escritorio({ L, F, X }: Kit, p: Puesto, color: string, indice: number, conSilla = true) {
  const tablero = X.std('mesaBlanca', '#F2F3F5', { roughness: 0.35, metalness: 0.1 })
  const metal = X.std('metalClaro', '#B8BFCB', { roughness: 0.4, metalness: 0.6 })
  const negro = X.std('negroMate', '#1A1D24', { roughness: 0.6 })
  L.addEn(p, F.caja, tablero, [0, 0.74, 0.55], [1.7, 0.07, 0.85])
  L.addEn(p, F.caja, metal, [-0.76, 0.37, 0.55], [0.06, 0.74, 0.7])
  L.addEn(p, F.caja, metal, [0.76, 0.37, 0.55], [0.06, 0.74, 0.7])
  const clave = 'pantalla' + color + (indice % 3)
  let pant = X.luminosos.find(x => x.m.userData.k === clave)?.m
  if (!pant) {
    pant = new MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFFFFF', emissiveMap: texPantalla(color, indice % 3 + 1), map: texPantalla(color, indice % 3 + 1), emissiveIntensity: 0.85, roughness: 0.3 })
    pant.userData.c = true; pant.userData.k = clave
    X.luminosos.push({ m: pant, dia: 0.8, noche: 1.5 })
  }
  L.addEn(p, F.caja, pant, [0, 1.08, 0.75], [0.78, 0.46, 0.035])
  L.addEn(p, F.caja, negro, [0, 0.9, 0.74], [0.08, 0.2, 0.05])
  L.addEn(p, F.caja, negro, [0, 0.79, 0.35], [0.5, 0.025, 0.17])
  if (conSilla) silla({ L, F, X }, p, color)
}

export function silla({ L, F, X }: Kit, p: Puesto, color: string) {
  const asiento = X.std('sillaNegra', '#23262E', { roughness: 0.7 })
  const metal = X.std('metalClaro', '#B8BFCB', { roughness: 0.4, metalness: 0.6 })
  const tela = X.std('tela' + color, mezcla(color, '#20242C', 0.55), { roughness: 0.85 })
  L.addEn(p, F.cil, asiento, [0, 0.5, -0.1], [0.3, 0.1, 0.3])
  L.addEn(p, F.caja, tela, [0, 0.88, -0.42], [0.5, 0.55, 0.08])
  L.addEn(p, F.cil, metal, [0, 0.25, -0.1], [0.04, 0.5, 0.04])
  L.addEn(p, F.cil, metal, [0, 0.04, -0.1], [0.3, 0.05, 0.3])
}

export function planta({ L, F, X }: Kit, x: number, z: number, h = 1, rngTono = 0) {
  const maceta = X.std('maceta', '#E9E3D6', { roughness: 0.6 })
  const verde = X.std('hojaPlanta' + (rngTono % 2), rngTono % 2 ? '#3E9B4F' : '#2C8745', { roughness: 0.85 })
  L.add(F.cil, maceta, [x, 0.28 * h, z], [0.34 * h, 0.56 * h, 0.34 * h])
  L.add(F.esf, verde, [x, 0.95 * h, z], [0.46 * h, 0.52 * h, 0.46 * h])
  L.add(F.esf, verde, [x + 0.18 * h, 1.3 * h, z - 0.1 * h], [0.3 * h, 0.34 * h, 0.3 * h])
}

export function mesaRedonda({ L, F, X }: Kit, x: number, z: number, radio: number, sillas: number, color: string) {
  const tapa = X.std('mesaRedonda', '#EFEAE0', { roughness: 0.4 })
  const pata = X.std('metalClaro', '#B8BFCB', { roughness: 0.4, metalness: 0.6 })
  const cojin = X.std('tela' + color, mezcla(color, '#20242C', 0.55), { roughness: 0.85 })
  L.add(F.cil, tapa, [x, 0.78, z], [radio, 0.07, radio])
  L.add(F.cil, pata, [x, 0.39, z], [0.07, 0.78, 0.07])
  for (let i = 0; i < sillas; i++) {
    const a = (i / sillas) * Math.PI * 2
    const sx = x + Math.cos(a) * (radio + 0.45), sz = z + Math.sin(a) * (radio + 0.45)
    L.add(F.cil, cojin, [sx, 0.46, sz], [0.26, 0.08, 0.26])
    L.add(F.caja, cojin, [sx + Math.cos(a) * 0.22, 0.72, sz + Math.sin(a) * 0.22], [0.08, 0.5, 0.42], [0, -a, 0])
    L.add(F.cil, pata, [sx, 0.23, sz], [0.04, 0.46, 0.04])
  }
}

export function sofa({ L, F, X }: Kit, p: Puesto, largo: number, color: string) {
  const tela = X.std('sofa' + color, color, { roughness: 0.9 })
  const oscuro = X.std('sofaO' + color, mezcla(color, '#000000', 0.3), { roughness: 0.9 })
  L.addEn(p, F.caja, tela, [0, 0.3, 0], [largo, 0.42, 0.95])
  L.addEn(p, F.caja, oscuro, [0, 0.72, -0.4], [largo, 0.55, 0.2])
  L.addEn(p, F.caja, oscuro, [-largo / 2 + 0.1, 0.5, 0], [0.2, 0.55, 0.95])
  L.addEn(p, F.caja, oscuro, [largo / 2 - 0.1, 0.5, 0], [0.2, 0.55, 0.95])
}

export function puf({ L, F, X }: Kit, x: number, z: number, color: string) {
  L.add(F.esf, X.std('puf' + color, color, { roughness: 0.95 }), [x, 0.4, z], [0.62, 0.45, 0.62])
}

export function alfombra({ L, F, X }: Kit, p: Puesto, ancho: number, largo: number, color: string, redonda = false) {
  const m = X.std('alfombra' + color + (redonda ? 'r' : ''), color, { roughness: 1 })
  if (redonda) L.addEn(p, F.cil, m, [0, 0.035, 0], [ancho / 2, 0.03, ancho / 2])
  else L.addEn(p, F.caja, m, [0, 0.035, 0], [ancho, 0.03, largo])
}

/** Barra de cafetería con banquetas y lámparas colgantes. */
export function barra({ L, F, X }: Kit, p: Puesto, largo: number) {
  const madera = X.std('barraMadera', '#9A6B43', { roughness: 0.55 })
  const tapa = X.std('barraTapa', '#F1EEE7', { roughness: 0.25 })
  const luz = X.luz('lamparaCalida', '#FFC66E', 0.5, 3)
  L.addEn(p, F.caja, madera, [0, 0.55, 0], [largo, 1.1, 0.7])
  L.addEn(p, F.caja, tapa, [0, 1.12, 0], [largo + 0.12, 0.06, 0.85])
  L.addEn(p, F.caja, X.std('estante', '#6E4C30', { roughness: 0.6 }), [0, 1.9, -1.05], [largo, 0.05, 0.3])
  L.addEn(p, F.caja, X.std('estante', '#6E4C30', { roughness: 0.6 }), [0, 2.5, -1.05], [largo, 0.05, 0.3])
  for (let i = 0; i < Math.floor(largo / 1.3); i++) {
    const lx = -largo / 2 + 0.7 + i * 1.3
    L.addEn(p, F.cil, X.std('hilo', '#2B2F38'), [lx, 2.8, 0.1], [0.012, 1.4, 0.012])
    L.addEn(p, F.esf, luz, [lx, 2.0, 0.1], 0.22)
    L.addEn(p, F.cil, madera, [lx, 0.42, 1.0], [0.2, 0.06, 0.2])
    L.addEn(p, F.cil, X.std('metalClaro', '#B8BFCB', { roughness: 0.4, metalness: 0.6 }), [lx, 0.2, 1.0], [0.03, 0.4, 0.03])
  }
}

export function billar({ L, F, X }: Kit, p: Puesto) {
  const fieltro = X.std('fieltroAzul', '#1B7CC2', { roughness: 0.95 })
  const madera = X.std('billarMadera', '#4A2F1C', { roughness: 0.5 })
  L.addEn(p, F.caja, madera, [0, 0.62, 0], [3.0, 0.3, 1.7])
  L.addEn(p, F.caja, fieltro, [0, 0.8, 0], [2.6, 0.06, 1.3])
  for (const [lx, lz] of [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]]) L.addEn(p, F.caja, madera, [lx, 0.25, lz], [0.2, 0.5, 0.2])
  const bola = [X.std('bola1', '#FFD84A'), X.std('bola2', '#E5493A'), X.std('bola3', '#F5F5F5')]
  for (let i = 0; i < 6; i++) L.addEn(p, F.esf, bola[i % 3], [-0.5 + (i % 3) * 0.28, 0.9, -0.15 + Math.floor(i / 3) * 0.3], 0.07)
  L.addEn(p, F.cil, X.std('lamparaCuerda', '#2B2F38'), [0, 3, 0], [0.01, 2.4, 0.01])
  L.addEn(p, F.caja, X.luz('lamparaBillar', '#FFF3D0', 0.6, 3.2), [0, 1.85, 0], [2.2, 0.08, 0.45])
}

/** Mesa de juntas ovalada con sillas alrededor (reuniones y dirección). */
export function mesaJuntas({ L, F, X }: Kit, p: Puesto, largo: number, ancho: number, color: string) {
  const tapa = X.std('juntasTapa', '#F6F3EC', { roughness: 0.25 })
  const borde = X.luz('juntasBorde', color, 0.55, 1.8)
  const sillaM = X.std('sillaNegra', '#23262E', { roughness: 0.7 })
  L.addEn(p, F.cil, tapa, [0, 0.76, 0], [largo / 2, 0.08, ancho / 2])
  L.addEn(p, F.cil, borde, [0, 0.7, 0], [largo / 2 + 0.05, 0.03, ancho / 2 + 0.05])
  L.addEn(p, F.cil, X.std('metalClaro', '#B8BFCB', { roughness: 0.4, metalness: 0.6 }), [0, 0.38, 0], [0.5, 0.76, 0.5])
  const n = 12
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const lx = Math.cos(a) * (largo / 2 + 0.55), lz = Math.sin(a) * (ancho / 2 + 0.55)
    L.addEn(p, F.cil, sillaM, [lx, 0.5, lz], [0.27, 0.1, 0.27])
    L.addEn(p, F.caja, sillaM, [lx * 1.06, 0.86, lz * 1.06], [0.45, 0.5, 0.08], -a - Math.PI / 2)
  }
}

/** Pista de caminar/trotar (bienestar): un aro luminoso en el suelo. */
export function pista({ L, X }: Kit, x: number, z: number, radio: number, color: string) {
  const m = X.luz('pistaBienestar' + color, color, 0.5, 1.8)
  L.add(new TorusGeometry(radio, 0.12, 8, 40), m, [x, 0.12, z], 1, [Math.PI / 2, 0, 0])
}

export function esterilla({ L, F, X }: Kit, p: Puesto, color: string) {
  L.addEn(p, F.caja, X.std('esterilla' + color, color, { roughness: 0.95 }), [0, 0.04, 0], [0.7, 0.04, 1.8])
}

export function bicicleta({ L, F, X }: Kit, p: Puesto) {
  const negro = X.std('negroMate', '#1A1D24', { roughness: 0.6 })
  const acento = X.std('bici', '#FF5A00', { roughness: 0.5 })
  L.addEn(p, F.caja, negro, [0, 0.05, 0], [0.5, 0.1, 1.2])
  L.addEn(p, F.cil, acento, [0, 0.5, 0.1], [0.28, 0.12, 0.28], [0, 0, Math.PI / 2])
  L.addEn(p, F.caja, acento, [0, 0.55, 0.3], [0.08, 0.9, 0.08])
  L.addEn(p, F.caja, negro, [0, 1.0, 0.4], [0.5, 0.06, 0.08])
  L.addEn(p, F.caja, negro, [0, 0.9, -0.3], [0.3, 0.06, 0.22])
}

export type { V3 }
