/**
 * Resti — asistente del panel del administrador (chef sin rostro, 3D con respaldo de imágenes del mismo modelo).
 * Conversa por voz (escuchar → pensar → hablar, con interrupción) o por texto, y NAVEGA: camina hasta un elemento de la lista blanca
 * (RESTI_TARGETS) y lo pulsa si es de navegación. Los cambios de datos pasan siempre por el modal de comandos (antes → después + aprobación):
 * Resti le pasa lo que dijiste y el modal lo interpreta, pero nada se aplica sin que lo apruebes.
 * Nada corre en reposo: sin intervalos, sin listeners de scroll y sin micrófono mientras está guardado o con la conversación apagada.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { useRestiConversacion } from '../../hooks/useRestiConversacion'
import { RestiSprite, RestiHat } from './RestiSprite'
import { isRestiTarget, type RestiBrainResponse } from '../../lib/resti/targets'
import { parseBrainResponse } from '../../lib/resti/brain'
import { intencionLocal } from '../../lib/resti/intents'
import { EVENTO_ABRIR_OPINION, EVENTO_OPINION_GUARDADA, type AtajoOpinion } from '../feedback/OpinionSection'
import type { RestiEstado3D } from './rig/restiAnim.ts'

// El personaje 3D (three.js) se descarga solo cuando se invoca a Resti; si el equipo no puede, se usan los sprites (capturas del mismo modelo).
const cargar3D = () => import('./RestiCharacter3D')
const Resti3D = lazy(cargar3D)

type Estado = 'HAT' | 'SUMMONING' | 'IDLE' | 'LISTENING' | 'THINKING' | 'WALKING' | 'POINTING' | 'SPEAKING'
interface Turno { rol: 'user' | 'assistant'; texto: string }

const W = 84   // caja del personaje (compacta: no tapa el panel); el 3D y los sprites comparten la misma proporción
const H = 132
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const NO_ENTENDI: RestiBrainResponse = { speech: 'No te entendí bien. ¿Me lo dices de otra forma?', action: 'NONE' }

/** Luz del collar: verde disponible, azul trabajando. Atención/urgente quedan para las alertas proactivas (aún no existen). */
const luzDe = (e: Estado) => (e === 'THINKING' || e === 'WALKING' || e === 'POINTING' ? 'procesando' : 'disponible') as 'procesando' | 'disponible'
/** Estado visual → postura. El saludo solo ocurre al invocarlo. */
const estado3D = (e: Estado, saludando: boolean): RestiEstado3D => {
  if (e === 'SPEAKING' && saludando) return 'saludo'
  return ({ HAT: 'reposo', SUMMONING: 'saludo', IDLE: 'reposo', LISTENING: 'escuchar', THINKING: 'pensar', WALKING: 'caminar', POINTING: 'senalar', SPEAKING: 'explicar' } as const)[e]
}

const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const sinMovimiento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const movil = () => window.innerWidth < 768
/** Distancia del borde de abajo: en el celular hay una barra de pestañas fija (Nueva orden, Mesas…) que Resti no debe tapar. */
const abajo = () => (movil() ? 76 : 16)
const casa = () => ({ x: window.innerWidth - W - 12, y: window.innerHeight - H - abajo() - 66 })
const buscar = (id: string) => document.querySelector<HTMLElement>(`[data-resti-target="${id}"]`)

const CSS = `
@keyframes resti-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes resti-surge{0%{opacity:0;transform:translateY(22px) scale(.55)}55%{opacity:1;transform:translateY(-5px) scale(1.04)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes resti-guarda{from{opacity:1;transform:translate(0,0) scale(1)}to{opacity:0;transform:translate(26px,30px) scale(.4)}}
@keyframes resti-hat-pop{0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.1)}100%{opacity:1;transform:scale(1)}}
@keyframes resti-globo{from{opacity:0;transform:translateY(6px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes resti-pulso{0%,100%{box-shadow:0 0 0 0 rgba(242,106,27,.45)}50%{box-shadow:0 0 0 8px rgba(242,106,27,0)}}
@media (prefers-reduced-motion: reduce){.resti-anim{animation:none!important}.resti-move{transition:none!important}}
`

