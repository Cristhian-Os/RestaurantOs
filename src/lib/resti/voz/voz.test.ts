// Pruebas de la conversación por voz (sin navegador). Correr con:  node src/lib/resti/voz/voz.test.ts
import assert from 'node:assert/strict'
import { bajarMuestreo, aWavBase64, pcm16Base64AMuestras, rms } from './pcm.ts'
import { crearVad } from './vad.ts'
import { partirFrases } from './frases.ts'
import { crearConversacion, MSG_NO_ENTENDI, MSG_ERROR, type DepsConv, type Frase, type EstadoConv } from './conversacion.ts'

// --- PCM / WAV ---
{
  const tono = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 20) * 0.5)
  const bajo = bajarMuestreo(tono, 48000, 16000); assert.equal(bajo.length, 16000)
  const wav = aWavBase64(bajo); assert.ok(wav.startsWith('UklGR'), 'cabecera RIFF'); assert.equal(atob(wav).slice(8, 12), 'WAVE'); assert.equal(atob(wav).length, 44 + 32000)
  const pcm = btoa(String.fromCharCode(0x00, 0x40, 0x00, 0xc0)), m = pcm16Base64AMuestras(pcm)   // +0.5 y -0.5
  assert.ok(Math.abs(m[0] - 0.5) < 1e-3 && Math.abs(m[1] + 0.5) < 1e-3)
  assert.ok(Math.abs(rms(Float32Array.from([0.5, -0.5, 0.5, -0.5])) - 0.5) < 1e-6)
}

// --- Frases ---
{
  assert.deepEqual(partirFrases('Hoy llevas un millón doscientos mil en ventas. Vas un doce por ciento arriba de ayer.'), ['Hoy llevas un millón doscientos mil en ventas.', 'Vas un doce por ciento arriba de ayer.'])
  assert.deepEqual(partirFrases('Listo. Ya quedó guardado en el sistema.'), ['Listo. Ya quedó guardado en el sistema.'], 'una frase muy corta se une')
  assert.deepEqual(partirFrases('  '), []); assert.deepEqual(partirFrases('Hola, ¿cómo vas?'), ['Hola, ¿cómo vas?'])
  assert.equal(partirFrases('Una frase larga uno. Una frase larga dos. Una frase larga tres. Una frase larga cuatro.').length, 3, 'máximo 3 audios')
  assert.equal(partirFrases('A. B. C. D.').join(' ').replace(/\s+/g, ' '), 'A. B. C. D.', 'no se pierde texto')
}

// --- VAD ---
{
  const vad = crearVad({ bloqueMs: 32 }), ev: string[] = []
  const alimentar = (energia: number, ms: number) => { for (let t = 0; t < ms; t += 32) { const e = vad.procesar(energia); if (e) ev.push(e) } }
  alimentar(0.003, 1000)            // ambiente
  alimentar(0.2, 90)                // golpe corto: no es voz
  alimentar(0.003, 500)
  assert.deepEqual(ev, [], 'un clic no abre una frase')
  alimentar(0.15, 1200)             // habla
  assert.deepEqual(ev, ['inicio'])
  alimentar(0.003, 400); assert.deepEqual(ev, ['inicio'], 'una pausa corta no cierra la frase')
  alimentar(0.15, 600)              // sigue hablando
  alimentar(0.003, 900); assert.deepEqual(ev, ['inicio', 'fin'])
  assert.ok(vad.vozMs() > 1500)
  // ambiente ruidoso: el umbral se adapta
  const v2 = crearVad({ bloqueMs: 32 }), e2: string[] = []
  for (let t = 0; t < 3000; t += 32) { const e = v2.procesar(0.02); if (e) e2.push(e) }   // ruido constante de 0.02
  assert.deepEqual(e2, [], 'el ruido constante no se confunde con voz')
  for (let t = 0; t < 600; t += 32) { const e = v2.procesar(0.3); if (e) e2.push(e) }
  assert.deepEqual(e2, ['inicio'], 'la voz sobre el ruido sí')
}

