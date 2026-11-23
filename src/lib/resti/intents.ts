import type { RestiBrainResponse, RestiTargetId } from './targets.ts'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()

const ir = (targetId: RestiTargetId, speech: string): RestiBrainResponse => ({ speech, action: 'WALK_AND_POINT', targetId })

/** Nivel 1: frases directas, sin red. Devuelve null si no es una frase conocida (entonces se pregunta a la IA). */
export function intencionLocal(texto: string): RestiBrainResponse | null {
  const t = norm(texto)
  if (!t) return null
  if (/\b(descansa|guardate|guarda ?te|vete|adios|chao|hasta luego)\b/.test(t)) return { speech: 'Aquí estaré cuando me necesites.', action: 'SLEEP' }
  if (/comandos? de voz|(cambia|cambiar|sube|subir|baja|bajar|ajusta|ajustar) (el )?(precio|stock|inventario)|registra(r)? (un )?gasto/.test(t))
    return { speech: 'Abro los comandos de voz. Ahí confirmas cada cambio antes de guardarlo.', action: 'OPEN_VOICE_COMMANDS' }
  if (/nueva orden|nuevo pedido|tomar (un )?pedido|abre.* orden/.test(t)) return ir('tab-nueva-orden', 'Aquí puedes tomar una nueva orden.')
  if (/mesas activas/.test(t)) return ir('card-mesas-activas', 'Estas son tus mesas activas.')
  if (/\bmesas?\b/.test(t)) return ir('tab-mesas', 'Aquí está el mapa de mesas.')
  if (/\bventas?\b/.test(t)) return ir('card-ventas-hoy', 'Aquí ves las ventas de hoy.')
  if (/pendientes?/.test(t)) return ir('card-pendientes', 'Estos son los pedidos pendientes.')
  if (/completad[ao]s?/.test(t)) return ir('card-completadas', 'Estas son las órdenes completadas de hoy.')
  if (/\b(listas?|listos?)\b/.test(t)) return ir('card-listas', 'Estas son las órdenes listas.')
  if (/\bcocina\b/.test(t)) return ir('card-en-cocina', 'Te muestro la cocina.')
  if (/notificacion/.test(t)) return ir('btn-notificaciones', 'Aquí están las notificaciones.')
  return null
}
