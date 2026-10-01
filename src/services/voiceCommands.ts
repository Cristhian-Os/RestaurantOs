/**
 * voiceCommands.ts
 * Comandos de voz que MODIFICAN datos existentes (precio/disponibilidad de platos,
 * inventario, tareas, turnos, mesas).
 *
 * Flujo: `voice-parse` (kind 'command') devuelve acciones crudas → `buildProposals`
 * las empareja con registros reales y calcula "antes → después" → la persona revisa
 * y aprueba → `applyChange` (voiceCommandsApi.ts) escribe con los permisos (RLS) de
 * quien está logueado. Este archivo es lógica pura, sin acceso a la base.
 */
import { matchName } from './voiceMatch.ts'
import { convertQty } from './voiceUnits.ts'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface RawAction {
  type: string
  dish?: string; size?: string; price?: number; available?: boolean
  ingredient?: string; mode?: string; quantity?: number
  title?: string; description?: string; assignee?: string; priority?: string; due_date?: string
  employee?: string; date?: string; start?: string; end?: string; notes?: string
  mesa?: number; estado?: string; capacidad?: number
  lineas?: { nombre?: string; cantidad?: number; unidad?: string; precio_unitario?: number }[]
  concepto?: string; monto?: number; categoria?: string
  proveedor?: string; telefono?: string; producto?: string
}

interface Size { nombre: string; precio: number }

/** Línea de receta tal como la guarda `guardar_receta_manual`. */
export interface RecipeLine {
  nombre: string
  costo_unitario: number
  unidad: string | null
  cantidad_necesaria: number
  ingrediente_id: string | null
}

/** Línea de una compra a proveedor tal como la recibe `registrar_compra_proveedor`. */
export interface PurchaseLine {
  ingrediente_id: string | null
  nombre_producto: string
  cantidad: number
  unidad: string | null
  precio_unitario: number
}

export interface CommandContext {
  today: string
  weekday: string
  dishes: { id: string; name: string; price: number; has_sizes: boolean; sizes: Size[]; available: boolean }[]
  ingredients: { id: string; nombre: string; unidad_medida: string; stock_actual: number; costo_unitario: number }[]
  /** Receta actual por id de plato (solo el admin la carga). */
  recipes: Record<string, RecipeLine[]>
  employees: { id: string; full_name: string }[]
  /** Lista de Proveedores del restaurante (para enlazar gastos y compras). */
  suppliers: { id: string; nombre: string }[]
  mesas: { id: string; numero: number; capacidad: number; estado: string }[]
}

export type Change =
  | { op: 'dish_price'; dishId: string; price: number; sizes?: Size[] }
  | { op: 'dish_availability'; dishId: string; available: boolean }
  | { op: 'ingredient_stock'; ingredientId: string; stock: number }
  | { op: 'task_create'; title: string; description: string; assignedTo: string; priority: Priority; dueDate: string | null; createdBy: string }
  | { op: 'shift_set'; employeeId: string; date: string; start: string; end: string; notes: string }
  | { op: 'shift_delete'; employeeId: string; date: string }
  | { op: 'table_status'; mesaId: string; estado: Estado }
  | { op: 'table_capacity'; mesaId: string; capacidad: number }
  | { op: 'recipe_save'; dishId: string; lines: RecipeLine[] }
  | { op: 'expense_add'; concepto: string; monto: number; categoria: 'proveedor' | null; registradoPor: string }
  | { op: 'purchase_add'; concepto: string; items: PurchaseLine[] }
  | { op: 'supplier_add'; nombre: string; telefono: string | null; producto: string | null }

export interface Proposal {
  /** Posición de la acción cruda de la que salió (para poder quitarla). */
  index:   number
  title:   string
  detail:  string
  /** null cuando hay un problema: no se puede aplicar hasta que se corrija dictando de nuevo. */
  change:  Change | null
  problem?: string
}

export type VoiceRole = 'admin' | 'cashier'

