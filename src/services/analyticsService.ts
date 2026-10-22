import { supabase } from './supabaseClient'

export interface MenuDishMetrics {
  dish_id: string
  dish_name: string
  price: number
  recipe_cost: number
  profit_margin: number
  units_sold: number
  revenue: number
  bcg_quadrant: 'star' | 'cash_cow' | 'question_mark' | 'dog'
  recommendation: string
}

export interface FoodCostAlert {
  dish_id: string
  dish_name: string
  new_margin: number
  critical: boolean
  suggested_price: number
}

export interface FraudPattern {
  pattern: string
  severity: 'low' | 'medium' | 'high'
  description: string
  affected_orders: number
}

export interface DemandPrediction {
  date: string
  predicted_units: number
  confidence: number
}

const PAGE_SIZE = 1000 // tope de PostgREST por petición

/** Trae TODAS las filas de una consulta paginando con range() (el tope por defecto es 1000 filas). */
async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = data || []
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return out
}

interface RawOrderItem {
  id?: string
  quantity?: number
  price?: number
  cancelled?: boolean
}

// orders.items es jsonb (array); por compatibilidad se acepta también un string JSON.
function parseItems(raw: unknown): RawOrderItem[] {
  if (Array.isArray(raw)) return raw as RawOrderItem[]
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }
  return []
}

/** Costo de receta de todos los platos del restaurante en una sola llamada. */
async function fetchRecipeCosts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('costos_recetas')
  if (error) throw error
  const map: Record<string, number> = {}
  for (const r of (data as { dish_id: string; costo: number | null }[] | null) || []) {
    map[r.dish_id] = Number(r.costo) || 0
  }
  return map
}

const BOGOTA_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', weekday: 'short' })
const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
/** Día de la semana (0=domingo) en hora de Bogotá, independiente de la zona del navegador. */
function bogotaDayOfWeek(d: Date): number {
  return DAY_INDEX[BOGOTA_DAY.format(d)] ?? d.getDay()
}

