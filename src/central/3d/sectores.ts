/**
 * sectores.ts — cómo se amuebla cada espacio de la oficina según su tipo (dirección, supervisión con pared de video,
 * reuniones, planificación, departamentos con filas de escritorios, cafetería, descanso, recreación, bienestar y jardines).
 * Solo decora: los agentes y sus escritorios los pone OficinaEscena con las posiciones de geometria.ts.
 */
import { ConeGeometry, CylinderGeometry, BackSide, RepeatWrapping } from 'three'
import { aPunto, type Sector } from './geometria.ts'
import { arbol, palma } from './entorno.ts'
import type { Kit } from './mobiliario.ts'
import { alfombra, barra, bicicleta, billar, escritorio, esterilla, mesaJuntas, mesaRedonda, pista, planta, puf, silla, sofa } from './mobiliario.ts'
import { texMapa } from './texturas.ts'

export interface InfoSector { id: string; anillo: 2 | 3 | 4; color: string }
const HEX = new CylinderGeometry(1, 1, 1, 6)

/** Punto del sector a una fracción de su profundidad (0 = pasillo interior, 1 = pared exterior) y un ángulo. */
const en = (s: Sector, fr: number, ang: number) => ({ ...aPunto(s.r0 + (s.r1 - s.r0) * fr, ang), ang })
/** Un puesto que mira al núcleo (o hacia afuera si `afuera`). */
const puesto = (x: number, z: number, ang: number, afuera = false) => ({ x, z, phi: -ang - Math.PI / 2 + (afuera ? Math.PI : 0) })

