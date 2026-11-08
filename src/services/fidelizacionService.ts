/**
 * fidelizacionService.ts
 * Acceso a clientes, puntos, niveles y recompensas. Las lecturas van directo a las tablas
 * (protegidas por RLS: admin y cajero). Todo lo que cambia saldos pasa por funciones de la
 * base (fid_*), que validan rol, evitan duplicados y dejan auditoría.
 */
import { supabase } from './supabaseClient'

export interface Programa {
  restaurant_id: string
  activo: boolean
  modo: 'puntos' | 'sellos' | 'ambos'
  monto_por_punto: number
  monto_minimo_sello: number
  nombre_club: string | null
  meses_vencimiento: number | null // null = los puntos no vencen
}

export type ProgramaCambios = Partial<Omit<Programa, 'restaurant_id'>>

export interface Cuenta {
  puntos_saldo: number
  puntos_historicos: number
  sellos_saldo: number
  visitas: number
  gasto_total: number
  ultima_visita: string | null
  nivel_id: string | null
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  correo: string | null
  cumpleanos: string | null
  consentimiento_marketing: boolean
  origen: string
  notas: string | null
  activo: boolean
  qr_token: string
  created_at: string
  fid_cuentas: Cuenta | null
}

/** Lo único que ven cajero y mesero de un cliente: sin compras, gasto ni teléfono completo (viene tapado desde la base). */
export interface ClienteBasico {
  id: string
  nombre: string
  telefono: string | null // "******1234"
  puntos_saldo: number
  sellos_saldo: number
  nivel: string | null
  acepta_mensajes: boolean
}

export interface Nivel {
  id: string
  nombre: string
  puntos_minimos: number
  descuento_pct: number
  beneficios: string | null
  activo: boolean
}

export type RecompensaTipo = 'producto' | 'descuento_pct' | 'descuento_fijo' | 'beneficio'

/** Premio tal como lo configura el administrador. */
export interface Recompensa {
  id: string
  nombre: string
  descripcion: string | null
  tipo: RecompensaTipo
  valor: number | null
  unidad: 'puntos' | 'sellos'
  costo: number
  condiciones: string | null
  vigente_desde: string | null
  vigente_hasta: string | null
  limite_por_cliente: number | null
  stock: number | null // null = sin límite
  activa: boolean
  nivel_minimo_id: string | null
}

export type RecompensaForm = Omit<Recompensa, 'id'>

/** Premio visto desde el mostrador para UN cliente: la base ya dice si puede canjearlo y, si no, por qué. */
export interface RecompensaDisponible {
  id: string
  nombre: string
  descripcion: string | null
  tipo: RecompensaTipo
  valor: number | null
  unidad: 'puntos' | 'sellos'
  costo: number
  condiciones: string | null
  stock: number | null
  disponible: boolean
  motivo: string | null
}

export interface CanjeHistorial {
  id: string
  created_at: string
  cliente: string
  recompensa: string
  unidad: 'puntos' | 'sellos'
  costo: number
  estado: 'aplicada' | 'anulada'
  hecho_por: string
  anulada_at: string | null
  motivo_anulacion: string | null
}

export interface ResumenCorte {
  puntos_emitidos: number
  puntos_canjeados: number
  puntos_vencidos: number
  canjes: number
  compras: number
  ventas: number
  clientes_activos: number
  clientes_nuevos: number
  clientes_total: number
  puntos_en_circulacion: number
  niveles: Record<string, number>
}

export interface Corte {
  id: string
  mes: string // primer día del mes cerrado, YYYY-MM-DD
  origen: 'manual' | 'automatico'
  ejecutado_at: string
  clientes_expirados: number
  puntos_expirados: number
  niveles_cambiados: number
  resumen: Partial<ResumenCorte>
}