// Las funciones relanzan los errores: los hooks (react-query) los exponen en `error`
// para que la pantalla los muestre en vez de enseñar una lista vacía como si fuera real.
export const analyticsService = {
  // ─── Matriz BCG (Análisis de Menú) ────────────────────────
  async generateMenuBCGMatrix(): Promise<MenuDishMetrics[]> {
    // 1. Órdenes completadas (últimos 30 días), solo columnas necesarias y paginadas
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const orders = await fetchAllPages<{ items: unknown }>((from, to) =>
      supabase
        .from('orders')
        .select('items')
        .eq('status', 'completed')
        .neq('tipo_pedido', 'RAPPI') // Rappi no cuenta en ventas (precios distintos al menú)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    )

    // 2. Contar unidades e ingresos por plato
    const dishMetrics: Record<string, { units_sold: number; revenue: number }> = {}
    for (const order of orders) {
      for (const item of parseItems(order.items)) {
        if (!item.id || item.cancelled) continue
        const qty = item.quantity || 1
        const m = (dishMetrics[item.id] ||= { units_sold: 0, revenue: 0 })
        m.units_sold += qty
        m.revenue += qty * (item.price || 0)
      }
    }

    const dishIds = Object.keys(dishMetrics)
    if (dishIds.length === 0) return []

    // 1 query para los platos + 1 RPC para todos los costos (sin N+1)
    const [{ data: allDishData, error: dishErr }, costs] = await Promise.all([
      supabase.from('dishes').select('id, name, price').in('id', dishIds),
      fetchRecipeCosts(),
    ])
    if (dishErr) throw dishErr

    const dishMap: Record<string, { name: string; price: number }> = {}
    for (const d of allDishData || []) dishMap[d.id] = { name: d.name, price: d.price }

    // 3. Métricas por plato
    const allDishes = dishIds.map((dish_id) => {
      const m = dishMetrics[dish_id]
      const price = dishMap[dish_id]?.price || 0
      const recipe_cost = costs[dish_id] || 0
      const profit_margin = price > 0 ? ((price - recipe_cost) / price) * 100 : 0
      return {
        dish_id,
        dish_name: dishMap[dish_id]?.name || 'Desconocido',
        price,
        recipe_cost,
        profit_margin: Math.round(profit_margin),
        units_sold: m.units_sold,
        revenue: Math.round(m.revenue * 100) / 100,
        bcg_quadrant: 'question_mark' as const,
        recommendation: '',
      }
    })

    // Medias
    const avgPopularity = allDishes.reduce((sum, d) => sum + d.units_sold, 0) / (allDishes.length || 1)
    const avgMargin = allDishes.reduce((sum, d) => sum + d.profit_margin, 0) / (allDishes.length || 1)

    // 4. Clasificar en matriz BCG
    return allDishes.map((dish) => {
      let bcg: 'star' | 'cash_cow' | 'question_mark' | 'dog'
      let recommendation: string

      if (dish.units_sold >= avgPopularity && dish.profit_margin >= avgMargin) {
        bcg = 'star'
        recommendation = 'ESTRELLA: Alto volumen + Alta rentabilidad. Promocionar y mantener calidad.'
      } else if (dish.units_sold < avgPopularity && dish.profit_margin >= avgMargin) {
        bcg = 'cash_cow'
        recommendation = 'VACA LECHERA: Bajo volumen + Alta rentabilidad. Perfecto para márgenes, mantener el precio.'
      } else if (dish.units_sold >= avgPopularity && dish.profit_margin < avgMargin) {
        bcg = 'question_mark'
        recommendation = 'INTERROGANTE: Alto volumen + Baja rentabilidad. Subir precio o reducir costos.'
      } else {
        bcg = 'dog'
        recommendation = 'PERRO: Bajo volumen + Baja rentabilidad. Considerar retirar del menú.'
      }

      return { ...dish, bcg_quadrant: bcg, recommendation }
    })
  },

  // ─── Alerta Food Cost ─────────────────────────────────────
  async checkFoodCostAlerts(): Promise<FoodCostAlert[]> {
    const [{ data: dishes, error }, costs] = await Promise.all([
      supabase.from('dishes').select('id, name, price'),
      fetchRecipeCosts(),
    ])
    if (error) throw error

    const alerts: FoodCostAlert[] = []
    for (const dish of dishes || []) {
      // Guard contra división por cero (platos con precio 0 → sin alerta de margen)
      if (!dish.price || dish.price <= 0) continue
      const recipe_cost = costs[dish.id] || 0
      // Sin receta registrada no hay costo real: no se puede opinar sobre el margen
      if (recipe_cost <= 0) continue
      const new_margin = ((dish.price - recipe_cost) / dish.price) * 100

      // Si margen < 60%, generar alerta
      if (new_margin < 60) {
        const suggested_price = recipe_cost / 0.4 // 40% costo, 60% margen
        alerts.push({
          dish_id: dish.id,
          dish_name: dish.name,
          new_margin: Math.round(new_margin),
          critical: new_margin < 40, // coincide con el texto "(crítico < 40%)" de la pantalla
          suggested_price: Math.round(suggested_price),
        })
      }
    }
    return alerts
  },

  // ─── Auditoría Anti-Fraude ───────────────────────────────
  async detectFraudPatterns(): Promise<FraudPattern[]> {
    const patterns: FraudPattern[] = []
    const since24h = new Date(Date.now() - 86400000).toISOString()

    // Patrón 1: Cancelaciones anormales. Línea base = promedio diario de los 7 días previos.
    const since8d = new Date(Date.now() - 8 * 86400000).toISOString()
    const { data: cancelled, error: cancelErr } = await supabase
      .from('orders')
      .select('created_at')
      .eq('status', 'cancelled')
      .gte('created_at', since8d)
      .limit(PAGE_SIZE)
    if (cancelErr) throw cancelErr

    const cancelRows = cancelled || []
    const cancelCount = cancelRows.filter((o) => o.created_at >= since24h).length
    const prevDaily = (cancelRows.length - cancelCount) / 7
    // Umbral: 3x el promedio diario previo, con un mínimo de 5 para no alertar por ruido
    const cancelThreshold = Math.max(5, prevDaily * 3)

    if (cancelCount > cancelThreshold) {
      patterns.push({
        pattern: 'high_cancellations',
        severity: 'high',
        description: `Se detectaron ${cancelCount} cancelaciones en 24h (promedio diario previo: ~${prevDaily.toFixed(1)}). Revisar.`,
        affected_orders: cancelCount,
      })
    }

    // Patrón 2: Descuentos manuales excesivos
    const { data: ordersWithNotes, error: notesErr } = await supabase
      .from('orders')
      .select('notes')
      .not('notes', 'is', null)
      .gte('created_at', since24h)
      .limit(PAGE_SIZE)
    if (notesErr) throw notesErr

    const discountCount = (ordersWithNotes || []).filter((o) =>
      o.notes?.toLowerCase().includes('descuento'),
    ).length

    if (discountCount > 5) {
      patterns.push({
        pattern: 'excessive_manual_discounts',
        severity: 'medium',
        description: `${discountCount} órdenes con descuentos manuales registrados en las últimas 24 h.`,
        affected_orders: discountCount,
      })
    }

    // Patrón 3: Transacciones de monto muy bajo en la última hora.
    // Umbral en COP: menos de $1.000 no cubre ni el producto más barato del menú.
    const LOW_TOTAL_COP = 1000
    const { data: fastOrders, error: fastErr } = await supabase
      .from('orders')
      .select('total')
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 3600000).toISOString())
      .limit(PAGE_SIZE)
    if (fastErr) throw fastErr

    const veryFastCount = (fastOrders || []).filter((o) => o.total < LOW_TOTAL_COP).length

    if (veryFastCount > 10) {
      patterns.push({
        pattern: 'unusual_fast_transactions',
        severity: 'low',
        description: `${veryFastCount} transacciones menores a $1.000 en la última hora. Revisar.`,
        affected_orders: veryFastCount,
      })
    }

    return patterns
  },

  // ─── Predicción de Demanda ────────────────────────────────
  async predictDemandByDayOfWeek(): Promise<DemandPrediction[]> {
    // Órdenes de los últimos 90 días (solo created_at, paginado)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const orders = await fetchAllPages<{ created_at: string }>((from, to) =>
      supabase
        .from('orders')
        .select('created_at')
        .eq('status', 'completed')
        .gte('created_at', ninetyDaysAgo.toISOString())
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    )

    // Agrupar por día de semana en hora de Bogotá (0=domingo, 6=sábado)
    const countByDay: number[] = [0, 0, 0, 0, 0, 0, 0]
    for (const order of orders) {
      countByDay[bogotaDayOfWeek(new Date(order.created_at))]++
    }

    const daysLabel = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const weeks = 90 / 7
    const predictions: DemandPrediction[] = []

    for (let day = 0; day < 7; day++) {
      predictions.push({
        date: daysLabel[day],
        predicted_units: Math.round(countByDay[day] / weeks),
        confidence: countByDay[day] > 0 ? 0.85 : 0.6,
      })
    }

    return predictions
  },
}
