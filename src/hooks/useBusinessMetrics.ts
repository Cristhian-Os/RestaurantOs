import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsService } from '../services/analyticsService'
import { supabase } from '../services/supabaseClient'

const MIN = 60 * 1000

export const useBusinessMetrics = () => {
  // La clave incluye el usuario: la caché nunca se comparte entre cuentas.
  const [uid, setUid] = useState<string | null>(null)
  useEffect(() => {
    let cancelado = false
    supabase.auth.getSession().then(({ data }) => { if (!cancelado) setUid(data.session?.user?.id ?? null) }).catch(() => {})
    return () => { cancelado = true }
  }, [])
  const enabled = !!uid
  const menu = useQuery({ queryKey: ['analytics', uid, 'menu'], queryFn: () => analyticsService.analisisMenu(30), staleTime: 10 * MIN, retry: 1, enabled })
  const foodCost = useQuery({ queryKey: ['analytics', uid, 'food_cost'], queryFn: () => analyticsService.foodCost(), staleTime: 10 * MIN, retry: 1, enabled })
  const revision = useQuery({ queryKey: ['analytics', uid, 'revision'], queryFn: () => analyticsService.revision(7), staleTime: 5 * MIN, retry: 1, enabled })
  const demanda = useQuery({ queryKey: ['analytics', uid, 'demanda'], queryFn: () => analyticsService.demanda(), staleTime: 10 * MIN, retry: 1, enabled })
  return { menu, foodCost, revision, demanda }
}
