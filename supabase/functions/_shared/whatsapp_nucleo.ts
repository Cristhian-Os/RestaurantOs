// Núcleo del bot y de la cola de envío. No importa nada de Deno ni de Supabase: recibe "puertos" (rpc, fetch, subida),
// así se prueba con falsos en Node (whatsapp_nucleo.test.ts) y las Edge Functions solo lo conectan.
import {
  GRAPH_VERSION, EXT_COMPROBANTE, construirEnvio, diceEntregado, esAlta, esBaja, extraerCodigo, parsearPayload, pideEstado, recortarError,
  type EventoWa, type MensajeCola, type MensajeEntrante,
} from './whatsapp.ts'
import { TXT_BOT } from './bot_logica.ts'

export type Rpc = (nombre: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
/** El cerebro del bot (bot_cerebro.ts). Si no se entrega, el bot queda como antes: respuestas fijas y una persona atiende. */
export type Cerebro = {
  responder: (e: { rid: string; convId: string; telefono: string; mensajeId: string | null; texto: string; transcripcion?: string | null }) => Promise<{ textos: string[] }>
  transcribir?: (bytes: Uint8Array, mime: string) => Promise<string | null>   // notas de voz; '' = sin voz, null = no se pudo
}
export type Puertos = {
  rpc: Rpc
  fetch: typeof fetch
  graphBase: string
  subirComprobante: (ruta: string, bytes: Uint8Array, mime: string) => Promise<string | null>   // devuelve mensaje de error o null
  ahora?: () => number
  cerebro?: Cerebro
}

const TXT = {
  baja: 'Listo, no volverás a recibir avisos ni promociones por este chat. Si cambias de opinión, escríbenos.',
  menu: 'Hola 👋 Escribe ESTADO para ver tu pedido. Si necesitas otra cosa, una persona del restaurante te responderá pronto.',
  pagoPendiente: 'Tu pedido pasa a cocina cuando el cajero confirme tu pago por transferencia. Envíanos aquí la foto del comprobante.',
  comprobanteOk: 'Recibimos tu comprobante, el cajero lo confirmará.',
  comprobanteMal: 'No pudimos recibir tu archivo. Envíalo como foto (imagen JPG o PNG), por favor.',
  entregaOk: 'Entrega cerrada ✅',
  codigoMal: 'Código incorrecto. Pídele de nuevo al cliente su código de 4 números.',
  bloqueado: 'Demasiados intentos con el código. Avisa al cajero para cerrar la entrega.',
  sinEntregas: 'No tienes entregas en camino para cerrar.',
  ayudaRepartidor: 'Para cerrar una entrega escribe el código de 4 números que te da el cliente.',
  sinPedido: 'No encontramos un pedido abierto con este número. Una persona del restaurante te responderá pronto.',
}

const ESTADO_TXT: Record<string, string> = {
  recibido: 'lo recibimos y lo estamos revisando',
  confirmado: 'está confirmado',
  preparando: 'se está preparando',
  listo: 'ya está listo',
  buscando_repartidor: 'ya está listo y estamos asignando quién lo lleve',
  asignado: 'ya tiene repartidor asignado',
  recogido: 'el repartidor ya lo recogió',
  en_camino: 'va en camino',
}

export function textoEstado(d: { numero?: number | null; estado: string; eta_min?: number | null; pago_estado?: string; metodo_pago?: string }): string {
  const num = d.numero ? ` #${d.numero}` : ''
  let t = `Tu pedido${num} ${ESTADO_TXT[d.estado] ?? 'está en proceso'}.`
  if (d.eta_min && ['recogido', 'en_camino', 'asignado', 'listo'].includes(d.estado)) t += ` Tiempo estimado: ${d.eta_min} min.`
  if (d.metodo_pago === 'transferencia' && d.pago_estado === 'pendiente_comprobante') t += ' Falta tu comprobante de transferencia: envíanos la foto aquí.'
  if (d.metodo_pago === 'transferencia' && d.pago_estado === 'comprobante_enviado') t += ' Estamos revisando tu comprobante.'
  return t
}

const ok = async <T>(p: Promise<{ data: T; error: { message: string } | null }>): Promise<T | null> => {
  const r = await p
  return r.error ? null : r.data
}

// ─── Descarga del comprobante desde la API de Meta ─────────────────────────
async function descargarMedia(p: Puertos, token: string, mediaId: string, aceptar: (mime: string) => boolean = m => !!EXT_COMPROBANTE[m], maxBytes = 5 * 1024 * 1024): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const h = { Authorization: `Bearer ${token}` }
  const meta = await p.fetch(`${p.graphBase}/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}`, { headers: h, signal: AbortSignal.timeout(10000) })
  if (!meta.ok) return null
  const info = await meta.json() as { url?: string; mime_type?: string }
  if (!info.url || !info.mime_type || !/^https:\/\//.test(info.url) || !aceptar(info.mime_type)) return null
  const bin = await p.fetch(info.url, { headers: h, signal: AbortSignal.timeout(20000) })
  if (!bin.ok) return null
  const bytes = new Uint8Array(await bin.arrayBuffer())
  if (bytes.length === 0 || bytes.length > maxBytes) return null     // comprobantes: el bucket acepta hasta 5 MB
  return { bytes, mime: info.mime_type }
}

// ─── Un mensaje entrante ───────────────────────────────────────────────────
async function atender(p: Puertos, rid: string, modo: string, m: MensajeEntrante): Promise<void> {
  const reg = await ok(p.rpc('wa_registrar_entrante', {
    p_rid: rid, p_telefono: m.de, p_nombre: m.nombre, p_wa_id: m.id, p_tipo: m.tipo,
    p_contenido: m.tipo === 'texto' ? { texto: m.texto } : { media_id: m.mediaId, mime: m.mime, caption: m.texto, lat: m.lat, lng: m.lng },
  }))
  if (!reg || reg.duplicado || reg.ignorado) return
  const tel: string = reg.telefono
  const decir = (texto: string, domId: string | null = null) => ok(p.rpc('wa_bot_responder', { p_rid: rid, p_telefono: tel, p_texto: texto, p_domicilio_id: domId }))
  // Respuestas "genéricas": como mucho una cada 30 min por conversación, y la conversación queda para el humano.
  const genericoUnaVez = async (texto: string) => { if (await ok(p.rpc('wa_bot_menu_turno', { p_conv: reg.conversacion_id }))) await decir(texto) }

  // BAJA: siempre se registra, también en modo manual. La confirmación solo la manda el bot.
  if (esBaja(m.texto)) {
    await p.rpc('wa_registrar_baja', { p_rid: rid, p_telefono: tel })
    if (modo === 'bot') await decir(TXT.baja)
    return
  }
  // ALTA: vuelve a recibir SOLO avisos de sus pedidos (las promociones se aceptan aparte). También se registra en modo manual.
  if (esAlta(m.texto)) {
    const cambio = await ok(p.rpc('wa_registrar_alta', { p_rid: rid, p_telefono: tel }))
    if (modo === 'bot') await decir(cambio ? TXT_BOT.alta : TXT_BOT.altaNada)
    return
  }
  if (modo !== 'bot') return

  if (reg.es_repartidor) {
    const codigo = extraerCodigo(m.texto)
    if (codigo) {
      const r = await ok(p.rpc('dom_cerrar_entrega_bot', { p_restaurant_id: rid, p_telefono: tel, p_codigo: codigo }))
      if (r?.ok) return void await decir(TXT.entregaOk)
      const motivo = r?.motivo
      return void await decir(motivo === 'bloqueado' ? TXT.bloqueado : motivo === 'sin_pedido' ? TXT.sinEntregas : TXT.codigoMal)
    }
    if (diceEntregado(m.texto)) {
      const info = await ok(p.rpc('wa_dom_de_repartidor', { p_rid: rid, p_telefono: tel }))
      if (!info || info.n === 0) return void await decir(TXT.sinEntregas)
      return void await decir(info.n === 1 && info.numero
        ? `¿Ya entregaste el pedido #${info.numero}? Escribe el código de 4 números del cliente.`
        : 'Escribe el código de 4 números del cliente para cerrar la entrega.')
    }
    return void await genericoUnaVez(TXT.ayudaRepartidor)
  }

  // Cliente
  if (m.tipo === 'imagen' || m.tipo === 'documento') {
    const dom = await ok(p.rpc('wa_dom_de_cliente', { p_rid: rid, p_telefono: tel, p_solo_pago: true }))
    if (dom) {
      const token = await ok(p.rpc('wa_leer_token', { p_rid: rid }))
      const media = token && m.mediaId && (!m.mime || EXT_COMPROBANTE[m.mime]) ? await descargarMedia(p, token, m.mediaId).catch(() => null) : null
      if (!media) return void await decir(TXT.comprobanteMal, dom.id)
      const ruta = `${rid}/${dom.id}-${(p.ahora ?? Date.now)()}.${EXT_COMPROBANTE[media.mime]}`
      if (await p.subirComprobante(ruta, media.bytes, media.mime)) return void await decir(TXT.comprobanteMal, dom.id)
      const id = await ok(p.rpc('dom_adjuntar_comprobante_bot', { p_restaurant_id: rid, p_telefono: tel, p_path: ruta }))
      return void await decir(id ? TXT.comprobanteOk : TXT.comprobanteMal, id ?? dom.id)
    }
  }
  if (pideEstado(m.texto)) {
    const dom = await ok(p.rpc('wa_dom_de_cliente', { p_rid: rid, p_telefono: tel, p_solo_pago: false }))
    return void await decir(dom ? textoEstado(dom) : TXT.sinPedido, dom?.id ?? null)
  }
  if (p.cerebro) return void await conCerebro(p, rid, reg, tel, m, decir)
  const pend = await ok(p.rpc('wa_dom_de_cliente', { p_rid: rid, p_telefono: tel, p_solo_pago: true }))
  return void await genericoUnaVez(pend?.pago_estado === 'pendiente_comprobante' ? TXT.pagoPendiente : TXT.menu)
}

// Mensaje de un cliente que no es BAJA/ALTA/ESTADO/comprobante: lo atiende el cerebro. Audio → texto primero.
async function conCerebro(p: Puertos, rid: string, reg: any, tel: string, m: MensajeEntrante, decir: (t: string) => Promise<unknown>): Promise<void> {
  const cb = p.cerebro!
  let texto = m.texto ?? '', transcripcion: string | null = null
  if (m.tipo === 'audio') {
    if (!cb.transcribir) return void await decir(TXT_BOT.noAudio)
    const token = await ok(p.rpc('wa_leer_token', { p_rid: rid }))
    const media = token && m.mediaId ? await descargarMedia(p, token, m.mediaId, mm => /^audio\//.test(mm), 1_300_000).catch(() => null) : null
    const t = media ? await cb.transcribir(media.bytes, media.mime).catch(() => null) : null
    if (!t) return void await decir(TXT_BOT.sinAudio)
    texto = t; transcripcion = t
  } else if (m.tipo === 'ubicacion') return void await decir(TXT_BOT.ubicacion)
  else if (m.tipo !== 'texto') return void await decir(TXT_BOT.soloTexto)
  if (!texto.trim()) return
  let textos: string[]
  try { textos = (await cb.responder({ rid, convId: reg.conversacion_id, telefono: tel, mensajeId: reg.mensaje_id ?? null, texto, transcripcion })).textos } catch (e) {
    console.error('whatsapp cerebro', recortarError(e)); textos = [TXT_BOT.falla]
  }
  for (const t of textos) await decir(t)
}

// ─── Webhook completo (ya con la firma verificada) ─────────────────────────
export async function procesarWebhook(p: Puertos, body: unknown): Promise<{ mensajes: number; estados: number }> {
  let nm = 0, ne = 0
  const eventos: EventoWa[] = parsearPayload(body)
  for (const ev of eventos) {
    const cfg = await ok(p.rpc('wa_config_por_numero', { p_phone_number_id: ev.phoneNumberId }))
    if (!cfg) continue                                   // número desconocido o WhatsApp desactivado: se ignora
    for (const s of ev.estados) { await p.rpc('wa_actualizar_estado', { p_rid: cfg.restaurant_id, p_wa_id: s.id, p_estado: s.estado, p_error: s.error }); ne++ }
    for (const m of ev.mensajes) {
      try { await atender(p, cfg.restaurant_id, cfg.modo, m); nm++ } catch (e) { console.error('whatsapp atender', recortarError(e)) }
    }
  }
  if (nm > 0) await procesarCola(p, 10).catch(e => console.error('whatsapp cola', recortarError(e)))    // que las respuestas salgan ya
  return { mensajes: nm, estados: ne }
}

// ─── Cola de envío ─────────────────────────────────────────────────────────
export async function procesarCola(p: Puertos, limite = 20): Promise<{ enviados: number; reintentos: number; fallidos: number; recordatorios: number }> {
  const res = { enviados: 0, reintentos: 0, fallidos: 0, recordatorios: 0 }
  const rec = await ok(p.rpc('wa_recordar_repartidores'))
  if (typeof rec === 'number') res.recordatorios = rec
  const filas = (await ok(p.rpc('wa_reclamar_cola', { p_limite: limite }))) as MensajeCola[] | null
  const tokens = new Map<string, string | null>()
  for (const m of filas ?? []) {
    const marcar = (okEnvio: boolean, waId: string | null, error: string | null, definitivo = false) =>
      ok(p.rpc('wa_marcar_envio', { p_id: m.id, p_ok: okEnvio, p_wa_id: waId, p_error: error, p_definitivo: definitivo }))
    const fin = (estado: string | null) => { if (estado === 'enviado') res.enviados++; else if (estado === 'fallido') res.fallidos++; else res.reintentos++ }
    const plan = construirEnvio(m)
    if ('fallo' in plan) { fin(await marcar(false, null, plan.fallo, true)); continue }
    if (!tokens.has(m.restaurant_id)) tokens.set(m.restaurant_id, await ok(p.rpc('wa_leer_token', { p_rid: m.restaurant_id })))
    const token = tokens.get(m.restaurant_id)
    if (!token) { fin(await marcar(false, null, 'Este restaurante no tiene el token de WhatsApp cargado')); continue }
    try {
      const r = await p.fetch(`${p.graphBase}/${GRAPH_VERSION}/${encodeURIComponent(m.phone_number_id)}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(plan.cuerpo), signal: AbortSignal.timeout(15000),
      })
      const j = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } }
      if (r.ok) fin(await marcar(true, j.messages?.[0]?.id ?? null, null))
      else fin(await marcar(false, null, recortarError(`Meta ${r.status} ${j.error?.code ?? ''}: ${j.error?.message ?? ''}`)))
    } catch (e) {
      fin(await marcar(false, null, recortarError(e)))
    }
  }
  return res
}