export interface ArmAccion {
  id: string
  tipo: string
  titulo: string
  razon: string
  evidencia: Record<string, unknown>
  payload: Record<string, unknown>
  estado: 'propuesta' | 'aprobada' | 'rechazada' | 'ejecutada' | 'fallida' | 'expirada'
  decidida_at: string | null
  nota_decision: string | null
  expira_at: string
  created_at: string
}

export interface Movimiento {
  id: string
  tipo: 'acredito' | 'reversa_acredito' | 'canje' | 'reversa_canje' | 'ajuste' | 'expiracion'
  unidad: 'puntos' | 'sellos'
  cantidad: number
  motivo: string | null
  created_at: string
}

export interface TarjetaPublica {
  restaurante: string
  nombre: string
  puntos: number
  sellos: number
  nivel: string | null
  nivel_beneficios: string | null
  siguiente_nivel: string | null
  puntos_para_siguiente: number | null
  progreso_pct: number
  movimientos: { fecha: string; tipo: Movimiento['tipo']; unidad: 'puntos' | 'sellos'; cantidad: number; motivo: string | null }[]
}

export interface NuevoCliente {
  nombre: string
  telefono?: string
  correo?: string
  cumpleanos?: string
  consentimiento: boolean
  canal?: 'whatsapp' | 'correo' | 'ambos'
  origen?: 'caja' | 'mesa'
}