// VAD con habla silábica: pulsos de voz con huecos de ~120 ms entre sílabas no deben impedir la detección
{
  const vad = crearVad({ bloqueMs: 21, calibracionMs: 100 }), ev: string[] = []
  const bloque = (e: number, n: number) => { for (let i = 0; i < n; i++) { const x = vad.procesar(e); if (x) ev.push(x) } }
  bloque(0.004, 20)
  for (let sílaba = 0; sílaba < 5; sílaba++) { bloque(0.18, 6); bloque(0.006, 6) }   // ~125 ms de voz, ~125 ms de hueco
  assert.deepEqual(ev, ['inicio'], 'las sílabas con huecos cuentan como una frase')
  const v2 = crearVad({ bloqueMs: 21, calibracionMs: 100 }); v2.ajustar({ umbralMin: 0.03, factorRuido: 5, inicioMs: 320 })   // más exigente (Resti hablando)
  const e2: string[] = []; const b2 = (e: number, n: number) => { for (let i = 0; i < n; i++) { const x = v2.procesar(e); if (x) e2.push(x) } }
  b2(0.004, 20); for (let k = 0; k < 6; k++) { b2(0.18, 6); b2(0.006, 6) }
  assert.deepEqual(e2, ['inicio'], 'también al interrumpir')
  const v3 = crearVad({ bloqueMs: 21, calibracionMs: 100 }); const e3: string[] = []
  for (let k = 0; k < 40; k++) { for (let i = 0; i < 3; i++) { const x = v3.procesar(0.2); if (x) e3.push(x) } for (let i = 0; i < 40; i++) { const x = v3.procesar(0.004); if (x) e3.push(x) } }   // golpes sueltos de 60 ms, muy separados
  assert.deepEqual(e3, [], 'golpes aislados no son voz')
}