export function amueblar(k: Kit, s: Sector, d: InfoSector, hoja: ConeGeometry, rng: () => number, completo: boolean) {
  const { L, F, X } = k
  const span = s.a1 - s.a0
  const angs = (n: number, margen = 0.12) => Array.from({ length: n }, (_, i) => n === 1 ? s.centro : s.a0 + span * margen + (span * (1 - 2 * margen) * i) / (n - 1))

  // Plantas en las esquinas de todos los espacios
  for (const a of [s.a0 + span * 0.06, s.a1 - span * 0.06]) { const p = en(s, 0.07, a); planta(k, p.x, p.z, 1.05, Math.floor(rng() * 2)) }

  switch (d.id) {
    case 'direccion': {
      // El escritorio del director lo pone la escena (donde está el agente); aquí: alfombra, sofás y librero.
      const c = en(s, 0.55, s.centro)
      alfombra(k, puesto(c.x, c.z, s.centro), 7.5, 5.5, '#2B4A7A')
      for (const lado of [-1, 1]) { const sf = en(s, 0.2, s.centro + lado * span * 0.3); sofa(k, puesto(sf.x, sf.z, s.centro + lado * span * 0.3), 2.6, '#3D6FB6') }
      const lb = en(s, 0.94, s.centro), pb = puesto(lb.x, lb.z, s.centro)
      L.addEn(pb, F.caja, X.std('libreroMadera', '#6E4C30', { roughness: 0.6 }), [0, 1.2, 0], [5.6, 2.4, 0.35])
      for (let i = 0; i < 14; i++) L.addEn(pb, F.caja, X.std('libro' + (i % 4), ['#E5493A', '#3D8BFF', '#FFD84A', '#F5F5F5'][i % 4]), [-2.5 + i * 0.38, 1.0 + (i % 3) * 0.5, 0.2], [0.22, 0.34, 0.05])
      break
    }
    case 'supervision': {
      // Pared de video curva con el mapa del mundo y escritorios mirando a ella
      const r = s.r1 - 0.9
      const video = X.luz('videoMundo', '#FFFFFF', 0.75, 1.5, { side: BackSide, roughness: 0.3 })
      if (!video.map) { const tex = texMapa(); tex.wrapS = RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; video.map = tex; video.emissiveMap = tex; video.needsUpdate = true }
      L.add(new CylinderGeometry(r, r, 2.5, 48, 1, true, Math.PI / 2 - (s.a1 - span * 0.04), span * 0.92), video, [0, 1.9, 0])
      L.add(new CylinderGeometry(r + 0.05, r + 0.05, 0.12, 48, 1, true, Math.PI / 2 - (s.a1 - span * 0.04), span * 0.92), X.std('marcoVideo', '#10151F', { side: BackSide }), [0, 0.6, 0])
      for (const a of angs(4, 0.18)) { const p = en(s, 0.45, a); escritorio(k, puesto(p.x, p.z, a, true), d.color, 1, true) }
      const cur = en(s, 0.42, s.centro)
      L.addEn(puesto(cur.x, cur.z, s.centro), F.caja, X.std('mesaBlanca', '#F2F3F5', { roughness: 0.35, metalness: 0.1 }), [0, 0.55, 1.2], [Math.min(7, span * (s.r0 + (s.r1 - s.r0) * 0.45) * 0.8), 0.06, 0.6])
      break
    }
    case 'reuniones': {
      const c = en(s, 0.5, s.centro)
      mesaJuntas(k, puesto(c.x, c.z, s.centro), 5.4, 2.6, d.color)
      const p = en(s, 0.93, s.centro)
      L.addEn(puesto(p.x, p.z, s.centro), F.caja, X.luz('pantallaJuntas' + d.color, d.color, 0.6, 1.8), [0, 1.9, 0], [4.2, 1.9, 0.08])
      break
    }
    case 'planificacion': {
      const c = en(s, 0.5, s.centro)
      L.add(HEX, X.std('hexMesa', '#F2F3F5', { roughness: 0.3 }), [c.x, 0.78, c.z], [2.3, 0.1, 2.3])
      L.add(HEX, X.luz('hexBorde' + d.color, d.color, 0.55, 1.8), [c.x, 0.7, c.z], [2.36, 0.03, 2.36])
      L.add(F.cil, X.std('metalClaro', '#B8BFCB', { roughness: 0.4, metalness: 0.6 }), [c.x, 0.38, c.z], [0.12, 0.76, 0.12])
      const p = en(s, 0.93, s.centro), pp = puesto(p.x, p.z, s.centro)
      L.addEn(pp, F.caja, X.std('pizarra', '#F7F8FA', { roughness: 0.4 }), [0, 1.7, 0], [5.4, 2.2, 0.08])
      const notas = ['#FFD84A', '#FF7AA8', '#6CC4FF', '#9BE070'].map((c, i) => X.std('nota' + i, c, { roughness: 0.7 }))
      for (let i = 0; i < 12; i++) L.addEn(pp, F.caja, notas[i % 4], [-2.2 + (i % 6) * 0.88, 1.3 + Math.floor(i / 6) * 0.9, 0.06], [0.5, 0.5, 0.02])
      for (const a of angs(5, 0.16)) { const q = en(s, 0.5 + 0.2 * Math.cos((a - s.centro) * 6), a); if (Math.abs(a - s.centro) > span * 0.14) silla(k, puesto(q.x, q.z, a, true), d.color) }
      break
    }
    case 'cafeteria': {
      const b = en(s, 0.9, s.centro); barra(k, puesto(b.x, b.z, s.centro), Math.min(8, span * (s.r0 + (s.r1 - s.r0) * 0.9) * 0.7))
      angs(3, 0.2).forEach((a, i) => { const m = en(s, 0.38 + (i % 2) * 0.1, a); mesaRedonda(k, m.x, m.z, 0.8, 4, '#FF7A1A') })
      break
    }
    case 'descanso': {
      angs(3, 0.2).forEach(a => { const q = en(s, 0.5, a); sofa(k, puesto(q.x, q.z, a), 2.3, '#4E9F8B') })
      const c = en(s, 0.28, s.centro); alfombra(k, puesto(c.x, c.z, s.centro), 5, 5, '#E9D8B8', true)
      const l = en(s, 0.88, s.centro - span * 0.2); planta(k, l.x, l.z, 1.4, 1)
      const l2 = en(s, 0.88, s.centro + span * 0.2); planta(k, l2.x, l2.z, 1.4, 0)
      break
    }
    case 'recreacion': {
      const b = en(s, 0.5, s.centro); billar(k, puesto(b.x, b.z, s.centro))
      angs(3, 0.15).forEach((a, i) => { const q = en(s, 0.82, a); puf(k, q.x, q.z, ['#FF7A1A', '#3FA9F5', '#FFC400'][i]) })
      const m = en(s, 0.2, s.centro); mesaRedonda(k, m.x, m.z, 0.7, 3, '#3FA9F5')
      break
    }
    case 'bienestar': {
      const c = en(s, 0.5, s.centro); pista(k, c.x, c.z, Math.min(3.2, (s.r1 - s.r0) * 0.3), d.color)
      angs(3, 0.2).forEach((a, i) => { const q = en(s, 0.5 + (i - 1) * 0.0, a); if (i !== 1) bicicleta(k, puesto(q.x, q.z, a)); else esterilla(k, puesto(q.x, q.z, a), '#9B6CFF') })
      break
    }
    case 'jardines': {
      const lago = X.luz('lago', '#5FC4FF', 0.2, 1, { transparent: true, opacity: 0.85, roughness: 0.1 })
      const c = en(s, 0.5, s.centro); L.add(F.cil, lago, [c.x, 0.06, c.z], [2.6, 0.06, 2.6])
      L.add(F.cil, X.std('piedra', '#D9D2C2', { roughness: 0.6 }), [c.x, 0.04, c.z], [2.85, 0.05, 2.85])
      for (let i = 0; i < 7; i++) { const a = s.a0 + span * (0.1 + 0.8 * rng()), fr = 0.12 + 0.8 * rng(), q = en(s, fr, a); if (Math.hypot(q.x - c.x, q.z - c.z) < 3.6) continue; if (rng() > 0.5) palma(L, F, X, hoja, q.x, q.z, 5 + rng() * 2, rng); else arbol(L, F, X, q.x, q.z, 0.7 + rng() * 0.4, Math.floor(rng() * 3)) }
      const flores = ['#F4A6C0', '#FFD25A', '#FF7A1A', '#FFFFFF', '#B58CFF'].map((c, i) => X.std('flor' + i, c, { roughness: 0.7 }))
      for (let i = 0; i < 26; i++) { const q = en(s, 0.1 + rng() * 0.8, s.a0 + span * (0.06 + 0.88 * rng())); if (Math.hypot(q.x - c.x, q.z - c.z) < 3.3) continue; L.add(F.esf, flores[i % flores.length], [q.x, 0.18, q.z], 0.2) }
      break
    }
    default: {
      if (d.anillo === 3) {
        // Departamento: dos filas de escritorios con pendón al frente. Los agentes ocupan la fila del medio.
        const filas: number[] = completo ? [0.2, 0.9] : [0.2]
        filas.forEach((fr, f) => {
          const r = s.r0 + (s.r1 - s.r0) * fr, largo = r * span * 0.84, n = Math.max(2, Math.floor(largo / 2.5))
          for (let i = 0; i < n; i++) {
            const a = s.a0 + span * 0.08 + (span * 0.84 * i) / Math.max(1, n - 1), p = aPunto(r, a)
            escritorio(k, puesto(p.x, p.z, a), d.color, i + f * 2 + Math.floor(s.centro * 10), true)
          }
        })
        const pl = en(s, 0.55, s.centro - span * 0.38); planta(k, pl.x, pl.z, 1.3, 1)
        const pr = en(s, 0.55, s.centro + span * 0.38); planta(k, pr.x, pr.z, 1.3, 0)
      } else if (d.anillo === 4) {
        const m = en(s, 0.5, s.centro); mesaRedonda(k, m.x, m.z, 0.9, 5, d.color)
      } else {
        const m = en(s, 0.5, s.centro); mesaJuntas(k, puesto(m.x, m.z, s.centro), 4, 2.2, d.color)
      }
    }
  }
}
