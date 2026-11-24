// Reglas puras de la conexión con Google (sin red ni base de datos). Se prueban con:  node supabase/functions/central-google-oauth/logica.test.ts
// Conecta UNA cuenta de Google Workspace (el buzón de ventas) con Central por OAuth: correo (enviar y leer respuestas) y calendario.
// Nada de contraseñas: Google devuelve un permiso revocable ("refresh token") que solo se guarda en el servidor.

export const SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/gmail.send',       // enviar correos
  'https://www.googleapis.com/auth/gmail.readonly',   // leer respuestas, rebotes y bajas del buzón de ventas
  'https://www.googleapis.com/auth/calendar.events',  // agendar demostraciones aceptadas
]
export const VIGENCIA_ESTADO_MS = 15 * 60_000

/** Motivo por el que NO se debe guardar el cliente OAuth, o null si tiene forma válida. */
export function validarCliente(id: unknown, secreto: unknown): string | null {
  if (typeof id !== 'string' || typeof secreto !== 'string') return 'Faltan datos: pega el ID y el secreto del cliente.'
  const i = id.trim(), s = secreto.trim()
  if (!/^[0-9]{6,}-[a-z0-9]{10,}\.apps\.googleusercontent\.com$/i.test(i)) return 'El ID del cliente debe terminar en ".apps.googleusercontent.com". Cópialo completo.'
  if (!/^[\x21-\x7E]{16,200}$/.test(s)) return 'El secreto parece incompleto o tiene espacios. Cópialo de nuevo completo.'
  return null
}

export function urlAutorizacion(clientId: string, redirectUri: string, estado: string): string {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: estado,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`
}

/** El "estado" liga la ida a Google con la vuelta: aleatorio + hora. Se usa una sola vez y caduca en 15 minutos. */
export const crearEstado = (aleatorioHex: string, ahoraMs: number) => `${aleatorioHex}|${ahoraMs}`
export function iguales(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
export function estadoValido(guardado: string | null | undefined, recibido: string, ahoraMs: number): boolean {
  if (!guardado || !recibido) return false
  const [token, hora] = guardado.split('|')
  const t = Number(hora)
  if (!token || !Number.isFinite(t) || ahoraMs - t > VIGENCIA_ESTADO_MS || ahoraMs < t) return false
  return iguales(token, recibido.split('|')[0] ?? '')
}

/** Correo de la cuenta conectada, leído del id_token que Google entrega directamente por TLS en el intercambio. */
export function correoDeIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null
  const partes = idToken.split('.')
  if (partes.length !== 3) return null
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(partes[1].length / 4) * 4, '=')
    const o = JSON.parse(atob(b64)) as { email?: unknown; email_verified?: unknown }
    return typeof o.email === 'string' && o.email_verified !== false && /^[^\s@]{1,64}@[^\s@]{1,255}$/.test(o.email) ? o.email.toLowerCase() : null
  } catch { return null }
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
/** Página sencilla que ve el dueño al volver de Google. Sin datos sensibles; el texto se escapa. */
export function paginaResultado(ok: boolean, mensaje: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexión con Google</title>
<style>body{font-family:system-ui,sans-serif;background:#0E0E10;color:#F5F5F6;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}main{max-width:420px;text-align:center}h1{font-size:22px}p{color:#A8A8AE;line-height:1.5}b{color:${ok ? '#4ADE80' : '#FF5A00'}}</style></head>
<body><main><h1><b>${ok ? 'Listo' : 'No se pudo conectar'}</b></h1><p>${esc(mensaje)}</p><p>Puedes cerrar esta ventana y volver a Central.</p></main></body></html>`
}
