/**
 * menuOptions.ts — lógica compartida del constructor de producto
 * (menú del cliente, pedido de caja/mesero y edición de pedidos).
 * Funciones puras: sin supabase ni React, para poder probarlas solas
 * (ver scripts/menuOptions.check.ts).
 */
import type { Dish, DishOptionGroup, ItemSel } from '../types'

export interface MenuCategory { value: string; label: string; emoji?: string }

// Config del menú guardada en restaurant_config.modules_enabled. Las listas
// *Off son lo que el cajero marcó como agotado en "Gestión del menú".
export interface MenuConfig {
  categories:    MenuCategory[]
  heladoFlavors: string[]
  jugoFlavors:   string[]
  heladoOff:     string[]
  jugoOff:       string[]
  toppingsOff:   string[]
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

export function parseMenuConfig(mods: unknown): MenuConfig {
  const m = (mods && typeof mods === 'object' ? mods : {}) as Record<string, unknown>
  return {
    categories:    Array.isArray(m.categories) ? (m.categories as MenuCategory[]).filter(c => c?.value) : [],
    heladoFlavors: strList(m.helado_flavors),
    jugoFlavors:   strList(m.jugo_flavors),
    heladoOff:     strList(m.helado_flavors_off),
    jugoOff:       strList(m.jugo_flavors_off),
    toppingsOff:   strList(m.toppings_off),
  }
}

// Orden de aparición de categorías = orden del arreglo de config (se cambia
// con ▲▼ en Menú → Configurar). Las que no están configuradas van al final
// en el orden en que llegaron (sort estable).
export function orderCategories(present: string[], config: { value: string }[] = []): string[] {
  const pos = new Map(config.map((c, i) => [c.value, i]))
  return [...present].sort((a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9))
}

// Opciones visibles: las activas + las que ya venían elegidas (al editar un
// pedido no se pierde de vista un sabor que se agotó después).
export const visibleOptions = (all: string[], off: string[], chosen: string[] = []) =>
  all.filter(x => !off.includes(x) || chosen.includes(x))

// ¿El plato tiene algo que elegir en el constructor?
export const hasOptions = (dish: Dish) =>
  !!dish.has_sizes || (dish.options?.length ?? 0) > 0 || (dish.tags?.length ?? 0) > 0 || (dish.toppings?.length ?? 0) > 0

export function defaultSel(dish: Dish): ItemSel {
  return dish.has_sizes && dish.sizes?.length ? { size: dish.sizes[0].nombre } : {}
}

export function selectedLabels(g: DishOptionGroup, gi: number, sel: ItemSel): string[] {
  const k = String(gi)
  if (g.multiple) return sel.opcionMulti?.[k] ?? []
  return sel.opcion?.[k] ? [sel.opcion[k]] : []
}

// ¿Cuántos sabores pide el grupo gi con la selección actual?
export function flavorsNeeded(g: DishOptionGroup, gi: number, sel: ItemSel): number {
  if (g.tipo === 'helado' || g.tipo === 'jugo') return g.cantidad ?? 1
  if (g.tipo === 'opcion') {
    const chosen = (g.opciones ?? []).filter(o => selectedLabels(g, gi, sel).includes(o.label))
    return Math.max(0, ...chosen.map(o => o.helado ?? 0))
  }
  return 0
}

export function selIsValid(dish: Dish, sel: ItemSel): boolean {
  return (dish.options ?? []).every((g, gi) => {
    if (g.tipo === 'opcion' && selectedLabels(g, gi, sel).length === 0) return false
    const need = flavorsNeeded(g, gi, sel)
    const n = sel.helado?.[String(gi)]?.length ?? 0
    return need > 0 ? n >= 1 && n <= need : true
  })
}

// Precio unitario estimado (el real lo recalcula el servidor con la misma regla).
export function unitPriceFor(dish: Dish, sel: ItemSel): number {
  const size = dish.has_sizes ? (dish.sizes?.find(s => s.nombre === sel.size) ?? dish.sizes?.[0]) : undefined
  const tops = (dish.toppings ?? [])
    .filter(t => sel.toppings?.includes(t.nombre))
    .reduce((s, t) => s + (Number(t.precio) || 0), 0)
  return (size ? Number(size.precio) : Number(dish.price)) + tops
}

interface Swap { ingrediente_id: string; ingrediente_nombre: string; sustituto_nombre: string | null }

// Texto de la selección para las notas del pedido (lo que lee cocina).
export function describeSel(dish: Dish, sel: ItemSel, shortages: Swap[] = []): string {
  const parts: string[] = []
  if (dish.has_sizes && sel.size) parts.push(`Tamaño: ${sel.size}`)
  ;(dish.options ?? []).forEach((g, gi) => {
    const flavors = sel.helado?.[String(gi)] ?? []
    if (g.tipo === 'helado' || g.tipo === 'jugo') {
      if (flavors.length) parts.push(`${g.nombre}: ${flavors.join(', ')}`)
      return
    }
    const labels = selectedLabels(g, gi, sel)
    if (labels.length) parts.push(labels.join(' + ') + (flavors.length ? ` (${flavors.join(', ')})` : ''))
  })
  if (sel.toppings?.length) parts.push(`Toppings: ${sel.toppings.join(', ')}`)
  if (sel.extras?.length) parts.push(`Adicionales: ${sel.extras.join(', ')}`)
  for (const s of shortages) {
    if (s.sustituto_nombre && sel.swaps?.includes(s.ingrediente_id)) parts.push(`Cambio: ${s.ingrediente_nombre} → ${s.sustituto_nombre}`)
  }
  return parts.join(' · ')
}

// Notas finales de la línea: opciones + comentario libre.
export const lineNotes = (optsText: string, comment?: string) =>
  [optsText, comment?.trim()].filter(Boolean).join(' · ')

export const toggleIn = (list: string[] | undefined, x: string) =>
  (list ?? []).includes(x) ? (list ?? []).filter(v => v !== x) : [...(list ?? []), x]

// Fecha de hoy en Colombia (YYYY-MM-DD), igual que hoy_local() en la base.
export const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
