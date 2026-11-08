// Pruebas del bot y de la cola con "puertos" falsos (sin red ni base). Correr con:  node supabase/functions/_shared/whatsapp_nucleo.test.ts
import assert from 'node:assert/strict'
import { procesarWebhook, procesarCola, textoEstado, type Puertos } from './whatsapp_nucleo.ts'

type Llamada = { n: string; a: Record<string, any> }
// rpc falso: respuestas por nombre; registra todo lo que se llama.
function armar(resp: Record<string, any>, graph: (url: string, init?: any) => Promise<any> = async () => ({ ok: false, status: 500, json: async () => ({}) })) {
  const llamadas: Llamada[] = [], subidas: { ruta: string; mime: string; bytes: number }[] = [], peticiones: string[] = []
  const p: Puertos = {
    rpc: async (n, a = {}) => { llamadas.push({ n, a }); const r = typeof resp[n] === 'function' ? resp[n](a) : resp[n]; return { data: r ?? null, error: null } },
    fetch: (async (url: string, init?: any) => { peticiones.push(String(url)); return graph(String(url), init) }) as any,
    graphBase: 'https://stub.local', ahora: () => 1700000000000,
    subirComprobante: async (ruta, bytes, mime) => { subidas.push({ ruta, mime, bytes: bytes.length }); return null },
  }
  return { p, llamadas, subidas, peticiones, textos: () => llamadas.filter(l => l.n === 'wa_bot_responder').map(l => l.a.p_texto as string) }
}
const msg = (m: any) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: '111' }, contacts: [{ wa_id: '573001112233', profile: { name: 'Ana' } }], messages: [{ from: '573001112233', id: 'w' + Math.random(), ...m }] } }] }] })
const texto = (t: string) => msg({ type: 'text', text: { body: t } })
const base = { wa_config_por_numero: { restaurant_id: 'R1', modo: 'bot' }, wa_registrar_entrante: { duplicado: false, conversacion_id: 'C1', telefono: '573001112233', es_repartidor: false }, wa_bot_menu_turno: true }

