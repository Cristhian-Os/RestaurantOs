// Reglas puras de la conversación por Telegram (sin red ni base de datos). Se prueban con:  node supabase/functions/central-telegram-chat/logica.test.ts
// Seguridad: solo se atiende al chat del dueño y solo si Telegram manda el secreto del webhook. Desde Telegram SOLO se puede: conversar, ver el estado y APAGAR.
// Encender los agentes, aprobar o gastar se hace dentro de Central con tu código de 2 pasos: nunca por este canal.

export interface MensajeTelegram { updateId: number; chatId: string; fromId: string; texto: string }
export type Comando = 'start' | 'ayuda' | 'estado' | 'apagar'

/** Saca lo necesario de un "update" de Telegram. Devuelve null si no es un mensaje de texto de una conversación privada. */
export function leerMensaje(update: unknown): MensajeTelegram | null {
  const u = (update && typeof update === 'object' ? update : {}) as { update_id?: unknown; message?: { chat?: { id?: unknown; type?: unknown }; from?: { id?: unknown; is_bot?: unknown }; text?: unknown } }
  const m = u.message
  if (!m || typeof m.text !== 'string' || m.text.trim() === '') return null
  if (typeof u.update_id !== 'number' || !Number.isFinite(u.update_id)) return null
  if (m.chat?.type !== 'private' || m.from?.is_bot === true) return null
  const chat = m.chat?.id, from = m.from?.id
  if ((typeof chat !== 'number' && typeof chat !== 'string') || (typeof from !== 'number' && typeof from !== 'string')) return null
  return { updateId: u.update_id, chatId: String(chat), fromId: String(from), texto: m.text.replace(/\u0000/g, '').trim().slice(0, 2000) }
}

/** Solo el dueño: el chat Y la persona deben coincidir con el chat_id configurado en el servidor. */
export const esDelDueno = (m: MensajeTelegram, chatConfigurado: string) => chatConfigurado !== '' && m.chatId === chatConfigurado && m.fromId === chatConfigurado

/** Comparación del secreto en tiempo constante (no revela cuántos caracteres acertó). */
export function iguales(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export function comando(texto: string): Comando | null {
  const t = texto.trim().toLowerCase().replace(/@\w+$/, '')
  if (t === '/start') return 'start'
  if (t === '/ayuda' || t === '/help') return 'ayuda'
  if (t === '/estado') return 'estado'
  if (t === '/apagar') return 'apagar'
  return null
}

/** Telegram admite 4096 caracteres por mensaje: se parte en trozos más cortos, sin cortar palabras. */
export function partir(texto: string, max = 3500): string[] {
  const t = texto.trim()
  if (t.length <= max) return t ? [t] : []
  const trozos: string[] = []
  let resto = t
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n', max)
    if (corte < max * 0.5) corte = resto.lastIndexOf(' ', max)
    if (corte < max * 0.5) corte = max
    trozos.push(resto.slice(0, corte).trim()); resto = resto.slice(corte).trim()
  }
  if (resto) trozos.push(resto)
  return trozos
}

export interface EstadoOficina {
  agentesActivos: boolean; campanasVigentes: number; prospectos: number; prospectosPorVerificar: number
  trabajosHoy: Record<string, number>; gastoMes: number; topeMes: number; pausados: string[]
}
const ETQ: Record<string, string> = { succeeded: 'terminados', failed: 'fallidos', running: 'corriendo', pending: 'en espera', retrying: 'reintentando', paused: 'en pausa', cancelled: 'cancelados', expired: 'vencidos' }
const usd = (n: number) => `US$ ${n.toFixed(2)}`

export function textoEstado(e: EstadoOficina): string {
  const tr = Object.entries(e.trabajosHoy).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${ETQ[k] ?? k}`).join(', ')
  return [
    `Agentes: ${e.agentesActivos ? 'ENCENDIDOS' : 'apagados'}.`,
    `Campañas vigentes: ${e.campanasVigentes}.`,
    `Prospectos: ${e.prospectos} (${e.prospectosPorVerificar} por verificar).`,
    `Trabajos de hoy: ${tr || 'ninguno'}.`,
    `Gasto de IA este mes: ${usd(e.gastoMes)} de ${usd(e.topeMes)}.`,
    e.pausados.length ? `Pausado por fallos: ${e.pausados.join(', ')}.` : '',
  ].filter(Boolean).join('\n')
}

export const TEXTO_AYUDA = [
  'Puedes escribirme con normalidad y te respondo como Chef Mayor.',
  'Comandos: /estado (cómo va la oficina) · /apagar (frena todos los agentes) · /ayuda.',
  'Por seguridad, encender los agentes, aprobar contenido o gastar se hace dentro de Central con tu código de 2 pasos, no por aquí.',
].join('\n')

/** Bloque que se le da a la IA para que hable con datos reales y no invente. */
export function contextoParaIA(e: EstadoOficina): string {
  return `Hablas por Telegram con Cristhian (el dueño). Datos reales de hoy (úsalos y NO inventes otros; si no sabes algo, dilo):\n${textoEstado(e)}\nPor este canal solo puedes conversar: no ejecutas acciones, no contactas a nadie, no publicas. Si te pide algo así, explícale cómo hacerlo en Central o qué propones. Responde corto (máximo 6 frases) y en español sencillo.`
}
