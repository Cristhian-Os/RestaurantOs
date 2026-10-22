import { useQuery } from '@tanstack/react-query'
import { analyticsService } from '../services/analyticsService'

export const useBusinessMetrics = () => {
  const menu = useQuery({ queryKey: ['analytics', 'menu'], queryFn: () => analyticsService.analisisMenu(30), staleTime: 1000 * 60 * 30, retry: 1 })
  const foodCost = useQuery({ queryKey: ['analytics', 'food_cost'], queryFn: () => analyticsService.foodCost(), staleTime: 1000 * 60 * 30, retry: 1 })
  const revision = useQuery({ queryKey: ['analytics', 'revision'], queryFn: () => analyticsService.revision(7), staleTime: 1000 * 60 * 15, retry: 1 })
  const demanda = useQuery({ queryKey: ['analytics', 'demanda'], queryFn: () => analyticsService.demanda(), staleTime: 1000 * 60 * 60 * 4, retry: 1 })
  return { menu, foodCost, revision, demanda }
}