// --- Conversación ---
const esperar = (ms = 5) => new Promise(r => setTimeout(r, ms))
function montar(over: Partial<DepsConv> = {}) {
  const estados: EstadoConv[] = [], dicho: string[] = [], textos: string[] = [], errores: string[] = []
  let cb!: { onFrase(f: Frase): void; onInicioHabla(): void }; let silenciados = 0, detenida = 0; const sens: string[] = []
  const deps: DepsConv = {
    iniciarCaptura: async c => { cb = c; return { detener: () => { detenida++ }, sensibilidad: m => sens.push(m) } },
    transcribir: async () => 'ventas de hoy', responder: async t => `Respuesta a ${t}`,
    hablar: async t => { dicho.push(t); await esperar(20) }, silenciar: () => { silenciados++ },
    onEstado: e => estados.push(e), onError: c => errores.push(c), onTexto: (r, t) => textos.push(`${r}:${t}`), ...over,
  }
  const conv = crearConversacion(deps)
  return { conv, estados, dicho, textos, errores, cb: () => cb, silenciados: () => silenciados, detenida: () => detenida, sens }
}
{ // Camino feliz
  const t = montar(); await t.conv.iniciar(); t.cb().onFrase({ wav: 'UklGR' }); await esperar(80)
  assert.deepEqual(t.estados, ['iniciando', 'escuchando', 'transcribiendo', 'pensando', 'hablando', 'escuchando'])
  assert.deepEqual(t.dicho, ['Respuesta a ventas de hoy']); assert.deepEqual(t.textos, ['user:ventas de hoy', 'assistant:Respuesta a ventas de hoy'])
  assert.ok(t.sens.includes('baja') && t.sens[t.sens.length - 1] === 'normal', 'más exigente mientras habla y vuelve a normal')
  t.conv.detener(); assert.equal(t.conv.estado(), 'apagado'); assert.equal(t.detenida(), 1)
}
{ // Silencio o ruido: no responde
  const t = montar({ transcribir: async () => '' }); await t.conv.iniciar(); t.cb().onFrase({ wav: 'x' }); await esperar(40)
  assert.deepEqual(t.dicho, []); assert.equal(t.conv.estado(), 'escuchando')
}
{ // Texto ya reconocido (reconocimiento del navegador): no se transcribe
  let llamadas = 0; const t = montar({ transcribir: async () => { llamadas++; return 'x' } }); await t.conv.iniciar()
  t.cb().onFrase({ texto: 'hola resti' }); await esperar(80); assert.equal(llamadas, 0); assert.deepEqual(t.dicho, ['Respuesta a hola resti'])
}
{ // Interrupción: la persona habla encima y Resti se calla
  const t = montar({ responder: async () => 'una respuesta larga' , hablar: async x => { await esperar(200); void x } }); await t.conv.iniciar()
  t.cb().onFrase({ texto: 'a' }); await esperar(30); assert.equal(t.conv.estado(), 'hablando')
  t.cb().onInicioHabla(); assert.equal(t.silenciados() >= 1, true); assert.equal(t.conv.estado(), 'escuchando')
  t.cb().onFrase({ texto: 'mejor dime las mesas' }); await esperar(300)
  assert.equal(t.textos.filter(x => x.startsWith('user:')).length, 2)
}
{ // Errores: la conversación sigue y lo dice
  const a = montar({ transcribir: async () => { throw new Error('x') } }); await a.conv.iniciar(); a.cb().onFrase({ wav: 'x' }); await esperar(60)
  assert.deepEqual(a.errores, ['transcripcion']); assert.deepEqual(a.dicho, [MSG_NO_ENTENDI]); assert.equal(a.conv.estado(), 'escuchando')
  const b = montar({ responder: async () => { throw new Error('x') } }); await b.conv.iniciar(); b.cb().onFrase({ texto: 'hola' }); await esperar(60)
  assert.deepEqual(b.errores, ['cerebro']); assert.deepEqual(b.dicho, [MSG_ERROR])
  const c = montar({ hablar: async () => { throw new Error('x') } }); await c.conv.iniciar(); c.cb().onFrase({ texto: 'hola' }); await esperar(60)
  assert.deepEqual(c.errores, ['voz']); assert.equal(c.conv.estado(), 'escuchando', 'si falla la voz sigue funcionando (texto)')
  const d = montar({ iniciarCaptura: async () => { throw new Error('sin permiso') } }); await d.conv.iniciar()
  assert.deepEqual(d.errores, ['microfono']); assert.equal(d.conv.estado(), 'apagado')
}
{ // Frase mientras piensa: se atiende después, sin perderse
  let n = 0; const t = montar({ responder: async x => { await esperar(40); return `R${++n}:${x}` } }); await t.conv.iniciar()
  t.cb().onFrase({ texto: 'uno' }); await esperar(10); t.cb().onFrase({ texto: 'dos' }); await esperar(250)
  assert.deepEqual(t.dicho, ['R1:uno', 'R2:dos'])
}
{ // Detener a mitad de turno: nada habla después
  const t = montar({ responder: async () => { await esperar(50); return 'tarde' } }); await t.conv.iniciar(); t.cb().onFrase({ texto: 'x' }); await esperar(10); t.conv.detener(); await esperar(100)
  assert.deepEqual(t.dicho, []); assert.equal(t.conv.estado(), 'apagado')
}
// VAD: el fin de frase se mide también contra la voz de la propia frase (un zumbido más fuerte que el silencio de calibración no lo deja colgado)
{
  const v = crearVad({ bloqueMs: 20, calibracionMs: 200 })
  const alimentar = (e: number, ms: number) => { let r: string | null = null; for (let t = 0; t < ms; t += 20) { const x = v.procesar(e); if (x) r = x } return r }
  alimentar(0.03, 200)                      // calibra con ruido de fondo suave
  assert.equal(alimentar(0.5, 1600), 'inicio')   // habla fuerte
  assert.equal(alimentar(0.06, 1400), 'fin', 'con un zumbido de 0,06 (más que el 60 % del umbral) igual termina la frase')
  const w = crearVad({ bloqueMs: 20, calibracionMs: 100 })
  for (let t = 0; t < 100; t += 20) w.procesar(0.005)
  let ini = null as string | null; for (let t = 0; t < 400; t += 20) ini = w.procesar(0.4) ?? ini
  assert.equal(ini, 'inicio'); assert.equal(w.forzarFin(), 'fin', 'fin manual mientras habla'); assert.equal(w.forzarFin(), null, 'ya no está hablando')
}
console.log('voz.test OK (pcm, vad, conversación)')