const CLIENTE_COLS =
  'id,nombre,telefono,correo,cumpleanos,consentimiento_marketing,origen,notas,activo,qr_token,created_at,' +
  'fid_cuentas(puntos_saldo,puntos_historicos,sellos_saldo,visitas,gasto_total,ultima_visita,nivel_id)'

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export const fidelizacionService = {
  async getPrograma(): Promise<Programa | null> {
    const { data, error } = await supabase.from('fid_programas').select('*').maybeSingle()
    fail(error)
    return data as Programa | null
  },

  /** Crea el programa la primera vez; después solo cambia si está activo o no. */
  async setProgramaActivo(actual: Programa | null, activo: boolean): Promise<void> {
    if (!actual) {
      const { error } = await supabase.from('fid_programas').insert({ activo })
      fail(error)
      return
    }
    const { error } = await supabase.from('fid_programas').update({ activo }).eq('restaurant_id', actual.restaurant_id)
    fail(error)
  },

  async getClientes(): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('clientes').select(CLIENTE_COLS).order('created_at', { ascending: false }).limit(500)
    fail(error)
    return (data ?? []) as unknown as Cliente[]
  },

  /** Búsqueda para cajero y mesero: código QR completo, últimos dígitos del celular o nombre. */
  async buscar(q: string): Promise<ClienteBasico[]> {
    const { data, error } = await supabase.rpc('fid_buscar_cliente', { p_q: q })
    fail(error)
    return (data ?? []) as ClienteBasico[]
  },

  async getFicha(id: string): Promise<ClienteBasico | null> {
    const { data, error } = await supabase.rpc('fid_ficha_cliente', { p_id: id })
    fail(error)
    return ((data as ClienteBasico[] | null) ?? [])[0] ?? null
  },

  async getNiveles(): Promise<Nivel[]> {
    const { data, error } = await supabase.from('fid_niveles').select('*').order('puntos_minimos')
    fail(error)
    return (data ?? []) as Nivel[]
  },

  /** Premios que el cliente puede canjear YA (y los demás con el motivo). Solo administrador y cajero. */
  async getRecompensasDisponibles(clienteId: string): Promise<RecompensaDisponible[]> {
    const { data, error } = await supabase.rpc('fid_recompensas_disponibles', { p_cliente_id: clienteId })
    fail(error)
    return (data ?? []) as RecompensaDisponible[]
  },

  /** Catálogo completo para configurar (activos y pausados). */
  async getRecompensasConfig(): Promise<Recompensa[]> {
    const { data, error } = await supabase.from('fid_recompensas').select('*').order('activa', { ascending: false }).order('costo')
    fail(error)
    return (data ?? []) as Recompensa[]
  },

  async guardarRecompensa(id: string | null, f: RecompensaForm): Promise<void> {
    const { error } = id
      ? await supabase.from('fid_recompensas').update(f).eq('id', id)
      : await supabase.from('fid_recompensas').insert(f)
    fail(error)
  },

  async guardarNivel(id: string | null, f: { nombre: string; puntos_minimos: number; beneficios: string | null; activo: boolean }): Promise<void> {
    const { error } = id
      ? await supabase.from('fid_niveles').update(f).eq('id', id)
      : await supabase.from('fid_niveles').insert(f)
    fail(error)
    // Cada cliente cambia de nivel según los nuevos umbrales.
    const r = await supabase.rpc('fid_recalcular_niveles')
    fail(r.error)
  },

  async guardarPrograma(actual: Programa | null, c: ProgramaCambios): Promise<void> {
    const { error } = actual
      ? await supabase.from('fid_programas').update(c).eq('restaurant_id', actual.restaurant_id)
      : await supabase.from('fid_programas').insert(c)
    fail(error)
  },

  async getCanjes(): Promise<CanjeHistorial[]> {
    const { data, error } = await supabase.rpc('fid_canjes_historial', { p_limite: 100 })
    fail(error)
    return (data ?? []) as CanjeHistorial[]
  },

  async anularCanje(id: string, motivo: string): Promise<void> {
    const { error } = await supabase.rpc('fid_anular_canje', { p_id: id, p_motivo: motivo })
    fail(error)
  },

  async getCortes(): Promise<Corte[]> {
    const { data, error } = await supabase.from('fid_cortes').select('*').order('mes', { ascending: false }).limit(24)
    fail(error)
    return (data ?? []) as Corte[]
  },

  /** Cierra un mes ya terminado (sin fecha = el último). Repetirlo no hace nada: devuelve lo guardado. */
  async correrCorte(mes?: string): Promise<{ mes: string; ya_existia: boolean; clientes_expirados: number; puntos_expirados: number; niveles_cambiados: number }> {
    const { data, error } = await supabase.rpc('fid_corte_mensual', { p_mes: mes ?? null })
    fail(error)
    return data as { mes: string; ya_existia: boolean; clientes_expirados: number; puntos_expirados: number; niveles_cambiados: number }
  },

  async getArmAcciones(): Promise<ArmAccion[]> {
    const { data, error } = await supabase.from('arm_acciones').select('*').order('created_at', { ascending: false }).limit(60)
    fail(error)
    return (data ?? []) as ArmAccion[]
  },

  /** Revisa los datos con reglas fijas y deja propuestas nuevas. Devuelve cuántas creó. No envía nada. */
  async generarSugerencias(): Promise<number> {
    const { data, error } = await supabase.rpc('arm_generar_sugerencias')
    fail(error)
    return Number(data ?? 0)
  },

  async decidirArm(id: string, aprobar: boolean): Promise<void> {
    const { error } = await supabase.rpc('arm_decidir', { p_id: id, p_aprobar: aprobar, p_nota: null })
    fail(error)
  },

  async getMovimientos(clienteId: string): Promise<Movimiento[]> {
    const { data, error } = await supabase
      .from('fid_movimientos').select('id,tipo,unidad,cantidad,motivo,created_at')
      .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(30)
    fail(error)
    return (data ?? []) as Movimiento[]
  },

  async registrarCliente(n: NuevoCliente): Promise<string> {
    const { data, error } = await supabase.rpc('fid_registrar_cliente', {
      p_nombre: n.nombre,
      p_telefono: n.telefono || null,
      p_correo: n.correo || null,
      p_cumpleanos: n.cumpleanos || null,
      p_consentimiento: n.consentimiento,
      p_canal: n.consentimiento ? (n.canal ?? 'whatsapp') : null,
      p_origen: n.origen ?? 'caja',
    })
    fail(error)
    return data as string
  },

  async canjear(clienteId: string, recompensaId: string, clave: string): Promise<void> {
    const { error } = await supabase.rpc('fid_canjear', {
      p_cliente_id: clienteId, p_recompensa_id: recompensaId, p_order_id: null, p_clave: clave,
    })
    fail(error)
  },

  async ajustarSaldo(clienteId: string, cantidad: number, motivo: string, unidad: 'puntos' | 'sellos'): Promise<void> {
    const { error } = await supabase.rpc('fid_ajustar_saldo', {
      p_cliente_id: clienteId, p_cantidad: cantidad, p_motivo: motivo, p_unidad: unidad,
    })
    fail(error)
  },

  /** Tarjeta que ve el cliente al escanear su QR. No requiere sesión. */
  async getTarjetaPublica(token: string): Promise<TarjetaPublica | null> {
    const { data, error } = await supabase.rpc('fid_tarjeta_publica', { p_token: token })
    fail(error)
    return (data as TarjetaPublica | null) ?? null
  },
}

