// Entrega al hilo principal bloques de 1024 muestras del micrófono (AudioWorklet). Lo carga src/lib/resti/voz/captura.ts.
class CapturaResti extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0 }
  process(entradas) {
    const c = entradas[0] && entradas[0][0]
    if (!c) return true
    for (let i = 0; i < c.length; i++) {
      this.buf[this.n++] = c[i]
      if (this.n === 1024) { this.port.postMessage(this.buf.slice(0)); this.n = 0 }
    }
    return true
  }
}
registerProcessor('resti-captura', CapturaResti)
