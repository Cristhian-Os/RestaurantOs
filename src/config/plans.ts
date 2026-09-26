/**
 * plans.ts — Definición de planes de RestaurantOS
 * ───────────────────────────────────────────────────────────────
 * Edita aquí precios, nombres y funciones. La landing y el registro
 * leen de este archivo, así no hay que tocar el diseño para ajustar
 * la oferta comercial.
 *
 * País inicial: Colombia. Precios en USD (referencia). Para mostrar
 * en COP, ajusta `currency` y `price`.
 */

export type PlanId = 'emprende' | 'pro' | 'premium'

export interface Plan {
  id:        PlanId
  name:      string
  price:     number          // por mes
  currency:  string          // símbolo mostrado
  tagline:   string
  featured?: boolean         // resalta el plan "recomendado"
  features:  string[]
  /** Solo Emprende: selector interactivo de # de mesas. */
  tableRange?: { min: number; max: number; default: number }
}

/** Días de prueba gratuita antes de requerir pago. */
export const TRIAL_DAYS = 7

export const PLANS: Plan[] = [
  {
    id:       'emprende',
    name:     'Emprende',
    price:    50,
    currency: '$',
    tagline:  'Para arrancar tu restaurante',
    tableRange: { min: 1, max: 12, default: 5 },
    features: [
      'Elige cuántas mesas necesitas',
      'Menú público con código QR',
      'Toma de pedidos',
      'Inventario básico',
      'Recetas de tus platos',
      'Corte de caja en Excel',
      '1 administrador',
    ],
  },
  {
    id:       'pro',
    name:     'Pro',
    price:    100,
    currency: '$',
    tagline:  'El favorito de los restaurantes',
    featured: true,
    features: [
      'Todo lo de Emprende',
      'Mesas ilimitadas',
      'Equipo ilimitado: meseros, cocina y caja',
      'Inventario y recetas avanzados',
      'Panel de cocina en tiempo real',
      'Tareas y turnos del personal',
      'Métricas y reportes de ventas',
      'Corte de caja profesional en Excel',
    ],
  },
  {
    id:       'premium',
    name:     'Premium',
    price:    170,
    currency: '$',
    tagline:  'Para crecer sin límites',
    features: [
      'Todo lo de Pro',
      'Pagos en línea: tus clientes pagan por la app',
      'Multi-sucursal',
      'Personalización total de tu marca',
      'Soporte prioritario',
    ],
  },
]
