/**
 * Detector de voz por energía (VAD) con ruido de fondo adaptativo e histéresis.
 * Entrada: la energía (RMS) de cada bloque de audio. Salida: 'inicio' cuando la persona empieza a hablar y 'fin' tras un silencio.
 * Es deliberadamente sencillo y sin dependencias: corre en el hilo de audio sin cargar nada.
 */
export interface OpcionesVad {
  /** Duración de cada bloque que se le entrega (ms). */
  bloqueMs: number
  /** Energía mínima para considerar voz, aunque el ambiente sea silencioso. */
  umbralMin?: number
  /** Cuántas veces por encima del ruido de fondo debe estar la voz. */
  factorRuido?: number
  /** Voz continua necesaria para declarar el inicio (descarta golpes y clics). */
  inicioMs?: number
  /** Silencio necesario para declarar el fin de la frase. */
  finMs?: number
  /** Una frase no pasa de esto: se corta aunque siga hablando. */
  maxFraseMs?: number
  /** Al empezar se aprende el ruido del ambiente sin declarar voz (evita tomar un lugar ruidoso por voz). */
  calibracionMs?: number
}

export type EventoVad = 'inicio' | 'fin' | null

export function crearVad(o: OpcionesVad) {
  let umbralMin = o.umbralMin ?? 0.012, factor = o.factorRuido ?? 3, inicioMs = o.inicioMs ?? 100
  const finMs = o.finMs ?? 700, maxFraseMs = o.maxFraseMs ?? 15_000
  let pico = 0   // nivel típico de la voz en la frase actual: el fin se mide contra él, no solo contra el ruido de fondo (en un lugar ruidoso el silencio nunca baja del ruido)
  let ruido = 0.004, hablando = false, conVoz = 0, enSilencio = 0, duracion = 0, vozTotal = 0, calibrando = o.calibracionMs ?? 500

  return {
    procesar(energia: number): EventoVad {
      if (calibrando > 0) { calibrando -= o.bloqueMs; ruido = Math.max(0.0015, ruido * 0.7 + energia * 0.3); return null }
      const umbral = Math.max(umbralMin, ruido * factor)
      if (!hablando) {
        // El ruido de fondo se aprende rápido solo con lo que NO es voz; con lo que supera el umbral apenas se mueve (si no, la propia voz subiría el umbral).
        const alfa = energia > umbral ? 0.002 : 0.03
        ruido = Math.max(0.0015, ruido * (1 - alfa) + energia * alfa)
        // Acumulador con fuga: el habla real tiene huecos entre sílabas, así que un hueco resta la mitad en vez de reiniciar la cuenta.
        if (energia > umbral) { conVoz += o.bloqueMs; if (conVoz >= inicioMs) { hablando = true; enSilencio = 0; duracion = conVoz; vozTotal = conVoz; pico = energia; return 'inicio' } }
        else conVoz = Math.max(0, conVoz - o.bloqueMs * 0.5)
        return null
      }
      duracion += o.bloqueMs
      // Es silencio lo que cae por debajo de la histéresis (60 % del umbral) Y de una fracción de la voz de esta frase: así el fin se detecta aunque haya ruido de fondo.
      const umbralFin = Math.max(umbral * 0.6, pico * 0.22)
      if (energia > umbral) pico = pico * 0.9 + energia * 0.1
      if (energia > umbralFin) { enSilencio = 0; vozTotal += o.bloqueMs } else enSilencio += o.bloqueMs
      // Tras una frase larga basta una pausa más corta para entender que terminó; en una corta se espera un poco más (puede seguir).
      const espera = vozTotal > 1200 ? Math.max(500, finMs - 150) : finMs
      if (enSilencio >= espera || duracion >= maxFraseMs) { hablando = false; conVoz = 0; enSilencio = 0; return 'fin' }
      return null
    },
    /** Cambia la sensibilidad en caliente (p. ej. más exigente mientras Resti habla, para no oírse a sí misma). */
    ajustar(n: { umbralMin?: number; factorRuido?: number; inicioMs?: number }) { umbralMin = n.umbralMin ?? umbralMin; factor = n.factorRuido ?? factor; inicioMs = n.inicioMs ?? inicioMs },
    /** Fin manual (p. ej. la persona toca el micrófono mientras habla): cierra la frase ya, sin esperar el silencio. */
    forzarFin(): EventoVad { if (!hablando) return null; hablando = false; conVoz = 0; enSilencio = 0; return 'fin' },
    hablando: () => hablando,
    /** Milisegundos con voz en la frase actual (para descartar ruidos cortos). */
    vozMs: () => vozTotal,
  }
}
