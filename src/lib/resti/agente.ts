/**
 * Habilidad agéntica de Resti: entender una orden de cambio, prepararla, pedir confirmación y aplicarla.
 * Aquí solo está la parte pura (detectar la orden, la confirmación y armar lo que Resti dice); el trabajo con la base está en Resti.tsx
 * y reutiliza EXACTAMENTE las mismas reglas del modal de comandos (voiceCommands: propuestas validadas, RLS al escribir).
 */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()

/** ¿Lo que dijo suena a una orden de CAMBIAR datos (agotar, precio, inventario, mesa, gasto, tarea…)? Si no, se pregunta al cerebro como siempre. */
export function esOrdenDeCambio(frase: string): boolean {
  const t = norm(frase)
  if (t.length < 6) return false
  if (/^(cuanto|cuantos|cuantas|que|como|donde|quien|cual|cuando|por que|me (muestras|dices|llevas))\b/.test(t) && !/^que (el|la|los|las) \w+ (lleve|tenga|sea|venda)/.test(t)) return false   // preguntas y consultas
  return /\b(desactiva\w*|activa\w*|agot\w+|se (acabo|termino|agoto)|ya no (hay|queda)|volvio|sube\w*|baja\w*|cambia\w*|pon\w*|marca\w*|quita\w*|registra\w*|anota\w*|agrega\w*|resta\w*|suma\w*|crea\w*|asigna\w*|compre|le pague|lleve\w*|tenga\w*|aumenta\w*|reduce\w*|elimina\w*|borra\w*|renombra\w*|llama\w*|anade\w*|incluye\w*|cancel\w*|despide\w*|corrig\w+|edita\w*|actualiza\w*|modifica\w*|contrata\w*|complet\w+|termin\w+|rechaza\w*|da de alta)\b/.test(t)
    && /\b(helado|sabor|jugo|plato|precio|inventario|stock|mesa|gasto|tarea|turno|receta|proveedor|ingrediente|cholao|limon|fresa|vainilla|leche|topping\w*|bolas?|descripcion|tamano\w*|categoria|carta|menu|agotad\w+|disponible|pedido|orden|empleado|empleada|mesero|mesera|cocinero|cajero|cajera|equipo|restaurante|negocio|costo|minimo|rol|telefono|celular|prioridad|titulo)\b|\$|\d/.test(t)
}

/** ¿Es un cambio de la CARTA (toppings, bolas, tamaños, descripción, categoría, crear o quitar un plato)? Va al intérprete del menú. */
export function esCambioDeMenu(frase: string): boolean {
  const t = norm(frase)
  return /\b(toppings?|bolas?|sabores de (helado|jugo)|descripcion|tamanos?|categoria|a la carta|de la carta|del menu|al menu|en el menu|nuevo plato|nuevo producto|renombra\w*)\b/.test(t)
    || /\bcrea\w* (un |el )?(plato|producto)\b/.test(t) || /\bllama\w* /.test(t) && /\b(plato|cholao|helado)\b/.test(t)
}

/** ¿A qué parte del sistema va la orden? pedidos, equipo, menú (carta) o «comando» (inventario, precios, mesas, gastos, tareas…: lo de siempre). */
export function ambitoDe(frase: string): 'pedidos' | 'equipo' | 'operaciones' | 'menu' | 'comando' {
  const t = norm(frase)
  if (/\b(pedidos?|ordenes?)\b/.test(t) && /\b(cancel\w*|elimin\w*|anul\w*|listo|lista|cocina|pendiente|marca\w*|pasa\w*)\b/.test(t) && !/\b(nueva orden|nuevo pedido|tomar)\b/.test(t)) return 'pedidos'
  if (/\b(empleados?|empleadas?|meseros?|meseras?|cocineros?|cocineras?|cajeros?|cajeras?|trabajador\w*|equipo)\b/.test(t) && /\b(desactiva\w*|activa\w*|despide\w*|reactiva\w*|quita\w*|saca\w*)\b/.test(t)) return 'equipo'
  if (/\b(nombre del (restaurante|negocio|local)|renombra\w* (el|mi) (restaurante|negocio))\b/.test(t) || /\bllama\w* .*(restaurante|negocio)\b/.test(t)) return 'equipo'
  if (esOperacion(t)) return 'operaciones'
  return esCambioDeMenu(frase) ? 'menu' : 'comando'
}

