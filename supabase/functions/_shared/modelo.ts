// callModel(): la ÚNICA puerta hacia un proveedor de IA de texto. Cambiar de proveedor es cambiar la configuración, no el resto del código.
//  - 'gemini': Google Gemini (respaldo mientras no haya otro configurado).
//  - 'compatible': cualquier proveedor con API estilo OpenAI (DeepSeek, Qwen, GLM, Kimi, etc.): solo cambian la URL base, el modelo y la clave.
// No lleva claves en el código: las recibe de quien llama (que las lee de platform_secrets con cargarProveedor).
// La voz (transcribir y hablar) NO pasa por aquí: va por la función resti-voz, siempre con Gemini.

export interface Turno { rol: 'user' | 'assistant'; texto: string }
export interface PedidoModelo {
  sistema: string
  usuario: string
  /** Turnos anteriores de la conversación (del más viejo al más nuevo), sin incluir `usuario`. */
  mensajes?: Turno[]
  maxTokens?: number
  temperatura?: number
  /** Salida en JSON (por defecto sí). */
  json?: boolean
  /** Tiempo máximo de espera en ms (por defecto 12 s). */
  timeoutMs?: number
}
export interface RespuestaModelo { texto: string; tokensEntrada: number; tokensSalida: number; proveedor: string; modelo: string }
export interface ConfigProveedor { proveedor: 'gemini' | 'compatible'; modelo: string; clave: string; urlBase?: string }
export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export const MODELO_POR_DEFECTO = 'gemini-2.5-flash'

type Obj = Record<string, any>

async function conTiempo<T>(ms: number, hacer: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try { return await hacer(ctl.signal) } catch (e) {
    if (ctl.signal.aborted) throw new Error('El proveedor tardó demasiado')
    throw e
  } finally { clearTimeout(t) }
}

async function llamarGemini(c: ConfigProveedor, p: PedidoModelo, f: Fetch): Promise<RespuestaModelo> {
  const contents = [
    ...(p.mensajes ?? []).map(m => ({ role: m.rol === 'assistant' ? 'model' : 'user', parts: [{ text: m.texto }] })),
    { role: 'user', parts: [{ text: p.usuario }] },
  ]
  const resp = await conTiempo(p.timeoutMs ?? 12_000, signal => f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.modelo)}:generateContent`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.clave },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: p.sistema }] },
      contents,
      // Sin "pensar" de más: es redactar con datos ya calculados, no razonar; ahorra costo.
      generationConfig: { maxOutputTokens: p.maxTokens ?? 1500, temperature: p.temperatura ?? 0.2, ...(p.json === false ? {} : { responseMimeType: 'application/json' }), thinkingConfig: { thinkingBudget: 0 } },
    }),
  }))
  const d = (await resp.json()) as Obj
  if (!resp.ok) throw new Error(`El proveedor respondió ${resp.status}`)
  const texto = ((d?.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]).map(x => x.text ?? '').join('').trim()
  const u = d?.usageMetadata ?? {}
  return { texto, tokensEntrada: Number(u.promptTokenCount) || 0, tokensSalida: (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0), proveedor: 'gemini', modelo: c.modelo }
}

async function llamarCompatible(c: ConfigProveedor, p: PedidoModelo, f: Fetch): Promise<RespuestaModelo> {
  if (!c.urlBase) throw new Error('Falta la URL del proveedor')
  const json = p.json !== false
  // El modo JSON de estos proveedores exige que la palabra "json" aparezca en el mensaje.
  const sistema = json && !/json/i.test(p.sistema + p.usuario) ? `${p.sistema}\n\nResponde únicamente con un objeto JSON.` : p.sistema
  const resp = await conTiempo(p.timeoutMs ?? 12_000, signal => f(`${c.urlBase!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.clave}` },
    body: JSON.stringify({
      model: c.modelo, temperature: p.temperatura ?? 0.2, max_tokens: p.maxTokens ?? 1500, ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: sistema },
        ...(p.mensajes ?? []).map(m => ({ role: m.rol, content: m.texto })),
        { role: 'user', content: p.usuario },
      ],
    }),
  }))
  const d = (await resp.json()) as Obj
  if (!resp.ok) throw new Error(`El proveedor respondió ${resp.status}`)
  const u = d?.usage ?? {}
  return { texto: String(d?.choices?.[0]?.message?.content ?? '').trim(), tokensEntrada: Number(u.prompt_tokens) || 0, tokensSalida: Number(u.completion_tokens) || 0, proveedor: 'compatible', modelo: c.modelo }
}

export function callModel(c: ConfigProveedor, p: PedidoModelo, f: Fetch): Promise<RespuestaModelo> {
  if (!c.clave) throw new Error('Falta la clave del proveedor')
  return c.proveedor === 'compatible' ? llamarCompatible(c, p, f) : llamarGemini(c, p, f)
}

/** Costo estimado en USD con los precios por millón de tokens guardados en platform_settings. */
export const costoUsd = (tin: number, tout: number, precioIn: number, precioOut: number) =>
  Math.round(((tin * precioIn + tout * precioOut) / 1_000_000) * 1e6) / 1e6

/**
 * Lee la configuración del proveedor desde platform_secrets (la clave nunca viaja al navegador).
 *   ai_proveedor = 'compatible' → usa ai_url_base, ai_modelo y ai_api_key (DeepSeek, etc.)
 *   cualquier otro valor o ausente → Gemini con gemini_api_key (el comportamiento de siempre).
 * Devuelve null si falta la clave del proveedor elegido.
 */
export async function cargarProveedor(admin: { from: (t: string) => any }): Promise<ConfigProveedor | null> {
  const { data: filas } = await admin.from('platform_secrets').select('key, value').in('key', ['gemini_api_key', 'ai_proveedor', 'ai_modelo', 'ai_url_base', 'ai_api_key'])
  const s: Record<string, string> = Object.fromEntries((filas ?? []).map((f: { key: string; value: string }) => [f.key, f.value]))
  const c: ConfigProveedor = s.ai_proveedor === 'compatible'
    ? { proveedor: 'compatible', modelo: s.ai_modelo ?? '', clave: s.ai_api_key ?? '', urlBase: s.ai_url_base }
    : { proveedor: 'gemini', modelo: s.ai_modelo || MODELO_POR_DEFECTO, clave: s.gemini_api_key ?? '' }
  return c.clave && c.modelo ? c : null
}
