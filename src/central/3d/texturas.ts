/**
 * texturas.ts — texturas dibujadas en el momento (canvas) para la oficina: cielo, pasto, mármol, asfalto, pantallas, pendones y el
 * cartel de RestaurantOS. El logo oficial se carga desde /brand/logo-oficial.png (recurso propio) y se pega tal cual, sin redibujarlo.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { hayTierraEn } from './tierra.ts'

function lienzo(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  return [c, c.getContext('2d') as CanvasRenderingContext2D]
}
function textura(c: HTMLCanvasElement, repetir = false): CanvasTexture {
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4
  if (repetir) { t.wrapS = RepeatWrapping; t.wrapT = RepeatWrapping }
  return t
}
function ruido(g: CanvasRenderingContext2D, w: number, h: number, cuantos: number, claro: string, oscuro: string, max = 2.2) {
  let s = 12345
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  for (let i = 0; i < cuantos; i++) { g.fillStyle = r() > 0.5 ? claro : oscuro; g.fillRect(r() * w, r() * h, 0.6 + r() * max, 0.6 + r() * max) }
}

// ── Logo oficial ───────────────────────────────────────────────────────────
let promesaLogo: Promise<HTMLImageElement | null> | null = null
export function cargarLogo(): Promise<HTMLImageElement | null> {
  promesaLogo ??= new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = '/brand/logo-oficial.png' })
  return promesaLogo
}

/** Medallón redondo: el logo oficial sobre fondo blanco con aro naranja. Se completa solo cuando llega la imagen. */
export function texLogoDisco(): CanvasTexture {
  const [c, g] = lienzo(512, 512)
  const pintar = (img: HTMLImageElement | null) => {
    g.clearRect(0, 0, 512, 512)
    g.fillStyle = '#FF5A00'; g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(256, 256, 226, 0, Math.PI * 2); g.fill()
    if (img) { g.save(); g.beginPath(); g.arc(256, 256, 222, 0, Math.PI * 2); g.clip(); g.drawImage(img, 40, 36, 432, 432); g.restore() }
  }
  pintar(null)
  const t = textura(c)
  void cargarLogo().then(img => { if (img) { pintar(img); t.needsUpdate = true } })
  return t
}

/** Cartel de la fachada: placa oscura con el logo y "RestaurantOS". */
export function texCartel(): CanvasTexture {
  const [c, g] = lienzo(1024, 256)
  const pintar = (img: HTMLImageElement | null) => {
    const f = g.createLinearGradient(0, 0, 0, 256); f.addColorStop(0, '#222A3A'); f.addColorStop(1, '#10151F')
    g.fillStyle = f; g.fillRect(0, 0, 1024, 256)
    g.fillStyle = '#FF5A00'; g.fillRect(0, 244, 1024, 12)
    if (img) { g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(28, 28, 200, 200, 28); g.fill(); g.drawImage(img, 36, 34, 184, 184) }
    g.font = '700 118px Inter, system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'
    const w1 = g.measureText('Restaurant').width
    g.fillStyle = '#FFFFFF'; g.fillText('Restaurant', 262, 130); g.fillStyle = '#FF7A1A'; g.fillText('OS', 262 + w1, 130)
  }
  pintar(null)
  const t = textura(c)
  void cargarLogo().then(img => { if (img) { pintar(img); t.needsUpdate = true } })
  return t
}

// ── Entorno ────────────────────────────────────────────────────────────────
export function texCielo(noche: boolean): CanvasTexture {
  const [c, g] = lienzo(16, 512)
  const f = g.createLinearGradient(0, 0, 0, 512)
  // Se pinta sobre una cúpula: el horizonte queda en la mitad (0.5) y lo de abajo lo tapa el terreno.
  const paradas: [number, string][] = noche
    ? [[0, '#030610'], [0.25, '#0A1432'], [0.42, '#27306A'], [0.49, '#6A4C6E'], [0.5, '#8A5A62'], [0.52, '#2A2F5C'], [1, '#10142A']]
    : [[0, '#3C7CCE'], [0.25, '#6FA6E3'], [0.42, '#BCD6EE'], [0.49, '#E3ECF3'], [0.5, '#E9EFF3'], [0.52, '#C9D6C2'], [1, '#9DB09A']]
  paradas.forEach(([p, col]) => f.addColorStop(p, col))
  g.fillStyle = f; g.fillRect(0, 0, 16, 512)
  return textura(c)
}

export function texPasto(): CanvasTexture {
  const [c, g] = lienzo(512, 512)
  g.fillStyle = '#4F8A35'; g.fillRect(0, 0, 512, 512)
  ruido(g, 512, 512, 9000, '#659F43', '#3C6E27', 3)
  ruido(g, 512, 512, 900, '#8DBB5C', '#2C5520', 2)
  return textura(c, true)
}

export function texMarmol(): CanvasTexture {
  const [c, g] = lienzo(512, 512)
  g.fillStyle = '#DDD5C4'; g.fillRect(0, 0, 512, 512)
  ruido(g, 512, 512, 2600, '#E9E3D4', '#CBC1AC', 5)
  // vetas suaves
  g.strokeStyle = 'rgba(160,148,125,0.16)'; g.lineWidth = 1.4
  for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(Math.random() * 512, 0); g.bezierCurveTo(Math.random() * 512, 170, Math.random() * 512, 340, Math.random() * 512, 512); g.stroke() }
  // juntas de las losas
  g.strokeStyle = 'rgba(120,108,88,0.5)'; g.lineWidth = 2
  g.strokeRect(1, 1, 510, 510); g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke()
  return textura(c, true)
}

