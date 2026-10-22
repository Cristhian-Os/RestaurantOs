/** Cambios del menú, pedidos y equipo que propone Resti: la IA interpreta la orden (función resti-acciones) y aquí se cargan los datos reales para armar el antes → después. */
import { supabase } from './supabaseClient'
import type { AccionMenu, PlatoMenu, CategoriaMenu, SaboresMenu } from '../lib/resti/menuCambios'
import type { AccionPedido, AccionEquipo, PedidoFila, PersonaFila } from '../lib/resti/pedidosEquipoCambios'

export type Ambito = 'menu' | 'pedidos' | 'equipo'

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
