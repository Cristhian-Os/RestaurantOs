// Claude (Anthropic) por la API de Mensajes. Va aparte de _shared/modelo.ts para no tocar lo que ya usan Resti y los reportes.
// La clave llega de quien llama (que la lee de un secreto del servidor); aquí no se guarda ni se escribe en ningún registro.
import type { Fetch, RespuestaModelo, Turno } from '../_shared/modelo.ts'

export interface PedidoAnthropic { sistema: string; turnos: Turno[]; maxTokens: number; timeoutMs?: number }

export async function llamarAnthropic(c: { modelo: string; clave: string }, p: PedidoAnthropic, f: Fetch): Promise<RespuestaModelo> {
  if (!c.clave) throw new Error('Falta la clave del proveedor')
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), p.timeoutMs ?? 25_000)
  try {
    const resp = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': c.clave, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: c.modelo, max_tokens: p.maxTokens, system: p.sistema, messages: p.turnos.map(m => ({ role: m.rol, content: m.texto })) }),
    })
    const d = (await resp.json()) as { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }
    if (!resp.ok) throw new Error(`El proveedor respondió ${resp.status}`)
    const texto = (d.content ?? []).filter(x => x.type === 'text').map(x => x.text ?? '').join('').trim()
    return { texto, llamadas: [], tokensEntrada: Number(d.usage?.input_tokens) || 0, tokensSalida: Number(d.usage?.output_tokens) || 0, proveedor: 'claude', modelo: c.modelo }
  } catch (e) {
    if (ctl.signal.aborted) throw new Error('El proveedor tardó demasiado')
    throw e
  } finally { clearTimeout(t) }
}
