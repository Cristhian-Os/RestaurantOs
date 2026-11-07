/** Utilidades de audio puras: remuestreo, WAV en base64 y PCM de 16 bits de Gemini → muestras. */

/** Baja la frecuencia de muestreo promediando bloques (suficiente para voz). */
export function bajarMuestreo(datos: Float32Array, rateEntrada: number, rateSalida = 16000): Float32Array {
  if (rateSalida >= rateEntrada) return datos
  const razon = rateEntrada / rateSalida, n = Math.floor(datos.length / razon), out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * razon), b = Math.min(datos.length, Math.floor((i + 1) * razon))
    let s = 0; for (let k = a; k < b; k++) s += datos[k]
    out[i] = s / Math.max(1, b - a)
  }
  return out
}

const aBase64 = (bytes: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** WAV mono de 16 bits en base64 (cabecera "RIFF…WAVE": empieza por "UklGR"). */
export function aWavBase64(muestras: Float32Array, rate = 16000): string {
  const buf = new ArrayBuffer(44 + muestras.length * 2), v = new DataView(buf)
  const txt = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  txt(0, 'RIFF'); v.setUint32(4, 36 + muestras.length * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  txt(36, 'data'); v.setUint32(40, muestras.length * 2, true)
  for (let i = 0; i < muestras.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, muestras[i])) * 0x7fff, true)
  return aBase64(new Uint8Array(buf))
}

/** PCM de 16 bits (little-endian) en base64 → muestras en [-1, 1]. */
export function pcm16Base64AMuestras(b64: string): Float32Array {
  const bin = atob(b64), n = Math.floor(bin.length / 2), out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const lo = bin.charCodeAt(i * 2), hi = bin.charCodeAt(i * 2 + 1)
    const v = (hi << 8) | lo
    out[i] = (v >= 0x8000 ? v - 0x10000 : v) / 0x8000
  }
  return out
}

/** Energía (RMS) de un bloque de muestras. */
export function rms(m: Float32Array): number {
  if (!m.length) return 0
  let s = 0; for (let i = 0; i < m.length; i++) s += m[i] * m[i]
  return Math.sqrt(s / m.length)
}
