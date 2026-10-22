/** Reproduce el audio que devuelve Gemini (PCM de 16 bits) y se puede cortar al instante (interrupción). */

export function crearReproductor() {
  let ctx: AudioContext | null = null, fuente: AudioBufferSourceNode | null = null
  let fuentesFlujo: AudioBufferSourceNode[] = [], cancelarFlujo: (() => void) | null = null, generacion = 0
  const asegurar = () => {
    if (!ctx) { const Ctx = window.AudioContext || (window as any).webkitAudioContext; ctx = new Ctx() }
    return ctx!
  }
  return {
    /** Llamar dentro de un gesto del usuario (el clic que activa la conversación): los navegadores no dejan sonar antes. */
    preparar() { void asegurar().resume().catch(() => {}) },
    /**
     * Reproduce un audio que llega por partes (PCM de 16 bits): empieza cuando hay ~0,2 s acumulados y encadena cada parte sin cortes.
     * Resuelve cuando terminó de sonar; si se llama a `detener()` (interrupción) se corta de inmediato.
     */
    async reproducirFlujo(f: { rate: number; leer(): Promise<{ done: boolean; value?: Uint8Array }>; cancelar(): void }): Promise<void> {
      const c = asegurar(); await c.resume().catch(() => {})
      this.detener()
      const mi = ++generacion
      const vigente = () => mi === generacion
      const programadas: AudioBufferSourceNode[] = []; fuentesFlujo = programadas; cancelarFlujo = () => f.cancelar()
      let siguiente = 0, impar: number | null = null, pendiente: Float32Array[] = [], pendientes = 0, iniciado = false
      const programar = (m: Float32Array) => {
        if (!m.length) return
        const b = c.createBuffer(1, m.length, f.rate); b.copyToChannel(m as Float32Array<ArrayBuffer>, 0)
        const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination)
        siguiente = Math.max(siguiente, c.currentTime + 0.02); s.start(siguiente); siguiente += b.duration; programadas.push(s)
      }
      const aMuestras = (bytes: Uint8Array): Float32Array => {
        let datos = bytes
        if (impar !== null) { const j = new Uint8Array(bytes.length + 1); j[0] = impar; j.set(bytes, 1); datos = j; impar = null }
        if (datos.length % 2) { impar = datos[datos.length - 1]; datos = datos.subarray(0, datos.length - 1) }
        const out = new Float32Array(datos.length / 2), v = new DataView(datos.buffer, datos.byteOffset, datos.byteLength)
        for (let i = 0; i < out.length; i++) out[i] = v.getInt16(i * 2, true) / 0x8000
        return out
      }
      try {
        while (vigente()) {
          const { done, value } = await f.leer()
          if (!vigente()) return
          if (done) break
          if (!value?.length) continue
          const m = aMuestras(value)
          if (iniciado) { programar(m); continue }
          pendiente.push(m); pendientes += m.length
          if (pendientes >= f.rate * 0.2) { iniciado = true; siguiente = c.currentTime + 0.05; for (const p of pendiente) programar(p); pendiente = [] }
        }
      } catch { /* flujo cortado: se reproduce lo que llegó */ }
      if (!vigente()) return
      if (!iniciado) { siguiente = c.currentTime + 0.05; for (const p of pendiente) programar(p) }
      const ultima = programadas[programadas.length - 1]
      if (ultima) await new Promise<void>(res => { ultima.onended = () => res(); if (!vigente()) res() })
      if (vigente()) { fuentesFlujo = []; cancelarFlujo = null }
    },
    detener() {
      generacion++
      try { fuente?.stop() } catch { /* ya terminó */ } fuente = null
      for (const s of fuentesFlujo) { try { s.stop() } catch { /* ya terminó */ } }   // al parar, su onended libera la espera de reproducirFlujo
      fuentesFlujo = []
      try { cancelarFlujo?.() } catch { /* nada */ } cancelarFlujo = null
    },
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
