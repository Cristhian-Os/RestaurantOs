// Guardas compartidas por las Edge Functions: comparación en tiempo constante, limitadores que FALLAN CERRADOS,
// topes globales de IA, sal del hash de IP, orígenes permitidos y registro de uso de IA. Sin dependencias de red: se prueba con node.

const utf8 = new TextEncoder()

/** Comparación en tiempo constante (no se corta en el primer byte distinto). */
export function iguales(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = utf8.encode(a), y = utf8.encode(b)
  let d = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(input))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Limitadores ───────────────────────────────────────────────────────────────────────────────────────────────────
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error?: unknown }> }

/**
 * check_rate_limit FALLA CERRADO: solo `true` deja pasar. Un error de red, un null o `false` bloquean.
 * (Antes se comparaba `=== false`, y si la base fallaba el limitador quedaba abierto.)
 */
export async function permitido(db: Rpc, key: string, max: number, secs: number): Promise<boolean> {
  try {
    const { data, error } = await db.rpc('check_rate_limit', { p_key: key, p_max: max, p_window_seconds: secs })
    return !error && data === true
  } catch { return false }
}

/** Resultado de un `rpc('check_rate_limit')` ya hecho (p. ej. dentro de un Promise.all): true solo si la respuesta fue `true`. */
export const respuestaPermitida = (r: { data?: unknown; error?: unknown } | null | undefined): boolean => !!r && !r.error && r.data === true

/** Topes GLOBALES diarios por función (clave 'global:<fn>'): techo de costo aunque cambien de IP o de cuenta. */
export const TOPES_GLOBALES_DIA: Record<string, number> = {
  'chat-support': 3000, 'voice-parse': 20000, 'resti-brain': 20000, 'resti-acciones': 20000, 'resti-voz': 20000,
  'menu-asistente': 10000, 'ai-report': 2000, 'feedback-resumen': 500,
}
export const topeGlobal = (db: Rpc, fn: string): Promise<boolean> => permitido(db, `global:${fn}`, TOPES_GLOBALES_DIA[fn] ?? 5000, 86400)

// ── Entorno ───────────────────────────────────────────────────────────────────────────────────────────────────────
const env = (k: string): string => {
  try { return String((globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? '') } catch { return '' }
}

/**
 * Hash de la IP (no se guarda la IP en texto). Sal: variable IP_HASH_SALT (secreto propio, ≥16 caracteres).
 * Si no está configurada se deriva una sal de la service key con una etiqueta de dominio (sha256 de 'ip-hash-salt:' + key):
 * nunca se usa la service key tal cual y la sal derivada no permite recuperarla. Configura IP_HASH_SALT para no depender de ella.
 */
export async function hashIp(ip: string): Promise<string> {
  const propia = env('IP_HASH_SALT')
  const sal = propia.length >= 16 ? propia : await sha256Hex('ip-hash-salt:' + env('SUPABASE_SERVICE_ROLE_KEY'))
  return (await sha256Hex(`${sal}|${ip}`)).slice(0, 16)
}

/** IP del cliente tal como la ve la plataforma (cf-connecting-ip, o la primera de x-forwarded-for). */
export function ipDe(req: Request): string {
  const xff = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  return req.headers.get('cf-connecting-ip') ?? (xff || 'sin-ip')
}

/** Orígenes permitidos: APP_ORIGINS (coma-separado, sin barra final). Vacío = no configurado. */
export function origenesConfigurados(): string[] {
  return env('APP_ORIGINS').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)
}

/** Origen aceptable para este request: si APP_ORIGINS está definido, solo los de la lista; si no, únicamente el Origin del propio request. */
export function origenValido(origin: string | null, lista: string[] = origenesConfigurados()): string | null {
  if (!origin) return null
  const o = origin.replace(/\/+$/, '')
  return lista.length ? (lista.includes(o) ? o : null) : o
}

/** ¿`redirect` es una URL https cuyo origen está permitido? (sin APP_ORIGINS, solo el Origin del request). */
export function redirectPermitido(redirect: unknown, origin: string | null, lista: string[] = origenesConfigurados()): boolean {
  if (typeof redirect !== 'string' || redirect.length > 2000) return false
  let u: URL
  try { u = new URL(redirect) } catch { return false }
  if (u.protocol !== 'https:' || u.username || u.password) return false
  if (lista.length) return lista.includes(u.origin)
  return !!origin && u.origin === origin.replace(/\/+$/, '')
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[A-Za-z]{2,}$/

// ── Datos personales ──────────────────────────────────────────────────────────────────────────────────────────────
/** Quita teléfonos y correos de un texto (registros, resúmenes, contexto enviado a un modelo). */
export function sinPersonales(t: string): string {
  return String(t ?? '')
    .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, '[correo]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[número]')
}

// ── Uso de IA ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Tablas = Rpc & { from: (t: string) => any }
let precios: { t: number; entrada: number; salida: number } | null = null

/**
 * Registra en ai_usage una llamada a la IA (tokens y costo estimado). Mejor esfuerzo: nunca rompe la respuesta al usuario.
 * `r` es lo que devolvió callModel (RespuestaModelo). Sin tokens (0 y 0) no escribe nada.
 */
export async function registrarUsoIA(
  admin: Tablas, restaurantId: string | null | undefined, funcion: string,
  r: { proveedor: string; modelo: string; tokensEntrada: number; tokensSalida: number } | null | undefined,
): Promise<void> {
  try {
    if (!r || (r.tokensEntrada || 0) + (r.tokensSalida || 0) <= 0) return
    if (!precios || Date.now() - precios.t > 300_000) {
      const { data } = await admin.from('platform_settings').select('clave, valor').in('clave', ['ai_precio_entrada_usd_millon', 'ai_precio_salida_usd_millon'])
      const p = Object.fromEntries((data ?? []).map((x: { clave: string; valor: number }) => [x.clave, Number(x.valor)]))
      precios = { t: Date.now(), entrada: Number.isFinite(p.ai_precio_entrada_usd_millon) ? p.ai_precio_entrada_usd_millon : 0.3, salida: Number.isFinite(p.ai_precio_salida_usd_millon) ? p.ai_precio_salida_usd_millon : 2.5 }
    }
    const costo = Math.round(((r.tokensEntrada * precios.entrada + r.tokensSalida * precios.salida) / 1_000_000) * 1e6) / 1e6
    const { error } = await admin.from('ai_usage').insert({
      restaurant_id: restaurantId ?? null, funcion, proveedor: r.proveedor, modelo: r.modelo,
      tokens_entrada: r.tokensEntrada, tokens_salida: r.tokensSalida, costo_usd: costo,
    })
    if (error) console.error('ai_usage insert failed', funcion, (error as { message?: string }).message)
  } catch (e) { console.error('ai_usage', funcion, e instanceof Error ? e.message : 'error') }
}

// ── Interruptor de Resti ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * ¿Resti está encendido para este restaurante? Es el mismo interruptor del panel (restaurant_config.modules_enabled.resti_agent,
 * que cambia plataforma_activar_resti). Apagado por defecto: cualquier error o dato ausente cuenta como apagado.
 */
export async function restiActivo(admin: { from: (t: string) => any }, restaurantId: string | null | undefined): Promise<boolean> {
  if (!restaurantId) return false
  try {
    const { data, error } = await admin.from('restaurant_config').select('modules_enabled').eq('restaurant_id', restaurantId).maybeSingle()
    if (error) return false
    return (data?.modules_enabled as { resti_agent?: unknown } | null)?.resti_agent === true
  } catch { return false }
}
