/**
 * usePlanes.ts — Precios y límites de los planes: UNA sola fuente (función `planes_publicos` en la base).
 * La página de inicio, el panel de suscripción y el chatbot leen de ahí; para cambiar un precio se edita
 * la tabla `planes` (función `plataforma_guardar_plan`), no el código.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import type { PlanId } from './plans'

export interface Desglose { base_cop: number; iva_cop: number; total_cop: number }

export interface PlanDB {
  id:             PlanId
  nombre:         string
  disponible:     boolean
  sede_extra_cop: number | null
  max_mesas:      number | null
  max_usuarios:   number | null
  max_docs_dian:  number | null
  mensual:        Desglose
  anual:          Desglose
}

let cache: PlanDB[] | null = null

export function usePlanes(): { planes: PlanDB[] | null; error: boolean } {
  const [planes, setPlanes] = useState<PlanDB[] | null>(cache)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (cache) return
    supabase.rpc('planes_publicos').then(({ data, error: e }) => {
      if (e || !Array.isArray(data)) { setError(true); return }
      cache = data as PlanDB[]
      setPlanes(cache)
    })
  }, [])
  return { planes, error }
}