/** Operación: corregir o borrar gastos y proveedores, altas y datos del equipo, estado o texto de tareas, ingredientes y mesas (agregar o quitar). Lo demás de «comando» se queda como estaba. */
function esOperacion(t: string): boolean {
  const gente = /\b(empleados?|empleadas?|meseros?|meseras?|cocineros?|cocineras?|cajeros?|cajeras?|trabajador\w*|equipo|personal)\b/
  if (/\bgastos?\b/.test(t) && /\b(corrig\w*|edita\w*|cambia\w*|modifica\w*|actualiza\w*|elimina\w*|borra\w*|quita\w*|anula\w*|era de|eran de|fueron)\b/.test(t) && !/\b(registra\w*|anota\w*|agrega\w*|nuevo gasto)\b/.test(t)) return true
  if (/\bproveedor(es)?\b/.test(t) && /\b(elimina\w*|borra\w*|quita\w*|saca\w*)\b/.test(t)) return true
  if (gente.test(t) && /\b(agrega\w*|anade\w*|crea\w*|contrata\w*|da de alta|nuevo|nueva|registra\w*)\b/.test(t)) return true
  if ((gente.test(t) || /\b(rol|telefono|celular)\b/.test(t)) && /\b(rol|telefono|celular|apellido|nombre|cambia\w* (a|de)|pasa\w* a|ascien\w*)\b/.test(t) && /\b(cambia\w*|edita\w*|actualiza\w*|pon\w*|pasa\w*|corrig\w*|modifica\w*)\b/.test(t)) return true
  if (/\btareas?\b/.test(t) && /\b(complet\w*|termin\w*|rechaz\w*|progreso|prioridad|titulo|descripcion|marca\w*|cambia\w*|edita\w*|renombra\w*)\b/.test(t) && !/\b(crea\w*|asigna\w*|nueva|nuevo)\b/.test(t)) return true
  if (/\bingredientes?\b/.test(t) && /\b(nuevo|nueva|crea\w*|agrega\w*|anade\w*|costo|minimo|unidad|renombra\w*|nombre|cambia\w*)\b/.test(t) && !/\b(stock|inventario|resta\w*|suma\w*|quedan?)\b/.test(t)) return true
  if (/\bcosto\b/.test(t) && /\b(por (kilo|litro|libra|unidad|gramo)|del ingrediente|de la (fresa|leche|mora|crema))\b/.test(t)) return true
  if (/\bmesas?\b/.test(t) && /\b(agrega\w*|anade\w*|crea\w*|nueva|nuevo|quita\w*|elimina\w*|borra\w*|desactiva\w*)\b/.test(t) && !/\b(mesera|libre|ocupada|reservada)\b/.test(t)) return true
  return false
}

/** Confirmación REFORZADA para cambios delicados (cancelar un pedido, desactivar a alguien): no basta un «sí» suelto; hay que decir de qué se trata. */
export const esConfirmacionReforzada = (frase: string) => esConfirmacion(frase) && /\b(cancel\w*|desactiv\w*|elimin\w*|quit\w*|borr\w*|confirm\w*|anul\w*)\b/.test(norm(frase))

/** "sí, aplícalo" cuando hay un cambio esperando confirmación. Solo el comienzo de la frase, para no confundirlo con otra cosa. */
export const esConfirmacion = (frase: string) => /^(si|sii+|dale|de una|aplicalo|aplicalos|aplica|confirmo|confirma|confirmado|hazlo|hagale|listo|ok|okay|claro|por favor|correcto|exacto|eso es)\b/.test(norm(frase))
export const esCancelacion = (frase: string) => /^(no|nop|cancela\w*|dejalo|olvidalo|ahora no|mejor no|para|detente|alto)\b/.test(norm(frase))

export interface PropuestaCorta { title: string; detail: string; change: unknown | null; problem?: string }

/** Lo que Resti dice al proponer el cambio (corto: va por voz y en el globo). */
export function resumenParaDecir(ps: PropuestaCorta[]): string {
  const ok = ps.filter(p => p.change)
  if (ok.length === 0) return 'No pude preparar ese cambio.'
  if (ok.length === 1) return `${limpiarFrase(ok[0].title, ok[0].detail)} ¿Lo aplico?`
  return `Preparé ${ok.length} cambios. Míralos en pantalla y dime sí para aplicarlos.`
}
/** Para decirlo en voz alta: sin símbolos ("·", "→") que el sintetizador lee mal. */
const limpiarFrase = (title: string, detail: string) => {
  const ti = String(title ?? '').replace(/\s*·\s*/g, ', ').replace(/[«»]/g, '').trim()
  const de = String(detail ?? '').trim().replace(/^(.+?)\s*→\s*(.+)$/, 'de $1 a $2').replace(/\s*→\s*/g, ' a ').replace(/[«»]/g, '')
  const t = [ti, de].filter(Boolean).join(': ')
  return /[.!?]$/.test(t) ? t : t + '.'
}

export function resumenAplicado(hechos: number, fallos: string[]): string {
  if (fallos.length === 0) return hechos === 1 ? 'Listo, ya lo apliqué.' : `Listo, apliqué los ${hechos} cambios.`
  if (hechos === 0) return `No pude aplicarlo: ${fallos[0]}`
  return `Apliqué ${hechos}, pero uno falló: ${fallos[0]}`
}
