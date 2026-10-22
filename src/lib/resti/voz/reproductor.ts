/** Reproduce el audio que devuelve Gemini (PCM de 16 bits) y se puede cortar al instante (interrupción). */
import { pcm16Base64AMuestras } from './pcm.ts'

export function crearReproductor() {
  let ctx: AudioContext | null = null, fuente: AudioBufferSourceNode | null = null
  const asegurar = () => {
    if (!ctx) { const Ctx = window.AudioContext || (window as any).webkitAudioContext; ctx = new Ctx() }
    return ctx!
  }
  return {
    /** Llamar dentro de un gesto del usuario (el clic que activa la conversación): los navegadores no dejan sonar antes. */
    preparar() { void asegurar().resume().catch(() => {}) },
    async reproducir(pcmBase64: string, rate: number): Promise<void> {
      const c = asegurar(); await c.resume().catch(() => {})
      const m = pcm16Base64AMuestras(pcmBase64); if (!m.length) return
      const buffer = c.createBuffer(1, m.length, rate); buffer.copyToChannel(m as Float32Array<ArrayBuffer>, 0)
      this.detener()
      const s = c.createBufferSource(); s.buffer = buffer; s.connect(c.destination); fuente = s
      await new Promise<void>(res => { s.onended = () => { if (fuente === s) fuente = null; res() }; s.start() })
    },
    detener() { try { fuente?.stop() } catch { /* ya terminó */ } fuente = null },
    cerrar() { this.detener(); void ctx?.close(); ctx = null },
  }
}

/** Voz del navegador (plan B): resuelve cuando termina de hablar. */
export function hablarConNavegador(texto: string): Promise<void> {
  return new Promise(resolve => {
    const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!s || !texto) return resolve()
    s.cancel()
    const u = new SpeechSynthesisUtterance(texto)
    u.lang = 'es-CO'; u.rate = 1.05; u.pitch = 0.95
    const v = s.getVoices().find(x => x.lang?.toLowerCase().startsWith('es')); if (v) u.voice = v
    u.onend = () => resolve(); u.onerror = () => resolve()
    s.speak(u)
  })
}
export const callarNavegador = () => { try { window.speechSynthesis?.cancel() } catch { /* nada */ } }
