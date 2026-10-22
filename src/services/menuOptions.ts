/**
 * menuOptions.ts — lógica compartida del constructor de producto
 * (menú del cliente, pedido de caja/mesero y edición de pedidos).
 * Funciones puras: sin supabase ni React, para poder probarlas solas
 * (ver scripts/menuOptions.check.ts).
 */
import type { Dish, DishOptionGroup, ItemSel, OptionGroupV2, OptionItem, OptionList } from '../types'

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
  optionsV2:     boolean   // interruptor por restaurante (modules_enabled.options_v2): opciones universales
  listas:        ListMap   // listas de opciones (option_lists + las heredadas de sabores)
  listaNombres:  Record<string, string>   // nombre visible de cada lista, por key
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

export function parseMenuConfig(mods: unknown): MenuConfig {
  const m = (mods && typeof mods === 'object' ? mods : {}) as Record<string, unknown>
  const base = {
    categories:    Array.isArray(m.categories) ? (m.categories as MenuCategory[]).filter(c => c?.value) : [],
    heladoFlavors: strList(m.helado_flavors),
    jugoFlavors:   strList(m.jugo_flavors),
    heladoOff:     strList(m.helado_flavors_off),
    jugoOff:       strList(m.jugo_flavors_off),
    toppingsOff:   strList(m.toppings_off),
    optionsV2:     m.options_v2 === true,
  }
  return {
    ...base, listas: listasHeredadas(base as MenuConfig),
    listaNombres: { sabores_helado: 'Sabores de helado', sabores_jugo: 'Sabores de jugo' },
  }
}

// Suma las listas guardadas (option_lists) a la config; las guardadas mandan sobre las heredadas.
export const conListas = (menu: MenuConfig, guardadas: OptionList[]): MenuConfig => ({
  ...menu, listas: mezclarListas(guardadas, menu),
  listaNombres: { ...menu.listaNombres, ...Object.fromEntries(guardadas.map(l => [l.key, l.nombre])) },
})

// Interpreta el JSON que devuelve listas_opciones_publicas (menú del cliente).
export function listasDesdeRpc(raw: unknown): OptionList[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(l => l && typeof l.key === 'string' && Array.isArray(l.items))
    .map(l => ({ key: l.key, nombre: String(l.nombre ?? l.key), items: l.items as OptionItem[], sort_order: Number(l.sort_order) || 0 }))
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

// Texto de la selección para las notas del pedido (lo que lee cocina):
// solo lo elegido — tamaño · sabores/opciones · toppings — sin etiquetas.
export function describeSel(dish: Dish, sel: ItemSel, shortages: Swap[] = []): string {
  const parts: string[] = []
  if (dish.has_sizes && sel.size) parts.push(sel.size)
  ;(dish.options ?? []).forEach((g, gi) => {
    const flavors = sel.helado?.[String(gi)] ?? []
    if (g.tipo === 'helado' || g.tipo === 'jugo') {
      if (flavors.length) parts.push(flavors.join(', '))
      return
    }
    const labels = selectedLabels(g, gi, sel)
    if (labels.length) parts.push(labels.join(' + ') + (flavors.length ? ` (${flavors.join(', ')})` : ''))
  })
  if (sel.toppings?.length) parts.push(sel.toppings.join(', '))
  if (sel.extras?.length) parts.push(sel.extras.join(', '))
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

// Forma canónica de una selección para compararlas: ignora el orden en que se tocaron
// los chips y los vacíos (un grupo sin sabores = grupo ausente).
function canon(v: unknown): unknown {
  if (Array.isArray(v)) { const a = v.map(canon).filter(x => x !== undefined); return a.length ? a.sort() : undefined }
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const c = canon((v as Record<string, unknown>)[k])
      if (c !== undefined) o[k] = c
    }
    return Object.keys(o).length ? o : undefined
  }
  if (typeof v === 'string') { const t = v.trim(); return t === '' ? undefined : t }
  return v ?? undefined
}