async function preguntarIA(text: string, historial: Turno[]): Promise<RestiBrainResponse> {
  const timeout = new Promise<null>(r => setTimeout(() => r(null), 10_000))
  try {
    const res = await Promise.race([supabase.functions.invoke('resti-brain', { body: { text, historial } }), timeout])
    if (!res) return { speech: 'Me estoy tardando demasiado. Intenta otra vez en un momento.', action: 'NONE' }
    if (res.error) return { speech: 'Ahora mismo no puedo ayudarte. Intenta en un momento.', action: 'NONE' }
    return parseBrainResponse(res.data) ?? NO_ENTENDI
  } catch {
    return { speech: 'Ahora mismo no puedo ayudarte. Intenta en un momento.', action: 'NONE' }
  }
}

interface MsgOpinion { role: 'user' | 'assistant'; text: string }
const SEMILLAS: Record<AtajoOpinion, string> = { fallo: 'Quiero reportar un fallo.', mejora: 'Quiero sugerir una mejora.', personalizacion: 'Quiero personalizar mi restaurante.' }
const CANCELA = /^\s*(cancel\w*|ya no|d[eé]jalo|olv[ií]dalo|salir|no gracias|nada)\b/i
const dispositivo = () => `${/Mobi|Android/i.test(navigator.userAgent) ? 'móvil' : 'computador'} ${window.innerWidth}px`

/** Opinión/fallo/personalización: la entrevista y el guardado los hace chat-support (mismas reglas, topes y tabla que el chat de opinión). */
async function conversarOpinion(mensajes: MsgOpinion[]): Promise<{ reply: string; saved: boolean }> {
  const timeout = new Promise<null>(r => setTimeout(() => r(null), 25_000))
  try {
    const res = await Promise.race([supabase.functions.invoke('chat-support', { body: { mode: 'opinion', pantalla: 'resti', dispositivo: dispositivo(), messages: mensajes } }), timeout])
    if (!res || res.error) return { reply: 'No pude conectar ahora. Intenta de nuevo en un momento.', saved: false }
    return { reply: String((res.data as { reply?: string })?.reply ?? 'No pude responder ahora.'), saved: !!(res.data as { saved?: unknown })?.saved }
  } catch { return { reply: 'No pude conectar ahora. Intenta de nuevo en un momento.', saved: false } }
}

interface Props { onOpenVoiceCommands: (textoDicho?: string) => void; onGoHome: () => void }

