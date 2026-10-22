/**
 * plans.ts — Textos de los planes de RestaurantOS
 * ───────────────────────────────────────────────────────────────
 * Aquí viven SOLO los textos (qué incluye cada plan). Los precios, los nombres
 * y los límites vienen de la base de datos (tabla `planes`, ver usePlanes.ts),
 * para que la página, el panel de cobro y el chatbot digan siempre lo mismo.
 *
 * Regla: nada que todavía no exista se ofrece como incluido.
 */

export type PlanId = 'emprende' | 'pro' | 'premium'

export interface PlanTexto {
  id:        PlanId
  tagline:   string
  featured?: boolean         // resalta el plan "recomendado"
  features:  string[]
}

export const PLANS: PlanTexto[] = [
  {
    id:       'emprende',
    tagline:  'Para arrancar tu restaurante',
    features: [
      'Menú público con código QR',
      'Toma de pedidos',
      'Inventario y recetas de tus platos',
      'Facturas de compra con foto',
      'Corte de caja en Excel',
      'Pagos en línea: tus clientes pagan por la app',
      'Soporte estándar',
    ],
  },
  {
    id:       'pro',
    tagline:  'El favorito de los restaurantes',
    featured: true,
    features: [
      'Todo lo de Esencial',
      'Mesas y equipo sin límite: meseros, cocina y caja',
      'Panel de cocina en tiempo real',
      'Tareas y turnos del personal',
      'Métricas y reportes de ventas',
      'Soporte prioritario',
    ],
  },
  {
    id:       'premium',
    tagline:  'Para cadenas con varias sedes',
    features: [
      'Todo lo de Pro',
      'Varias sedes en una sola cuenta',
    ],
  },
]
