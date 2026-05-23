import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60000, gcTime: 10 * 60 * 1000 },
    mutations: { retry: 1 }
  }
})