// Cada unidad de un producto se elige por separado (dos cholaos pueden llevar sabores y
// toppings distintos). Al enviar, las unidades con exactamente la misma selección se
// juntan en una línea con cantidad; las distintas quedan como líneas aparte.
export function groupUnits(units: ItemSel[]): { sel: ItemSel; qty: number }[] {
  const groups = new Map<string, { sel: ItemSel; qty: number }>()
  for (const sel of units) {
    const key = JSON.stringify(canon(sel) ?? {})
    const g = groups.get(key)
    if (g) g.qty += 1
    else groups.set(key, { sel, qty: 1 })
  }
  return [...groups.values()]
}

// ─── Modelo v2 (Anexo B): grupos genéricos + listas reutilizables ──────────────
// Las funciones son puras. `listas` = listas del restaurante por key (option_lists).
export type ListMap = Record<string, OptionItem[]>

const LISTA_HELADO = 'sabores_helado'
const LISTA_JUGO   = 'sabores_jugo'

// Listas "virtuales" armadas con la config heredada (helado_flavors, jugo_flavors y sus *_off).
// Sirven para que un restaurante con options_v2 encendido funcione antes de migrar sus listas.
export function listasHeredadas(menu: MenuConfig): ListMap {
  return {
    [LISTA_HELADO]: menu.heladoFlavors.map(label => ({ label, activo: !menu.heladoOff.includes(label) })),
    [LISTA_JUGO]:   menu.jugoFlavors.map(label => ({ label, activo: !menu.jugoOff.includes(label) })),
  }
}

// Las listas guardadas (option_lists) mandan; la config heredada completa lo que falte.
export function mezclarListas(guardadas: OptionList[], menu: MenuConfig): ListMap {
  const out = listasHeredadas(menu)
  for (const l of guardadas) out[l.key] = l.items
  return out
}

const esV2 = (g: unknown): g is OptionGroupV2 => !!g && typeof g === 'object' && (g as { v?: unknown }).v === 2

// Grupos del plato en formato v2. Los heredados se convierten en memoria (ids estables g_<índice>).
export function gruposDe(dish: Dish): OptionGroupV2[] {
  return ((dish.options ?? []) as unknown[]).map((raw, i): OptionGroupV2 => {
    if (esV2(raw)) return raw
    const g = raw as DishOptionGroup
    if (g.tipo === 'helado' || g.tipo === 'jugo') {
      return { v: 2, id: `g_${i}`, nombre: g.nombre, modo: 'multi', min: 1, max: g.cantidad ?? 1, requerido: true,
        fuente: { lista: g.tipo === 'jugo' ? LISTA_JUGO : LISTA_HELADO } }
    }
    const items: OptionItem[] = (g.opciones ?? []).map(o => ({
      label: o.label, ...((o.helado ?? 0) > 0 ? { sub: { lista: LISTA_HELADO, cantidad: o.helado as number } } : {}),
    }))
    return { v: 2, id: `g_${i}`, nombre: g.nombre, modo: g.multiple ? 'multi' : 'single', min: 1,
      max: g.multiple ? Math.max(1, items.length) : 1, requerido: true, fuente: { items } }
  })
}

export const itemsDeGrupo = (g: OptionGroupV2, listas: ListMap): OptionItem[] =>
  'lista' in g.fuente ? (listas[g.fuente.lista] ?? []) : g.fuente.items

// Ítems que se pueden ofrecer: activos, más los que ya venían elegidos (al editar un pedido).
export const itemsVisibles = (g: OptionGroupV2, listas: ListMap, chosen: string[] = []): OptionItem[] =>
  itemsDeGrupo(g, listas).filter(it => it.activo !== false || chosen.includes(it.label))

export const maxDeGrupo = (g: OptionGroupV2): number => (g.max === 'cantidad' ? 1 : g.max)

export const subKey = (gid: string, label: string) => `${gid}>${label}`

