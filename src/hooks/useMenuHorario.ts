import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { aplicarMenuHorario, msHastaCambio, type MenuHorarioEstado, type PlatoBase } from '../lib/menuHorario'

const REFRESCO_MS = 120_000          // respaldo: por si el cambio lo hizo el administrador a mano
const MARGEN_MS = 1_500              // se vuelve a consultar un instante DESPUÉS del cambio de franja
const TOPE_TIMER_MS = 6 * 3_600_000  // los navegadores móviles duermen temporizadores largos: se re-arma cada 6 h

/**
 * Menú vigente según la hora del restaurante (la decide el SERVIDOR, no el dispositivo).
 *  - 'qr': menú público (solo menús marcados "mostrar en QR"). 'personal': mesero/caja/admin de esa sede.
 *  - Si el restaurante no usa menús por horario (o la función aún no existe en esa base) → estado null:
 *    la lista de platos queda EXACTAMENTE igual que siempre.
 *  - Se actualiza solo: al llegar la hora del cambio, al volver a la pestaña, al recuperar internet,
 *    cada 2 minutos y (personal) cuando el admin cambia algo.
 */
export function useMenuHorario(restaurantId: string | null | undefined, canal: 'qr' | 'personal') {
  const [estado, setEstado] = useState<MenuHorarioEstado | null>(null)
  const [listo, setListo] = useState(false)
  const [personalLibre, setPersonalLibre] = useState(false)   // el admin autorizó vender fuera de horario
  const recibidoEn = useRef(Date.now())
  const timer = useRef<number | undefined>(undefined)

  const cargar = useCallback(async () => {
    if (!restaurantId) return
    const { data, error } = await supabase.rpc('menu_horario_estado', { p_restaurant_id: restaurantId, p_canal: canal })
    recibidoEn.current = Date.now()
    setEstado(error || !data ? null : (data as MenuHorarioEstado))
    setListo(true)
  }, [restaurantId, canal])

  // Carga inicial y al cambiar de sede
  useEffect(() => { setEstado(null); setListo(false); void cargar() }, [cargar])

  // Temporizador hasta el próximo cambio de franja
  useEffect(() => {
    window.clearTimeout(timer.current)
    const ms = msHastaCambio(estado, Date.now(), recibidoEn.current)
    if (ms == null) return
    timer.current = window.setTimeout(() => { void cargar() }, Math.min(ms + MARGEN_MS, TOPE_TIMER_MS))
    return () => window.clearTimeout(timer.current)
  }, [estado, cargar])

  // Volver a la pestaña / recuperar conexión / respaldo periódico
  useEffect(() => {
    if (!restaurantId) return
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar() }
    const alConectar = () => { void cargar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', alConectar)
    const iv = window.setInterval(alVolver, REFRESCO_MS)
    return () => { document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('online', alConectar); window.clearInterval(iv) }
  }, [restaurantId, cargar])

  // Personal: reaccionar al instante a cambios del administrador y leer la autorización "fuera de horario"
  useEffect(() => {
    if (!restaurantId || canal !== 'personal') return
    let cancelado = false
    const leerAutorizacion = () => {
      supabase.from('restaurant_config').select('menus_staff_fuera_horario').eq('restaurant_id', restaurantId).maybeSingle()
        .then(({ data }) => { if (!cancelado) setPersonalLibre(data?.menus_staff_fuera_horario === true) })
    }
    leerAutorizacion()
    let espera: number | undefined
    const alCambiar = () => { window.clearTimeout(espera); espera = window.setTimeout(() => { void cargar(); leerAutorizacion() }, 400) }
    const filtro = `restaurant_id=eq.${restaurantId}`
    let ch = supabase.channel(`menu-horario-${restaurantId}-${Math.random().toString(36).slice(2)}`)
    for (const tabla of ['menus_horario', 'menu_horario_productos', 'menu_horario_franjas', 'menu_horario_excepciones', 'menu_horario_dias_especiales']) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: tabla, filter: filtro }, alCambiar)
    }
    ch = ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_config', filter: filtro }, alCambiar).subscribe()
    return () => { cancelado = true; window.clearTimeout(espera); supabase.removeChannel(ch) }
  }, [restaurantId, canal, cargar])

  /** Filtra y repercia una lista de platos según el menú vigente (o la deja igual si no aplica). */
  const aplicar = useCallback(<T extends PlatoBase>(platos: T[]): T[] =>
    aplicarMenuHorario(platos, estado, { mostrarTodo: canal === 'personal' && personalLibre }), [estado, canal, personalLibre])

  return { estado, listo, aplicar, recargar: cargar }
}
