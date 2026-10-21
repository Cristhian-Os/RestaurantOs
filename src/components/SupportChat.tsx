/**
 * SupportChat.tsx — Chat de Resti con IA (Gemini vía Edge Function)
 * Botón flotante + panel. Dos modos:
 *  - 'soporte' (landing y visitantes): ventas y dudas.
 *  - 'opinion' (personal con sesión dentro de la app): recoge fallos, mejoras y personalización; la función los guarda.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'
import { EVENTO_ABRIR_OPINION, EVENTO_OPINION_GUARDADA, type AtajoOpinion } from './feedback/OpinionSection'

interface Msg { role: 'user' | 'assistant'; text: string }

// Limpieza ligera de markdown para mostrar texto legible
function clean(t: string): string {
  return t.replace(/\*\*(.*?)\*\*/g, '$1').replace(/^\s*[*-]\s+/gm, '• ')
}

const WELCOME: Msg = { role: 'assistant', text: '¡Hola! Soy Resti 👋 el asistente de RestaurantOS. ¿En qué te ayudo? Puedo contarte de los planes, la prueba gratis o cómo empezar.' }
const WELCOME_OPINION: Msg = { role: 'assistant', text: '¡Hola! Soy Resti 👋 Cuéntame qué falló, qué mejorarías o cómo quieres personalizar tu restaurante, y lo dejo anotado para el equipo.' }
const ATAJOS: { id: AtajoOpinion; texto: string; semilla: string }[] = [
  { id: 'fallo', texto: 'Reportar un fallo', semilla: 'Quiero reportar un fallo.' },
  { id: 'mejora', texto: 'Sugerir una mejora', semilla: 'Quiero sugerir una mejora.' },
  { id: 'personalizacion', texto: 'Personalizar mi restaurante', semilla: 'Quiero personalizar mi restaurante.' },
]
const BORRADOR = 'ros_opinion_borrador'

const leerBorrador = (): string => { try { return localStorage.getItem(BORRADOR) ?? '' } catch { return '' } }
const guardarBorrador = (t: string) => { try { if (t) localStorage.setItem(BORRADOR, t); else localStorage.removeItem(BORRADOR) } catch { /* sin almacenamiento: no se conserva el borrador */ } }
const dispositivo = () => `${/Mobi|Android/i.test(navigator.userAgent) ? 'móvil' : 'computador'} ${window.innerWidth}px`

