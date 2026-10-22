import { useCallback, useEffect, useRef, useState } from 'react'
import { crearConversacion, type EstadoConv } from '../lib/resti/voz/conversacion'
import { iniciarCapturaVad, iniciarCapturaNavegador } from '../lib/resti/voz/captura'
import { crearReproductor, hablarConNavegador, callarNavegador } from '../lib/resti/voz/reproductor'
import { vozDelServidorDisponible, transcribirAudio, abrirVozEnFlujo } from '../lib/resti/voz/servicio'

export type ModoVoz = 'servidor' | 'navegador'
const ERRORES: Record<string, string> = {
  microfono: 'Permite el micrófono en tu navegador para hablar conmigo.',
  transcripcion: 'No pude oírte bien. Puedes escribirme.',
  cerebro: 'Ahora mismo no puedo ayudarte. Intenta en un momento.',
}

/**
 * Conversación por voz de Resti (escuchar → pensar → hablar, con interrupción).
 *  - Modo 'servidor': Gemini transcribe lo que dices y convierte la respuesta en audio (función resti-voz); el micrófono detecta cuándo hablas.
 *  - Modo 'navegador' (plan B si el servidor no tiene voz configurada): reconocimiento y voz del propio navegador, sin interrupción.
 * El razonamiento no pasa por aquí: lo hace `responder` (el cerebro de Resti).
 */
export function useRestiConversacion(opts: { responder: (texto: string) => Promise<string>; alTexto?: (rol: 'user' | 'assistant', texto: string) => void }) {
  const [estado, setEstado] = useState<EstadoConv>('apagado')
  const [usuarioHablando, setUsuarioHablando] = useState(false)
  const [modo, setModo] = useState<ModoVoz | null>(null)
  const [error, setError] = useState<string | null>(null)
  const modoRef = useRef<ModoVoz | null>(null)
  const optsRef = useRef(opts); optsRef.current = opts
  const reproductor = useRef<ReturnType<typeof crearReproductor>>()
  const tokenVoz = useRef(0)
  const conv = useRef<ReturnType<typeof crearConversacion>>()

  const asegurar = useCallback(() => {
    if (conv.current) return conv.current
    reproductor.current ??= crearReproductor()
    conv.current = crearConversacion({
      iniciarCaptura: async cb => {
        const cbs = { onFrase: (f: Parameters<typeof cb.onFrase>[0]) => { setUsuarioHablando(false); cb.onFrase(f) }, onInicioHabla: () => { setUsuarioHablando(true); cb.onInicioHabla() } }
        if (modoRef.current === 'servidor') {
          try { return await iniciarCapturaVad(cbs) } catch (e) {
            if (e instanceof Error && e.name === 'NotAllowedError') throw e
            modoRef.current = 'navegador'; setModo('navegador')   // sin micrófono avanzado: se prueba el reconocimiento del navegador
          }
        }
        return await iniciarCapturaNavegador(cbs)
      },
      transcribir: wav => transcribirAudio(wav),
      responder: t => optsRef.current.responder(t),
      hablar: async texto => {
        const mi = ++tokenVoz.current
        if (modoRef.current === 'servidor') {
          try {
            // Streaming: Resti empieza a hablar ~1 s después, sin esperar a que se genere todo el audio.
            const flujo = await abrirVozEnFlujo(texto)
            if (mi !== tokenVoz.current) { flujo.cancelar(); return }   // la persona interrumpió mientras se abría
            await reproductor.current!.reproducirFlujo(flujo); return
          } catch { if (mi !== tokenVoz.current) return /* sin voz del servidor: se usa la del navegador */ }
        }
        await hablarConNavegador(texto)
      },
      silenciar: () => { tokenVoz.current++; reproductor.current?.detener(); callarNavegador() },
      onEstado: e => { setEstado(e); if (e === 'apagado') setUsuarioHablando(false) },
      onError: c => { setError(ERRORES[c] ?? null) },
      onTexto: (r, t) => optsRef.current.alTexto?.(r, t),
    })
    return conv.current
  }, [])

  /** Enciende o apaga la conversación. Debe llamarse desde un clic (los navegadores solo dejan sonar y grabar tras un gesto). */
  const alternar = useCallback(async () => {
    const c = asegurar()
    if (c.estado() !== 'apagado') { c.detener(); return }
    setError(null)
    reproductor.current!.preparar()
    if (modoRef.current === null) { const ok = await vozDelServidorDisponible(); modoRef.current = ok ? 'servidor' : 'navegador'; setModo(modoRef.current) }
    await c.iniciar()
  }, [asegurar])

  /** Dice una frase suelta (p. ej. el saludo al invocarla), sin encender el micrófono. Debe llamarse dentro de un clic. */
  const hablarSuelto = useCallback(async (texto: string) => {
    const mi = ++tokenVoz.current
    reproductor.current ??= crearReproductor(); reproductor.current.preparar()
    try {
      const flujo = await abrirVozEnFlujo(texto)
      if (mi !== tokenVoz.current) { flujo.cancelar(); return }
      await reproductor.current.reproducirFlujo(flujo); return
    } catch { if (mi !== tokenVoz.current) return /* sin voz del servidor: la del navegador */ }
    await hablarConNavegador(texto)
  }, [])
  const callar = useCallback(() => { tokenVoz.current++; reproductor.current?.detener(); callarNavegador() }, [])

  useEffect(() => () => { conv.current?.detener(); reproductor.current?.cerrar() }, [])
  const soportado = typeof navigator !== 'undefined' && (!!navigator.mediaDevices?.getUserMedia || !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition)

  return { estado, activa: estado !== 'apagado', usuarioHablando, modo, error, limpiarError: () => setError(null), alternar, detener: () => conv.current?.detener(), hablarSuelto, callar, soportado }
}
