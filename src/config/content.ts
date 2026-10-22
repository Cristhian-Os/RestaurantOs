/**
 * content.ts — Contenido editable de la landing
 * ───────────────────────────────────────────────────────────────
 * Reseñas de restaurantes y preguntas frecuentes. Cambia estos
 * textos cuando tengas testimonios reales de tus clientes.
 */

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
    q: '¿Cómo empiezo a usar RestaurantOS?',
    a: 'Solicita acceso y nuestro equipo activa tu restaurante contigo: dejamos listo tu menú, mesas y equipo, y te entregamos tu usuario de administrador.',
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
