import type { RestiBrainResponse, RestiTargetId } from './targets.ts'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()

const ir = (targetId: RestiTargetId, speech: string): RestiBrainResponse => ({ speech, action: 'WALK_AND_POINT', targetId })

/** Despedida: solo si TODA la frase lo es («adiós», «descansa, Resti», «chao, gracias»). «Vete al menú de ventas» o «dile adiós al cliente» no la guardan. */
const RELLENO = new Set(['resti', 'ya', 'bueno', 'ok', 'listo', 'gracias', 'por', 'favor', 'hoy', 'ahora', 'pues', 'hasta', 'mañana', 'manana'])
function esDespedida(t: string): boolean {
  const resto = t.split(' ').filter(w => w && !RELLENO.has(w)).join(' ')
  const sola = /^(descansa|guardate|guarda te|vete|adios|chao|chau|nos vemos)$/.test(resto)
  return sola || /^hasta luego( resti)?$/.test(t)
}

/** ¿Empieza como una petición de IR a algún sitio («muéstrame las mesas», «llévame a ventas», «abre nueva orden»)? Entonces manda el router local, aunque lleve un verbo de cambio. */
export function esFraseDeNavegacion(texto: string): boolean {
  return /^(muestrame|ensenam\w*|llevame|llevanos|ve a|ir a|vamos a|abre|abreme|senala\w*|donde (esta|estan|queda)|quiero ver|a ver|ver) /.test(norm(texto))
}

/** Nivel 1: frases directas, sin red. Devuelve null si no es una frase conocida (entonces se pregunta a la IA). */
export function intencionLocal(texto: string): RestiBrainResponse | null {
  const t = norm(texto)
  if (!t) return null
  if (esDespedida(t)) return { speech: 'Aquí estaré cuando me necesites.', action: 'SLEEP' }
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
  return null
}
