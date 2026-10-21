// Validación de una opinión que propone el modelo (Anexo F, sección 3.4).
// El modelo SOLO aporta texto y clasificación; el restaurante, el usuario y el rol los pone la función desde la sesión.
export const TIPOS = ['fallo', 'mejora', 'personalizacion', 'pregunta', 'otro'] as const
export const MODULOS = ['pedidos', 'cocina', 'caja', 'inventario', 'menu', 'menu_publico', 'equipo', 'pagos', 'otro'] as const
export const URGENCIAS = ['baja', 'media', 'alta'] as const

// "Alta" solo si lo que escribió la PERSONA muestra un bloqueo real (no poder cobrar, tomar pedidos, entrar...).
const BLOQUEO = /(no\s+(puedo|podemos|me\s+deja|nos\s+deja|deja|se\s+puede|logro|logramos)\s+(cobrar|tomar|entrar|ingresar|iniciar|abrir|imprimir|hacer\s+pedidos)|no\s+(cobra|abre|carga|funciona|entra|recibe|llegan|aparece)|se\s+(cay[oó]|trab[oó]|bloque[oó])|est[aá]\s+(ca[ií]d[oa]|bloquead[oa])|no\s+recibe\s+los\s+pedidos|no\s+puedo\s+trabajar)/i

export interface OpinionSegura {
  tipo: (typeof TIPOS)[number]
  modulo: (typeof MODULOS)[number]
  urgencia: (typeof URGENCIAS)[number]
  titulo: string
  detalle: string
  pasos: string | null
}

const limpiar = (v: unknown, max: number): string =>
  // eslint-disable-next-line no-control-regex
  String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)

const elegir = <T extends readonly string[]>(lista: T, v: unknown, otro: T[number]): T[number] =>
  (lista as readonly string[]).includes(String(v)) ? (String(v) as T[number]) : otro

/** `textoUsuario` = SOLO los mensajes escritos por la persona (nunca lo que dice el modelo). */
export function validarOpinion(args: Record<string, unknown> | null | undefined, textoUsuario: string): OpinionSegura | { error: string } {
  const a = args ?? {}
  const titulo = limpiar(a.titulo, 140)
  if (titulo.length < 3) return { error: 'Falta un título claro' }
  const detalle = limpiar(a.detalle, 4000) || titulo
  const pasos = limpiar(a.pasos, 2000) || null
  let urgencia = elegir(URGENCIAS, a.urgencia, 'media')
  if (urgencia === 'alta' && !BLOQUEO.test(textoUsuario)) urgencia = 'media'
  return { tipo: elegir(TIPOS, a.tipo, 'otro'), modulo: elegir(MODULOS, a.modulo, 'otro'), urgencia, titulo, detalle, pasos }
}

/** Texto libre de contexto (pantalla/dispositivo) que manda el navegador: solo se recorta. */
export const contexto = (v: unknown, max: number): string | null => limpiar(v, max) || null

/** Conversación que se guarda con la opinión: últimos mensajes, recortados. */
export function conversacionGuardable(msgs: Array<{ role?: string; text?: string }>): Array<{ role: string; text: string }> {
  return msgs.slice(-12).map(m => ({ role: m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user', text: limpiar(m.text, 1000) }))
}
