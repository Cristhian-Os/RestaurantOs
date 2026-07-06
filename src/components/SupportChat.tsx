/**
 * SupportChat.tsx — Chat de soporte con IA (Gemini vía Edge Function)
 * Botón flotante + panel. Se usa en la landing y dentro de la app.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'

interface Msg { role: 'user' | 'assistant'; text: string }

// Limpieza ligera de markdown para mostrar texto legible
function clean(t: string): string {
  return t.replace(/\*\*(.*?)\*\*/g, '$1').replace(/^\s*[*-]\s+/gm, '• ')
}

const WELCOME: Msg = { role: 'assistant', text: '¡Hola! Soy Resti 👋 el asistente de RestaurantOS. ¿En qué te ayudo? Puedo contarte de los planes, la prueba gratis o cómo empezar.' }

export default function SupportChat() {
  const [open,    setOpen]    = useState(false)
  const [msgs,    setMsgs]    = useState<Msg[]>([WELCOME])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, loading, open])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    const next = [...msgs, { role: 'user' as const, text }]
    setMsgs(next)
    setInput('')
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('chat-support', {
        body: { messages: next.map(m => ({ role: m.role, text: m.text })) },
      })
      if (error) throw error
      setMsgs(m => [...m, { role: 'assistant', text: (data?.reply as string) ?? 'No pude responder ahora.' }])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Ups, no pude conectar. Intenta de nuevo en un momento.' }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, msgs])

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
        aria-label="Soporte">
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
              <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>Soporte RestaurantOS</p>
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
              {loading && (
                <div style={{ alignSelf: 'flex-start', padding: '0.6rem 0.85rem', color: 'var(--w-ink-mut)', fontSize: '0.85rem' }}>
                  Escribiendo…
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: '0.75rem', borderTop: '1px solid var(--w-line)', display: 'flex', gap: '0.5rem', background: 'var(--w-surface)' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send() }}
                placeholder="Escribe tu pregunta…"
                style={{ flex: 1, border: '1px solid var(--w-line)', borderRadius: '0.75rem', padding: '0.6rem 0.85rem', fontSize: '0.875rem', outline: 'none', fontFamily: 'var(--w-sans)', background: 'var(--w-bg)', color: 'var(--w-ink)' }} />
              <button onClick={send} disabled={loading || !input.trim()}
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