// Convierte una selección heredada (helado/opcion/opcionMulti por índice) al formato v2,
// para abrir pedidos viejos en el constructor nuevo. Una selección v2 pasa igual.
export function selAV2(dish: Dish, sel: ItemSel): ItemSel {
  if (sel.grupos) return sel
  const grupos: Record<string, string[]> = {}
  ;(dish.options ?? []).forEach((g, gi) => {
    if (esV2(g)) return
    const id = `g_${gi}`, k = String(gi)
    const sabores = sel.helado?.[k] ?? []
    if (g.tipo === 'helado' || g.tipo === 'jugo') { if (sabores.length) grupos[id] = sabores; return }
    const labels = selectedLabels(g, gi, sel)
    if (labels.length) grupos[id] = labels
    const conSub = (g.opciones ?? []).find(o => (o.helado ?? 0) > 0 && labels.includes(o.label))
    if (conSub && sabores.length) grupos[subKey(id, conSub.label)] = sabores
  })
  const { helado: _h, opcion: _o, opcionMulti: _m, ...resto } = sel
  return { ...resto, ...(Object.keys(grupos).length ? { grupos } : {}) }
}

const elegidos = (sel: ItemSel, id: string) => sel.grupos?.[id] ?? []

export function selIsValidV2(groups: OptionGroupV2[], listas: ListMap, sel: ItemSel): boolean {
  return groups.every(g => {
    const ch = elegidos(sel, g.id)
    const minimo = g.requerido ? Math.max(1, g.min) : g.min
    if (ch.length < minimo || ch.length > maxDeGrupo(g)) return false
    const items = itemsDeGrupo(g, listas)
    return ch.every(label => {
      const it = items.find(x => x.label === label)
      if (!it) return false
      if (!it.sub) return true
      const n = elegidos(sel, subKey(g.id, label)).length
      return n >= 1 && n <= it.sub.cantidad
    })
  })
}

// Suma de precio_extra de los ítems elegidos (mismo cálculo que el servidor).
export function extrasV2(groups: OptionGroupV2[], listas: ListMap, sel: ItemSel): number {
  return groups.reduce((sum, g) => {
    const items = itemsDeGrupo(g, listas)
    return sum + elegidos(sel, g.id).reduce((s, label) => {
      const it = items.find(x => x.label === label)
      let extra = Number(it?.precio_extra) || 0
      // Sub-elecciones (ej. sabores de «Con helado»): también suman su precio_extra, como en el servidor
      if (it?.sub) {
        const subItems = listas[it.sub.lista] ?? []
        extra += elegidos(sel, subKey(g.id, label)).reduce((t, sl) => t + (Number(subItems.find(x => x.label === sl)?.precio_extra) || 0), 0)
      }
      return s + extra
    }, 0)
  }, 0)
}

export const unitPriceForV2 = (dish: Dish, listas: ListMap, sel: ItemSel): number =>
  unitPriceFor(dish, sel) + extrasV2(gruposDe(dish), listas, sel)

// Texto para cocina: igual que describeSel pero leyendo sel.grupos.
export function describeSelV2(dish: Dish, sel: ItemSel, shortages: Swap[] = []): string {
  const parts: string[] = []
  if (dish.has_sizes && sel.size) parts.push(sel.size)
  for (const g of gruposDe(dish)) {
    const ch = elegidos(sel, g.id)
    if (!ch.length) continue
    const sep = 'lista' in g.fuente ? ', ' : ' + '
    parts.push(ch.map(label => {
      const sub = elegidos(sel, subKey(g.id, label))
      return sub.length ? `${label} (${sub.join(', ')})` : label
    }).join(sep))
  }
  if (sel.toppings?.length) parts.push(sel.toppings.join(', '))
  if (sel.extras?.length) parts.push(sel.extras.join(', '))
  for (const s of shortages) {
    if (s.sustituto_nombre && sel.swaps?.includes(s.ingrediente_id)) parts.push(`Cambio: ${s.ingrediente_nombre} → ${s.sustituto_nombre}`)
  }
  return parts.join(' · ')
}

// Fecha de hoy en Colombia (YYYY-MM-DD), igual que hoy_local() en la base.
export const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
