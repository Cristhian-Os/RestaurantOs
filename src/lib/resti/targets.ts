/** Lista blanca de lo único que Resti puede señalar o pulsar: botones de NAVEGACIÓN del panel del administrador. */
export const RESTI_TARGETS = [
  'card-ventas-hoy',
  'card-pendientes',
  'card-en-cocina',
  'card-listas',
  'card-completadas',
  'card-mesas-activas',
  'tab-nueva-orden',
  'tab-mesas',
  'btn-notificaciones',
] as const

export type RestiTargetId = typeof RESTI_TARGETS[number]

export const isRestiTarget = (id: unknown): id is RestiTargetId =>
  typeof id === 'string' && (RESTI_TARGETS as readonly string[]).includes(id)

export type RestiAction = 'NONE' | 'WALK_AND_POINT' | 'OPEN_VOICE_COMMANDS' | 'SLEEP'

export interface RestiBrainResponse {
  speech: string              // máximo 2 oraciones
  action: RestiAction
  targetId?: RestiTargetId    // solo valores de RESTI_TARGETS
}
