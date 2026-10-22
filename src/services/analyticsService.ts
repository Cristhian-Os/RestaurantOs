/**
 * analyticsService.ts — Asistente de Negocio. Todas las cifras las calcula la base de datos (funciones SQL del Bloque 11):
 * aquí solo se piden y se tipan. Nada se supone ni se inventa: un plato sin receta no tiene margen.
 */
import { supabase } from './supabaseClient'

export type Cuadrante = 'star' | 'cash_cow' | 'question_mark' | 'dog' | 'sin_receta'

export interface PlatoAnalisis {
  dish_id: string; nombre: string; precio: number; unidades: number; ingresos: number
  costo_receta: number | null; margen_pct: number | null; costo_incompleto: boolean; cuadrante: Cuadrante
}
export interface AnalisisMenu {
  dias: number; con_receta: number; sin_receta: number
  promedio_unidades: number | null; promedio_margen: number | null; platos: PlatoAnalisis[]
}

export interface AlertaFoodCost {
  dish_id: string; nombre: string; precio: number; costo_receta: number; margen_pct: number
  critico: boolean; costo_incompleto: boolean; precio_sugerido: number
}
export interface FoodCost { margen_minimo: number; platos_total: number; platos_con_receta: number; alertas: AlertaFoodCost[] }

export type AlertaRevision =
  | { regla: 'anulaciones_por_persona'; persona: string; pedidos: number; anulados: number; porcentaje: number }
  | { regla: 'anulaciones_24h'; anulados: number; promedio_diario: number }
export interface Revision { umbral_pct: number; min_pedidos: number; dias: number; alertas: AlertaRevision[] }

export interface Demanda {
  suficiente: boolean; dias_de_historial: number; mensaje?: string; desde?: string; hasta?: string
  dias: { dow: number; nombre: string; promedio_pedidos: number; dias_observados: number }[]
}

export interface Umbrales { anulacion_pct_max: number; min_pedidos: number; food_cost_margen_min: number }
export const UMBRALES_INICIALES: Umbrales = { anulacion_pct_max: 15, min_pedidos: 10, food_cost_margen_min: 60 }

async function pedir<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const analyticsService = {
  analisisMenu: (dias = 30) => pedir<AnalisisMenu>('analisis_menu', { p_dias: dias }),
  foodCost: () => pedir<FoodCost>('alertas_food_cost'),
  revision: (dias = 7) => pedir<Revision>('alertas_revision', { p_dias: dias }),
  demanda: () => pedir<Demanda>('demanda_por_dia', { p_semanas: 8 }),

  async cargarUmbrales(): Promise<Umbrales> {
    const { data } = await supabase.from('analytics_config').select('anulacion_pct_max, min_pedidos, food_cost_margen_min').maybeSingle()
    return data ? { anulacion_pct_max: Number(data.anulacion_pct_max), min_pedidos: Number(data.min_pedidos), food_cost_margen_min: Number(data.food_cost_margen_min) } : UMBRALES_INICIALES
  },
  async guardarUmbrales(u: Umbrales): Promise<string | null> {
    const { error } = await supabase.from('analytics_config').upsert(u, { onConflict: 'restaurant_id' })
    return error ? error.message : null
  },
}
