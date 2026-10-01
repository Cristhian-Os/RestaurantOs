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

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface RawAction {
  type: string
  dish?: string; size?: string; price?: number; available?: boolean
  ingredient?: string; mode?: string; quantity?: number
  title?: string; description?: string; assignee?: string; priority?: string; due_date?: string
  employee?: string; date?: string; start?: string; end?: string; notes?: string
  mesa?: number; estado?: string; capacidad?: number
}

interface Size { nombre: string; precio: number }

export interface CommandContext {
  today: string
  weekday: string
  dishes: { id: string; name: string; price: number; has_sizes: boolean; sizes: Size[]; available: boolean }[]
  ingredients: { id: string; nombre: string; unidad_medida: string; stock_actual: number }[]
  employees: { id: string; full_name: string }[]
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

export interface Proposal {
  /** Posición de la acción cruda de la que salió (para poder quitarla). */
  index:   number
  title:   string
  detail:  string
  /** null cuando hay un problema: no se puede aplicar hasta que se corrija dictando de nuevo. */
  change:  Change | null
  problem?: string
}

type Priority = 'low' | 'medium' | 'high' | 'urgent'
type Estado = 'libre' | 'ocupada' | 'reservada' | 'cuenta'

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const PRIORITY_LABEL: Record<Priority, string> = { low: 'baja', medium: 'media', high: 'alta', urgent: 'urgente' }
const ESTADOS: Estado[] = ['libre', 'ocupada', 'reservada', 'cuenta']

// ─── Utilidades puras ────────────────────────────────────────────────────────

export const money = (n: number) => '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const num = (n: number) => String(Math.round(n * 1000) / 1000)

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
    mesas:       ctx.mesas.map(m => m.numero),
  }
}

// ─── Propuestas ──────────────────────────────────────────────────────────────

/**
 * Convierte acciones crudas en propuestas. Las aplica EN ORDEN sobre una copia del
 * contexto, así "agrega 2 kg de fresa" dos veces suma 4 y no se pisan.
 */
export function buildProposals(actions: RawAction[], base: CommandContext, adminId: string): Proposal[] {
  const ctx = structuredClone(base)
  return actions.map((a, index) => {
    const p = propose(a, ctx, adminId)
    return { index, ...p }
  })
}

type Built = Omit<Proposal, 'index'>
const bad = (title: string, problem: string): Built => ({ title, detail: '', change: null, problem })

function propose(a: RawAction, ctx: CommandContext, adminId: string): Built {
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
        change: { op: 'task_create', title: title.slice(0, 200), description: (a.description ?? '').trim().slice(0, 1000), assignedTo: e.id, priority, dueDate: due, createdBy: adminId },
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

    default:
      return bad('Acción no reconocida', 'No pude convertir esto en un cambio. Intenta decirlo de otra forma.')
  }
}
