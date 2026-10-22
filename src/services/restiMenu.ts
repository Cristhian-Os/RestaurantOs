/** Cambios del menú, pedidos y equipo que propone Resti: la IA interpreta la orden (función resti-acciones) y aquí se cargan los datos reales para armar el antes → después. */
import { supabase } from './supabaseClient'
import type { AccionMenu, PlatoMenu, CategoriaMenu, SaboresMenu } from '../lib/resti/menuCambios'
import type { AccionOp, DatosOp } from '../lib/resti/operacionesCambios'
import type { AccionPedido, AccionEquipo, PedidoFila, PersonaFila } from '../lib/resti/pedidosEquipoCambios'

export type Ambito = 'menu' | 'pedidos' | 'equipo' | 'operaciones'

export async function interpretar<T>(ambito: Ambito, text: string): Promise<T[]> {
  const { data, error } = await supabase.functions.invoke('resti-acciones', { body: { ambito, text } })
  if (error) throw new Error('No pude interpretar el cambio.')
  return Array.isArray(data?.actions) ? data.actions as T[] : []
}
export const interpretarMenu = (text: string) => interpretar<AccionMenu>('menu', text)
export const interpretarPedidos = (text: string) => interpretar<AccionPedido>('pedidos', text)
export const interpretarEquipo = (text: string) => interpretar<AccionEquipo>('equipo', text)

const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])

export async function cargarMenu(): Promise<{ platos: PlatoMenu[]; categorias: CategoriaMenu[]; sabores: SaboresMenu }> {
  const [d, c] = await Promise.all([
    supabase.from('dishes').select('id, name, description, price, category, tags, has_sizes, sizes, options, toppings, available, availability_status').neq('availability_status', 'discontinued').order('name'),
    supabase.from('restaurant_config').select('modules_enabled').maybeSingle(),
  ])
  if (d.error) throw new Error('No pude cargar el menú.')
  const mods = (c.data?.modules_enabled ?? {}) as { categories?: { value?: string; label?: string }[]; helado_flavors?: unknown; jugo_flavors?: unknown; options_v2?: unknown }
  const categorias = (mods.categories ?? []).filter(x => x?.value).map(x => ({ value: String(x.value), label: x.label }))
  return { platos: (d.data ?? []) as PlatoMenu[], categorias, sabores: { helado: lista(mods.helado_flavors), jugo: lista(mods.jugo_flavors), v2: mods.options_v2 === true } }
}

export async function cargarPedidosAbiertos(): Promise<PedidoFila[]> {
  const { data, error } = await supabase.from('orders').select('id, order_number_today, table_num, status, customer_name, items, total').in('status', ['pending', 'cooking', 'ready']).order('created_at', { ascending: false }).limit(80)
  if (error) throw new Error('No pude cargar los pedidos.')
  return (data ?? []) as PedidoFila[]
}

export async function cargarEquipo(): Promise<{ gente: PersonaFila[]; nombreRestaurante: string | null }> {
  const [p, c] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, active').order('full_name').limit(100),
    supabase.from('restaurant_config').select('display_name').maybeSingle(),
  ])
  if (p.error) throw new Error('No pude cargar el equipo.')
  return { gente: (p.data ?? []) as PersonaFila[], nombreRestaurante: (c.data as { display_name?: string } | null)?.display_name ?? null }
}

export const interpretarOperaciones = (text: string) => interpretar<AccionOp>('operaciones', text)

/** Datos reales de gastos, proveedores, equipo, tareas, ingredientes y mesas para armar el «antes → después» de las operaciones. */
export async function cargarDatosOp(): Promise<DatosOp> {
  const [g, pv, eq, t, ing, m] = await Promise.all([
    supabase.from('gastos').select('id, concepto, monto, categoria, created_at').order('created_at', { ascending: false }).limit(80),
    supabase.from('proveedores').select('id, nombre').order('nombre'),
    supabase.from('profiles').select('id, full_name, role, phone, active').order('full_name').limit(100),
    supabase.from('tasks').select('id, title, status, priority').order('created_at', { ascending: false }).limit(80),
    supabase.from('ingredientes').select('id, nombre, unidad_medida, costo_unitario, stock_minimo').order('nombre'),
    supabase.from('mesas').select('id, numero, capacidad').eq('activa', true).order('numero'),
  ])
  if ([g, pv, eq, t, ing, m].some(r => r.error)) throw new Error('No pude cargar los datos del restaurante.')
  return {
    gastos: (g.data ?? []).map(x => ({ ...x, monto: Number(x.monto) })), proveedores: pv.data ?? [], equipo: eq.data ?? [], tareas: t.data ?? [],
    ingredientes: (ing.data ?? []).map(x => ({ ...x, costo_unitario: Number(x.costo_unitario) })), mesas: m.data ?? [],
  } as DatosOp
}