export default function Resti({ onOpenVoiceCommands, onGoHome }: Props) {
  const [estado, setEstado] = useState<Estado>('HAT')
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [habla, setHabla] = useState('')
  const [dir, setDir] = useState(0)                      // -1 izquierda, 1 derecha: hacia dónde gira y señala
  const [desplazando, setDesplazando] = useState(false)
  const [saludando, setSaludando] = useState(false)
  const [saliendo, setSaliendo] = useState(false)         // animación de vuelta al gorro (no desaparece de golpe)
  const [listo3D, setListo3D] = useState(false)          // el 3D ya dibujó su primer cuadro (hasta entonces se ve la captura del mismo modelo)
  const [sin3D, setSin3D] = useState(false)               // el equipo no puede con el 3D: se usan los sprites
  const [texto, setTexto] = useState('')
  const ocupado = useRef(false)
  const moviendose = useRef(false)                        // caminando o señalando: ahí el estado visual lo manda el movimiento
  const timerHabla = useRef<ReturnType<typeof setTimeout>>()
  const timerLimpiar = useRef<ReturnType<typeof setTimeout>>()
  const opinion = useRef<MsgOpinion[] | null>(null)       // hilo de opinión/fallo en curso (null = conversación normal)
  const historial = useRef<Turno[]>([])                   // memoria de la conversación (últimos turnos; el servidor la valida y la recorta)
  const posRef = useRef<{ x: number; y: number } | null>(null); posRef.current = pos
  const reducido = sinMovimiento()

  const ir = (e: Estado) => setEstado(e)
  const recordar = (rol: Turno['rol'], t: string) => { historial.current = [...historial.current, { rol, texto: t }].slice(-6) }

  // Se declara antes para que `decir` y el estado visual sepan si hay conversación; se completa más abajo con `responder`.
  const responderRef = useRef<(t: string) => Promise<string>>(async () => '')
  const conv = useRestiConversacion({
    responder: t => responderRef.current(t),
    alTexto: (rol, t) => { if (rol === 'user') { clearTimeout(timerHabla.current); setHabla(`«${t}»`) } },
  })
  const convRef = useRef(conv); convRef.current = conv

  /** En conversación el estado visual lo gobierna la conversación; si no, el temporizador de siempre. */
  const decir = useCallback((t: string) => {
    clearTimeout(timerHabla.current); clearTimeout(timerLimpiar.current)
    setHabla(t)
    if (convRef.current.activa) return
    setEstado('SPEAKING')
    timerHabla.current = setTimeout(() => { setHabla(''); setEstado('IDLE'); setSaludando(false) }, Math.min(7000, 2000 + t.length * 45))
  }, [])

  const aplicarEstadoConv = useCallback(() => {
    const c = convRef.current
    if (!c.activa || moviendose.current) return
    if (c.estado === 'transcribiendo' || c.estado === 'pensando') setEstado('THINKING')
    else if (c.estado === 'hablando') setEstado('SPEAKING')
    else if (c.estado === 'escuchando') {
      setEstado(c.usuarioHablando ? 'LISTENING' : 'IDLE'); setSaludando(false)
      if (!c.usuarioHablando) { clearTimeout(timerLimpiar.current); timerLimpiar.current = setTimeout(() => setHabla(''), 3500) }
    }
  }, [])
  useEffect(() => { aplicarEstadoConv() }, [conv.estado, conv.usuarioHablando, aplicarEstadoConv])
  useEffect(() => { if (conv.error) { decir(conv.error); conv.limpiarError() } }, [conv.error]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = useCallback(() => {
    clearTimeout(timerHabla.current); clearTimeout(timerLimpiar.current)
    convRef.current.detener(); convRef.current.callar(); historial.current = []; moviendose.current = false
    const volver = () => { setHabla(''); setPos(null); setEstado('HAT'); setDir(0); setDesplazando(false); setSaludando(false); setListo3D(false); setSaliendo(false) }
    if (sinMovimiento()) { volver(); return }
    setSaliendo(true); setHabla('')
    timerLimpiar.current = setTimeout(volver, 300)   // lo que dura la animación de vuelta al gorro
  }, [])

  const invocar = async () => {
    setPos(casa()); setEstado('SUMMONING'); setSaludando(true)
    void convRef.current.hablarSuelto('Dime qué necesitas.')   // dentro del clic: los navegadores solo dejan sonar tras un gesto
    await esperar(reducido ? 0 : 380)
    decir('Dime qué necesitas.')
  }

  /** Camina hasta el elemento de la lista blanca, lo resalta y, si es de navegación, lo pulsa. */
  const walkToAndClick = useCallback(async (targetId: string, speechText?: string, shouldClick = true) => {
    if (!isRestiTarget(targetId)) return false
    let el = buscar(targetId)
    if (!el) {
      onGoHome()
      for (let i = 0; i < 10 && !el; i++) { await esperar(100); el = buscar(targetId) }
    }
    if (!el) { decir('No veo eso en esta pantalla.'); return false }
    moviendose.current = true
    const r0 = el.getBoundingClientRect()
    if (r0.top < 0 || r0.bottom > window.innerHeight || r0.left < 0 || r0.right > window.innerWidth) {
      el.scrollIntoView({ block: 'center', behavior: reducido ? 'auto' : 'smooth' })
      await esperar(reducido ? 0 : 450)
    }
    const r = el.getBoundingClientRect()
    const izq = r.left - W - 8
    const x = clamp(izq >= 8 ? izq : r.right + 8, 8, window.innerWidth - W - 8)
    const y = clamp(r.bottom - H, 8, window.innerHeight - H - 8)
    if (!reducido) {
      const haciaDer = x > (posRef.current?.x ?? casa().x)
      setDir(haciaDer ? 1 : -1); setDesplazando(true)
      ir('WALKING'); setPos({ x, y })
      await esperar(650)
      setDesplazando(false)
    }
    setDir(izq >= 8 ? 1 : -1)   // se detiene a la izquierda del elemento → señala a la derecha, y al revés
    ir('POINTING')
    el.style.outline = '3px solid var(--w-terra)'; el.style.outlineOffset = '3px'
    const resaltado = el
    setTimeout(() => { resaltado.style.outline = ''; resaltado.style.outlineOffset = '' }, 1800)
    if (speechText) decir(speechText)
    // Tras señalar, el estado visual vuelve a lo que corresponda (en conversación, a lo que esté pasando).
    setTimeout(() => { moviendose.current = false; if (!convRef.current.activa) setEstado('IDLE'); else aplicarEstadoConv() }, 2300)
    // Primero lo dice y luego pulsa: en Caja, Cocina y pagos Resti no aparece, y el subtítulo se perdería al cambiar de pantalla.
    if (shouldClick) { await esperar(speechText ? 1300 : 0); resaltado.click() }
    return true
  }, [decir, onGoHome, reducido, aplicarEstadoConv])

  const ejecutar = useCallback(async (r: RestiBrainResponse, dicho: string) => {
    if (r.action === 'WALK_AND_POINT' && r.targetId) { await walkToAndClick(r.targetId, r.speech, true); return }
    decir(r.speech)
    if (r.action === 'SLEEP') { await esperar(1600); guardar() }
    else if (r.action === 'OPEN_VOICE_COMMANDS') onOpenVoiceCommands(dicho)   // el modal interpreta lo que dijiste; tú apruebas cada cambio
  }, [decir, guardar, onOpenVoiceCommands, walkToAndClick])

  /** La respuesta de Resti a lo que dijo la persona: primero las órdenes locales (gratis e inmediatas) y si no, el cerebro. */
  const obtenerRespuesta = useCallback(async (frase: string): Promise<RestiBrainResponse> => {
    if (opinion.current) {
      if (CANCELA.test(frase)) { opinion.current = null; return { speech: 'Listo, lo dejamos así.', action: 'NONE' } }
      if (!convRef.current.activa) ir('THINKING')
      const hilo: MsgOpinion[] = [...opinion.current, { role: 'user', text: frase }]
      const { reply, saved } = await conversarOpinion(hilo)
      opinion.current = saved ? null : [...hilo, { role: 'assistant', text: reply }]
      if (saved) window.dispatchEvent(new CustomEvent(EVENTO_OPINION_GUARDADA))
      return { speech: reply, action: 'NONE' }
    }
    let r = intencionLocal(frase)
    if (!r) { if (!convRef.current.activa) ir('THINKING'); r = await preguntarIA(frase, historial.current) }
    recordar('user', frase); recordar('assistant', r.speech)
    if (r.action === 'START_FEEDBACK') opinion.current = [{ role: 'user', text: frase }, { role: 'assistant', text: r.speech }]
    return r
  }, [])

  // En conversación: Resti ejecuta la parte visual por su cuenta y devuelve lo que va a decir (el audio lo reproduce la conversación).
  responderRef.current = async t => { const r = await obtenerRespuesta(t); void ejecutar(r, t); return r.speech }

  const atender = useCallback(async (t: string) => {
    const frase = t.trim()
    if (!frase || ocupado.current) return
    ocupado.current = true
    try { const r = await obtenerRespuesta(frase); await ejecutar(r, frase) } finally { ocupado.current = false }
  }, [ejecutar, obtenerRespuesta])

  useEffect(() => () => { clearTimeout(timerHabla.current); clearTimeout(timerLimpiar.current) }, [])

  // Precarga (con el navegador libre) three.js y el modelo: así, al tocar el gorro, Resti aparece enseguida y no tras varios segundos en blanco.
  useEffect(() => {
    const red = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (red?.saveData || /(^|-)2g$/.test(red?.effectiveType ?? '')) return
    const w = window as unknown as { requestIdleCallback?: (f: () => void) => number; cancelIdleCallback?: (i: number) => void }
    const id = w.requestIdleCallback ? w.requestIdleCallback(() => { void cargar3D(); void fetch('/assets/resti/resti.glb').catch(() => {}) }) : window.setTimeout(() => { void cargar3D() }, 3000)
    return () => { if (w.requestIdleCallback) w.cancelIdleCallback?.(id); else clearTimeout(id) }
  }, [])

  // Los botones de "Opinión y sugerencias" abren a Resti (ya no hay otro chat en pantalla para el administrador).
  const atenderRef = useRef(atender); atenderRef.current = atender
  useEffect(() => {
    const alAbrir = (e: Event) => {
      const atajo = (e as CustomEvent<{ atajo?: AtajoOpinion }>).detail?.atajo
      if (!posRef.current) { setPos(casa()); setEstado('SUMMONING'); setSaludando(true) }
      opinion.current = []
      const semilla = atajo ? SEMILLAS[atajo] : undefined
      if (semilla) void atenderRef.current(semilla)
      else decir('Cuéntame qué falló, qué mejorarías o qué quieres personalizar.')
    }
    window.addEventListener(EVENTO_ABRIR_OPINION, alAbrir)
    return () => window.removeEventListener(EVENTO_ABRIR_OPINION, alAbrir)
  }, [decir])

  const etiquetaMic = conv.estado === 'apagado' ? 'Hablar con Resti' : 'Terminar la conversación'
  const placeholder = ({ apagado: 'Pregúntale a Resti…', iniciando: 'Activando el micrófono…', escuchando: 'Te escucho…', transcribiendo: 'Pensando…', pensando: 'Pensando…', hablando: 'Háblale para interrumpir' } as const)[conv.estado]

  if (estado === 'HAT') {
    return (
      <>
        <style>{CSS}</style>
        <button type="button" onClick={invocar} onPointerEnter={() => { void cargar3D() }} onFocus={() => { void cargar3D() }} aria-label="Abrir a Resti, tu chef asistente" title="Resti"
          className="resti-anim"
          style={{ position: 'fixed', right: 16, bottom: movil() ? 84 : 20, zIndex: 90, width: 58, height: 58, borderRadius: '50%', cursor: 'pointer', padding: 0,
            border: '1px solid var(--w-line)', background: 'var(--w-surface)', boxShadow: 'var(--w-shadow-sm)',
            display: 'grid', placeItems: 'center', animation: 'resti-hat-pop 320ms cubic-bezier(.34,1.4,.64,1) both, resti-float 2s ease-in-out 400ms 3' }}>
          <RestiHat />
        </button>
      </>
    )
  }

  const p = pos ?? casa()
  const mov = movil()
  // Globo de texto: ENCIMA de la cabeza, con una colita hacia ella, así nunca tapa la cara. Si arriba no hay espacio (Resti caminó al borde), va al costado.
  const anchoGlobo = Math.min(260, window.innerWidth - 24)
  const arriba = p.y > 84
  const gx = arriba ? clamp(p.x + W - anchoGlobo + 6, 12, window.innerWidth - anchoGlobo - 12)
    : (p.x > anchoGlobo + 20 ? p.x - anchoGlobo - 8 : clamp(p.x + W + 8, 8, window.innerWidth - anchoGlobo - 8))
  const gy = arriba ? p.y - 8 : Math.max(8, p.y)
  const colita = clamp(p.x + W / 2 - gx - 6, 16, anchoGlobo - 28)
  return (
    <>
      <style>{CSS}</style>
      {!reducido && (
        <div className="resti-move" aria-hidden={estado === 'SUMMONING'}
          style={{ position: 'fixed', left: 0, top: 0, zIndex: 95, width: W, height: H, pointerEvents: 'none',
            transform: `translate(${p.x}px, ${p.y}px)`, transition: `transform 650ms ${EASE}` }}>
          <div className="resti-anim" style={{ position: 'relative', width: W, height: H, animation: saliendo ? 'resti-guarda 280ms cubic-bezier(.5,0,.75,0) both' : estado === 'SUMMONING' ? 'resti-surge 420ms cubic-bezier(.34,1.4,.64,1) both' : undefined, transformOrigin: '50% 100%' }}>
            {sin3D
              ? <div style={{ width: W, height: H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}><RestiSprite estado={estado3D(estado, saludando)} direccion={dir} desplazando={desplazando} luz={luzDe(estado)} width={W} /></div>
              : (
                <>
                  {/* Mientras el 3D carga se ve la captura del mismo modelo (nunca un hueco en blanco) */}
                  {!listo3D && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}><RestiSprite estado={estado3D(estado, saludando)} direccion={dir} desplazando={desplazando} luz={luzDe(estado)} width={W} /></div>}
                  <Suspense fallback={null}><Resti3D estado={estado3D(estado, saludando)} direccion={dir} desplazando={desplazando} luz={luzDe(estado)} width={W} height={H} onListo={() => setListo3D(true)} onFallo={() => setSin3D(true)} /></Suspense>
                </>
              )}
          </div>
        </div>
      )}

      {habla && (
        <div role="status" aria-live="polite"
          style={reducido
            ? { position: 'fixed', right: 16, bottom: abajo() + 70, zIndex: 96, maxWidth: 'min(320px, calc(100vw - 32px))' }
            : { position: 'fixed', left: 0, top: 0, zIndex: 96, width: anchoGlobo, pointerEvents: 'none',
                transform: `translate(${gx}px, ${gy}px)`, transition: `transform 650ms ${EASE}` }}>
          <div style={{ transform: arriba && !reducido ? 'translateY(-100%)' : undefined }}>
            <div className="resti-anim" key={habla} style={{ position: 'relative', animation: 'resti-globo 220ms ease-out both' }}>
              <p style={{ margin: 0, padding: '0.55rem 0.8rem', background: '#111113', color: '#fff', borderRadius: '1rem', fontSize: '0.8125rem',
                lineHeight: 1.35, fontFamily: 'var(--w-sans)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>
                {habla}
              </p>
              {arriba && !reducido && <span aria-hidden style={{ position: 'absolute', left: colita, bottom: -5, width: 12, height: 12, background: '#111113', transform: 'rotate(45deg)', borderRadius: 2 }} />}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); const t = texto; setTexto(''); void atender(t) }}
        style={{ position: 'fixed', bottom: abajo(), zIndex: 96, display: 'flex', gap: 8, alignItems: 'center', padding: 6, boxSizing: 'border-box',
          ...(mov ? { left: 12, right: 12 } : { right: 16 }),
          background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '999px', boxShadow: 'var(--w-shadow-sm)',
          opacity: saliendo ? 0 : 1, transform: saliendo ? 'translateY(10px)' : 'none', transition: 'opacity 200ms ease, transform 200ms ease', pointerEvents: saliendo ? 'none' : undefined }}>
        {conv.soportado && (
          <button type="button" onClick={() => { void conv.alternar() }} aria-label={etiquetaMic} aria-pressed={conv.activa} title={conv.modo === 'navegador' && conv.activa ? 'Voz del navegador (sin interrupción)' : etiquetaMic}
            className={conv.activa ? 'resti-anim' : undefined}
            style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0, display: 'grid', placeItems: 'center', lineHeight: 0,
              background: 'var(--w-terra)', color: '#fff', opacity: conv.activa ? 1 : 0.92,
              animation: conv.activa && conv.estado === 'escuchando' ? 'resti-pulso 1.6s ease-in-out infinite' : undefined }}>
            {conv.activa
              ? <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
              : <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" />
                </svg>}
          </button>
        )}
        <input value={texto} onChange={e => setTexto(e.target.value)} maxLength={200} placeholder={placeholder} aria-label="Escríbele a Resti"
          style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', fontSize: '0.9rem',
            minWidth: 0, height: 44, ...(mov ? { flex: 1 } : { width: 200 }) }} />
        <button type="button" onClick={guardar} aria-label="Guardar a Resti" title="Descansa, Resti"
          style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0, display: 'grid', placeItems: 'center', lineHeight: 0, background: 'var(--w-bg)', color: 'var(--w-ink-mut)' }}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </form>
    </>
  )
}
