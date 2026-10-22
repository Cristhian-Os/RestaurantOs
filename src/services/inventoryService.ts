import { supabase } from './supabaseClient'
import type {
  Ingrediente,
  Receta,
  RecetaLine,
  ListaCompras,
  RecetaShortage,
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
        ingrediente_id: l.ingrediente_id || null,
      }))

    const { data, error } = await supabase.rpc('guardar_receta_manual', {
      p_producto_id: producto_id,
      p_lineas,
    })
    if (error) throw new Error(`Error guardando receta: ${error.message}`)
    return (data as number) ?? p_lineas.length
  },

  // ─── Ingredientes agotados con cambio disponible ───────────
  // Ingredientes de receta sin stock; si el ingrediente tiene un
  // sustituto configurado (Inventario → Ingredientes), se ofrece
  // como cambio al agregar el plato — igual que un adicional.
  async getRecetaShortages(): Promise<RecetaShortage[]> {
    const [{ data: recetas, error }, ingredientes] = await Promise.all([
      supabase.from('recetas').select('producto_id, ingrediente_id, cantidad_necesaria').not('ingrediente_id', 'is', null),
      inventoryService.getIngredientes(),
    ])
    if (error) throw new Error(`Error fetching recetas: ${error.message}`)

    const porId = new Map(ingredientes.map(i => [i.id, i]))
    const shortages: RecetaShortage[] = []
    for (const r of recetas || []) {
      const ing = porId.get(r.ingrediente_id)
      // Faltante = el stock no alcanza para una porción del plato
      if (!ing || Number(ing.stock_actual) >= Number(r.cantidad_necesaria)) continue
      const sustituto = ing.sustituto_id ? porId.get(ing.sustituto_id) : null
      shortages.push({
        producto_id:        r.producto_id,
        ingrediente_id:     r.ingrediente_id,
        ingrediente_nombre: ing.nombre,
        sustituto_id:       ing.sustituto_id ?? null,
        sustituto_nombre:   sustituto?.nombre ?? null,
      })
    }
    return shortages
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

  // ─── Platos para editar receta ────────────────────────────
  // Todos los platos del menú (incluidos los agotados), menos los descontinuados:
  // un plato agotado también necesita su receta.
  async getPlatosParaReceta(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase
      .from('dishes')
      .select('id, name')
      .neq('availability_status', 'discontinued')
      .order('name', { ascending: true })

    if (error) throw new Error(`Error fetching platos: ${error.message}`)
    return data || []
  },
}
