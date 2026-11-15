// Reglas puras de central-agente (sin red ni base de datos): catálogo de proveedores, límites de gasto, armado del prompt.
// Se prueban con:  node supabase/functions/central-agente/logica.test.ts
// Ninguna clave vive aquí: cada proveedor solo dice el NOMBRE del secreto del servidor donde está su clave.
import type { Turno } from '../_shared/modelo.ts'

export interface Proveedor { id: string; nombre: string; tipo: 'anthropic' | 'compatible'; secreto: string; urlBase?: string; modeloDefecto: string }

/** Proveedores que Central sabe usar. "compatible" = API estilo OpenAI (NVIDIA, DeepSeek…): solo cambian URL, modelo y clave. */
export const PROVEEDORES: Proveedor[] = [
  { id: 'claude', nombre: 'Claude (Anthropic)', tipo: 'anthropic', secreto: 'CENTRAL_CLAVE_CLAUDE', modeloDefecto: 'claude-sonnet-5-5' },
  { id: 'nvidia', nombre: 'NVIDIA (DeepSeek y otros)', tipo: 'compatible', secreto: 'CENTRAL_CLAVE_NVIDIA', urlBase: 'https://integrate.api.nvidia.com/v1', modeloDefecto: 'deepseek-ai/deepseek-v3.1' },
  { id: 'deepseek', nombre: 'DeepSeek', tipo: 'compatible', secreto: 'CENTRAL_CLAVE_DEEPSEEK', urlBase: 'https://api.deepseek.com', modeloDefecto: 'deepseek-chat' },
  { id: 'openrouter', nombre: 'OpenRouter (muchos modelos)', tipo: 'compatible', secreto: 'CENTRAL_CLAVE_OPENROUTER', urlBase: 'https://openrouter.ai/api/v1', modeloDefecto: 'anthropic/claude-sonnet-4.5' },
  { id: 'openai', nombre: 'OpenAI (ChatGPT)', tipo: 'compatible', secreto: 'CENTRAL_CLAVE_OPENAI', urlBase: 'https://api.openai.com/v1', modeloDefecto: 'gpt-4o-mini' },
  { id: 'gemini', nombre: 'Gemini (Google)', tipo: 'compatible', secreto: 'CENTRAL_CLAVE_GEMINI', urlBase: 'https://generativelanguage.googleapis.com/v1beta/openai', modeloDefecto: 'gemini-2.5-flash' },
  { id: 'groq', nombre: 'Groq', tipo: 'compatible', secreto: 'CENTRAL_CLAVE_GROQ', urlBase: 'https://api.groq.com/openai/v1', modeloDefecto: 'llama-3.3-70b-versatile' },
]

export const MAX_TOKENS_RESPUESTA = 700
export const MAX_MENSAJES_POR_MINUTO = 8
export const MAX_TURNOS = 12

/** Si el dueño no ha puesto el precio del modelo, se asume uno ALTO a propósito: el límite de gasto se cumple "por lo alto", nunca por lo bajo. USD por millón de tokens. */
export const PRECIO_PRUDENTE = { entrada: 15, salida: 75 }

const MODELO_VALIDO = /^[a-zA-Z0-9._\-/:]{3,80}$/
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null)

export const proveedorPorId = (id: string) => PROVEEDORES.find(p => p.id === id) ?? null

/** Primer proveedor, en el orden del agente → el predeterminado → el resto, que tenga clave guardada en el servidor. */
export function elegirProveedor(modelosAgente: unknown, predeterminado: unknown, tieneClave: (p: Proveedor) => boolean): Proveedor | null {
  const orden = [...(Array.isArray(modelosAgente) ? modelosAgente : []), predeterminado, ...PROVEEDORES.map(p => p.id)]
  for (const id of orden) {
    const p = typeof id === 'string' ? proveedorPorId(id) : null
    if (p && tieneClave(p)) return p
  }
  return null
}

/** Modelo a usar: el que el dueño fijó en la configuración (si tiene forma válida) o el de fábrica. */
export function modeloDe(p: Proveedor, config: unknown): string {
  const m = (config && typeof config === 'object' ? (config as Record<string, unknown>)[p.id] : undefined)
  return typeof m === 'string' && MODELO_VALIDO.test(m) ? m : p.modeloDefecto
}

export function costoEstimado(tokensEntrada: number, tokensSalida: number, precios: unknown, proveedorId: string): number {
  const fila = (precios && typeof precios === 'object' ? (precios as Record<string, { entrada?: unknown; salida?: unknown }>)[proveedorId] : undefined) ?? {}
  const pe = num(fila.entrada) ?? PRECIO_PRUDENTE.entrada, ps = num(fila.salida) ?? PRECIO_PRUDENTE.salida
  return Math.round(((tokensEntrada * pe + tokensSalida * ps) / 1_000_000) * 1e4) / 1e4
}

export interface EstadoLimites {
  encendida: boolean
  topeGlobal: number; gastoGlobal: number
  presupuestoAgente: number; gastoAgente: number
  mensajesUltimoMinuto: number
}
export type CodigoBloqueo = 'apagada' | 'sin_tope' | 'tope_global' | 'sin_presupuesto' | 'presupuesto_agente' | 'muy_rapido'

