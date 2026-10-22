/**
 * numeros.ts — números y textos de importación con las costumbres de Colombia (es-CO):
 * punto = miles, coma = decimales. Compartido por SetupWizard y RecetasPaso.
 */

// "12.000" (miles) y "3,5" (decimal). El punto solo es de miles si hay grupos de 3 dígitos y no empieza en 0
// ("1.250" → 1250, pero "0.250" y "1.5" son decimales).
export const numTxt = (v: string): string => {
  const t = String(v ?? '').replace(/[$\s]/g, '')
  if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t)) return t.replace(/\./g, '').replace(',', '.')
  return t.replace(',', '.')
}

/** Número a partir de texto es-CO; NaN si no es un número. */
export const numEsCO = (v: string): number => {
  const t = numTxt(v)
  return t === '' ? NaN : Number(t)
}

/**
 * Todo lo que viene de un archivo es texto: nunca se interpreta como fórmula.
 * Se quitan "=" y "@" iniciales; el "+" solo si no es un teléfono ("+57 300…" se conserva).
 */
export const limpiarTxt = (v: unknown): string => {
  const t = String(v ?? '').trim().replace(/^[=@]+/, '')
  return /^\+[\d\s()-]+$/.test(t) ? t : t.replace(/^\++/, '')
}

const UNIDAD: Record<string, string> = {
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  g: 'gramo', gr: 'gramo', gramo: 'gramo', gramos: 'gramo',
  l: 'litro', lt: 'litro', litro: 'litro', litros: 'litro',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml',
  pieza: 'pieza', piezas: 'pieza', unidad: 'pieza', unidades: 'pieza', und: 'pieza', u: 'pieza',
  paquete: 'paquete', paquetes: 'paquete', paq: 'paquete',
}
/** Unidad canónica o '' si no se reconoce (misma tabla que usa la base). */
export const unidadCanon = (v: unknown): string => UNIDAD[String(v ?? '').trim().toLowerCase()] ?? ''
