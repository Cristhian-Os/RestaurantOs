// Funciones puras de WhatsApp (sin red ni base de datos): firma de Meta, lectura del payload, textos, cuerpo de envío.
// Pruebas: node supabase/functions/_shared/whatsapp.test.ts

export const GRAPH_VERSION = 'v21.0'

// ─── Firma X-Hub-Signature-256 ────────────────────────────────────────────
function hexABytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function igualesConstante(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export function textoIgualConstante(a: string, b: string): boolean {
  const e = new TextEncoder()
  return igualesConstante(e.encode(a), e.encode(b))
}

export async function verificarFirmaMeta(secreto: string, cuerpoCrudo: string, cabecera: string | null): Promise<boolean> {
  if (!secreto || !cabecera || !cabecera.startsWith('sha256=')) return false
  const recibida = hexABytes(cabecera.slice(7))
  if (!recibida) return false
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const esperada = new Uint8Array(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpoCrudo)))
  return igualesConstante(esperada, recibida)
}

// ─── Texto ────────────────────────────────────────────────────────────────
// Minúsculas, sin tildes, sin signos, espacios simples.
export function normalizar(t: string | null | undefined): string {
  return (t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function esBaja(t: string | null | undefined): boolean {
  return ['baja', 'stop', 'dar de baja', 'darme de baja'].includes(normalizar(t))
}

/** ALTA: el cliente que se dio de baja vuelve a recibir SOLO avisos de sus pedidos (nunca promociones: eso se acepta aparte). */
export function esAlta(t: string | null | undefined): boolean {
  return ['alta', 'start', 'dar de alta', 'darme de alta', 'quiero recibir avisos'].includes(normalizar(t))
}

export function pideEstado(t: string | null | undefined): boolean {
  const n = normalizar(t)
  return n === 'estado' || n === 'mi pedido' || n === 'estado pedido' || n === 'estado de mi pedido' || n === 'donde esta mi pedido'
}

export function diceEntregado(t: string | null | undefined): boolean {
  const n = normalizar(t)
  return ['entregado', 'listo', 'ya entregue', 'entregue', 'ya lo entregue', 'ya esta entregado'].includes(n)
}

// Un mensaje corto con exactamente un grupo de 4 números ("1234" o "codigo 1234").
export function extraerCodigo(t: string | null | undefined): string | null {
  const n = normalizar(t)
  if (!n || n.length > 30) return null
  const m = n.match(/(?<![0-9])[0-9]{4}(?![0-9])/g)
  return m && m.length === 1 && n.replace(/[0-9]{4}/, '').replace(/\b(codigo|el|es|cod)\b/g, '').trim() === '' ? m[0] : null
}

// ─── Payload de Meta ──────────────────────────────────────────────────────
export type MensajeEntrante = {
  id: string; de: string; nombre: string | null
  tipo: 'texto' | 'imagen' | 'audio' | 'documento' | 'ubicacion' | 'otro'
  texto: string | null; mediaId: string | null; mime: string | null; lat: number | null; lng: number | null
}
export type EstadoMensaje = { id: string; estado: 'enviado' | 'entregado' | 'leido' | 'fallido'; error: string | null }
export type EventoWa = { phoneNumberId: string; mensajes: MensajeEntrante[]; estados: EstadoMensaje[] }

const MAPA_ESTADO: Record<string, EstadoMensaje['estado']> = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' }

export function parsearPayload(body: any): EventoWa[] {
  const out: EventoWa[] = []
  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return out
  for (const entry of body.entry) {
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = ch?.value
      const phoneNumberId = v?.metadata?.phone_number_id
      if (typeof phoneNumberId !== 'string' || !phoneNumberId) continue
      const nombres: Record<string, string> = {}
      for (const c of Array.isArray(v.contacts) ? v.contacts : []) if (c?.wa_id) nombres[String(c.wa_id)] = String(c?.profile?.name ?? '')
      const mensajes: MensajeEntrante[] = []
      for (const m of Array.isArray(v.messages) ? v.messages : []) {
        if (typeof m?.id !== 'string' || typeof m?.from !== 'string') continue
        const media = m.image ?? m.document ?? m.audio ?? null
        const tipo = m.type === 'text' ? 'texto' : m.type === 'image' ? 'imagen' : m.type === 'document' ? 'documento'
          : m.type === 'audio' ? 'audio' : m.type === 'location' ? 'ubicacion' : 'otro'
        mensajes.push({
          id: m.id, de: m.from, nombre: nombres[m.from] || null, tipo,
          texto: m.type === 'text' ? String(m.text?.body ?? '') : media?.caption ? String(media.caption) : null,
          mediaId: typeof media?.id === 'string' ? media.id : null, mime: typeof media?.mime_type === 'string' ? media.mime_type : null,
          lat: typeof m.location?.latitude === 'number' ? m.location.latitude : null, lng: typeof m.location?.longitude === 'number' ? m.location.longitude : null,
        })
      }
      const estados: EstadoMensaje[] = []
      for (const s of Array.isArray(v.statuses) ? v.statuses : []) {
        const est = MAPA_ESTADO[String(s?.status)]
        if (typeof s?.id !== 'string' || !est) continue
        const e0 = Array.isArray(s.errors) ? s.errors[0] : null
        estados.push({ id: s.id, estado: est, error: e0 ? recortarError(`${e0.code ?? ''} ${e0.title ?? e0.message ?? ''}`) : null })
      }
      out.push({ phoneNumberId, mensajes, estados })
    }
  }
  return out
}

// ─── Envío a la API de Meta ───────────────────────────────────────────────
export type MensajeCola = {
  id: string; restaurant_id: string; telefono: string; tipo: string; contenido: any; intentos: number
  phone_number_id: string; dentro_ventana: boolean
  plantilla: { nombre: string; idioma: string; variables: string[]; aprobada: boolean } | null
}

const limpiarParam = (v: unknown): string => {
  const s = (v === null || v === undefined ? '' : String(v)).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1000)
  return s || '-'     // Meta rechaza parámetros vacíos
}

