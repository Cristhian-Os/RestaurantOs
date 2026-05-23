import { useQuery } from '@tanstack/react-query'
import { analyticsService } from '../services/analyticsService'

export const useBusinessMetrics = () => {
  // BCG Matrix
  const bcgQuery = useQuery({
    queryKey: ['analytics', 'bcg_matrix'],
    queryFn: () => analyticsService.generateMenuBCGMatrix(),
    staleTime: 1000 * 60 * 60, // 1 hora
    retry: 2,
  })

  // Food Cost Alerts
  const foodCostQuery = useQuery({
    queryKey: ['analytics', 'food_cost_alerts'],
    queryFn: () => analyticsService.checkFoodCostAlerts(),
    staleTime: 1000 * 60 * 30, // 30 min
    retry: 2,
  })

  // Fraud Detection
  const fraudQuery = useQuery({
    queryKey: ['analytics', 'fraud_patterns'],
    queryFn: () => analyticsService.detectFraudPatterns(),
    staleTime: 1000 * 60 * 15, // 15 min
    retry: 2,
  })

  // Demand Prediction
  const demandQuery = useQuery({
    queryKey: ['analytics', 'demand_prediction'],
    queryFn: () => analyticsService.predictDemandByDayOfWeek(),
    staleTime: 1000 * 60 * 60 * 4, // 4 horas
    retry: 1,
  })

  return {
    bcg: {
      data: bcgQuery.data || [],
      isLoading: bcgQuery.isLoading,
      error: bcgQuery.error,
    },
    foodCost: {
      data: foodCostQuery.data || [],
      isLoading: foodCostQuery.isLoading,
      error: foodCostQuery.error,
    },
    fraud: {
      data: fraudQuery.data || [],
      isLoading: fraudQuery.isLoading,
      error: fraudQuery.error,
    },
    demand: {
      data: demandQuery.data || [],
      isLoading: demandQuery.isLoading,
      error: demandQuery.error,
    },
  }
}
