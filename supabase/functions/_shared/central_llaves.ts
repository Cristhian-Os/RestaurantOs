// Llaves de Central. Se leen primero de los secretos del servidor (Supabase) y, si no hay, de las que el dueño pegó en el panel
// (tabla platform_secrets: seguridad de filas activa y sin permisos para usuarios, solo se lee con la llave de servicio).
// El valor de una llave NUNCA se devuelve al navegador ni se escribe en ningún registro: solo se informa si existe y de dónde viene.

export const SECRETOS = [
  'CENTRAL_CLAVE_CLAUDE', 'CENTRAL_CLAVE_NVIDIA', 'CENTRAL_CLAVE_DEEPSEEK',
  'CENTRAL_CLAVE_OPENROUTER', 'CENTRAL_CLAVE_OPENAI', 'CENTRAL_CLAVE_GEMINI', 'CENTRAL_CLAVE_GROQ', 'CENTRAL_TELEGRAM_TOKEN', 'CENTRAL_TELEGRAM_CHAT_ID',
] as const

/** Nombre de la fila en platform_secrets: el del secreto en minúsculas. */
export const filaDe = (nombre: string) => nombre.toLowerCase()

/** Devuelve el motivo por el que NO se debe guardar, o null si el valor es aceptable. */
export function validarSecreto(nombre: string, valor: unknown): string | null {
  if (!(SECRETOS as readonly string[]).includes(nombre)) return 'Ese dato no existe.'
  if (typeof valor !== 'string') return 'Falta pegar el valor.'
  const v = valor.trim()
  if (nombre === 'CENTRAL_TELEGRAM_CHAT_ID') return /^-?\d{5,20}$/.test(v) ? null : 'El chat_id es un número (puede empezar con -).'
  if (v.length < 8 || v.length > 400) return 'La llave parece incompleta o demasiado larga. Cópiala de nuevo completa.'
  if (!/^[\x21-\x7E]+$/.test(v)) return 'La llave no debe tener espacios ni caracteres raros. Cópiala de nuevo.'
  return null
}

export interface Llaves { leer(nombre: string): string; origen(nombre: string): 'servidor' | 'panel' | null }
type Cliente = { from: (t: string) => any }

export async function cargarLlaves(admin: Cliente): Promise<Llaves> {
  const { data } = await admin.from('platform_secrets').select('key, value').in('key', SECRETOS.map(filaDe))
  const bd: Record<string, string> = Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map(f => [f.key, f.value]))
  const env = (n: string) => Deno.env.get(n) ?? ''
  return {
    leer: n => env(n) || bd[filaDe(n)] || '',
    origen: n => (env(n) ? 'servidor' : bd[filaDe(n)] ? 'panel' : null),
  }
}
