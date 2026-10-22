import { useCallback, useEffect, useRef, useState } from 'react'

const MENSAJES: Record<string, string> = {
  'not-allowed': 'Permite el micrófono en tu navegador para hablar conmigo.',
  'service-not-allowed': 'Permite el micrófono en tu navegador para hablar conmigo.',
  'no-speech': 'No te escuché. Intenta de nuevo.',
  'audio-capture': 'No encuentro un micrófono.',
  'network': 'Sin internet el micrófono puede no funcionar. Puedes escribirme.',
}

/** Voz de Resti: reconocimiento (es-CO, una frase por vez) y lectura en voz alta. El micrófono solo está activo mientras escucha. */
export function useRestiVoice() {
  const Ctor: any = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : undefined
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<any>(null)

  const stop = useCallback(() => {
    try { rec.current?.abort() } catch { /* ya estaba detenido */ }
    rec.current = null
    setListening(false)
  }, [])

  const listen = useCallback((onText: (t: string) => void) => {
    if (!Ctor) return
    stop(); setError(null)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setError(MENSAJES.network); return }
    const r = new Ctor()
    r.lang = 'es-CO'; r.continuous = false; r.interimResults = false
    r.onresult = (e: any) => { const t = e?.results?.[0]?.[0]?.transcript; if (t) onText(String(t)) }
    r.onerror = (e: any) => setError(MENSAJES[e?.error] ?? 'No pude usar el micrófono. Puedes escribirme.')
    r.onend = () => { setListening(false); rec.current = null }
    rec.current = r
    setListening(true)
    try { r.start() } catch { setListening(false) }
  }, [Ctor, stop])

  /** Lee `text` en voz alta (voz es-* si existe). */
  const speak = useCallback((text: string) => {
    const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!s || !text) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'es-CO'; u.rate = 1.05; u.pitch = 0.95
    const v = s.getVoices().find(x => x.lang?.toLowerCase().startsWith('es'))
    if (v) u.voice = v
    s.speak(u)
  }, [])

  const silenciar = useCallback(() => { if (typeof window !== 'undefined') window.speechSynthesis?.cancel() }, [])
  const limpiarError = useCallback(() => setError(null), [])

  useEffect(() => () => { stop(); if (typeof window !== 'undefined') window.speechSynthesis?.cancel() }, [stop])

  return { supported: !!Ctor, listening, error, listen, stop, speak, silenciar, limpiarError }
}
