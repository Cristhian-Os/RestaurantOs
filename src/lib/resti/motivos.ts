/** Convierte el motivo de error de una carga en lote (viene de la base de datos) en una frase clara para el administrador. */
export function motivoClaro(motivo: string): string {
  const m = (motivo ?? '').toLowerCase()
  if (!m.trim()) return 'No pude guardar esta fila. Revisa sus datos.'
  if (m.includes('duplicate key') || m.includes('already exists') || m.includes('unique')) return 'Ya existe uno con ese nombre.'
  if (m.includes('null value') || m.includes('not-null') || m.includes('violates not-null')) return 'Falta un dato obligatorio.'
  if (m.includes('numero no es valido') || m.includes('número no es válido') || m.includes('invalid input syntax')) return 'Hay un número mal escrito. Usa solo cifras, por ejemplo 12000 o 3,5.'
  if (m.includes('precio no es un numero') || m.includes('precio no es un número')) return 'El precio no es un número válido. Escríbelo solo con cifras, por ejemplo 12000.'
  if (m.includes('fuera de rango') || m.includes('check constraint')) return 'Un valor está fuera de rango. No se aceptan negativos.'
  if (m.includes('precio no puede ser negativo')) return 'El precio no puede ser negativo.'
  if (m.includes('muy largo') || m.includes('entre 2 y 100')) return 'El nombre tiene un largo que no puedo guardar (entre 2 y 100 letras).'
  if (m.includes('unidad no valida') || m.includes('unidad no válida')) return 'La unidad no es válida. Usa kg, gramo, litro, ml, pieza o paquete.'
  if (m.includes('permission') || m.includes('row-level security') || m.includes('solo el administrador')) return 'Tu usuario no tiene permiso para esto. Entra como administrador.'
  return motivo.length > 140 ? motivo.slice(0, 137) + '…' : motivo
}

/** "12 mesas", "1 plato": concordancia simple para los resúmenes de Resti. */
export const cantidadTxt = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`
