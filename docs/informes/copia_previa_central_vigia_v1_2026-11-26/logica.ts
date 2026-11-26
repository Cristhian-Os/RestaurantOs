// Reglas puras del vigia de Central: datos reales -> hallazgos. Sin red ni base de datos.
export interface Restaurante { id: string; name: string; active: boolean; created_at: string; trial_ends_at: string | null }
export interface Suscripcion { restaurant_id: string; status: string; current_period_end: string | null; trial_ends_at: string | null }
export interface Opinion { numero: number; titulo: string; urgencia: string | null; created_at: string; tipo: string | null }
export interface Datos {
  ahora: Date
  restaurantes: Restaurante[]
  suscripciones: Suscripcion[]
  pedidosPorRestaurante: Record<string, number>
  opiniones: Opinion[]
}
export interface Hallazgo {
  clave: string
  titulo: string; detalle: string
  agente: string; departamento: string
  prioridad: 'P0' | 'P1' | 'P2' | 'P3'
}

const DIA = 86_400_000
const dias = (a: Date, b: string | null) => (b ? (new Date(b).getTime() - a.getTime()) / DIA : null)

export function evaluar(d: Datos): Hallazgo[] {
  const h: Hallazgo[] = []
  const subDe = new Map(d.suscripciones.map(s => [s.restaurant_id, s]))

  for (const r of d.restaurantes) {
    const edad = (d.ahora.getTime() - new Date(r.created_at).getTime()) / DIA
    const s = subDe.get(r.id)
    const pedidos = d.pedidosPorRestaurante[r.id] ?? 0

    if (edad <= 2) {
      h.push({ clave: `bienvenida:${r.id}`, titulo: `Dar la bienvenida a ${r.name}`, detalle: `Restaurante nuevo (${Math.max(0, Math.round(edad * 24))} h). Escíbele, ayúdale a configurar el menú y ofrécele una demo corta.`, agente: 'mateo', departamento: 'ventas', prioridad: 'P2' })
    }
    if (s && s.status !== 'active' && s.status !== 'trialing') {
      h.push({ clave: `suscripcion:${r.id}:${s.status}`, titulo: `Suscripción de ${r.name} en estado "${s.status}"`, detalle: 'Revisar el cobro y contactar al dueño antes de que pierda el servicio.', agente: 'dani', departamento: 'finanzas', prioridad: 'P1' })
    }
    const finPrueba = dias(d.ahora, s?.trial_ends_at ?? r.trial_ends_at)
    if (finPrueba !== null && finPrueba >= 0 && finPrueba <= 3) {
      h.push({ clave: `prueba:${r.id}:${(s?.trial_ends_at ?? r.trial_ends_at ?? '').slice(0, 10)}`, titulo: `La prueba de ${r.name} termina en ${Math.ceil(finPrueba)} día(s)`, detalle: 'Contactar para cerrar el plan antes de que termine.', agente: 'mateo', departamento: 'ventas', prioridad: 'P1' })
    }
    const finPeriodo = dias(d.ahora, s?.current_period_end ?? null)
    if (s?.status === 'active' && finPeriodo !== null && finPeriodo >= 0 && finPeriodo <= 3) {
      h.push({ clave: `renovacion:${r.id}:${(s.current_period_end ?? '').slice(0, 10)}`, titulo: `${r.name} renueva en ${Math.ceil(finPeriodo)} día(s)`, detalle: 'Confirmar que el cobro automático esté en orden.', agente: 'dani', departamento: 'finanzas', prioridad: 'P3' })
    }
    if (r.active && edad > 7 && pedidos === 0) {
      h.push({ clave: `inactivo:${r.id}`, titulo: `${r.name} no ha recibido pedidos en 3 días`, detalle: 'Posible abandono: llamar, preguntar si tiene algún problema y ofrecer ayuda.', agente: 'crystal', departamento: 'exito', prioridad: 'P2' })
    }
  }

  for (const o of d.opiniones) {
    const horas = (d.ahora.getTime() - new Date(o.created_at).getTime()) / 3_600_000
    const urgente = (o.urgencia ?? '').toLowerCase().startsWith('alta') || (o.urgencia ?? '').toLowerCase() === 'urgente'
    if (urgente || horas >= 12) {
      h.push({ clave: `opinion:${o.numero}`, titulo: `Opinión #${o.numero} sin atender: ${o.titulo}`.slice(0, 160), detalle: `${o.tipo ?? 'Opinión'} ${urgente ? 'urgente' : 'sin respuesta hace ' + Math.floor(horas) + ' h'}. Revisarla en Opinión y responder al usuario.`, agente: 'sofia', departamento: 'soporte', prioridad: urgente ? 'P1' : 'P2' })
    }
  }
  return h
}

export function resumenTelegram(nuevos: Hallazgo[], total: number): string {
  if (!nuevos.length) return ''
  const orden = [...nuevos].sort((a, b) => a.prioridad.localeCompare(b.prioridad))
  const lineas = orden.slice(0, 5).map(x => `• ${x.prioridad} ${x.titulo}`)
  const mas = orden.length > 5 ? `\n…y ${orden.length - 5} más en Central → Tareas.` : ''
  return `🔎 Central revisó la plataforma (${total} puntos vigilados). Nuevo:\n${lineas.join('\n')}${mas}`.slice(0, 900)
}
