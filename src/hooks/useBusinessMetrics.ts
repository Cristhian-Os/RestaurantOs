import { useQuery } from '@tanstack/react-query'
import { analyticsService } from '../services/analyticsService'
import { supabase } from '../services/supabaseClient'

export const useBusinessMetrics = () => {
  // Alcance de la caché: el usuario actual. Sin esto, dos cuentas en el mismo
  // dispositivo compartirían las mismas métricas cacheadas.
  const scopeQuery = useQuery({
    queryKey: ['analytics', 'scope'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.user?.id ?? null
    },
    staleTime: 0,
    gcTime: 0,
  })
  const uid = scopeQuery.data ?? null
  const enabled = !!uid

  // BCG Matrix
  const bcgQuery = useQuery({
    queryKey: ['analytics', uid, 'bcg_matrix'],
    queryFn: () => analyticsService.generateMenuBCGMatrix(),
    enabled,
    staleTime: 1000 * 60 * 10, // 10 min
    retry: 2,
  })

  // Food Cost Alerts
  const foodCostQuery = useQuery({
    queryKey: ['analytics', uid, 'food_cost_alerts'],
    queryFn: () => analyticsService.checkFoodCostAlerts(),
    enabled,
    staleTime: 1000 * 60 * 5, // 5 min
    retry: 2,
  })

  // Fraud Detection
  const fraudQuery = useQuery({
    queryKey: ['analytics', uid, 'fraud_patterns'],
    queryFn: () => analyticsService.detectFraudPatterns(),
    enabled,
    staleTime: 1000 * 60 * 5, // 5 min
    retry: 2,
  })

  // Demand Prediction
  const demandQuery = useQuery({
    queryKey: ['analytics', uid, 'demand_prediction'],
    queryFn: () => analyticsService.predictDemandByDayOfWeek(),
    enabled,
    staleTime: 1000 * 60 * 10, // 10 min
    retry: 1,
  })

  return {
    bcg: {
      data: bcgQuery.data || [],
      isLoading: scopeQuery.isLoading || bcgQuery.isLoading,
      error: bcgQuery.error,
    },
    foodCost: {
      data: foodCostQuery.data || [],
      isLoading: scopeQuery.isLoading || foodCostQuery.isLoading,
      error: foodCostQuery.error,
    },
    fraud: {
      data: fraudQuery.data || [],
      isLoading: scopeQuery.isLoading || fraudQuery.isLoading,
      error: fraudQuery.error,
    },
    demand: {
      data: demandQuery.data || [],
      isLoading: scopeQuery.isLoading || demandQuery.isLoading,
      error: demandQuery.error,
    },
  }
}
