/**
 * Resti — asistente del panel del administrador (chef 2.5D sin rostro).
 * Solo NAVEGA: camina hasta un elemento de la lista blanca (RESTI_TARGETS) y lo pulsa si es de navegación.
 * Los cambios de datos pasan siempre por el modal de comandos de voz (antes → después + aprobación).
 * Nada corre en reposo: sin intervalos, sin listeners de scroll y sin micrófono mientras está guardado.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { useRestiVoice } from '../../hooks/useRestiVoice'
import { RestiSprite, RestiHat, type RestiPose } from './RestiSprite'
import { isRestiTarget, type RestiBrainResponse } from '../../lib/resti/targets'
import { parseBrainResponse } from '../../lib/resti/brain'
import { intencionLocal } from '../../lib/resti/intents'

type Estado = 'HAT' | 'SUMMONING' | 'IDLE' | 'LISTENING' | 'THINKING' | 'WALKING' | 'POINTING' | 'SPEAKING'

const W = 84
const H = Math.round(W * 329 / 197)
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const NO_ENTENDI: RestiBrainResponse = { speech: 'No te entendí bien. ¿Me lo dices de otra forma?', action: 'NONE' }

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
@media (prefers-reduced-motion: reduce){.resti-anim{animation:none!important}.resti-move{transition:none!important}}
`

async function preguntarIA(text: string): Promise<RestiBrainResponse> {
  const timeout = new Promise<null>(r => setTimeout(() => r(null), 10_000))
  try {
    const res = await Promise.race([supabase.functions.invoke('resti-brain', { body: { text } }), timeout])
    if (!res) return { speech: 'Me estoy tardando demasiado. Intenta otra vez en un momento.', action: 'NONE' }
    if (res.error) return { speech: 'Ahora mismo no puedo ayudarte. Intenta en un momento.', action: 'NONE' }
    return parseBrainResponse(res.data) ?? NO_ENTENDI
  } catch {
    return { speech: 'Ahora mismo no puedo ayudarte. Intenta en un momento.', action: 'NONE' }
  }
}

interface Props { onOpenVoiceCommands: () => void; onGoHome: () => void }

export default function Resti({ onOpenVoiceCommands, onGoHome }: Props) {
  const [estado, setEstado] = useState<Estado>('HAT')
  const [pose, setPose] = useState<RestiPose>('wave')
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [mirarDer, setMirarDer] = useState(false)
  const [habla, setHabla] = useState('')
  const [texto, setTexto] = useState('')
  const voz = useRestiVoice()
  const ocupado = useRef(false)
  const timerHabla = useRef<ReturnType<typeof setTimeout>>()
  const reducido = sinMovimiento()

  const ir = (e: Estado, p?: RestiPose) => { setEstado(e); if (p) setPose(p) }

  const decir = useCallback((t: string, enVoz: boolean) => {
    clearTimeout(timerHabla.current)
    setHabla(t); setEstado('SPEAKING')
    if (enVoz) voz.speak(t)
    timerHabla.current = setTimeout(() => { setHabla(''); setEstado('IDLE'); setPose('wave') }, Math.min(7000, 2000 + t.length * 45))
  }, [voz])

  const guardar = useCallback(() => {
    clearTimeout(timerHabla.current)
    voz.stop(); voz.silenciar()
    setHabla(''); setPos(null); setEstado('HAT')
  }, [voz])

  const invocar = async () => {
    setPos(casa()); setPose('wave'); setEstado('SUMMONING')
    await esperar(reducido ? 0 : 400)
    decir('Dime qué necesitas.', false)
  }

  /** Camina hasta el elemento de la lista blanca, lo resalta y, si es de navegación, lo pulsa. */
  const walkToAndClick = useCallback(async (targetId: string, speechText?: string, shouldClick = true, enVoz = false) => {
    if (!isRestiTarget(targetId)) return false
    let el = buscar(targetId)
    if (!el) {
      onGoHome()
      for (let i = 0; i < 10 && !el; i++) { await esperar(100); el = buscar(targetId) }
    }
    if (!el) { decir('No veo eso en esta pantalla.', false); return false }
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
      setMirarDer(x > (pos?.x ?? casa().x))
      ir('WALKING', 'walk'); setPos({ x, y })
      await esperar(650)
    }
    setMirarDer(false)   // el brazo del sprite "click" ya apunta a la derecha
    ir('POINTING', 'click')
    el.style.outline = '3px solid var(--w-terra)'; el.style.outlineOffset = '3px'
    const resaltado = el
    setTimeout(() => { resaltado.style.outline = ''; resaltado.style.outlineOffset = '' }, 1800)
    if (shouldClick) resaltado.click()
    if (speechText) decir(speechText, enVoz)
    return true
  }, [decir, onGoHome, pos, reducido])

  const ejecutar = useCallback(async (r: RestiBrainResponse, enVoz: boolean) => {
    if (r.action === 'WALK_AND_POINT' && r.targetId) { await walkToAndClick(r.targetId, r.speech, true, enVoz); return }
    decir(r.speech, enVoz)
    if (r.action === 'SLEEP') { await esperar(1600); guardar() }
    else if (r.action === 'OPEN_VOICE_COMMANDS') onOpenVoiceCommands()
  }, [decir, guardar, onOpenVoiceCommands, walkToAndClick])

  const atender = useCallback(async (t: string, enVoz: boolean) => {
    const frase = t.trim()
    if (!frase || ocupado.current) return
    ocupado.current = true
    try {
      let r = intencionLocal(frase)
      if (!r) { ir('THINKING', 'think'); r = await preguntarIA(frase) }
      await ejecutar(r, enVoz)
    } finally { ocupado.current = false }
  }, [ejecutar])

  useEffect(() => {
    if (voz.error) { decir(voz.error, false); voz.limpiarError() }
  }, [voz.error]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (estado === 'LISTENING' && !voz.listening) setEstado('IDLE')
  }, [voz.listening, estado])
  useEffect(() => () => clearTimeout(timerHabla.current), [])

  const escuchar = () => {
    if (voz.listening) { voz.stop(); return }
    ir('LISTENING', 'think'); setHabla('Te escucho…')
    voz.listen(t => { void atender(t, true) })
  }

  if (estado === 'HAT') {
    return (
      <>
        <style>{CSS}</style>
        <button type="button" onClick={invocar} aria-label="Abrir a Resti, tu chef asistente" title="Resti"
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
            <RestiSprite pose={pose} width={W} mirarDerecha={mirarDer} />
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
            lineHeight: 1.35, fontFamily: 'var(--w-sans)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {habla}
          </p>
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); const t = texto; setTexto(''); void atender(t, false) }}
        style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 96, display: 'flex', gap: 6, alignItems: 'center', padding: 6,
          background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: '999px', boxShadow: 'var(--w-shadow-sm)', maxWidth: 'calc(100vw - 32px)' }}>
        {voz.supported && (
          <button type="button" onClick={escuchar} aria-label={voz.listening ? 'Dejar de escuchar' : 'Hablar con Resti'}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
              background: voz.listening ? 'var(--w-terra)' : 'var(--w-bg)', color: voz.listening ? '#fff' : 'var(--w-terra)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}>
              <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v4" />
            </svg>
          </button>
        )}
        <input value={texto} onChange={e => setTexto(e.target.value)} maxLength={200} placeholder="Pregúntale a Resti…" aria-label="Escríbele a Resti"
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
