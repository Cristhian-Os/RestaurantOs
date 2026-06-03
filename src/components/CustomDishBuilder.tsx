/**
 * CustomDishBuilder.tsx - Constructor de platos personalizados
 * Permite seleccionar ingredientes del stock disponible y crear un plato custom
 */
import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../services/supabaseClient'
import message from 'antd/es/message'

interface Ingredient {
  id: string
  nombre: string
  unidad_medida: string
  stock_actual: number
  costo_unitario: number
  disponibilidad: 'disponible' | 'bajo' | 'agotado'
}

interface SelectedIngredient {
  id: string
  nombre: string
  cantidad: number
  unidad_medida: string
  costo: number
}

const S = {
  neoOut:  { boxShadow: 'var(--shadow-out)' },
  neoIn:   { boxShadow: 'var(--shadow-in)' },
  neoOutSm:{ boxShadow: 'var(--shadow-out-sm)' },
  coral:   { boxShadow: 'var(--shadow-coral)' },
}

interface CustomDishBuilderProps {
  onDishCreated: (dish: {
    name: string
    description?: string
    price: number
    ingredients: Record<string, number>
  }) => void
  onClose: () => void
}

// Formato de precio en pesos colombianos (sin decimales, con separador de miles)
const fmtCOP = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

export const CustomDishBuilder = memo(({ onDishCreated, onClose }: CustomDishBuilderProps) => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selected, setSelected] = useState<Record<string, SelectedIngredient>>({})
  const [dishName, setDishName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')

  // Cargar ingredientes disponibles
  useEffect(() => {
    const fetchIngredients = async () => {
      try {
        const { data, error } = await supabase
          .from('ingredientes_disponibles')
          .select('*')
          .gt('stock_actual', 0)
          .order('nombre')

        if (error) throw error
        setIngredients(data || [])
      } catch (err) {
        console.error('Error cargando ingredientes:', err)
        message.error('Error al cargar ingredientes')
      } finally {
        setLoading(false)
      }
    }

    fetchIngredients()
  }, [])

  // Filtrar ingredientes por búsqueda
  const filteredIngredients = useMemo(() => {
    if (!search.trim()) return ingredients
    const q = search.toLowerCase()
    return ingredients.filter(i => i.nombre.toLowerCase().includes(q))
  }, [ingredients, search])

  // Calcular precio total y validar cantidades
  const { totalPrice, isValid } = useMemo(() => {
    let total = 0
    const selectedIds = new Set<string>()

    for (const ing of Object.values(selected)) {
      total += ing.costo
      selectedIds.add(ing.id)

      // Validar cantidad disponible
      const original = ingredients.find(i => i.id === ing.id)
      if (original && ing.cantidad > original.stock_actual) {
        return { totalPrice: 0, isValid: false }
      }
    }

    return { totalPrice: total, isValid: selectedIds.size > 0 && dishName.trim().length > 0 }
  }, [selected, ingredients, dishName])

  // Incremento por defecto según la unidad de medida del ingrediente
  const getStep = useCallback((unidad: string): number => {
    switch (unidad) {
      case 'kg':
      case 'litro':   return 0.1   // 100 g / 100 ml
      case 'gramo':
      case 'ml':      return 50     // 50 g / 50 ml
      case 'pieza':
      case 'paquete': return 1
      default:        return 1
    }
  }, [])

  // Agregar/actualizar ingrediente
  const handleAddIngredient = useCallback((ing: Ingredient) => {
    const step = getStep(ing.unidad_medida)
    setSelected(prev => {
      const nuevaCantidad = Math.min(
        (prev[ing.id]?.cantidad ?? 0) + step,
        ing.stock_actual, // nunca exceder el stock
      )
      return {
        ...prev,
        [ing.id]: {
          id: ing.id,
          nombre: ing.nombre,
          cantidad: nuevaCantidad,
          unidad_medida: ing.unidad_medida,
          costo: ing.costo_unitario * nuevaCantidad,
        },
      }
    })
  }, [getStep])

  // Actualizar cantidad de ingrediente
  const handleUpdateQuantity = useCallback((id: string, cantidad: number) => {
    const ing = ingredients.find(i => i.id === id)
    if (!ing || cantidad <= 0) return

    if (cantidad > ing.stock_actual) {
      message.warning(`Máximo disponible: ${ing.stock_actual} ${ing.unidad_medida}`)
      return
    }

    setSelected(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        cantidad,
        costo: ing.costo_unitario * cantidad,
      },
    }))
  }, [ingredients])

  // Remover ingrediente
  const handleRemoveIngredient = useCallback((id: string) => {
    setSelected(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  // Crear plato custom
  const handleCreateDish = useCallback(async () => {
    if (!isValid) return

    setSubmitting(true)
    try {
      const ingredientesMap: Record<string, number> = {}
      for (const [id, ing] of Object.entries(selected)) {
        ingredientesMap[id] = ing.cantidad
      }

      onDishCreated({
        name: dishName,
        description: description || undefined,
        price: totalPrice,
        ingredients: ingredientesMap,
      })

      message.success('Plato custom creado')
      onClose()
    } catch (err) {
      console.error('Error creando plato custom:', err)
      message.error('Error al crear plato')
    } finally {
      setSubmitting(false)
    }
  }, [isValid, selected, dishName, description, totalPrice, onDishCreated, onClose])

  if (loading) {
    return (
      <motion.div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current" />
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="w-full max-w-2xl mx-auto p-6 space-y-6"
    >
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Crear Plato Personalizado</h2>
        <p className="text-sm text-gray-600">Elige ingredientes del stock para crear tu plato</p>
      </div>

      {/* Nombre y descripción */}
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Nombre del plato (ej: Ensalada de la Casa)"
          value={dishName}
          onChange={e => setDishName(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border-2 border-gray-300 focus:border-orange-400 focus:outline-none transition"
          maxLength={100}
        />
        <textarea
          placeholder="Descripción (opcional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border-2 border-gray-300 focus:border-orange-400 focus:outline-none transition resize-none"
          rows={2}
          maxLength={200}
        />
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Buscar ingrediente..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-3 rounded-2xl border-2 border-gray-300 focus:border-orange-400 focus:outline-none transition"
      />

      {/* Ingredientes disponibles */}
      <div className="space-y-2">
        <h3 className="font-semibold text-gray-700">Ingredientes disponibles</h3>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-2"
          style={S.neoIn}
        >
          {filteredIngredients.length === 0 ? (
            <p className="text-gray-500 text-sm col-span-full text-center py-4">
              {search ? 'No hay ingredientes que coincidan' : 'No hay ingredientes disponibles'}
            </p>
          ) : (
            filteredIngredients.map(ing => (
              <motion.button
                key={ing.id}
                onClick={() => handleAddIngredient(ing)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="p-3 rounded-lg bg-white border-2 border-gray-300 hover:border-orange-400 hover:bg-orange-50 transition text-left"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{ing.nombre}</p>
                    <p className="text-xs text-gray-600">
                      {fmtCOP(ing.costo_unitario)} / {ing.unidad_medida}
                    </p>
                  </div>
                  <span className="text-xs bg-gray-200 px-2 py-1 rounded font-semibold">
                    {ing.stock_actual} {ing.unidad_medida}
                  </span>
                </div>
              </motion.button>
            ))
          )}
        </div>
      </div>

      {/* Ingredientes seleccionados */}
      {Object.keys(selected).length > 0 && (
        <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h3 className="font-semibold text-gray-700">Ingredientes seleccionados</h3>
          <div className="space-y-2 p-4 rounded-2xl bg-gray-50 border-2 border-gray-200">
            <AnimatePresence>
              {Object.entries(selected).map(([id, ing]) => (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center justify-between gap-3 p-3 bg-white rounded-lg border border-gray-200"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-900">{ing.nombre}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        value={ing.cantidad}
                        onChange={e => handleUpdateQuantity(id, parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                        min="0"
                        step={['kg', 'litro'].includes(ing.unidad_medida) ? '0.1' : '1'}
                      />
                      <span className="text-xs text-gray-600">{ing.unidad_medida}</span>
                      <span className="ml-auto font-semibold text-orange-500">{fmtCOP(ing.costo)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveIngredient(id)}
                    className="p-2 hover:bg-red-100 rounded-lg transition text-red-500"
                  >
                    ✕
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* Summary y botones */}
      <motion.div className="space-y-4 p-4 rounded-2xl" style={S.coral}>
        <div className="flex justify-between items-baseline">
          <span className="text-gray-700 font-semibold">Precio estimado:</span>
          <span className="text-3xl font-bold text-orange-600">{fmtCOP(totalPrice)}</span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-2xl border-2 border-gray-400 text-gray-700 font-semibold hover:bg-gray-100 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreateDish}
            disabled={!isValid || submitting}
            className="flex-1 px-4 py-3 rounded-2xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? 'Creando...' : '✓ Agregar al carrito'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
})

CustomDishBuilder.displayName = 'CustomDishBuilder'
