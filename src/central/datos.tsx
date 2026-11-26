/**
 * datos.tsx — carga única de los datos de Central y reparto a todas las pantallas (contexto de React).
 * Todo se lee con la sesión del dueño: la base (RLS + central_autorizado()) decide qué devuelve; sin 2 pasos devuelve vacío.
 * Se recarga al volver a la pestaña, después de cada acción y, para agentes, tareas, aprobaciones, avisos y gasto de IA, en vivo (Realtime).
 * Nada de esto toca datos de un restaurante, salvo la lectura
 * agregada de central_restaurantes() (solo lectura).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../services/supabaseClient'
import type {
  Agente, Aprobacion, Consumo, Conversacion, Departamento, Documento, Integracion, Memoria, Notificacion, Proyecto,
  RestauranteCentral, Reunion, Tarea, Ubicacion,
} from './catalogo.ts'

export interface Datos {
  departamentos: Departamento[]; agentes: Agente[]; tareas: Tarea[]; aprobaciones: Aprobacion[]; proyectos: Proyecto[]
  conversaciones: Conversacion[]; reuniones: Reunion[]; notificaciones: Notificacion[]; documentos: Documento[]; memoria: Memoria[]
  integraciones: Integracion[]; consumo: Consumo[]; ubicaciones: Ubicacion[]; restaurantes: RestauranteCentral[]
  config: Record<string, unknown>
}
export type EstadoCarga = 'cargando' | 'listo' | 'error' | 'no_instalado'
/** Estado de la conexión en vivo: conectando (primera vez), en_vivo, o reconectando (se cayó; al volver se recarga todo una vez). */
export type EstadoEnVivo = 'conectando' | 'en_vivo' | 'reconectando'

/** Tablas que se actualizan solas: al cambiar una, se vuelve a pedir SOLO esa (no las 15 de la carga completa). */
const EN_VIVO: Record<string, { clave: keyof Datos; pedir: () => PromiseLike<{ data: unknown; error: unknown }> }> = {
  central_agentes: { clave: 'agentes', pedir: () => supabase.from('central_agentes').select('*').order('orden') },
  central_tareas: { clave: 'tareas', pedir: () => supabase.from('central_tareas').select('*').order('created_at', { ascending: false }).limit(500) },
  central_aprobaciones: { clave: 'aprobaciones', pedir: () => supabase.from('central_aprobaciones').select('*').order('created_at', { ascending: false }).limit(200) },
  central_notificaciones: { clave: 'notificaciones', pedir: () => supabase.from('central_notificaciones').select('*').order('created_at', { ascending: false }).limit(100) },
  central_consumo: { clave: 'consumo', pedir: () => supabase.from('central_consumo').select('*').order('periodo', { ascending: false }).limit(1000) },
}
/** Espera para juntar varios cambios seguidos en una sola recarga. */
const ESPERA_AGRUPAR_MS = 300

const VACIO: Datos = {
  departamentos: [], agentes: [], tareas: [], aprobaciones: [], proyectos: [], conversaciones: [], reuniones: [], notificaciones: [],
  documentos: [], memoria: [], integraciones: [], consumo: [], ubicaciones: [], restaurantes: [], config: {},
}

interface Ctx {
  datos: Datos; estado: EstadoCarga; restaurantesDisponibles: boolean; userId: string | null
  enVivo: EstadoEnVivo
  recargar: () => Promise<void>
  /** Ejecuta una acción (de acciones.ts), recarga y devuelve su error (o null). */
  hacer: (fn: () => Promise<string | null>) => Promise<string | null>
}
const CentralCtx = createContext<Ctx | null>(null)
export function useCentral(): Ctx {
  const c = useContext(CentralCtx)
  if (!c) throw new Error('useCentral fuera de CentralDatos')
  return c
}

// Tablas que ya no existen en el servidor (migración sin instalar) devuelven estos códigos
const SIN_TABLA = new Set(['42P01', 'PGRST205', '42883', 'PGRST202'])

