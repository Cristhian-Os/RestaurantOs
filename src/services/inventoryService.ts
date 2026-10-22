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

    if (error) {
      // 23503: el ingrediente lo usan otros registros (compras, etc.)
      if (error.code === '23503' || /foreign key|violates/i.test(error.message)) {
        throw new Error('No se puede eliminar: este ingrediente está en uso (por ejemplo en compras registradas). Déjalo con stock 0 o cámbialo por otro.')
      }
      throw new Error(`Error deleting ingrediente: ${error.message}`)
    }
  },

  // Compra a proveedor: suma stock y costo en la base (sin leer el stock desde la caché del navegador).
  async registrarCompra(ingrediente: { id: string; nombre: string; unidad_medida: string }, cantidad: number, precio: number, proveedor?: string): Promise<void> {
    const { error } = await supabase.rpc('registrar_compra_proveedor', {
      p_concepto: proveedor?.trim() || `Compra de ${ingrediente.nombre}`,
      p_items: [{
        ingrediente_id: ingrediente.id,
        nombre_producto: ingrediente.nombre,
        cantidad,
        unidad: ingrediente.unidad_medida,
        precio_unitario: precio,
      }],
    })
    if (error) throw new Error(error.message)
  },

  // Fija el stock con la función de la base (valida rol y restaurante).
  async ajustarStock(id: string, stock: number): Promise<void> {
    const { error } = await supabase.rpc('ajustar_stock_ingrediente', { p_ingrediente_id: id, p_stock: stock })
    if (error) throw new Error(error.message)
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
        // Línea vinculada a un ingrediente: manda el costo vivo del inventario, no una copia
        costo_unitario: l.ingrediente_id ? 0 : (Number.isFinite(l.costo_unitario) ? l.costo_unitario : 0),
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
      supabase.from('recetas').select('producto_id, ingrediente_id').not('ingrediente_id', 'is', null),
      inventoryService.getIngredientes(),
    ])
    if (error) throw new Error(`Error fetching recetas: ${error.message}`)

    const porId = new Map(ingredientes.map(i => [i.id, i]))
    const shortages: RecetaShortage[] = []
    for (const r of recetas || []) {
      const ing = porId.get(r.ingrediente_id)
      if (!ing || Number(ing.stock_actual) > 0) continue
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

  // ─── Platos para elegir receta ────────────────────────────
  // Todos los platos del restaurante (incluye agotados), menos los descontinuados.
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
