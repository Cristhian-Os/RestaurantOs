/**
 * content.ts — Contenido editable de la landing
 * ───────────────────────────────────────────────────────────────
 * Reseñas de restaurantes y preguntas frecuentes. Cambia estos
 * textos cuando tengas testimonios reales de tus clientes.
 */

/** Cupos de la promoción de lanzamiento (primeros N = plan sin costo).
 *  Bajado de 5 a 3 el 2026-09-26 — los 3 cupos ya están ocupados por
 *  restaurantes existentes, así que de aquí en adelante ningún restaurante
 *  nuevo la recibe automáticamente (nunca se activó de forma automática:
 *  siempre fue el dueño marcando is_promo=true a mano). */
export const PROMO_SLOTS = 3

/** WhatsApp del equipo de VENTAS al que Resti manda a quien quiere comprar (con indicativo). Vacío = Resti no muestra el botón y el equipo escribe desde los leads.
 *  Es el WhatsApp Business de RestaurantOS (dado por el dueño el 2026-10-22). CONTACTO_WHATSAPP es otro número, sin confirmar que sea de RestaurantOS. */
export const WHATSAPP_VENTAS: string = '+57 310 4645742'

/** WhatsApp de contacto para activar un restaurante (con indicativo, ej. +57 300 000 0000). Vacío = solo texto. */
export const CONTACTO_WHATSAPP = '+57 304 538 8425'

export interface Testimonial {
  quote:   string
  name:    string
  role:    string   // cargo + restaurante
  initial: string   // letra para el avatar
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'Pasamos de anotar pedidos en papel a tener todo en el celular. La cocina ya no pierde comandas y cerramos caja en minutos.',
    name:  'Cristhian B.',
    role:  'Dueño · Cholaos',
    initial: 'C',
  },
  {
    quote: 'El menú con QR nos subió las ventas. Los clientes piden más cuando ven las fotos y arman su propio plato.',
    name:  'Sofía C.',
    role:  'Administradora · Restaurante',
    initial: 'S',
  },
  {
    quote: 'Por fin sé cuánto me cuesta cada plato y qué ingredientes se me están acabando. El inventario se descuenta solo.',
    name:  'Juan G.',
    role:  'Chef · Cocina',
    initial: 'J',
  },
]

export interface Faq { q: string; a: string }

export const FAQS: Faq[] = [
  {
    q: '¿Necesito instalar algo?',
    a: 'No. RestaurantOS funciona desde el navegador de cualquier celular, tablet o computador. Solo entras con tu cuenta.',
  },
  {
    q: '¿Cómo funciona el cobro?',
    a: 'Se cobra desde el primer mes, sin permanencia, y la comisión de Wompi ya viene incluida en el precio. Puedes pagar mes a mes o el plan anual prepagado, que sale más barato. Si no te convence, te devolvemos el primer pago si lo pides dentro de los 30 días.',
  },
  {
    q: '¿Puedo cambiar de plan o cancelar?',
    a: 'Sí, en cualquier momento. Subes, bajas o cancelas tu plan sin permanencia ni penalidades.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Sí. Cada restaurante tiene su información completamente aislada y protegida. Nadie más puede ver tus datos.',
  },
  {
    q: '¿Sirve para varios tipos de negocio?',
    a: 'Restaurantes, heladerías, cafés, bares, comidas rápidas y más. Personalizas el menú y las categorías a tu gusto.',
  },
]
