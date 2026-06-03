import { supabase } from './supabaseClient'
import type {
  Ingrediente,
  Receta,
  RecetaLine,
  ListaCompras,
  ProductoDisponible,
} from '../types/inventory'

export const inventoryService = {
  // ─── Ingredientes ─────────────────────────────────────────
  async getIngredientes(): Promise<Ingrediente[]> {
    const { data, error } = await supabase
      .from('ingredientes')
      .select('*')
      .order('nombre', { ascending: true })

    if (error) throw new Error(`Error fetching ingredientes: ${error.message}`)
    return data || []
  },

  async createIngrediente(ingrediente: Omit<Ingrediente, 'id' | 'created_at' | 'updated_at'>): Promise<Ingrediente> {
    const { data, error } = await supabase
      .from('ingredientes')
      .insert([ingrediente])
      .select()
      .single()

    if (error) throw new Error(`Error creating ingrediente: ${error.message}`)
    return data
  },

  async updateIngrediente(id: string, updates: Partial<Ingrediente>): Promise<Ingrediente> {
    const { data, error } = await supabase
      .from('ingredientes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(`Error updating ingrediente: ${error.message}`)
    return data
  },

  async deleteIngrediente(id: string): Promise<void> {
    const { error } = await supabase
      .from('ingredientes')
      .delete()
      .eq('id', id)

    if (error) throw new Error(`Error deleting ingrediente: ${error.message}`)
  },

  // ─── Recetas ──────────────────────────────────────────────
  async getRecetasByProducto(producto_id: string): Promise<Receta[]> {
    const { data, error } = await supabase
      .from('recetas')
      .select('*')
      .eq('producto_id', producto_id)

    if (error) throw new Error(`Error fetching recetas: ${error.message}`)
    return data || []
  },

  async addIngredienteToReceta(receta: Omit<Receta, 'id' | 'created_at'>): Promise<Receta> {
    const { data, error } = await supabase
      .from('recetas')
      .insert([receta])
      .select()
      .single()

    if (error) throw new Error(`Error adding ingrediente to receta: ${error.message}`)
    return data
  },

  async removeIngredienteFromReceta(id: string): Promise<void> {
    const { error } = await supabase
      .from('recetas')
      .delete()
      .eq('id', id)

    if (error) throw new Error(`Error removing ingrediente from receta: ${error.message}`)
  },

  // ─── Guardar receta manual (reemplaza todas las líneas del producto) ──
  // Flujo 100% manual: cada línea trae nombre libre, precio y cantidad.
  // Usa una RPC transaccional (delete + insert atómicos): si algo falla,
  // se revierte todo y NO se pierde la receta previa.
  async saveRecetaLines(producto_id: string, lines: RecetaLine[]): Promise<number> {
    if (!producto_id) throw new Error('Falta el producto')

    const p_lineas = lines
      .filter(l => l.nombre.trim() !== '' && l.cantidad_necesaria > 0)
      .map(l => ({
        nombre: l.nombre.trim(),
        costo_unitario: Number.isFinite(l.costo_unitario) ? l.costo_unitario : 0,
        unidad: l.unidad?.trim() || null,
        cantidad_necesaria: l.cantidad_necesaria,
      }))

    const { data, error } = await supabase.rpc('guardar_receta_manual', {
      p_producto_id: producto_id,
      p_lineas,
    })
    if (error) throw new Error(`Error guardando receta: ${error.message}`)
    return (data as number) ?? p_lineas.length
  },

  // ─── Lista de Compras ─────────────────────────────────────
  async getListaCompras(): Promise<ListaCompras[]> {
    const { data, error } = await supabase
      .from('vista_lista_compras')
      .select('*')
      .order('prioridad', { ascending: false })

    if (error) throw new Error(`Error fetching lista compras: ${error.message}`)
    return data || []
  },

  // ─── Productos Disponibles ────────────────────────────────
  async getProductosDisponibles(): Promise<ProductoDisponible[]> {
    const { data, error } = await supabase
      .from('vista_productos_disponibles')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw new Error(`Error fetching productos disponibles: ${error.message}`)
    return data || []
  },

  // ─── Cálculo de Costo de Receta ───────────────────────────
  async calcularCostoReceta(dish_id: string): Promise<number> {
    const { data, error } = await supabase
      .rpc('calcular_costo_receta', { p_dish_id: dish_id })

    if (error) throw new Error(`Error calculating recipe cost: ${error.message}`)
    return data || 0
  },

  // ─── Registrar detalle de pedido (Trigger automático) ─────
  async registrarDetallePedido(detalle: {
    order_id: string
    dish_id: string
    cantidad: number
    precio_unit: number
  }): Promise<void> {
    const { error } = await supabase
      .from('detalles_pedidos')
      .insert([detalle])

    if (error) throw new Error(`Error registering order detail: ${error.message}`)
  },
}