// Devuelve el cuerpo para POST /{phone_number_id}/messages, o { fallo } si no se puede enviar (y no vale la pena reintentar).
export function construirEnvio(m: MensajeCola): { cuerpo: Record<string, unknown> } | { fallo: string } {
  if (m.tipo === 'plantilla') {
    if (!m.plantilla || !m.plantilla.aprobada) return { fallo: 'La plantilla no existe o aún no está aprobada por WhatsApp' }
    const vars = (m.contenido?.vars ?? {}) as Record<string, unknown>
    const parametros = m.plantilla.variables.map(nombre => ({ type: 'text', text: limpiarParam(vars[nombre]) }))
    return { cuerpo: {
      messaging_product: 'whatsapp', to: m.telefono, type: 'template',
      template: { name: m.plantilla.nombre, language: { code: m.plantilla.idioma || 'es' }, ...(parametros.length ? { components: [{ type: 'body', parameters: parametros }] } : {}) },
    } }
  }
  if (m.tipo === 'texto') {
    const texto = String(m.contenido?.texto ?? '').trim()
    if (!texto) return { fallo: 'Mensaje vacío' }
    if (!m.dentro_ventana) return { fallo: 'Pasaron más de 24 horas desde el último mensaje del cliente y no hay plantilla aprobada' }
    return { cuerpo: { messaging_product: 'whatsapp', to: m.telefono, type: 'text', text: { body: texto.slice(0, 4000), preview_url: false } } }
  }
  return { fallo: 'Tipo de mensaje no soportado para envío' }
}

// Error corto y sin secretos (tokens de Meta, cabeceras Bearer).
export function recortarError(e: unknown): string {
  const s = (e instanceof Error ? e.message : String(e ?? ''))
  return s.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***').replace(/EA[A-Za-z0-9]{20,}/g, '***').replace(/\s+/g, ' ').trim().slice(0, 500)
}

export const EXT_COMPROBANTE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
