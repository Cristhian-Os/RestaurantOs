import { createClient } from '@supabase/supabase-js'

// Variables de entorno inyectadas por Vite en build time
const supabaseUrl: string = (import.meta as any).env.VITE_SUPABASE_URL
const supabaseKey: string = (import.meta as any).env.VITE_SUPABASE_ANON_KEY

// BUG FIX #1: Guard para variables de entorno faltantes
// Sin esto, createClient falla silenciosamente con "undefined" como URL
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[RestaurantOS] Faltan variables de entorno:\n' +
    (!supabaseUrl ? '  - VITE_SUPABASE_URL\n' : '') +
    (!supabaseKey ? '  - VITE_SUPABASE_ANON_KEY\n' : '') +
    'Verifica tu archivo .env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