// Número desconocido: no se hace nada
{ const t = armar({ wa_config_por_numero: null }); await procesarWebhook(t.p, texto('hola')); assert.equal(t.llamadas.filter(l => l.n !== 'wa_config_por_numero').length, 0) }
// Duplicado: no responde
{ const t = armar({ ...base, wa_registrar_entrante: { duplicado: true } }); await procesarWebhook(t.p, texto('estado')); assert.deepEqual(t.textos(), []) }
// BAJA en modo bot: registra y confirma; en modo manual: registra y NO responde
{
  const t = armar(base); await procesarWebhook(t.p, texto('BAJA'))
  assert.equal(t.llamadas.filter(l => l.n === 'wa_registrar_baja').length, 1); assert.match(t.textos()[0], /no volverás a recibir/)
  const m = armar({ ...base, wa_config_por_numero: { restaurant_id: 'R1', modo: 'manual' } }); await procesarWebhook(m.p, texto('baja'))
  assert.equal(m.llamadas.filter(l => l.n === 'wa_registrar_baja').length, 1); assert.deepEqual(m.textos(), [])
  const m2 = armar({ ...base, wa_config_por_numero: { restaurant_id: 'R1', modo: 'manual' } }); await procesarWebhook(m2.p, texto('hola'))
  assert.deepEqual(m2.textos(), [])    // manual: solo guarda
}
// Repartidor: código bien / mal / bloqueado / sin código
{
  const rep = { ...base, wa_registrar_entrante: { ...base.wa_registrar_entrante, es_repartidor: true } }
  let t = armar({ ...rep, dom_cerrar_entrega_bot: { ok: true, numero: 7 } }); await procesarWebhook(t.p, texto('1234'))
  assert.equal(t.llamadas.find(l => l.n === 'dom_cerrar_entrega_bot')!.a.p_codigo, '1234'); assert.deepEqual(t.textos(), ['Entrega cerrada ✅'])
  t = armar({ ...rep, dom_cerrar_entrega_bot: { ok: false, motivo: 'incorrecto' } }); await procesarWebhook(t.p, texto('9999')); assert.match(t.textos()[0], /incorrecto/)
  t = armar({ ...rep, dom_cerrar_entrega_bot: { ok: false, motivo: 'bloqueado' } }); await procesarWebhook(t.p, texto('9999')); assert.match(t.textos()[0], /Demasiados intentos/)
  t = armar({ ...rep, wa_dom_de_repartidor: { n: 1, numero: 12 } }); await procesarWebhook(t.p, texto('entregado'))
  assert.match(t.textos()[0], /pedido #12/); assert.equal(t.llamadas.filter(l => l.n === 'dom_cerrar_entrega_bot').length, 0)   // pide el código, NO cierra
  t = armar({ ...rep, wa_dom_de_repartidor: { n: 0 } }); await procesarWebhook(t.p, texto('listo')); assert.match(t.textos()[0], /No tienes entregas/)
}
// Cliente: estado, menú con tope, aviso de pago pendiente
{
  let t = armar({ ...base, wa_dom_de_cliente: { id: 'D1', estado: 'en_camino', eta_min: 10, numero: 5, pago_estado: 'confirmado', metodo_pago: 'transferencia' } })
  await procesarWebhook(t.p, texto('ESTADO')); assert.match(t.textos()[0], /pedido #5 va en camino\. Tiempo estimado: 10 min/)
  t = armar({ ...base, wa_dom_de_cliente: null }); await procesarWebhook(t.p, texto('hola')); assert.match(t.textos()[0], /Escribe ESTADO/)
  t = armar({ ...base, wa_bot_menu_turno: false }); await procesarWebhook(t.p, texto('hola')); assert.deepEqual(t.textos(), [])    // ya hubo una respuesta en 30 min
  t = armar({ ...base, wa_dom_de_cliente: { id: 'D1', estado: 'recibido', pago_estado: 'pendiente_comprobante', metodo_pago: 'transferencia' } })
  await procesarWebhook(t.p, texto('ya hice el pedido')); assert.match(t.textos()[0], /pasa a cocina cuando el cajero confirme tu pago por transferencia/)
}
// Comprobante: descarga (stub de Graph) → sube a <restaurante>/<domicilio>-<ts>.jpg → adjunta
{
  const graph = async (url: string) => url === 'https://stub.local/v21.0/media1'
    ? { ok: true, json: async () => ({ url: 'https://cdn.stub.local/file', mime_type: 'image/jpeg' }) }
    : { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }
  const t = armar({ ...base, wa_dom_de_cliente: { id: 'D1', pago_estado: 'pendiente_comprobante' }, wa_leer_token: 'TOKEN-R1', dom_adjuntar_comprobante_bot: 'D1' }, graph)
  await procesarWebhook(t.p, msg({ type: 'image', image: { id: 'media1', mime_type: 'image/jpeg' } }))
  assert.deepEqual(t.subidas, [{ ruta: 'R1/D1-1700000000000.jpg', mime: 'image/jpeg', bytes: 4 }])
  assert.equal(t.llamadas.find(l => l.n === 'dom_adjuntar_comprobante_bot')!.a.p_path, 'R1/D1-1700000000000.jpg')
  assert.deepEqual(t.textos(), ['Recibimos tu comprobante, el cajero lo confirmará.'])
  assert.deepEqual(t.peticiones.slice(0, 2), ['https://stub.local/v21.0/media1', 'https://cdn.stub.local/file'])
  // PDF: no se descarga, pide foto
  const t2 = armar({ ...base, wa_dom_de_cliente: { id: 'D1', pago_estado: 'pendiente_comprobante' }, wa_leer_token: 'TOKEN-R1' }, graph)
  await procesarWebhook(t2.p, msg({ type: 'document', document: { id: 'media2', mime_type: 'application/pdf' } }))
  assert.equal(t2.peticiones.length, 0); assert.match(t2.textos()[0], /foto/)
}
// Cola: texto dentro de ventana OK; fuera de ventana falla sin llamar a Meta; error de Meta → reintento; token nunca en el error
{
  const fila = (o: any) => ({ id: 'M1', restaurant_id: 'R1', telefono: '573001112233', tipo: 'texto', contenido: { texto: 'Hola' }, intentos: 0, phone_number_id: '111', dentro_ventana: true, plantilla: null, ...o })
  const marcas: any[] = []
  const comun = (filas: any[]) => ({ wa_recordar_repartidores: 2, wa_reclamar_cola: filas, wa_leer_token: 'EAAGsecretotokensecretotoken1234', wa_marcar_envio: (a: any) => { marcas.push(a); return a.p_ok ? 'enviado' : a.p_definitivo ? 'fallido' : 'en_cola' } })
  let t = armar(comun([fila({})]), async () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.OK' }] }) }))
  let r = await procesarCola(t.p); assert.deepEqual(r, { enviados: 1, reintentos: 0, fallidos: 0, recordatorios: 2 })
  assert.equal(marcas.at(-1).p_wa_id, 'wamid.OK'); assert.equal(t.peticiones[0], 'https://stub.local/v21.0/111/messages')
  t = armar(comun([fila({ dentro_ventana: false })])); r = await procesarCola(t.p)
  assert.equal(r.fallidos, 1); assert.equal(t.peticiones.length, 0); assert.match(marcas.at(-1).p_error, /24 horas/)
  t = armar(comun([fila({})]), async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 190, message: 'Invalid OAuth access token EAAGsecretotokensecretotoken1234' } }) }))
  r = await procesarCola(t.p); assert.equal(r.reintentos, 1); assert.ok(!marcas.at(-1).p_error.includes('EAAGsecreto')); assert.match(marcas.at(-1).p_error, /190/)
  t = armar(comun([fila({})]), async () => { throw new Error('red caída') }); r = await procesarCola(t.p); assert.equal(r.reintentos, 1)
  // sin token cargado: reintento (no gira en falso: la propia reclamación ya salta restaurantes sin credenciales)
  t = armar({ ...comun([fila({})]), wa_leer_token: null }); r = await procesarCola(t.p); assert.equal(r.reintentos, 1)
}
assert.match(textoEstado({ numero: 3, estado: 'preparando' }), /pedido #3 se está preparando/)

// ── ALTA y cerebro del bot ──────────────────────────────────────────────────
{
  // ALTA: se registra (aun en modo manual) y el bot confirma solo si está en modo bot
  let t = armar({ ...base, wa_registrar_alta: true }); await procesarWebhook(t.p, texto('ALTA'))
  assert.equal(t.llamadas.filter(l => l.n === 'wa_registrar_alta').length, 1); assert.match(t.textos()[0], /avisos de tus pedidos/)
  t = armar({ ...base, wa_config_por_numero: { restaurant_id: 'R1', modo: 'manual' }, wa_registrar_alta: true }); await procesarWebhook(t.p, texto('alta'))
  assert.equal(t.llamadas.filter(l => l.n === 'wa_registrar_alta').length, 1); assert.deepEqual(t.textos(), [])
  t = armar({ ...base, wa_registrar_alta: false }); await procesarWebhook(t.p, texto('Alta')); assert.match(t.textos()[0], /Ya estabas/)

  // Con cerebro: el texto del cliente va al cerebro y sus respuestas salen por la cola; ya no hay respuesta genérica
  const visto: any[] = []
  const cerebro = { responder: async (e: any) => { visto.push(e); return { textos: ['uno', 'dos'] } }, transcribir: async (_b: Uint8Array, mime: string) => (mime.startsWith('audio/') ? 'quiero una hamburguesa' : null) }
  t = armar({ ...base, wa_registrar_entrante: { duplicado: false, conversacion_id: 'C1', mensaje_id: 'M9', telefono: '573001112233', es_repartidor: false } }); t.p.cerebro = cerebro
  await procesarWebhook(t.p, texto('hola, ¿qué tienen?'))
  assert.deepEqual(t.textos(), ['uno', 'dos']); assert.equal(visto[0].rid, 'R1'); assert.equal(visto[0].convId, 'C1'); assert.equal(visto[0].mensajeId, 'M9'); assert.equal(visto[0].texto, 'hola, ¿qué tienen?')
  assert.equal(t.llamadas.filter(l => l.n === 'wa_bot_menu_turno').length, 0)
  // BAJA y ESTADO siguen siendo deterministas: no pasan por el modelo
  visto.length = 0
  t = armar({ ...base, wa_dom_de_cliente: null }); t.p.cerebro = cerebro; await procesarWebhook(t.p, texto('baja')); await procesarWebhook(t.p, texto('estado'))
  assert.equal(visto.length, 0)
  // Si el cerebro falla, el cliente no se queda sin respuesta
  t = armar({ ...base }); t.p.cerebro = { responder: async () => { throw new Error('boom') } }; await procesarWebhook(t.p, texto('hola'))
  assert.match(t.textos()[0], /problema para responderte/)
  // Un repartidor nunca llega al cerebro
  visto.length = 0
  t = armar({ ...base, wa_registrar_entrante: { duplicado: false, conversacion_id: 'C1', telefono: '573001112233', es_repartidor: true } }); t.p.cerebro = cerebro; await procesarWebhook(t.p, texto('hola'))
  assert.equal(visto.length, 0)
  // Audio: se descarga, se transcribe y el cerebro recibe el TEXTO (y la transcripción para guardarla)
  const graphAudio = async (url: string) => url.endsWith('/audio1') ? { ok: true, status: 200, json: async () => ({ url: 'https://cdn.stub.local/a', mime_type: 'audio/ogg; codecs=opus' }) } : { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
  t = armar({ ...base, wa_leer_token: 'TOKEN-R1' }, graphAudio); t.p.cerebro = cerebro
  await procesarWebhook(t.p, msg({ type: 'audio', audio: { id: 'audio1', mime_type: 'audio/ogg; codecs=opus' } }))
  assert.equal(visto.at(-1).texto, 'quiero una hamburguesa'); assert.equal(visto.at(-1).transcripcion, 'quiero una hamburguesa')
  // Audio que no se pudo transcribir, o sin transcriptor: se pide por escrito
  t = armar({ ...base, wa_leer_token: 'TOKEN-R1' }, graphAudio); t.p.cerebro = { ...cerebro, transcribir: async () => null }
  await procesarWebhook(t.p, msg({ type: 'audio', audio: { id: 'audio1', mime_type: 'audio/ogg' } })); assert.match(t.textos()[0], /escribes/)
  t = armar({ ...base }); t.p.cerebro = { responder: cerebro.responder }
  await procesarWebhook(t.p, msg({ type: 'audio', audio: { id: 'audio1', mime_type: 'audio/ogg' } })); assert.match(t.textos()[0], /No puedo escuchar audios/)
}
console.log('whatsapp_nucleo: todo bien')
