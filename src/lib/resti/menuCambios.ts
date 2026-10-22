/**
 * Cambios del menú que Resti propone (toppings, bolas de helado, tamaños, textos, platos nuevos o quitados).
 * Parte pura: a partir de lo que entendió la IA y de los platos reales arma el «antes → después» y el cambio exacto a escribir.
 * No toca la base: aplicar es `applyChange` (con los permisos del administrador) y solo tras su confirmación.
 */
export interface PlatoMenu {
  id: string; name: string; description: string | null; price: number; category: string | null; tags: string[] | null
  has_sizes: boolean | null; sizes: { nombre: string; precio: number }[] | null
  options: any[] | null; toppings: { nombre: string; precio: number }[] | null
  available?: boolean | null; availability_status?: string | null
}
export interface CategoriaMenu { value: string; label?: string }
export type AccionMenu =
  | { type: 'topping'; dish: string; op: 'add' | 'remove' | 'price'; topping: string; price?: number }
  | { type: 'scoops'; dish: string; cantidad: number }
  | { type: 'juice'; dish: string; cantidad: number }
  | { type: 'size'; dish: string; op: 'add' | 'remove' | 'price'; size: string; price?: number }
  | { type: 'text'; dish: string; field: 'description' | 'name' | 'tags' | 'category'; value: string }
  | { type: 'create'; name: string; price: number; category: string; description: string }
  | { type: 'remove'; dish: string }
  | { type: 'flavor'; lista: 'helado' | 'jugo'; op: 'add' | 'remove'; sabor: string }

export type CambioMenu =
  | { op: 'dish_patch'; dishId: string; patch: Record<string, unknown> }
  | { op: 'dish_insert'; row: Record<string, unknown> }
  | { op: 'flavors_set'; clave: 'helado_flavors' | 'jugo_flavors'; lista: string[] }
export interface PropuestaMenu { index: number; title: string; detail: string; change: CambioMenu | null; problem?: string }

export const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const cortar = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** El plato que más se parece al dicho: igual, o uno contiene al otro (se prefiere el nombre más largo). null si no hay ninguno. */
export function buscarPlato<T extends { name: string }>(dicho: string, platos: T[]): T | null {
  const d = norm(dicho); if (!d) return null
  const exacto = platos.find(p => norm(p.name) === d); if (exacto) return exacto
  const cand = platos.filter(p => { const n = norm(p.name); return n.length >= 3 && (d.includes(n) || n.includes(d)) })
  return cand.sort((a, b) => b.name.length - a.name.length)[0] ?? null
}
const buscarCategoria = (dicho: string, cats: CategoriaMenu[]) => {
  const d = norm(dicho); if (!d) return null
  return cats.find(c => norm(c.label ?? '') === d || norm(c.value) === d) ?? cats.find(c => { const l = norm(c.label ?? c.value); return l.length >= 3 && (l.includes(d) || d.includes(l)) }) ?? null
}
const tituloOpcion = (tipo: 'helado' | 'jugo', n: number) => tipo === 'helado' ? (n > 1 ? `Elige ${n} sabores de helado` : 'Elige el sabor del helado') : (n > 1 ? `Elige ${n} sabores de jugo` : 'Elige el sabor del jugo')

