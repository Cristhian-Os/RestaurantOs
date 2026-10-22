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
const casa = () => ({ x: window.innerWidth - W - 16, y: window.innerHeight - H - 84 })
const buscar = (id: string) => document.querySelector<HTMLElement>(`[data-resti-target="${id}"]`)

const CSS = `
@keyframes resti-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes resti-emerge{from{transform:scaleY(.1);opacity:0}to{transform:scaleY(1);opacity:1}}
@keyframes resti-beam{0%{opacity:0}40%{opacity:.85}100%{opacity:0}}
@keyframes resti-spark{from{transform:translate(0,0);opacity:1}to{transform:translate(var(--dx),var(--dy));opacity:0}}
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

interface Props { onOpenVoiceCommands: (textoDicho?: string) => void; onGoHome: () => void }

export default function Resti({ onOpenVoiceCommands, onGoHome }: Props) {
  const [estado, setEstado] = useState<Estado>('HAT')
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [habla, setHabla] = useState('')
  const [dir, setDir] = useState(0)                      // -1 izquierda, 1 derecha: hacia dónde gira y señala
  const [desplazando, setDesplazando] = useState(false)
  const [saludando, setSaludando] = useState(false)
  const [sin3D, setSin3D] = useState(false)               // el equipo no puede con el 3D: se usan los sprites
  const [texto, setTexto] = useState('')
  const ocupado = useRef(false)
  const moviendose = useRef(false)                        // caminando o señalando: ahí el estado visual lo manda el movimiento
  const timerHabla = useRef<ReturnType<typeof setTimeout>>()
  const timerLimpiar = useRef<ReturnType<typeof setTimeout>>()
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
    convRef.current.detener(); historial.current = []; moviendose.current = false
    setHabla(''); setPos(null); setEstado('HAT'); setDir(0); setDesplazando(false); setSaludando(false)
  }, [])

  const invocar = async () => {
    setPos(casa()); setEstado('SUMMONING'); setSaludando(true)
    await esperar(reducido ? 0 : 400)
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
    let r = intencionLocal(frase)
    if (!r) { if (!convRef.current.activa) ir('THINKING'); r = await preguntarIA(frase, historial.current) }
    recordar('user', frase); recordar('assistant', r.speech)
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

  const etiquetaMic = conv.estado === 'apagado' ? 'Hablar con Resti' : 'Terminar la conversación'
  const placeholder = ({ apagado: 'Pregúntale a Resti…', iniciando: 'Activando el micrófono…', escuchando: 'Te escucho…', transcribiendo: 'Pensando…', pensando: 'Pensando…', hablando: 'Háblale para interrumpir' } as const)[conv.estado]

  if (estado === 'HAT') {
    return (
      <>
        <style>{CSS}</style>
        <button type="button" onClick={invocar} onPointerEnter={() => { void cargar3D() }} onFocus={() => { void cargar3D() }} aria-label="Abrir a Resti, tu chef asistente" title="Resti"
          className="resti-anim"
          style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 90, width: 58, height: 58, borderRadius: '50%', cursor: 'pointer',
            border: '1px solid var(--w-line)', background: 'var(--w-surface)', boxShadow: 'var(--w-shadow-sm)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'resti-float 2s ease-in-out 3' }}>
          <RestiHat />
        </button>
      </>
    )
  }

  const p = pos ?? casa()
  const globoALaIzquierda = p.x > 270
  return (
    <>
      <style>{CSS}</style>
      {!reducido && (
        <div className="resti-move" aria-hidden={estado === 'SUMMONING'}
          style={{ position: 'fixed', left: 0, top: 0, zIndex: 95, width: W, height: H, pointerEvents: 'none',
            transform: `translate(${p.x}px, ${p.y}px)`, transition: `transform 650ms ${EASE}` }}>
          {estado === 'SUMMONING' && (
            <>
              <div className="resti-anim" style={{ position: 'absolute', left: W / 2 - 22, top: -40, width: 44, height: H + 40,
                background: 'linear-gradient(to top, rgba(242,106,27,.0), rgba(242,106,27,.55))', animation: 'resti-beam 400ms ease-out both' }} />
              {[[-40, -30], [40, -36], [-26, -60], [30, -64], [-6, -76], [14, -52]].map(([dx, dy], i) => (
                <span key={i} className="resti-anim" style={{ position: 'absolute', left: W / 2, top: 20, width: 5, height: 5, borderRadius: '50%',
                  background: '#F26A1B', ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animation: 'resti-spark 400ms ease-out both' }} />
              ))}
            </>
          )}
          <div className="resti-anim" style={{ animation: estado === 'SUMMONING' ? 'resti-emerge 400ms ease-out both' : undefined, transformOrigin: '50% 100%' }}>
            {sin3D
              ? <div style={{ width: W, height: H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}><RestiSprite estado={estado3D(estado, saludando)} direccion={dir} desplazando={desplazando} luz={luzDe(estado)} width={W} /></div>
              : <Suspense fallback={null}><Resti3D estado={estado3D(estado, saludando)} direccion={dir} desplazando={desplazando} luz={luzDe(estado)} width={W} height={H} onFallo={() => setSin3D(true)} /></Suspense>}
          </div>
        </div>
      )}

      {habla && (
        <div role="status" aria-live="polite"
          style={reducido
            ? { position: 'fixed', right: 16, bottom: 80, zIndex: 96, maxWidth: 'min(320px, calc(100vw - 32px))' }
            : { position: 'fixed', left: 0, top: 0, zIndex: 96, width: 240, maxWidth: 'calc(100vw - 16px)', pointerEvents: 'none',
                transform: `translate(${globoALaIzquierda ? Math.max(8, p.x - 248) : Math.min(window.innerWidth - 248, p.x + W + 8)}px, ${Math.max(8, p.y)}px)`,
                transition: `transform 650ms ${EASE}` }}>
          <p style={{ margin: 0, padding: '0.5rem 0.75rem', background: '#111113', color: '#fff', borderRadius: '0.875rem', fontSize: '0.8125rem',
            lineHeight: 1.35, fontFamily: 'var(--w-sans)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
            {habla}
          </p>
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); const t = texto; setTexto(''); void atender(t) }}
        style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 96, display: 'flex', gap: 6, alignItems: 'center', padding: 6,
          background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '999px', boxShadow: 'var(--w-shadow-sm)', maxWidth: 'calc(100vw - 32px)' }}>
        {conv.soportado && (
          <button type="button" onClick={() => { void conv.alternar() }} aria-label={etiquetaMic} aria-pressed={conv.activa} title={conv.modo === 'navegador' && conv.activa ? 'Voz del navegador (sin interrupción)' : etiquetaMic}
            className={conv.activa ? 'resti-anim' : undefined}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
              background: conv.activa ? 'var(--w-terra)' : 'var(--w-bg)', color: conv.activa ? '#fff' : 'var(--w-terra)',
              animation: conv.activa && conv.estado === 'escuchando' ? 'resti-pulso 1.6s ease-in-out infinite' : undefined }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}>
              <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v4" />
            </svg>
          </button>
        )}
        <input value={texto} onChange={e => setTexto(e.target.value)} maxLength={200} placeholder={placeholder} aria-label="Escríbele a Resti"
          style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--w-ink)', fontFamily: 'var(--w-sans)', fontSize: '0.875rem',
            width: 160, minWidth: 0 }} />
        <button type="button" onClick={guardar} aria-label="Guardar a Resti" title="Descansa, Resti"
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0, background: 'var(--w-bg)', color: 'var(--w-ink-mut)', fontSize: '1rem' }}>
          ✕
        </button>
      </form>
    </>
  )
}
