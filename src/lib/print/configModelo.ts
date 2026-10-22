/**
 * configModelo.ts — configuración de impresión de un restaurante (Anexo H, 4) y reparto de los platos entre impresoras.
 * Parte pura (sin base de datos) para poder probarla. Se guarda en restaurant_printing.config.
 */
import type { Ancho } from './modelo.ts'
import type { ItemPedido } from './tickets.ts'

export interface Impresora { id: string; nombre: string; ancho: Ancho; activa: boolean; categorias: string[]; copias: number }
export type ReciboAlCobrar = 'preguntar' | 'siempre' | 'nunca'
export interface ConfigImpresion {
  impresoras: Impresora[]
  comandaAutomatica: boolean          // imprimir la comanda sola al enviar el pedido (en la "estación de impresión")
  recibo: ReciboAlCobrar              // qué hacer con el recibo al cobrar
  anchoRecibo: Ancho                  // papel del recibo y la pre-cuenta (la impresora de caja)
  propinaSugeridaPct: number          // 0 = sin línea de propina sugerida
  mensaje: string                     // agradecimiento en el recibo
  pie: string                         // pie legal; vacío = "Recibo de pago, no es factura electrónica"
}

export const CONFIG_INICIAL: ConfigImpresion = { impresoras: [], comandaAutomatica: false, recibo: 'preguntar', anchoRecibo: 80, propinaSugeridaPct: 0, mensaje: '¡Gracias por su visita!', pie: '' }

const texto = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
const num = (v: unknown, min: number, max: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def }

/** Lo que viene de la base (JSON libre) se limpia y se acota antes de usarlo. */
export function normalizarConfig(raw: unknown): ConfigImpresion {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const impresoras = (Array.isArray(r.impresoras) ? r.impresoras : []).slice(0, 12).map((x, i): Impresora => {
    const p = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return {
      id: texto(p.id, 40) || `imp${i + 1}`,
      nombre: texto(p.nombre, 40) || `Impresora ${i + 1}`,
      ancho: Number(p.ancho) === 80 ? 80 : 58,
      activa: p.activa !== false,
      categorias: (Array.isArray(p.categorias) ? p.categorias : []).map(c => texto(c, 60)).filter(Boolean).slice(0, 40),
      copias: num(p.copias, 1, 5, 1),
    }
  })
  return {
    impresoras,
    comandaAutomatica: r.comandaAutomatica === true,
    recibo: r.recibo === 'siempre' || r.recibo === 'nunca' ? r.recibo : 'preguntar',
    anchoRecibo: Number(r.anchoRecibo) === 58 ? 58 : 80,
    propinaSugeridaPct: num(r.propinaSugeridaPct, 0, 30, 0),
    mensaje: texto(r.mensaje ?? CONFIG_INICIAL.mensaje, 120),
    pie: texto(r.pie, 160),
  }
}

export interface Reparto { impresora: Impresora; items: ItemPedido[] }

/**
 * Reparte los platos entre las impresoras ACTIVAS. Las que tienen categorías propias se quedan con esos platos;
 * las que no tienen ninguna ("todo") reciben lo que ninguna otra reclamó. Un pedido con bebidas y comidas sale en dos comandas.
 * `categoriaDe` busca la categoría del plato (el pedido solo guarda su id).
 */
export function repartirPorImpresora<T extends ItemPedido>(items: T[], impresoras: Impresora[], categoriaDe: (it: T) => string | null | undefined): Reparto[] {
  const activas = impresoras.filter(i => i.activa)
  const especificas = activas.filter(i => i.categorias.length > 0)
  const generales = activas.filter(i => i.categorias.length === 0)
  const reclamado = new Set<T>()
  const out: Reparto[] = []
  for (const imp of especificas) {
    const suyos = items.filter(it => { const c = categoriaDe(it); return !!c && imp.categorias.includes(c) })
    suyos.forEach(s => reclamado.add(s))
    if (suyos.length) out.push({ impresora: imp, items: suyos })
  }
  const resto = items.filter(it => !reclamado.has(it))
  if (resto.length) for (const imp of generales) out.push({ impresora: imp, items: resto })
  return out
}
