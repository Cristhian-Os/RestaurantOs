/**
 * datos.tsx — carga única de los datos de Central y reparto a todas las pantallas (contexto de React).
 * Todo se lee con la sesión del dueño: la base (RLS + central_autorizado()) decide qué devuelve; sin 2 pasos devuelve vacío.
 * Se recarga al volver a la pestaña y después de cada acción. Nada de esto toca datos de un restaurante, salvo la lectura
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

const VACIO: Datos = {
  departamentos: [], agentes: [], tareas: [], aprobaciones: [], proyectos: [], conversaciones: [], reuniones: [], notificaciones: [],
  documentos: [], memoria: [], integraciones: [], consumo: [], ubicaciones: [], restaurantes: [], config: {},
}

interface Ctx {
  datos: Datos; estado: EstadoCarga; restaurantesDisponibles: boolean; userId: string | null
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
  const hacer = useCallback(async (fn: () => Promise<string | null>) => {
    const error = await fn()
    await cargar(true)
    return error
  }, [cargar])

  const valor = useMemo<Ctx>(() => ({ datos, estado, restaurantesDisponibles, userId, recargar, hacer }), [datos, estado, restaurantesDisponibles, userId, recargar, hacer])
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