export default function SupportChat({ modo = 'soporte', pantalla }: { modo?: 'soporte' | 'opinion'; pantalla?: string }) {
  const opinion = modo === 'opinion'
  const [open,    setOpen]    = useState(false)
  const [msgs,    setMsgs]    = useState<Msg[]>([opinion ? WELCOME_OPINION : WELCOME])
  const [input,   setInput]   = useState(opinion ? leerBorrador() : '')
  const [loading, setLoading] = useState(false)
  const [aviso,   setAviso]   = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const msgsRef = useRef(msgs); msgsRef.current = msgs
  const loadingRef = useRef(loading); loadingRef.current = loading

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, loading, open])

  const enviar = useCallback(async (texto: string) => {
    const text = texto.trim()
    if (!text || loadingRef.current) return
    const next = [...msgsRef.current, { role: 'user' as const, text }]
    setMsgs(next)
    setInput('')
    setAviso(null)
    setLoading(true)
    try {
      const mensajes = next.map(m => ({ role: m.role, text: m.text }))
      const { data, error } = await supabase.functions.invoke('chat-support', {
        body: opinion ? { mode: 'opinion', pantalla, dispositivo: dispositivo(), messages: mensajes } : { messages: mensajes },
      })
      if (error) throw error
      setMsgs(m => [...m, { role: 'assistant', text: (data?.reply as string) ?? 'No pude responder ahora.' }])
      if (opinion) {
        guardarBorrador('')
        if (data?.saved) window.dispatchEvent(new CustomEvent(EVENTO_OPINION_GUARDADA))
      }
    } catch {
      if (opinion) {
        // No se pierde lo escrito: vuelve a la casilla y se avisa.
        setMsgs(m => m.slice(0, -1))
        setInput(text); guardarBorrador(text)
        setAviso('No se pudo enviar (¿sin internet?). Tu mensaje quedó guardado: inténtalo de nuevo.')
      } else {
        setMsgs(m => [...m, { role: 'assistant', text: 'Ups, no pude conectar. Intenta de nuevo en un momento.' }])
      }
    } finally {
      setLoading(false)
    }
  }, [opinion, pantalla])

  // Desde "Opinión y sugerencias": abre el chat y arranca con el atajo elegido.
  useEffect(() => {
    if (!opinion) return
    const alAbrir = (e: Event) => {
      const atajo = (e as CustomEvent<{ atajo?: AtajoOpinion }>).detail?.atajo
      setOpen(true)
      const semilla = ATAJOS.find(a => a.id === atajo)?.semilla
      if (semilla && msgsRef.current.length === 1) void enviar(semilla)
    }
    window.addEventListener(EVENTO_ABRIR_OPINION, alAbrir)
    return () => window.removeEventListener(EVENTO_ABRIR_OPINION, alAbrir)
  }, [opinion, enviar])

  return (
    <>
      {/* Botón flotante */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileTap={{ scale: 0.92 }}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 90,
          width: 58, height: 58, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--w-terra)', color: '#fff', boxShadow: 'var(--w-shadow-md, 0 8px 24px rgba(0,0,0,0.2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label={opinion ? 'Opinión y sugerencias' : 'Soporte'}>
        {open
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 24, height: 24 }}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 26, height: 26 }}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed', bottom: 90, right: 20, zIndex: 90,
              width: 'min(380px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 130px))',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              borderRadius: '1.25rem', background: 'var(--w-surface)',
              border: '1px solid var(--w-line)', boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
              fontFamily: 'var(--w-sans)',
            }}>

            {/* Header */}
            <div style={{ padding: '1rem 1.25rem', background: 'var(--w-terra)', color: '#fff' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>{opinion ? 'Opinión y sugerencias' : 'Soporte RestaurantOS'}</p>
              <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.85 }}>Resti · asistente con IA</p>
            </div>

            {/* Mensajes */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem', background: 'var(--w-bg)' }}>
              {msgs.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%', padding: '0.6rem 0.85rem', borderRadius: '1rem',
                  fontSize: '0.875rem', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? 'var(--w-terra)' : 'var(--w-surface)',
                  color: m.role === 'user' ? '#fff' : 'var(--w-ink)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--w-line)',
                }}>
                  {m.role === 'assistant' ? clean(m.text) : m.text}
                </div>
              ))}
              {opinion && msgs.length === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {ATAJOS.map(a => (
                    <button key={a.id} onClick={() => void enviar(a.semilla)} disabled={loading}
                      style={{ alignSelf: 'flex-start', padding: '0.5rem 0.85rem', minHeight: '2.5rem', borderRadius: '999px', border: '1px solid var(--w-terra)', background: 'var(--w-surface)', color: 'var(--w-terra)', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {a.texto}
                    </button>
                  ))}
                </div>
              )}
              {loading && (
                <div style={{ alignSelf: 'flex-start', padding: '0.6rem 0.85rem', color: 'var(--w-ink-mut)', fontSize: '0.85rem' }}>
                  Escribiendo…
                </div>
              )}
            </div>

            {/* Avisos */}
            {aviso && <div style={{ padding: '0.5rem 0.9rem', fontSize: '0.78rem', background: 'rgba(176,52,29,0.10)', color: '#B0341D' }}>{aviso}</div>}
            {opinion && <div style={{ padding: '0.35rem 0.9rem', fontSize: '0.7rem', color: 'var(--w-ink-mut)', background: 'var(--w-surface)' }}>Lo que escribas se guarda para mejorar RestaurantOS. No escribas contraseñas ni datos de tarjetas.</div>}

            {/* Input */}
            <div style={{ padding: '0.75rem', borderTop: '1px solid var(--w-line)', display: 'flex', gap: '0.5rem', background: 'var(--w-surface)' }}>
              <input
                value={input}
                onChange={e => { setInput(e.target.value); if (opinion) guardarBorrador(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter') void enviar(input) }}
                placeholder={opinion ? 'Cuéntame tu idea o el problema…' : 'Escribe tu pregunta…'}
                style={{ flex: 1, border: '1px solid var(--w-line)', borderRadius: '0.75rem', padding: '0.6rem 0.85rem', fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--w-sans)', background: 'var(--w-bg)', color: 'var(--w-ink)' }} />
              <button onClick={() => void enviar(input)} disabled={loading || !input.trim()}
                style={{ border: 'none', borderRadius: '0.75rem', padding: '0 0.9rem', background: 'var(--w-terra)', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading || !input.trim() ? 0.6 : 1, fontWeight: 700 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18 }}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
