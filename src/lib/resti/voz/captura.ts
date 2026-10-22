/**
 * Captura de voz de Resti en el navegador. Dos modos con la misma forma:
 *  - iniciarCapturaVad: micrófono + detector de voz; entrega cada frase como WAV 16 kHz (se transcribe en el servidor con Gemini).
 *  - iniciarCapturaNavegador: reconocimiento de voz del propio navegador (plan B si no hay Gemini); entrega el texto ya reconocido.
 * El micrófono solo está encendido mientras la conversación está activa.
 */
import { crearVad } from './vad.ts'
import { bajarMuestreo, aWavBase64, rms } from './pcm.ts'
import type { CapturaConv, Frase } from './conversacion.ts'

interface Callbacks { onFrase(f: Frase): void; onInicioHabla(): void }
export type Captura = CapturaConv

const PREROLL_MS = 320   // lo que se conserva antes de detectar la voz, para no cortar la primera sílaba
const SENSIBILIDAD = { normal: { umbralMin: 0.012, factorRuido: 3, inicioMs: 100, finMs: 800 }, baja: { umbralMin: 0.03, factorRuido: 5, inicioMs: 320 } }

export async function iniciarCapturaVad(cb: Callbacks): Promise<Captura> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('microfono')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
  // Si algo falla después de abrir el micrófono (AudioContext, worklet…), se libera: si no, el indicador de "micrófono en uso" queda encendido.
  try { return await montarCaptura(stream, cb) } catch (e) { stream.getTracks().forEach(t => t.stop()); throw e }
}

async function montarCaptura(stream: MediaStream, cb: Callbacks): Promise<Captura> {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext
  // A 16 kHz directamente: el navegador remuestrea con filtro de calidad (mejor que promediar bloques a mano). Si no lo permite, se usa la frecuencia del equipo.
  let ctx: AudioContext
  try { ctx = new Ctx({ sampleRate: 16000 }) } catch { ctx = new Ctx() }
  let origen: MediaStreamAudioSourceNode
  try { origen = ctx.createMediaStreamSource(stream) } catch { void ctx.close(); ctx = new Ctx(); origen = ctx.createMediaStreamSource(stream) }   // Firefox no mezcla frecuencias distintas
  const mudo = ctx.createGain(); mudo.gain.value = 0; mudo.connect(ctx.destination)   // el nodo debe estar conectado para que el navegador lo procese

  const vad = crearVad({ bloqueMs: (1024 / ctx.sampleRate) * 1000, ...SENSIBILIDAD.normal })
  let preroll: Float32Array[] = [], frase: Float32Array[] = [], vivo = true
  const cerrar = () => {
    const voz = vad.vozMs(); const total = frase.reduce((n, b) => n + b.length, 0), todo = new Float32Array(total); let o = 0
    for (const b of frase) { todo.set(b, o); o += b.length }
    frase = []
    if (voz >= 250) cb.onFrase({ wav: aWavBase64(bajarMuestreo(todo, ctx.sampleRate, 16000), 16000) })   // un ruido corto no es una frase
  }
  const bloque = (f: Float32Array) => {
    if (!vivo) return
    const ev = vad.procesar(rms(f))
    if (ev === 'inicio') { frase = [...preroll, f]; preroll = []; cb.onInicioHabla(); return }
    if (vad.hablando() || ev === 'fin') {
      frase.push(f)
      if (ev === 'fin') cerrar()
      return
    }
    preroll.push(f); while (preroll.length * 1024 / ctx.sampleRate * 1000 > PREROLL_MS) preroll.shift()
  }

  let nodo: AudioNode
  try {
    await ctx.audioWorklet.addModule('/resti-captura.worklet.js')
    const w = new AudioWorkletNode(ctx, 'resti-captura'); w.port.onmessage = ev => bloque(ev.data as Float32Array); nodo = w
  } catch {
    const sp = ctx.createScriptProcessor(2048, 1, 1)   // navegadores sin AudioWorklet
    sp.onaudioprocess = ev => { const d = ev.inputBuffer.getChannelData(0); for (let i = 0; i + 1024 <= d.length; i += 1024) bloque(d.slice(i, i + 1024)) }
    nodo = sp
  }
  origen.connect(nodo); nodo.connect(mudo)
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {})

  return {
    terminarFrase: () => { if (vad.forzarFin() === 'fin') cerrar() },
    sensibilidad: m => vad.ajustar(SENSIBILIDAD[m]),
    detener() {
      vivo = false
      try { origen.disconnect(); nodo.disconnect(); mudo.disconnect() } catch { /* ya desconectado */ }
      stream.getTracks().forEach(t => t.stop()); void ctx.close()
    },
  }
}

const MENSAJES: Record<string, string> = { 'not-allowed': 'microfono', 'service-not-allowed': 'microfono', 'audio-capture': 'microfono' }

/** Reconocimiento del navegador, continuo. Mientras Resti habla se pausa (no distingue su voz de la de la persona): en este modo no hay interrupción. */
export async function iniciarCapturaNavegador(cb: Callbacks): Promise<Captura> {
  const Reco = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!Reco) throw new Error('microfono')
  let detenido = false, pausado = false, activo: any = null, hubo = false
  const arrancar = () => {
    if (detenido || pausado) return
    const r = new Reco(); activo = r
    r.lang = 'es-CO'; r.continuous = true; r.interimResults = true
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], t = String(res[0]?.transcript ?? '').trim()
        if (!t) continue
        if (!res.isFinal) { if (!hubo) { hubo = true; cb.onInicioHabla() } }
        else { hubo = false; cb.onFrase({ texto: t }) }
      }
    }
    r.onerror = (e: any) => { if (MENSAJES[e?.error]) { detenido = true } }
    r.onend = () => { activo = null; hubo = false; if (!detenido && !pausado) setTimeout(arrancar, 150) }
    try { r.start() } catch { /* ya estaba iniciado */ }
  }
  arrancar()
  return {
    sensibilidad: m => { pausado = m === 'baja'; if (pausado) { try { activo?.abort() } catch { /* nada */ } } else if (!activo) arrancar() },
    detener() { detenido = true; try { activo?.abort() } catch { /* nada */ } },
  }
}
