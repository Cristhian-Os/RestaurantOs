/**
 * customDishService.ts - Servicio para manejar platos custom
 * Crea platos personalizados y descuenta ingredientes del stock
 */
import { supabase } from './supabaseClient'

interface CustomDishInput {
  name: string
  description?: string
  price: number
  ingredients: Record<string, number> // { ingrediente_id: cantidad }
}

/**
 * Crear un plato custom y descontar ingredientes del stock
 * Usa la función PL/pgSQL en Supabase para atomicidad
 */
export const createCustomDish = async (
  orderId: string,
  customDish: CustomDishInput
): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('crear_plato_custom', {
      p_order_id: orderId,
      p_name: customDish.name,
      p_description: customDish.description || null,
      p_ingredientes: customDish.ingredients, // JSONB
    })

    if (error) {
      console.error('Error creando plato custom:', error)
      throw new Error(error.message || 'Error al crear plato personalizado')
    }

    return data as string // Retorna el ID del plato custom creado
  } catch (err) {
    console.error('CustomDishService error:', err)
    throw err
  }
}

/**
 * Obtener ingredientes disponibles para el selector
 */
export const getAvailableIngredients = async () => {
  try {
    const { data, error } = await supabase
      .from('ingredientes_disponibles')
      .select('*')
      .gt('stock_actual', 0)
      .order('nombre')

    if (error) throw error
    return data || []
  } catch (err) {
    console.error('Error obteniendo ingredientes:', err)
    throw err
  }
}

/**
 * Validar que hay stock suficiente para los ingredientes seleccionados
 */
export const validateIngredientStock = async (
  ingredients: Record<string, number>
): Promise<{ valid: boolean; message?: string }> => {
  try {
    for (const [ingId, cantidad] of Object.entries(ingredients)) {
      const { data, error } = await supabase
        .from('ingredientes')
        .select('stock_actual, nombre')
        .eq('id', ingId)
        .single()

      if (error || !data) {
        return { valid: false, message: `Ingrediente no encontrado: ${ingId}` }
      }

      if (data.stock_actual < cantidad) {
        return {
          valid: false,
          message: `Stock insuficiente de ${data.nombre}. Disponible: ${data.stock_actual}`,
        }
      }
    }

    return { valid: true }
  } catch (err) {
    console.error('Error validando stock:', err)
    return { valid: false, message: 'Error al validar disponibilidad' }
  }
}
