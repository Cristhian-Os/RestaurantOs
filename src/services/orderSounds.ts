/**
 * orderSounds.ts — tonos de aviso por tipo de pedido, generados con Web Audio
 * (sin archivos de sonido). Cada tipo tiene un patrón distinto para
 * reconocerlo de oído:
 *   Mesa        ding-dong x2
 *   Para llevar bip-bip-bip-biiip
 *   Domicilio   escala que baja
 *   Rappi       trino rápido
 *
 * Los navegadores (sobre todo iPhone/Android) no dejan sonar audio hasta que
 * la persona toca la pantalla: el contexto se crea/reanuda en el primer
 * toque y queda listo. Mientras siga bloqueado, isAudioLocked() es true y la
 * UI muestra un aviso para activarlo (ver SoundControls en OrderSoundAlerts).
 */
type Note = [freq: number, start: number, dur: number]

const PATTERNS: Record<string, { wave: OscillatorType; gain: number; notes: Note[] }> = {
  LOCAL:     { wave: 'triangle', gain: 0.9,  notes: [[659, 0, 0.28], [523, 0.3, 0.4], [659, 0.8, 0.28], [523, 1.1, 0.45]] },
  LLEVAR:    { wave: 'square',   gain: 0.35, notes: [[1047, 0, 0.12], [1047, 0.2, 0.12], [1047, 0.4, 0.12], [1397, 0.6, 0.4]] },
  DOMICILIO: { wave: 'sawtooth', gain: 0.3,  notes: [[1175, 0, 0.16], [988, 0.18, 0.16], [784, 0.36, 0.16], [659, 0.54, 0.16], [523, 0.72, 0.35]] },
  RAPPI:     { wave: 'square',   gain: 0.3,  notes: [[1568, 0, 0.07], [1245, 0.09, 0.07], [1568, 0.18, 0.07], [1245, 0.27, 0.07], [1568, 0.36, 0.07], [1245, 0.45, 0.07], [1568, 0.54, 0.25]] },
}

export const TIPO_LABEL: Record<string, string> = {
  LOCAL: 'Mesa', LLEVAR: 'Para llevar', DOMICILIO: 'Domicilio', RAPPI: 'Rappi',
}

let ctx: AudioContext | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(fn => fn())

function getCtx(): AudioContext | null {
  if (ctx) return ctx
  const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!C) return null
  ctx = new C()
  ctx.onstatechange = notify
  return ctx
}

// Llamar SIEMPRE dentro de un toque/clic del usuario.
export function unlockAudio() {
  const c = getCtx()
  if (!c) return
  if (c.state !== 'running') c.resume().then(notify).catch(() => {})
  // iOS: un buffer mudo dentro del gesto termina de "despertar" la salida de audio
  const b = c.createBufferSource()
  b.buffer = c.createBuffer(1, 1, 22050)
  b.connect(c.destination)
  b.start(0)
  notify()
}

export const isAudioLocked = () => !ctx || ctx.state !== 'running'

export function onAudioStateChange(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) {
    window.addEventListener(ev, unlockAudio, { passive: true })
  }
}

// Suena el patrón del tipo de pedido dos veces seguidas (para que se oiga en
// una cocina con ruido) y vibra. Si el audio sigue bloqueado, solo vibra.
export function playOrderSound(tipo?: string | null) {
  if ('vibrate' in navigator) navigator.vibrate([250, 100, 250])
  const c = ctx
  if (!c || c.state !== 'running') return
  const p = PATTERNS[tipo ?? ''] ?? PATTERNS.LOCAL
  const out = c.createDynamicsCompressor()
  out.connect(c.destination)
  const t0 = c.currentTime + 0.05
  const total = Math.max(...p.notes.map(([, s, d]) => s + d)) + 0.35
  for (const rep of [0, total]) {
    for (const [freq, start, dur] of p.notes) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = p.wave
      o.frequency.value = freq
      const at = t0 + rep + start
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(p.gain, at + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      o.connect(g)
      g.connect(out)
      o.start(at)
      o.stop(at + dur + 0.02)
    }
  }
}
