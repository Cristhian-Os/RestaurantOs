/**
 * Conversación por voz de Resti: escuchar → transcribir → pensar → hablar, con interrupción (si la persona habla encima, Resti se calla).
 * Es una máquina de estados pura: el micrófono, la transcripción, el cerebro y el altavoz entran como dependencias, así que se prueba sin navegador.
 */
export type EstadoConv = 'apagado' | 'iniciando' | 'escuchando' | 'transcribiendo' | 'pensando' | 'hablando'
/** Lo que entrega la captura: audio WAV (se transcribe en el servidor) o texto ya reconocido (reconocimiento del navegador). */
export interface Frase { wav?: string; texto?: string }

export interface CapturaConv { detener(): void; sensibilidad?(modo: 'normal' | 'baja'): void; /** Cierra ya la frase que se está diciendo (la persona avisa que terminó). */ terminarFrase?(): void }
export interface DepsConv {
  iniciarCaptura(cb: { onFrase(f: Frase): void; onInicioHabla(): void }): Promise<CapturaConv>
  transcribir(wav: string): Promise<string>
  /** Devuelve lo que Resti va a decir; las acciones visuales (caminar, señalar…) las hace por su cuenta. */
  responder(texto: string): Promise<string>
  hablar(texto: string): Promise<void>
  /** Corta de inmediato el audio que está sonando. */
  silenciar(): void
  onEstado(e: EstadoConv): void
  onError?(codigo: 'microfono' | 'transcripcion' | 'limite' | 'cerebro' | 'voz'): void
  onTexto?(rol: 'user' | 'assistant', texto: string): void
}

export const MSG_NO_ENTENDI = 'No te escuché bien. ¿Me lo repites?'
export const MSG_LIMITE = 'Llegamos al límite de voz por ahora. Puedes escribirme.'
export const MSG_ERROR = 'Ahora mismo no puedo ayudarte. Intenta en un momento.'

export function crearConversacion(d: DepsConv) {
  let estado = 'apagado' as EstadoConv, turno = 0, intento = 0, captura: CapturaConv | null = null, pendiente: Frase | null = null
  const ir = (e: EstadoConv) => {
    if (e === estado) return
    estado = e; d.onEstado(e)
    captura?.sensibilidad?.(e === 'hablando' ? 'baja' : 'normal')   // mientras habla, el micrófono exige más para no oírse a sí misma
  }
  const actual = (): EstadoConv => estado   // lectura fresca: TypeScript no ve los cambios de estado que ocurren durante un await
  const ocupado = () => estado === 'transcribiendo' || estado === 'pensando'

  async function procesar(f: Frase) {
    const mi = ++turno
    const vigente = () => mi === turno && estado !== 'apagado'
    let texto = f.texto?.trim() ?? ''
    if (!texto && f.wav) {
      ir('transcribiendo')
      try { texto = (await d.transcribir(f.wav)).trim() } catch (e) { const limite = e instanceof Error && e.message === 'limite'; d.onError?.(limite ? 'limite' : 'transcripcion'); if (vigente()) { await decir(limite ? MSG_LIMITE : MSG_NO_ENTENDI, mi) } return fin(mi) }
      if (!vigente()) return
    }
    if (!texto) return fin(mi)   // ruido o silencio: no se responde
    d.onTexto?.('user', texto)
    ir('pensando')
    let respuesta: string
    try { respuesta = await d.responder(texto) } catch { d.onError?.('cerebro'); respuesta = MSG_ERROR }
    if (!vigente()) return
    await decir(respuesta, mi)
    fin(mi)
  }
  async function decir(texto: string, mi: number) {
    if (mi !== turno || estado === 'apagado') return
    d.onTexto?.('assistant', texto)
    ir('hablando')
    try { await d.hablar(texto) } catch { d.onError?.('voz') }
  }
  function fin(mi: number) {
    if (mi !== turno || estado === 'apagado') return
    ir('escuchando')
    if (pendiente) { const f = pendiente; pendiente = null; void procesar(f) }
  }

  return {
    estado: () => estado,
    /** La persona avisa que terminó de hablar (toca el micrófono): se cierra la frase sin esperar el silencio. */
    terminarFrase: () => captura?.terminarFrase?.(),
    async iniciar() {
      if (actual() !== 'apagado') return
      const mio = ++intento   // si se apaga (o se reinicia) mientras se espera el permiso del micrófono, esta captura ya no sirve
      ir('iniciando')
      let nueva: CapturaConv
      try {
        nueva = await d.iniciarCaptura({
          onFrase: f => { if (estado === 'apagado') return; if (ocupado()) { pendiente = f; return } void procesar(f) },
          onInicioHabla: () => { if (estado === 'hablando') { turno++; d.silenciar(); ir('escuchando') } },   // interrupción
        })
      } catch {
        if (mio !== intento || actual() === 'apagado') return   // ya lo apagaron: nada que avisar
        d.onError?.('microfono'); estado = 'apagado'; d.onEstado('apagado'); return
      }
      if (mio !== intento || actual() === 'apagado') { try { nueva.detener() } catch { /* ya estaba detenido */ } return }   // lo apagaron durante el permiso: se suelta el micrófono
      captura = nueva
      if (actual() === 'iniciando') ir('escuchando')
    },
    detener() {
      turno++; intento++; pendiente = null; d.silenciar()
      try { captura?.detener() } catch { /* ya estaba detenido */ }
      captura = null; ir('apagado')
    },
  }
}
