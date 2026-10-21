// callModel(): la ÚNICA puerta hacia un proveedor de IA. Cambiar de proveedor es cambiar la configuración, no el resto del código.
//  - 'gemini': Google Gemini (hoy, con la clave que ya existe en platform_secrets).
//  - 'compatible': cualquier proveedor con API estilo OpenAI (DeepSeek, Qwen, GLM, Kimi, etc.): solo cambian la URL base, el modelo y la clave.
// No lleva claves en el código: las recibe de quien llama (que las lee de platform_secrets).

export interface PedidoModelo { sistema: string; usuario: string; maxTokens?: number }
export interface RespuestaModelo { texto: string; tokensEntrada: number; tokensSalida: number; proveedor: string; modelo: string }
export interface ConfigProveedor { proveedor: 'gemini' | 'compatible'; modelo: string; clave: string; urlBase?: string }
export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export const MODELO_POR_DEFECTO = 'gemini-2.5-flash'

type Obj = Record<string, any>

async function llamarGemini(c: ConfigProveedor, p: PedidoModelo, f: Fetch): Promise<RespuestaModelo> {
  const resp = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.modelo)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.clave },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: p.sistema }] },
      contents: [{ role: 'user', parts: [{ text: p.usuario }] }],
      // Salida en JSON y sin "pensar" de más: es redactar cifras ya calculadas, no razonar; ahorra costo.
      generationConfig: { maxOutputTokens: p.maxTokens ?? 1500, temperature: 0.2, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  const d = (await resp.json()) as Obj
  if (!resp.ok) throw new Error(`El proveedor respondió ${resp.status}`)
  const texto = ((d?.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]).map(x => x.text ?? '').join('').trim()
  const u = d?.usageMetadata ?? {}
  return { texto, tokensEntrada: Number(u.promptTokenCount) || 0, tokensSalida: (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0), proveedor: 'gemini', modelo: c.modelo }
}

async function llamarCompatible(c: ConfigProveedor, p: PedidoModelo, f: Fetch): Promise<RespuestaModelo> {
  if (!c.urlBase) throw new Error('Falta la URL del proveedor')
  const resp = await f(`${c.urlBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.clave}` },
    body: JSON.stringify({
      model: c.modelo, temperature: 0.2, max_tokens: p.maxTokens ?? 1500, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: p.sistema }, { role: 'user', content: p.usuario }],
    }),
  })
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