export function CentralDatos({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<Datos>(VACIO)
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [restaurantesDisponibles, setRestaurantesDisponibles] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [enVivo, setEnVivo] = useState<EstadoEnVivo>('conectando')
  const vivo = useRef(true)

  const cargar = useCallback(async (silencioso: boolean) => {
    if (!silencioso) setEstado('cargando')
    try {
      const q = <T,>(p: PromiseLike<{ data: unknown; error: { code?: string } | null }>) => p.then(r => ({ filas: (r.data ?? []) as T[], error: r.error }))
      const [{ data: u }, dep, ag, ta, ap, pr, co, re, no, doc, me, inte, con, ub, cfg, rest] = await Promise.all([
        supabase.auth.getUser(),
        q<Departamento>(supabase.from('central_departamentos').select('*').order('anillo').order('orden')),
        q<Agente>(supabase.from('central_agentes').select('*').order('orden')),
        q<Tarea>(supabase.from('central_tareas').select('*').order('created_at', { ascending: false }).limit(500)),
        q<Aprobacion>(supabase.from('central_aprobaciones').select('*').order('created_at', { ascending: false }).limit(200)),
        q<Proyecto>(supabase.from('central_proyectos').select('*').order('created_at', { ascending: false }).limit(200)),
        q<Conversacion>(supabase.from('central_conversaciones').select('*').eq('archivada', false).order('created_at')),
        q<Reunion>(supabase.from('central_reuniones').select('*').order('inicio', { ascending: false }).limit(200)),
        q<Notificacion>(supabase.from('central_notificaciones').select('*').order('created_at', { ascending: false }).limit(100)),
        q<Documento>(supabase.from('central_documentos').select('*').order('updated_at', { ascending: false }).limit(300)),
        q<Memoria>(supabase.from('central_memoria').select('*').order('updated_at', { ascending: false }).limit(300)),
        q<Integracion>(supabase.from('central_integraciones').select('*').order('nombre')),
        q<Consumo>(supabase.from('central_consumo').select('*').order('periodo', { ascending: false }).limit(1000)),
        q<Ubicacion>(supabase.from('central_ubicaciones').select('*')),
        q<{ clave: string; valor: unknown }>(supabase.from('central_config').select('*')),
        supabase.rpc('central_restaurantes').then(r => ({ filas: (Array.isArray(r.data) ? r.data : []) as RestauranteCentral[], error: r.error as { code?: string } | null })),
      ])
      if (!vivo.current) return
      if (dep.error && SIN_TABLA.has(dep.error.code ?? '')) { setEstado('no_instalado'); return }
      const falla = [dep, ag, ta, ap, pr, co, re, no, doc, me, inte, con, ub, cfg].some(x => x.error)
      if (falla) { setEstado(silencioso ? 'listo' : 'error'); return }      // una recarga silenciosa fallida no borra lo que ya se ve
      setUserId(u.user?.id ?? null)
      setRestaurantesDisponibles(!rest.error)
      setDatos({
        departamentos: dep.filas, agentes: ag.filas, tareas: ta.filas, aprobaciones: ap.filas, proyectos: pr.filas, conversaciones: co.filas,
        reuniones: re.filas, notificaciones: no.filas, documentos: doc.filas, memoria: me.filas, integraciones: inte.filas, consumo: con.filas,
        ubicaciones: ub.filas, restaurantes: rest.filas, config: Object.fromEntries(cfg.filas.map(f => [f.clave, f.valor])),
      })
      setEstado('listo')
    } catch {
      if (vivo.current && !silencioso) setEstado('error')
    }
  }, [])

  useEffect(() => {
    vivo.current = true
    void cargar(false)
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar(true) }
    document.addEventListener('visibilitychange', alVolver)
    return () => { vivo.current = false; document.removeEventListener('visibilitychange', alVolver) }
  }, [cargar])

  const recargar = useCallback(() => cargar(true), [cargar])

  // Vuelve a pedir una sola tabla. Un fallo no borra lo que ya se ve.
  const refrescar = useCallback(async (tabla: string) => {
    const t = EN_VIVO[tabla]
    if (!t) return
    try {
      const r = await t.pedir()
      if (!vivo.current || r.error) return
      setDatos(d => ({ ...d, [t.clave]: (r.data ?? []) as never }))
    } catch { /* se conserva lo que ya se ve */ }
  }, [])

  // Conexión en vivo: se abre cuando Central ya cargó. RLS decide qué eventos le llegan a esta sesión.
  const listo = estado === 'listo'
  useEffect(() => {
    if (!listo) return
    let activo = true, yaConecto = false
    const pendientes = new Set<string>()
    let temporizador: ReturnType<typeof setTimeout> | null = null
    const volcar = () => { temporizador = null; const tablas = [...pendientes]; pendientes.clear(); tablas.forEach(t => void refrescar(t)) }
    const canal = supabase.channel('central-en-vivo')
    for (const tabla of Object.keys(EN_VIVO)) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => {
        pendientes.add(tabla)
        if (!temporizador) temporizador = setTimeout(volcar, ESPERA_AGRUPAR_MS)
      })
    }
    canal.subscribe(s => {
      if (!activo) return
      if (s === 'SUBSCRIBED') {
        setEnVivo('en_vivo')
        if (yaConecto) void cargar(true)   // volvió tras una caída: pudo perderse algo, se recarga todo una vez
        yaConecto = true
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setEnVivo('reconectando')
    })
    return () => { activo = false; if (temporizador) clearTimeout(temporizador); void supabase.removeChannel(canal) }
  }, [listo, cargar, refrescar])
  const hacer = useCallback(async (fn: () => Promise<string | null>) => {
    const error = await fn()
    await cargar(true)
    return error
  }, [cargar])

  const valor = useMemo<Ctx>(() => ({ datos, estado, restaurantesDisponibles, userId, enVivo, recargar, hacer }), [datos, estado, restaurantesDisponibles, userId, enVivo, recargar, hacer])
  return <CentralCtx.Provider value={valor}>{children}</CentralCtx.Provider>
}

/** Búsquedas que se repiten en muchas pantallas. */
export function useIndices() {
  const { datos } = useCentral()
  return useMemo(() => ({
    depto: (id: string | null | undefined) => datos.departamentos.find(d => d.id === id),
    agente: (id: string | null | undefined) => datos.agentes.find(a => a.id === id),
    agentesDe: (deptoId: string) => datos.agentes.filter(a => a.departamento_id === deptoId),
  }), [datos.departamentos, datos.agentes])
}

export const ABIERTA = (estado: string) => estado !== 'completada' && estado !== 'rechazada' && estado !== 'cancelada'
