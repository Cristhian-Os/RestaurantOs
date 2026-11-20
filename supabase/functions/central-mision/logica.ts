// Reglas puras de la misión diaria (sin red, sin IA). Se prueba con: node supabase/functions/central-mision/logica.test.ts
// Escoge UNA misión por escalera de prioridad, con hechos reales de la base. Nada inventado.

export interface Prospecto { id: string; nombre: string; etapa: string; proxima_accion: string; proxima_accion_en: string | null; tiene_expediente: boolean }
export interface Datos {
  ahora: Date
  prospectos: Prospecto[]                       // solo reales (es_ficticio = false)
  citasHoy: { nombre: string; hora: string }[]  // confirmadas de hoy (hora ya en texto local)
  tareasUrgentes: { titulo: string; prioridad: string }[] // P0/P1 abiertas
  campanaVigente: boolean
  ayerBloqueada: boolean
}
export interface Mision { mision: string; por_que: string; resultado_esperado: string; minutos: number; primer_paso: string; agente_apoyo: string | null; tareas: string[] }

const ETAPAS_CERRADAS = new Set(['perdido', 'no_contactar', 'cliente_activado'])
const corto = (t: string, n = 140) => t.slice(0, n)

export function elegirMision(d: Datos): Mision {
  const activos = d.prospectos.filter(p => !ETAPAS_CERRADAS.has(p.etapa))
  let m: Mision
  if (d.citasHoy.length > 0) {
    const c = d.citasHoy
    m = { mision: corto(`Atender ${c.length === 1 ? 'la cita de hoy' : `las ${c.length} citas de hoy`}: ${c.map(x => x.nombre).join(', ')}`), por_que: 'Una cita aceptada por el prospecto es lo más valioso del día.',
      resultado_esperado: 'Cita realizada y su resultado anotado.', minutos: 60, primer_paso: `Abre la cita de ${c[0].nombre} (${c[0].hora}) y repasa el paquete de llamada.`, agente_apoyo: 'mateo',
      tareas: c.slice(0, 3).map(x => corto(`Cita con ${x.nombre} a las ${x.hora}`, 100)) }
  } else if (d.tareasUrgentes.length > 0) {
    const t = d.tareasUrgentes
    m = { mision: corto(`Resolver lo urgente: ${t[0].titulo}`, 190), por_que: `Hay ${t.length} tarea(s) urgentes abiertas (P0/P1).`, resultado_esperado: 'Las urgentes resueltas o delegadas.', minutos: 30,
      primer_paso: 'Abre Tareas y revisa la más urgente.', agente_apoyo: null, tareas: t.slice(0, 3).map(x => corto(`${x.prioridad}: ${x.titulo}`, 100)) }
  } else {
    const vencidos = activos.filter(p => p.proxima_accion_en && new Date(p.proxima_accion_en) <= d.ahora)
      .sort((a, b) => (a.proxima_accion_en! < b.proxima_accion_en! ? -1 : 1))
    if (vencidos.length > 0) {
      m = { mision: corto(`Dar seguimiento a ${vencidos.length} prospecto(s) con acción vencida`), por_que: 'Una acción vencida enfría la oportunidad.', resultado_esperado: 'Cada prospecto con su próxima acción al día.', minutos: 30,
        primer_paso: `Abre ${vencidos[0].nombre}: ${vencidos[0].proxima_accion || 'define la próxima acción'}.`, agente_apoyo: 'mateo',
        tareas: vencidos.slice(0, 3).map(p => corto(`${p.nombre}: ${p.proxima_accion || 'definir próxima acción'}`, 100)) }
    } else if (!d.campanaVigente && activos.some(p => p.etapa === 'investigado')) {
      m = { mision: 'Activar la primera campaña', por_que: 'Hay prospectos investigados pero ninguna autorización de campaña vigente: sin ella no se puede contactar.', resultado_esperado: 'Una autorización de campaña activa.', minutos: 20,
        primer_paso: 'Abre Crecimiento y crea la autorización de campaña.', agente_apoyo: null, tareas: ['Definir ciudad, segmento y límites', 'Activar la autorización'] }
    } else {
      const sinInvestigar = activos.filter(p => p.etapa === 'prospecto_identificado' && !p.tiene_expediente)
      if (sinInvestigar.length > 0) {
        m = { mision: corto(`Investigar ${Math.min(3, sinInvestigar.length)} prospecto(s) identificados`), por_que: 'Sin expediente no hay con qué abrir una conversación útil.', resultado_esperado: 'Expediente de investigación listo.', minutos: 45,
          primer_paso: `Abre ${sinInvestigar[0].nombre} y llena su investigación con fuentes públicas.`, agente_apoyo: 'mateo', tareas: sinInvestigar.slice(0, 3).map(p => corto(`Investigar a ${p.nombre}`, 100)) }
      } else if (activos.length === 0) {
        m = { mision: 'Anotar los primeros 5 restaurantes reales de Armenia', por_que: 'Aún no hay prospectos reales: es el primer paso de todo el embudo.', resultado_esperado: '5 prospectos reales, cada uno con su fuente pública.', minutos: 45,
          primer_paso: 'Busca en Google Maps restaurantes de Armenia y anota nombre, dirección pública y enlace de la fuente.', agente_apoyo: 'mateo',
          tareas: ['Buscar 5 restaurantes en fuentes públicas', 'Crearlos en Prospectos con su enlace', 'Revisar que no estén en No contactar'] }
      } else {
        m = { mision: 'Mover un prospecto a su siguiente etapa', por_que: 'No hay nada vencido ni urgente: avanza el que esté más cerca de cerrar.', resultado_esperado: 'Un prospecto con etapa y próxima acción actualizadas.', minutos: 30,
          primer_paso: `Abre ${activos[0].nombre} y define su próxima acción.`, agente_apoyo: 'mateo', tareas: [corto(`Definir próxima acción de ${activos[0].nombre}`, 100)] }
      }
    }
  }
  if (d.ayerBloqueada) {
    m = { ...m, minutos: Math.min(m.minutos, 20), tareas: m.tareas.slice(0, 1), por_que: corto(`Ayer quedó bloqueada: hoy solo el primer paso. ${m.por_que}`, 590) }
  }
  return { ...m, tareas: m.tareas.slice(0, 3) }
}

export interface Cierre { tareas_completadas: number; cambios_de_etapa: number; notas: number; citas_realizadas: number; prospectos_creados: number; pendientes: string[] }

export function textoCierre(c: Cierre, mision: string | null, estado: string | null): string {
  const hechos = [`tareas cerradas: ${c.tareas_completadas}`, `cambios de etapa: ${c.cambios_de_etapa}`, `notas: ${c.notas}`, `citas realizadas: ${c.citas_realizadas}`, `prospectos nuevos: ${c.prospectos_creados}`]
  return [`🌙 Cierre del día`, mision ? `Misión (${estado ?? 'propuesta'}): ${mision}` : 'Hoy no hubo misión.', hechos.join(' · '),
    c.pendientes.length ? `Pendiente: ${c.pendientes.join('; ')}` : 'Sin pendientes urgentes.'].join('\n')
}

export function textoManana(m: Mision): string {
  return [`☀️ Misión de hoy (por reglas, sin IA): ${m.mision}`, `Por qué: ${m.por_que}`, `Primer paso: ${m.primer_paso} (${m.minutos} min)`].join('\n')
}