const WALLET_FN = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/wallet-pass`

/** Enlace directo al pase (el navegador lo abre y el celular ofrece guardarlo en su wallet). */
export const walletUrl = (tipo: 'google' | 'apple', token: string) => `${WALLET_FN}?tipo=${tipo}&token=${token}`

/** Qué wallets están encendidas en el servidor. Si algo falla, ninguna: los botones no se muestran. */
export async function getWalletEstado(): Promise<{ google: boolean; apple: boolean }> {
  try {
    const r = await fetch(`${WALLET_FN}?tipo=estado`)
    if (!r.ok) return { google: false, apple: false }
    const j = await r.json() as { google?: boolean; apple?: boolean }
    return { google: !!j.google, apple: !!j.apple }
  } catch {
    return { google: false, apple: false }
  }
}

/** Países más comunes. "otro" deja escribir el número completo con +. */
export const PAISES = [
  { cc: '57', nombre: 'Colombia' }, { cc: '58', nombre: 'Venezuela' }, { cc: '593', nombre: 'Ecuador' },
  { cc: '51', nombre: 'Perú' }, { cc: '52', nombre: 'México' }, { cc: '1', nombre: 'EE. UU. / Canadá' },
  { cc: '34', nombre: 'España' }, { cc: '507', nombre: 'Panamá' }, { cc: '56', nombre: 'Chile' },
  { cc: '54', nombre: 'Argentina' }, { cc: '55', nombre: 'Brasil' },
] as const

/** Arma el número con país para guardarlo: "+<país><número sin ceros iniciales>". */
export function telefonoConPais(cc: string, local: string): string {
  const t = local.trim()
  if (!t) return ''
  if (cc === 'otro') return t.startsWith('+') ? t : `+${t.replace(/\D/g, '')}`
  return `+${cc}${t.replace(/\D/g, '').replace(/^0+/, '')}`
}

/** Teléfono guardado (solo dígitos con país) a texto legible: +57 300 123 4567, +52 5512345678. */
export function telefonoLegible(t: string | null): string {
  if (!t) return 'Sin teléfono'
  const m = /^57(\d{3})(\d{3})(\d{4})$/.exec(t)
  if (m) return `+57 ${m[1]} ${m[2]} ${m[3]}`
  const p = PAISES.filter(x => t.startsWith(x.cc)).sort((a, b) => b.cc.length - a.cc.length)[0]
  return p ? `+${p.cc} ${t.slice(p.cc.length)}` : `+${t}`
}

export const MOV_TEXTO: Record<Movimiento['tipo'], string> = {
  acredito: 'Compra',
  reversa_acredito: 'Pago anulado',
  canje: 'Canje',
  reversa_canje: 'Canje anulado',
  ajuste: 'Ajuste',
  expiracion: 'Vencimiento',
}