/** Qué puede dictar cada rol. El cajero solo toca lo operativo; precios, tareas y turnos son del admin. */
export const ALLOWED_ACTIONS: Record<VoiceRole, readonly string[]> = {
  admin:   ['dish_price', 'dish_availability', 'ingredient_stock', 'task_create', 'shift_set', 'shift_delete', 'table_status', 'table_capacity', 'recipe_set', 'expense_add', 'purchase_add', 'supplier_add'],
  cashier: ['dish_availability', 'ingredient_stock', 'table_status', 'expense_add', 'purchase_add'],
}

type Priority = 'low' | 'medium' | 'high' | 'urgent'
type Estado = 'libre' | 'ocupada' | 'reservada' | 'cuenta'

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const PRIORITY_LABEL: Record<Priority, string> = { low: 'baja', medium: 'media', high: 'alta', urgent: 'urgente' }
const ESTADOS: Estado[] = ['libre', 'ocupada', 'reservada', 'cuenta']

// ─── Utilidades puras ────────────────────────────────────────────────────────

export const money = (n: number) => '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const num = (n: number) => String(Math.round(n * 1000) / 1000)
const num6 = (n: number) => String(Math.round(n * 1e6) / 1e6)

function normTime(s: string | undefined): string | null {
  const m = (s ?? '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

function validDate(s: string | undefined): string | null {
  const v = (s ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(v + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}

/** Fecha y día de la semana en hora de Colombia (el servidor del navegador puede estar en otra zona). */
export function bogotaNow(now: Date = new Date()): { today: string; weekday: string } {
  const tz = 'America/Bogota'
  return {
    today:   new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now),
    weekday: new Intl.DateTimeFormat('es-CO', { timeZone: tz, weekday: 'long' }).format(now),
  }
}

/** Versión compacta del contexto para la IA: solo nombres, no ids ni precios. */
export function toPromptContext(ctx: CommandContext) {
  return {
    today: ctx.today, weekday: ctx.weekday,
    dishes:      ctx.dishes.map(d => ({ name: d.name, sizes: d.has_sizes ? d.sizes.map(s => s.nombre) : [] })),
    ingredients: ctx.ingredients.map(i => ({ name: i.nombre, unit: i.unidad_medida })),
    employees:   ctx.employees.map(e => e.full_name),
    suppliers:   ctx.suppliers.map(x => x.nombre),
    mesas:       ctx.mesas.map(m => m.numero),
  }
}

// ─── Propuestas ──────────────────────────────────────────────────────────────

/**
 * Convierte acciones crudas en propuestas. Las aplica EN ORDEN sobre una copia del
 * contexto, así "agrega 2 kg de fresa" dos veces suma 4 y no se pisan.
 */
export function buildProposals(actions: RawAction[], base: CommandContext, userId: string, role: VoiceRole = 'admin'): Proposal[] {
  const ctx = structuredClone(base)
  return actions.map((a, index) => {
    if (!ALLOWED_ACTIONS[role].includes(a.type) && ALLOWED_ACTIONS.admin.includes(a.type)) {
      return { index, ...bad('Solo el administrador', 'Este cambio solo lo puede hacer el administrador.') }
    }
    return { index, ...propose(a, ctx, userId) }
  })
}

const normTxt = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Empareja el proveedor dictado con la lista de Proveedores. Sin coincidencia, se conserva lo dictado y se avisa. */
function resolveSupplier(spoken: string | undefined, ctx: CommandContext): { name: string; linked: boolean } | null {
  const said = (spoken ?? '').trim()
  if (!said) return null
  const hit = matchName(said, ctx.suppliers, x => x.nombre)
  return hit ? { name: hit.nombre, linked: true } : { name: said, linked: false }
}
const notListed = (name: string) => `“${name}” no está en tu lista de Proveedores (se registra igual; di “agrega al proveedor ${name}” para sumarlo)`

type Built = Omit<Proposal, 'index'>
const bad = (title: string, problem: string): Built => ({ title, detail: '', change: null, problem })

function propose(a: RawAction, ctx: CommandContext, userId: string): Built {
  switch (a.type) {
    case 'dish_price': {
      const d = matchName(a.dish, ctx.dishes, x => x.name)
      if (!d) return bad(`Precio de "${a.dish ?? '?'}"`, `No encontré el plato "${a.dish ?? ''}" en el menú.`)
      const title = `${d.name} · precio`
      if (typeof a.price !== 'number' || !Number.isFinite(a.price) || a.price < 0) return bad(title, 'No entendí el precio.')
      if (d.has_sizes && d.sizes.length > 0) {
        const size = a.size ? matchName(a.size, d.sizes, s => s.nombre) : d.sizes.length === 1 ? d.sizes[0] : null
        const names = d.sizes.map(s => s.nombre).join(', ')
        if (!size) return bad(title, a.size
          ? `El plato no tiene el tamaño "${a.size}". Tiene: ${names}.`
          : `Este plato tiene tamaños (${names}). Di de cuál cambiar el precio.`)
        const old = size.precio
        const sizes = d.sizes.map(s => s === size ? { ...s, precio: a.price as number } : s)
        d.sizes = sizes
        d.price = Math.min(...sizes.map(s => s.precio))
        return { title: `${d.name} · ${size.nombre}`, detail: `${money(old)} → ${money(a.price)}`, change: { op: 'dish_price', dishId: d.id, price: d.price, sizes } }
      }
      const old = d.price
      d.price = a.price
      return { title, detail: `${money(old)} → ${money(a.price)}`, change: { op: 'dish_price', dishId: d.id, price: a.price } }
    }

    case 'dish_availability': {
      const d = matchName(a.dish, ctx.dishes, x => x.name)
      if (!d) return bad(`Disponibilidad de "${a.dish ?? '?'}"`, `No encontré el plato "${a.dish ?? ''}" en el menú.`)
      if (typeof a.available !== 'boolean') return bad(`${d.name} · disponibilidad`, 'No entendí si está disponible o agotado.')
      const label = (v: boolean) => (v ? 'Disponible' : 'Agotado')
      const old = d.available
      d.available = a.available
      return { title: `${d.name} · disponibilidad`, detail: `${label(old)} → ${label(a.available)}`, change: { op: 'dish_availability', dishId: d.id, available: a.available } }
    }

    case 'ingredient_stock': {
      const i = matchName(a.ingredient, ctx.ingredients, x => x.nombre)
      if (!i) return bad(`Inventario de "${a.ingredient ?? '?'}"`, `No encontré el ingrediente "${a.ingredient ?? ''}".`)
      const title = `${i.nombre} · inventario`
      if (typeof a.quantity !== 'number' || !Number.isFinite(a.quantity) || a.quantity < 0) return bad(title, 'No entendí la cantidad.')
      const mode = a.mode === 'add' || a.mode === 'subtract' ? a.mode : 'set'
      const cur = Number(i.stock_actual)
      const raw = mode === 'add' ? cur + a.quantity : mode === 'subtract' ? cur - a.quantity : a.quantity
      const next = Math.round(Math.max(0, raw) * 1000) / 1000
      i.stock_actual = next
      const clamped = raw < 0 ? ' (no puede bajar de 0)' : ''
      return { title, detail: `${num(cur)} → ${num(next)} ${i.unidad_medida}${clamped}`, change: { op: 'ingredient_stock', ingredientId: i.id, stock: next } }
    }

    case 'task_create': {
      const title = (a.title ?? '').trim()
      if (title.length < 3) return bad('Tarea nueva', 'No entendí el título de la tarea (mínimo 3 letras).')
      const e = matchName(a.assignee, ctx.employees, x => x.full_name)
      if (!e) return bad(`Tarea: ${title}`, a.assignee ? `No encontré al empleado "${a.assignee}".` : 'Di a quién se le asigna la tarea.')
      const priority = PRIORITIES.includes(a.priority as Priority) ? (a.priority as Priority) : 'medium'
      const due = validDate(a.due_date)
      const parts = [`Para ${e.full_name}`, `prioridad ${PRIORITY_LABEL[priority]}`, due ? `vence ${due}` : 'sin fecha']
      return {
        title: `Tarea: ${title.slice(0, 200)}`, detail: parts.join(' · '),
        change: { op: 'task_create', title: title.slice(0, 200), description: (a.description ?? '').trim().slice(0, 1000), assignedTo: e.id, priority, dueDate: due, createdBy: userId },
      }
    }

    case 'shift_set': {
      const e = matchName(a.employee, ctx.employees, x => x.full_name)
      if (!e) return bad(`Turno de "${a.employee ?? '?'}"`, `No encontré al empleado "${a.employee ?? ''}".`)
      const title = `Turno de ${e.full_name}`
      const date = validDate(a.date)
      if (!date) return bad(title, 'No entendí la fecha del turno.')
      const start = normTime(a.start), end = normTime(a.end)
      if (!start || !end) return bad(title, 'No entendí la hora de inicio o de fin.')
      if (start >= end) return bad(title, 'La hora de inicio debe ser antes de la de fin.')
      return { title, detail: `${date} · ${start}–${end}`, change: { op: 'shift_set', employeeId: e.id, date, start, end, notes: (a.notes ?? '').trim() } }
    }

    case 'shift_delete': {
      const e = matchName(a.employee, ctx.employees, x => x.full_name)
      if (!e) return bad(`Quitar turno de "${a.employee ?? '?'}"`, `No encontré al empleado "${a.employee ?? ''}".`)
      const title = `Quitar turno de ${e.full_name}`
      const date = validDate(a.date)
      if (!date) return bad(title, 'No entendí la fecha del turno.')
      return { title, detail: date, change: { op: 'shift_delete', employeeId: e.id, date } }
    }

    case 'table_status': {
      const m = ctx.mesas.find(x => x.numero === Number(a.mesa))
      if (!m) return bad(`Mesa ${a.mesa ?? '?'}`, `No encontré la mesa ${a.mesa ?? ''}.`)
      if (!ESTADOS.includes(a.estado as Estado)) return bad(`Mesa ${m.numero} · estado`, 'No entendí el estado (libre, ocupada, reservada o cuenta).')
      const old = m.estado
      m.estado = a.estado as string
      return { title: `Mesa ${m.numero} · estado`, detail: `${old} → ${a.estado}`, change: { op: 'table_status', mesaId: m.id, estado: a.estado as Estado } }
    }

    case 'table_capacity': {
      const m = ctx.mesas.find(x => x.numero === Number(a.mesa))
      if (!m) return bad(`Mesa ${a.mesa ?? '?'}`, `No encontré la mesa ${a.mesa ?? ''}.`)
      const cap = Number(a.capacidad)
      if (!Number.isInteger(cap) || cap < 1 || cap > 100) return bad(`Mesa ${m.numero} · capacidad`, 'No entendí la capacidad.')
      const old = m.capacidad
      m.capacidad = cap
      return { title: `Mesa ${m.numero} · capacidad`, detail: `${old} → ${cap} personas`, change: { op: 'table_capacity', mesaId: m.id, capacidad: cap } }
    }

    case 'recipe_set': {
      const d = matchName(a.dish, ctx.dishes, x => x.name)
      if (!d) return bad(`Receta de "${a.dish ?? '?'}"`, `No encontré el plato "${a.dish ?? ''}" en el menú.`)
      const title = `${d.name} · receta`
      const spoken = a.lineas ?? []
      if (spoken.length === 0) return bad(title, 'No entendí los ingredientes de la receta.')
      const incoming: RecipeLine[] = []
      const notes: string[] = []
      for (const l of spoken) {
        const name = (l.nombre ?? '').trim()
        const qty = Number(l.cantidad)
        if (!name) return bad(title, 'Un ingrediente quedó sin nombre.')
        if (!Number.isFinite(qty) || qty <= 0) return bad(title, `No entendí la cantidad de "${name}".`)
        const ing = matchName(name, ctx.ingredients, x => x.nombre)
        let amount = qty
        if (ing) {
          // Dictó gramos y el inventario va en kg (o ml/litros): se convierte aquí, no con la IA.
          const c = convertQty(qty, l.unidad, ing.unidad_medida)
          if (c.ok === false) return bad(title, `${ing.nombre}: ${c.reason}`)
          amount = c.qty
          if (c.converted) notes.push(`${ing.nombre}: ${num6(qty)} ${(l.unidad ?? '').trim()} = ${num6(amount)} ${ing.unidad_medida}`)
        }
        incoming.push({
          nombre: ing?.nombre ?? name,
          costo_unitario: ing ? Number(ing.costo_unitario) || 0 : 0,
          unidad: ing?.unidad_medida ?? ((l.unidad ?? '').trim() || null),
          cantidad_necesaria: Math.round(amount * 1e6) / 1e6,
          ingrediente_id: ing?.id ?? null,
        })
      }
      const current = ctx.recipes[d.id] ?? []
      const replace = a.mode === 'set'
      const keyOf = (l: RecipeLine) => l.ingrediente_id ?? 'n:' + l.nombre.trim().toLowerCase()
      let lines: RecipeLine[]
      if (replace) {
        lines = incoming
      } else {
        // Sumar a la receta: un ingrediente que ya estaba se actualiza, no se duplica.
        lines = current.map(l => ({ ...l }))
        for (const n of incoming) {
          const at = lines.findIndex(l => keyOf(l) === keyOf(n))
          if (at >= 0) lines[at] = { ...lines[at], cantidad_necesaria: n.cantidad_necesaria, unidad: n.unidad ?? lines[at].unidad }
          else lines.push(n)
        }
      }
      ctx.recipes[d.id] = lines
      const show = (l: RecipeLine) => `${l.nombre} ${num6(l.cantidad_necesaria)}${l.unidad ? ' ' + l.unidad : ''}`
      const unlinked = incoming.filter(l => !l.ingrediente_id).length
      const parts = [
        incoming.map(show).join(' · '),
        replace
          ? (current.length > 0 ? `Reemplaza la receta actual (${current.length} ${current.length === 1 ? 'ingrediente' : 'ingredientes'})` : 'Receta nueva')
          : (current.length > 0 ? `Se suma a la receta actual (${current.length} ${current.length === 1 ? 'ingrediente' : 'ingredientes'})` : 'Receta nueva'),
      ]
      if (notes.length > 0) parts.push('Convertido: ' + notes.join('; '))
      if (unlinked > 0) parts.push(`${unlinked} sin inventario: no descontará stock`)
      return { title, detail: parts.join(' · '), change: { op: 'recipe_save', dishId: d.id, lines } }
    }

    case 'expense_add': {
      const said = (a.concepto ?? '').trim()
      const sup = resolveSupplier(a.proveedor || (a.categoria === 'proveedor' ? said : ''), ctx)
      // Con proveedor, el concepto sigue la convención de la caja: el nombre del proveedor.
      let concepto = said
      if (sup) {
        const extra = normTxt(said).includes(normTxt(sup.name)) ? '' : said
        concepto = extra && normTxt(extra) !== normTxt(a.proveedor ?? '') ? `${sup.name} · ${extra}` : sup.name
      }
      if (concepto.length < 3) return bad('Gasto nuevo', 'No entendí en qué fue el gasto (mínimo 3 letras).')
      const title = `Gasto: ${concepto.slice(0, 120)}`
      const monto = Number(a.monto)
      if (!Number.isFinite(monto) || monto <= 0) return bad(title, 'No entendí el monto.')
      if (monto > 1_000_000_000) return bad(title, 'El monto es demasiado grande: revisa que dijiste bien las cifras.')
      const categoria = sup || a.categoria === 'proveedor' ? 'proveedor' : null
      const parts = [money(monto)]
      if (categoria) parts.push('pago a proveedor')
      if (sup?.linked) parts.push(`Proveedor: ${sup.name}`)
      if (sup && !sup.linked) parts.push('⚠ ' + notListed(sup.name))
      return {
        title, detail: parts.join(' · '),
        change: { op: 'expense_add', concepto: concepto.slice(0, 200), monto: Math.round(monto), categoria, registradoPor: userId },
      }
    }

    case 'purchase_add': {
      const sup = resolveSupplier(a.proveedor || a.concepto, ctx)
      if (!sup || sup.name.length < 2) return bad('Compra a proveedor', 'Di a qué proveedor se le compró.')
      const concepto = sup.name
      const title = `Compra a ${concepto.slice(0, 120)}`
      const spoken = a.lineas ?? []
      if (spoken.length === 0) return bad(title, 'No entendí los productos de la compra.')
      const items: PurchaseLine[] = []
      const notes: string[] = []
      for (const l of spoken) {
        const name = (l.nombre ?? '').trim()
        const qty = Number(l.cantidad), price = Number(l.precio_unitario)
        if (!name) return bad(title, 'Un producto quedó sin nombre.')
        if (!Number.isFinite(qty) || qty <= 0) return bad(title, `No entendí la cantidad de "${name}".`)
        if (!Number.isFinite(price) || price < 0) return bad(title, `No entendí el precio de "${name}".`)
        const ing = matchName(name, ctx.ingredients, x => x.nombre)
        let amount = qty, unitPrice = price
        if (ing) {
          // El precio dictado es por la unidad dictada: al convertir la cantidad, el precio se ajusta
          // en sentido contrario y el total de la línea no cambia.
          const c = convertQty(1, l.unidad, ing.unidad_medida)
          if (c.ok === false) return bad(title, `${ing.nombre}: ${c.reason}`)
          if (c.converted) {
            amount = Math.round(qty * c.qty * 1e6) / 1e6
            unitPrice = Math.round((price / c.qty) * 1e6) / 1e6
            notes.push(`${ing.nombre}: ${num6(qty)} ${(l.unidad ?? '').trim()} = ${num6(amount)} ${ing.unidad_medida}`)
          }
        }
        items.push({
          ingrediente_id: ing?.id ?? null,
          nombre_producto: ing?.nombre ?? name,
          cantidad: amount,
          unidad: ing?.unidad_medida ?? ((l.unidad ?? '').trim() || null),
          precio_unitario: unitPrice,
        })
        // Igual que la base: sube el stock y el costo del ingrediente (cuenta para órdenes siguientes).
        if (ing) { ing.stock_actual = Math.round((Number(ing.stock_actual) + amount) * 1e6) / 1e6; ing.costo_unitario = unitPrice }
      }
      const total = items.reduce((t, i) => t + i.cantidad * i.precio_unitario, 0)
      const show = (i: PurchaseLine) => `${i.nombre_producto} ${num6(i.cantidad)}${i.unidad ? ' ' + i.unidad : ''} × ${money(i.precio_unitario)}`
      const unlinked = items.filter(i => !i.ingrediente_id).length
      const parts = [items.map(show).join(' · '), `Total ${money(total)}`]
      if (notes.length > 0) parts.push('Convertido: ' + notes.join('; '))
      parts.push(sup.linked ? `Proveedor: ${sup.name}` : '⚠ ' + notListed(sup.name))
      parts.push(unlinked === items.length ? 'Ningún producto está en inventario: no sumará stock' : 'Suma al inventario')
      if (unlinked > 0 && unlinked < items.length) parts.push(`${unlinked} sin inventario: no sumará stock`)
      return { title, detail: parts.join(' · '), change: { op: 'purchase_add', concepto: concepto.slice(0, 200), items } }
    }

    case 'supplier_add': {
      const nombre = (a.proveedor ?? a.concepto ?? '').trim()
      if (nombre.length < 2) return bad('Proveedor nuevo', 'No entendí el nombre del proveedor.')
      const title = `Proveedor nuevo: ${nombre.slice(0, 120)}`
      const dup = matchName(nombre, ctx.suppliers, x => x.nombre)
      if (dup && normTxt(dup.nombre) === normTxt(nombre)) return bad(title, `“${dup.nombre}” ya está en tu lista de Proveedores.`)
      const telefono = (a.telefono ?? '').replace(/[^\d+ ]/g, '').trim() || null
      const producto = (a.producto ?? '').trim().slice(0, 200) || null
      // Se suma a la lista simulada: una compra dictada después en la misma orden ya lo enlaza.
      ctx.suppliers.push({ id: 'nuevo:' + normTxt(nombre), nombre })
      const parts = [telefono ? `Tel. ${telefono}` : 'sin teléfono', producto ? `vende ${producto}` : 'sin producto']
      if (dup) parts.push(`Parecido a “${dup.nombre}”: revisa que no sea el mismo`)
      return { title, detail: parts.join(' · '), change: { op: 'supplier_add', nombre: nombre.slice(0, 120), telefono, producto } }
    }

    default:
      return bad('Acción no reconocida', 'No pude convertir esto en un cambio. Intenta decirlo de otra forma.')
  }
}