/** Devuelve por qué NO se debe llamar al modelo, o null si todo está en regla. Sin tope fijado por el dueño, no se gasta nada. */
export function decidirLimite(s: EstadoLimites): CodigoBloqueo | null {
  if (!s.encendida) return 'apagada'
  if (!(s.topeGlobal > 0)) return 'sin_tope'
  if (s.gastoGlobal >= s.topeGlobal) return 'tope_global'
  if (!(s.presupuestoAgente > 0)) return 'sin_presupuesto'
  if (s.gastoAgente >= s.presupuestoAgente) return 'presupuesto_agente'
  if (s.mensajesUltimoMinuto >= MAX_MENSAJES_POR_MINUTO) return 'muy_rapido'
  return null
}

const TEXTO_BLOQUEO: Record<string, string> = {
  apagada: 'La IA está apagada. Enciéndela en Integraciones cuando quieras que los agentes respondan.',
  sin_tope: 'Falta fijar el límite de gasto mensual en Integraciones. Mientras no lo fijes, no se gasta nada.',
  tope_global: 'Se alcanzó el límite de gasto mensual de la IA. Sube el límite en Integraciones o espera al próximo mes.',
  sin_presupuesto: 'Este agente no tiene presupuesto mensual. Asígnale uno en su ficha.',
  presupuesto_agente: 'Este agente ya usó todo su presupuesto del mes.',
  muy_rapido: 'Vas muy rápido: espera un minuto y vuelve a escribir.',
  sin_proveedor: 'No hay ningún modelo de IA con llave guardada en el servidor.',
  agente_no_activo: 'Este agente no está activo con un proveedor real. Se le responde en simulación local.',
  sin_permiso: 'Solo el dueño con su código de 2 pasos puede usar esto.',
  sin_sesion: 'Tu sesión venció. Vuelve a entrar.',
  conversacion: 'Solo los chats directos con un agente usan IA por ahora.',
  proveedor_falla: 'El proveedor de IA no respondió bien. Inténtalo en un momento.',
  vacio: 'El modelo no devolvió texto.',
  peticion: 'Petición no válida.',
}
export const textoBloqueo = (c: string) => TEXTO_BLOQUEO[c] ?? 'No se pudo completar.'

/** Convierte los mensajes guardados en turnos que alternan usuario/asistente (lo que exigen los proveedores); el último debe ser del usuario. */
export function armarTurnos(mensajes: { autor_tipo: string; contenido: string }[], max = MAX_TURNOS): Turno[] {
  const turnos: Turno[] = []
  for (const m of mensajes) {
    const rol = m.autor_tipo === 'humano' ? 'user' : m.autor_tipo === 'agente' ? 'assistant' : null
    if (!rol || !m.contenido?.trim()) continue
    const ultimo = turnos.at(-1)
    if (ultimo && ultimo.rol === rol) ultimo.texto += `\n${m.contenido.trim()}`
    else turnos.push({ rol, texto: m.contenido.trim() })
  }
  const recientes = turnos.slice(-max)
  while (recientes.length && recientes[0].rol !== 'user') recientes.shift()
  return recientes.at(-1)?.rol === 'user' ? recientes : []
}

export interface FichaAgente { nombre: string; rol: string; especialidad: string; objetivos: unknown; nivel: string }
const ROL: Record<string, string> = { chef_mayor: 'Chef Mayor', jefe: 'jefe de departamento', subordinado: 'miembro del equipo', asistente: 'asistente' }

/** Instrucciones del agente. Dicen la verdad sobre sus límites: hoy solo conversa y propone; no ejecuta nada ni ve datos de restaurantes. */
export function sistemaAgente(a: FichaAgente, area: string): string {
  const objetivos = (Array.isArray(a.objetivos) ? a.objetivos : []).filter(o => typeof o === 'string').slice(0, 5).map(o => `- ${String(o).slice(0, 160)}`).join('\n')
  return [
    `Eres ${a.nombre}, ${ROL[a.rol] ?? 'agente'} del área "${area}" de RestaurantOS Central, la oficina de agentes de Cristhian, dueño de RestaurantOS (software para restaurantes). Hablas con él.`,
    a.especialidad ? `Tu especialidad: ${a.especialidad}.` : '',
    objetivos ? `Tus objetivos:\n${objetivos}` : '',
    `Tu nivel de autoridad es ${a.nivel}.`,
    'Reglas que nunca rompes:',
    '- Hoy NO tienes acceso a datos de restaurantes, pedidos, dinero, correo ni herramientas. No inventes cifras ni digas que consultaste algo.',
    '- No ejecutas acciones. Si algo requiere hacer algo, lo propones y Cristhian decide; lo que es de nivel N3 (despliegues, dinero, cambios de licencia, borrar datos) solo lo decide un humano.',
    '- Nunca pidas ni repitas contraseñas, llaves o códigos.',
    'Responde en español sencillo, corto y directo (máximo 6 frases), sin jerga técnica.',
  ].filter(Boolean).join('\n')
}

/** Primer día del mes en hora de Colombia (UTC-5, sin horario de verano): así el consumo no se corre de mes a las 7 p. m. */
export function primerDiaDelMes(ahora: Date): string {
  const co = new Date(ahora.getTime() - 5 * 3600_000)
  return `${co.getUTCFullYear()}-${String(co.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** Lee el nivel de seguridad de la sesión (aal1/aal2) del JWT. Solo se usa DESPUÉS de que el servidor validó el token. */
export function leerAal(jwt: string): string {
  try {
    const parte = jwt.split('.')[1] ?? ''
    const json = atob(parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '='))
    const aal = (JSON.parse(json) as { aal?: unknown }).aal
    return typeof aal === 'string' ? aal : 'aal1'
  } catch { return 'aal1' }
}
