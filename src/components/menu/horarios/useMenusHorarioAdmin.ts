import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../services/supabaseClient'
import type {
  DiaEspecialFila, FranjaFila, MenuHorarioEstado, MenuHorarioFila, ProductoMenuFila,
} from '../../../lib/menuHorario'

export interface PlatoAdmin {
  id: string
  name: string
  category: string
  price: number
  has_sizes: boolean
  sizes: { nombre: string; precio: number }[]
  todo_el_dia: boolean
}
export interface ConfigMenus {
  menus_horario_activo: boolean
  zona_horaria: string
  menus_gracia_min: number
  menus_staff_fuera_horario: boolean
}
export interface ExcepcionFila {
  id: string
  tipo: 'forzar' | 'extender' | 'suspender'
  menu_id: string
  desde: string
  hasta: string | null
  nota: string | null
  created_by: string | null
  created_at: string
  cerrada_at: string | null
  cerrada_by: string | null
}
export interface AuditoriaFila {
  id: number
  actor_id: string | null
  accion: string
  tabla: string | null
  detalle: { antes?: Record<string, unknown>; despues?: Record<string, unknown> }
  created_at: string
}
export interface SedeFila { id: string; nombre: string; actual: boolean }

const CONFIG_INICIAL: ConfigMenus = { menus_horario_activo: false, zona_horaria: 'America/Bogota', menus_gracia_min: 10, menus_staff_fuera_horario: false }

/** Todo lo que necesita la pantalla "Menús por horario" del administrador, en vivo. */
export function useMenusHorarioAdmin() {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [menus, setMenus] = useState<MenuHorarioFila[]>([])
  const [franjas, setFranjas] = useState<FranjaFila[]>([])
  const [productos, setProductos] = useState<ProductoMenuFila[]>([])
  const [diasEsp, setDiasEsp] = useState<DiaEspecialFila[]>([])
  const [excepciones, setExcepciones] = useState<ExcepcionFila[]>([])
  const [config, setConfig] = useState<ConfigMenus>(CONFIG_INICIAL)
  const [platos, setPlatos] = useState<PlatoAdmin[]>([])
  const [sedes, setSedes] = useState<SedeFila[]>([])
  const [estado, setEstado] = useState<MenuHorarioEstado | null>(null)
  const [auditoria, setAuditoria] = useState<AuditoriaFila[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [rid, setRid] = useState<string | null>(null)
  const montado = useRef(true)

  const cargar = useCallback(async () => {
    const r = await supabase.rpc('current_restaurant_id')
    const id = typeof r.data === 'string' ? r.data : null
    if (!id) { if (montado.current) { setError('No se pudo identificar el restaurante'); setCargando(false) } return }
    const [m, f, p, de, ex, cfg, d, sd, est, au] = await Promise.all([
      supabase.from('menus_horario').select('*').order('created_at'),
      supabase.from('menu_horario_franjas').select('*'),
      supabase.from('menu_horario_productos').select('*'),
      supabase.from('menu_horario_dias_especiales').select('*').order('fecha'),
      supabase.from('menu_horario_excepciones').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('restaurant_config').select('menus_horario_activo, zona_horaria, menus_gracia_min, menus_staff_fuera_horario').eq('restaurant_id', id).maybeSingle(),
      supabase.from('dishes').select('id, name, category, price, has_sizes, sizes, todo_el_dia').neq('availability_status', 'discontinued').order('name'),
      supabase.rpc('mis_sedes'),
      supabase.rpc('menu_horario_estado', { p_restaurant_id: id, p_canal: 'personal' }),
      supabase.from('menu_horario_auditoria').select('*').order('created_at', { ascending: false }).limit(80),
    ])
    if (!montado.current) return
    const falla = m.error || f.error || p.error || de.error || d.error
    if (falla) { setError(falla.message); setCargando(false); return }
    setRid(id)
    setMenus((m.data ?? []) as MenuHorarioFila[])
    setFranjas((f.data ?? []) as FranjaFila[])
    setProductos(((p.data ?? []) as ProductoMenuFila[]).map(x => ({ ...x, precio_especial: x.precio_especial == null ? null : Number(x.precio_especial) })))
    setDiasEsp((de.data ?? []) as DiaEspecialFila[])
    setExcepciones((ex.data ?? []) as ExcepcionFila[])
    if (cfg.data) setConfig({ ...CONFIG_INICIAL, ...(cfg.data as Partial<ConfigMenus>) })
    setPlatos(((d.data ?? []) as PlatoAdmin[]).map(x => ({ ...x, price: Number(x.price), todo_el_dia: !!x.todo_el_dia, sizes: Array.isArray(x.sizes) ? x.sizes : [] })))
    setSedes(Array.isArray(sd.data) ? (sd.data as { id: string; nombre: string; actual: boolean }[]).map(s => ({ id: s.id, nombre: s.nombre, actual: !!s.actual })) : [])
    setEstado(est.error ? null : (est.data as MenuHorarioEstado))
    const filasAu = (au.data ?? []) as AuditoriaFila[]
    setAuditoria(filasAu)
    // Nombres de quienes hicieron cambios / controles
    const ids = [...new Set([...filasAu.map(a => a.actor_id), ...((ex.data ?? []) as ExcepcionFila[]).flatMap(e => [e.created_by, e.cerrada_by])].filter((x): x is string => !!x))]
    if (ids.length) {
      const { data: perfiles } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      if (montado.current) setNombres(Object.fromEntries(((perfiles ?? []) as { id: string; full_name: string | null }[]).map(x => [x.id, x.full_name || 'Un usuario'])))
    }
    setError(null)
    setCargando(false)
  }, [])

  useEffect(() => { montado.current = true; void cargar(); return () => { montado.current = false } }, [cargar])

  // En vivo: otro administrador cambia algo, o llega la hora de un cambio de franja
  useEffect(() => {
    if (!rid) return
    let espera: number | undefined
    const alCambiar = () => { window.clearTimeout(espera); espera = window.setTimeout(() => { void cargar() }, 500) }
    const filtro = `restaurant_id=eq.${rid}`
    let ch = supabase.channel(`menus-horario-admin-${rid}-${Math.random().toString(36).slice(2)}`)
    for (const t of ['menus_horario', 'menu_horario_franjas', 'menu_horario_productos', 'menu_horario_excepciones', 'menu_horario_dias_especiales']) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: filtro }, alCambiar)
    }
    ch = ch.subscribe()
    const iv = window.setInterval(() => { if (document.visibilityState === 'visible') void cargar() }, 60_000)
    return () => { window.clearTimeout(espera); window.clearInterval(iv); supabase.removeChannel(ch) }
  }, [rid, cargar])

  return { cargando, error, menus, franjas, productos, diasEsp, excepciones, config, platos, sedes, estado, auditoria, nombres, recargar: cargar }
}