export function texAsfalto(): CanvasTexture {
  const [c, g] = lienzo(256, 256)
  g.fillStyle = '#2C3038'; g.fillRect(0, 0, 256, 256)
  ruido(g, 256, 256, 3500, '#454A55', '#1C1F26', 1.8)
  return textura(c, true)
}

export function texAdoquin(): CanvasTexture {
  const [c, g] = lienzo(256, 256)
  g.fillStyle = '#CFC6B4'; g.fillRect(0, 0, 256, 256)
  ruido(g, 256, 256, 2000, '#DDD5C4', '#B9AF9A', 3)
  g.strokeStyle = 'rgba(110,100,82,0.45)'; g.lineWidth = 2
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke() }
  return textura(c, true)
}

export function texMadera(): CanvasTexture {
  const [c, g] = lienzo(256, 256)
  g.fillStyle = '#A97B50'; g.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 256; y += 32) { g.fillStyle = y % 64 ? '#B58859' : '#9C7048'; g.fillRect(0, y, 256, 30); g.fillStyle = 'rgba(60,36,16,0.5)'; g.fillRect(0, y + 30, 256, 2) }
  ruido(g, 256, 256, 1200, '#C79A6C', '#7E5836', 2.6)
  return textura(c, true)
}

// ── Pantallas y pendones ───────────────────────────────────────────────────
/** Pantalla de un escritorio: un tablero de datos ficticio con el color del departamento (solo decoración). */
export function texPantalla(color: string, semilla: number): CanvasTexture {
  const [c, g] = lienzo(128, 80)
  g.fillStyle = '#0B1424'; g.fillRect(0, 0, 128, 80)
  g.fillStyle = color; g.globalAlpha = 0.9
  let s = semilla * 7919 + 13
  const r = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296 }
  for (let i = 0; i < 9; i++) { const h = 10 + r() * 36; g.fillRect(10 + i * 11, 66 - h, 7, h) }
  g.globalAlpha = 0.8; g.fillRect(8, 8, 46, 4); g.globalAlpha = 0.45; g.fillRect(8, 15, 30, 3)
  g.globalAlpha = 1; g.strokeStyle = '#FFFFFF'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(10, 50); for (let i = 1; i < 9; i++) g.lineTo(10 + i * 11 + 3, 50 - r() * 22); g.stroke()
  return textura(c)
}

/** Planisferio de puntos para la pared de video de supervisión (usa la misma máscara de tierra del globo). */
export function texMapa(): CanvasTexture {
  const [c, g] = lienzo(1024, 256)
  const f = g.createLinearGradient(0, 0, 0, 256); f.addColorStop(0, '#0A1A3A'); f.addColorStop(1, '#06102A')
  g.fillStyle = f; g.fillRect(0, 0, 1024, 256)
  g.fillStyle = '#3EA6FF'
  for (let y = 4; y < 252; y += 4) for (let x = 4; x < 1020; x += 4) {
    const lng = (x / 1024) * 360 - 180, lat = 80 - ((y - 4) / 248) * 140
    if (hayTierraEn(lat, lng)) g.fillRect(x - 1, y - 1, 2.4, 2.4)
  }
  g.strokeStyle = 'rgba(80,170,255,0.4)'; g.lineWidth = 2; g.strokeRect(3, 3, 1018, 250)
  return textura(c)
}

/** Pendón del departamento: degradado de su color con un glifo blanco (varios estilos). */
export function texPendon(color: string, estilo: number): CanvasTexture {
  const [c, g] = lienzo(128, 224)
  const f = g.createLinearGradient(0, 0, 0, 224); f.addColorStop(0, color); f.addColorStop(1, '#101626')
  g.fillStyle = f; g.fillRect(0, 0, 128, 224)
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.strokeRect(6, 6, 116, 212)
  g.fillStyle = '#FFFFFF'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round'
  const cx = 64, cy = 96
  switch (((estilo % 6) + 6) % 6) {
    case 0: for (let i = 0; i < 4; i++) { const h = 20 + i * 15; g.fillRect(24 + i * 22, cy + 34 - h, 14, h) } break                                   // barras
    case 1: { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 16 : 40; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) } g.closePath(); g.fill(); break }   // estrella
    case 2: g.beginPath(); g.arc(cx, cy, 30, Math.PI, 0); g.stroke(); g.fillRect(cx - 42, cy - 2, 14, 28); g.fillRect(cx + 28, cy - 2, 14, 28); break      // auriculares
    case 3: g.beginPath(); g.moveTo(cx - 32, cy - 20); g.lineTo(cx - 52, cy); g.lineTo(cx - 32, cy + 20); g.moveTo(cx + 32, cy - 20); g.lineTo(cx + 52, cy); g.lineTo(cx + 32, cy + 20); g.moveTo(cx + 8, cy - 28); g.lineTo(cx - 8, cy + 28); g.stroke(); break   // </>
    case 4: g.beginPath(); g.moveTo(cx, cy - 40); g.lineTo(cx + 34, cy - 26); g.lineTo(cx + 30, cy + 14); g.quadraticCurveTo(cx, cy + 44, cx, cy + 44); g.quadraticCurveTo(cx, cy + 44, cx - 30, cy + 14); g.lineTo(cx - 34, cy - 26); g.closePath(); g.stroke(); break   // escudo
    default: g.beginPath(); g.moveTo(cx - 40, cy + 6); g.lineTo(cx, cy - 36); g.lineTo(cx + 40, cy + 6); g.stroke(); g.strokeRect(cx - 28, cy + 6, 56, 34); break   // casa
  }
  return textura(c)
}