/** Arma una propuesta por acción. Las acciones se aplican EN ORDEN sobre una copia: dos toppings al mismo plato se suman, no se pisan. */
export interface SaboresMenu { helado: string[]; jugo: string[]; v2: boolean }
export function proponerCambiosMenu(acciones: AccionMenu[], platos: PlatoMenu[], categorias: CategoriaMenu[], sabores: SaboresMenu = { helado: [], jugo: [], v2: false }): PropuestaMenu[] {
  const listas = { helado: [...sabores.helado], jugo: [...sabores.jugo] }
  const copia = new Map<string, PlatoMenu>(platos.map(p => [p.id, structuredClone(p)]))
  const parches = new Map<string, Record<string, unknown>>()      // cambios acumulados por plato
  const vivos = () => [...copia.values()].filter(p => p.availability_status !== 'discontinued')
  const mala = (index: number, title: string, problem: string): PropuestaMenu => ({ index, title, detail: '', change: null, problem })
  const nuevos: { name: string }[] = []

  return acciones.map((a, index): PropuestaMenu => {
    if (a.type === 'create') {
      if (buscarPlato(a.name, [...vivos(), ...nuevos]) && norm(a.name) === norm(buscarPlato(a.name, [...vivos(), ...nuevos])!.name)) return mala(index, `Crear «${a.name}»`, 'Ya existe un plato con ese nombre.')
      const cat = a.category ? buscarCategoria(a.category, categorias) : null
      if (a.category && !cat) return mala(index, `Crear «${a.name}»`, `La categoría «${a.category}» no existe.`)
      if (!cat && categorias.length > 0) return mala(index, `Crear «${a.name}»`, '¿En qué categoría va? Dímelo y lo preparo.')
      nuevos.push({ name: a.name })
      return { index, title: `Crear plato «${a.name}»`, detail: `${cop(a.price)}${cat ? ` · ${cat.label ?? cat.value}` : ''}`, problem: undefined,
        change: { op: 'dish_insert', row: { name: a.name, description: a.description || null, price: a.price, category: cat?.value ?? 'principal', tags: [], available: true, has_sizes: false, sizes: [], options: [], toppings: [], availability_status: 'available' } } }
    }

    if (a.type === 'flavor') {
      const etiqueta = a.lista === 'helado' ? 'Sabores de helado' : 'Sabores de jugo'
      if (sabores.v2) return mala(index, `${etiqueta} · ${a.sabor}`, 'Este restaurante usa las listas de opciones nuevas: edítalas desde Menú → Opciones.')
      const lista = listas[a.lista], i = lista.findIndex(x => norm(x) === norm(a.sabor))
      if (a.op === 'add' && i >= 0) return mala(index, `${etiqueta} · ${a.sabor}`, `El sabor «${lista[i]}» ya está en la lista.`)
      if (a.op === 'remove' && i < 0) return mala(index, `${etiqueta} · ${a.sabor}`, `El sabor «${a.sabor}» no está en la lista.`)
      const nueva = a.op === 'add' ? [...lista, a.sabor] : lista.filter((_, k) => k !== i)
      listas[a.lista] = nueva
      return { index, title: `${etiqueta} · ${a.op === 'add' ? 'Agregar' : 'Quitar'} «${a.op === 'add' ? a.sabor : lista[i]}»`, detail: `${lista.length} → ${nueva.length} sabores`, change: { op: 'flavors_set', clave: a.lista === 'helado' ? 'helado_flavors' : 'jugo_flavors', lista: nueva } }
    }

    const plato = buscarPlato(a.dish, vivos())
    if (!plato) return mala(index, `Plato «${a.dish}»`, `No encontré el plato «${a.dish}» en la carta.`)
    const p = copia.get(plato.id)!
    const acumular = (patch: Record<string, unknown>) => { Object.assign(p, patch); parches.set(p.id, { ...(parches.get(p.id) ?? {}), ...patch }) }
    const salida = (title: string, detail: string, patch: Record<string, unknown>): PropuestaMenu => {
      acumular(patch)
      return { index, title: `${p.name} · ${title}`, detail, change: { op: 'dish_patch', dishId: p.id, patch: { ...parches.get(p.id)! } } }
    }
    const opciones = Array.isArray(p.options) ? p.options : []
    const dificil = () => opciones.some(o => o?.v === 2) ? 'Este plato usa las opciones nuevas: cámbialas desde Menú → editar plato.'
      : opciones.some(o => o?.tipo === 'opcion' && (o.opciones ?? []).some((c: { helado?: number }) => c.helado)) ? 'Este plato usa la opción queso/helado: cámbiala desde Menú → editar plato.' : null

    switch (a.type) {
      case 'topping': {
        const lista = [...(p.toppings ?? [])]
        const i = lista.findIndex(t => norm(t.nombre) === norm(a.topping))
        if (a.op === 'add') {
          if (i >= 0) return salida('Toppings', `«${lista[i].nombre}» ya estaba: ${cop(lista[i].precio)} → ${cop(a.price ?? 0)}`, { toppings: lista.map((t, k) => k === i ? { ...t, precio: a.price ?? 0 } : t) })
          return salida('Toppings', `Agregar «${a.topping}» (${a.price ? '+' + cop(a.price) : 'gratis'})`, { toppings: [...lista, { nombre: a.topping, precio: a.price ?? 0 }] })
        }
        if (i < 0) return mala(index, `${p.name} · Toppings`, `«${p.name}» no tiene el topping «${a.topping}».`)
        if (a.op === 'remove') return salida('Toppings', `Quitar «${lista[i].nombre}»`, { toppings: lista.filter((_, k) => k !== i) })
        return salida('Toppings', `«${lista[i].nombre}»: ${cop(lista[i].precio)} → ${cop(a.price ?? 0)}`, { toppings: lista.map((t, k) => k === i ? { ...t, precio: a.price ?? 0 } : t) })
      }
      case 'scoops': case 'juice': {
        const tipo = a.type === 'scoops' ? 'helado' : 'jugo', etiqueta = tipo === 'helado' ? 'Bolas de helado' : 'Sabores de jugo'
        const motivo = dificil(); if (motivo) return mala(index, `${p.name} · ${etiqueta}`, motivo)
        const i = opciones.findIndex(o => o?.tipo === tipo)
        const antes = i >= 0 ? Number(opciones[i].cantidad) || 0 : 0
        if (antes === a.cantidad) return mala(index, `${p.name} · ${etiqueta}`, `Ya elige ${antes}.`)
        let nuevas = [...opciones]
        if (a.cantidad === 0) nuevas = nuevas.filter((_, k) => k !== i)
        else if (i >= 0) nuevas[i] = { ...nuevas[i], cantidad: a.cantidad, nombre: tituloOpcion(tipo, a.cantidad) }
        else nuevas.push({ tipo, nombre: tituloOpcion(tipo, a.cantidad), cantidad: a.cantidad })
        return salida(etiqueta, `${antes} → ${a.cantidad}`, { options: nuevas })
      }
      case 'size': {
        const lista = [...(p.sizes ?? [])]
        const i = lista.findIndex(s => norm(s.nombre) === norm(a.size))
        if (a.op === 'add' && i >= 0) return mala(index, `${p.name} · Tamaños`, `Ya existe el tamaño «${lista[i].nombre}».`)
        if (a.op !== 'add' && i < 0) return mala(index, `${p.name} · Tamaños`, `«${p.name}» no tiene el tamaño «${a.size}».`)
        const nuevas = a.op === 'add' ? [...lista, { nombre: a.size, precio: a.price ?? 0 }] : a.op === 'remove' ? lista.filter((_, k) => k !== i) : lista.map((s, k) => k === i ? { ...s, precio: a.price ?? 0 } : s)
        const detail = a.op === 'add' ? `Agregar «${a.size}» (${cop(a.price ?? 0)})` : a.op === 'remove' ? `Quitar «${lista[i].nombre}»` : `«${lista[i].nombre}»: ${cop(lista[i].precio)} → ${cop(a.price ?? 0)}`
        // Como en el editor del menú: con tamaños el precio base es el menor; sin ninguno, el plato deja de venderse por tamaños.
        return salida('Tamaños', detail, { sizes: nuevas, has_sizes: nuevas.length > 0, ...(nuevas.length > 0 ? { price: Math.min(...nuevas.map(s => s.precio)) } : {}) })
      }
      case 'text': {
        if (a.field === 'description') return salida('Descripción', `«${cortar(p.description ?? '—')}» → «${cortar(a.value)}»`, { description: a.value })
        if (a.field === 'name') {
          if (vivos().some(o => o.id !== p.id && norm(o.name) === norm(a.value))) return mala(index, `${p.name} · Nombre`, `Ya hay otro plato llamado «${a.value}».`)
          return salida('Nombre', `«${p.name}» → «${a.value}»`, { name: a.value })
        }
        if (a.field === 'tags') { const tags = a.value.split(',').map(t => t.trim()).filter(Boolean); return salida('Etiquetas', `${(p.tags ?? []).join(', ') || '—'} → ${tags.join(', ')}`, { tags }) }
        const cat = buscarCategoria(a.value, categorias)
        if (!cat) return mala(index, `${p.name} · Categoría`, `La categoría «${a.value}» no existe.`)
        const antes = categorias.find(c => c.value === p.category)
        return salida('Categoría', `${antes?.label ?? p.category ?? '—'} → ${cat.label ?? cat.value}`, { category: cat.value })
      }
      case 'remove': return salida('Quitar de la carta', 'Se quita de la carta (queda guardado como descontinuado).', { available: false, availability_status: 'discontinued' })
    }
  })
}
