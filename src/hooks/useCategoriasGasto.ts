/**
 * useCategoriasGasto — categorías de gastos del restaurante ("¿en qué se gastó?").
 *  • `categorias`: las activas, para el selector al registrar un gasto.
 *  • `etiquetas`: clave → nombre de TODAS (también las desactivadas), para mostrar el historial.
 * Si el restaurante todavía no tiene categorías propias (o la tabla aún no existe), ofrece las sugeridas
 * y `usaSugeridas` es true: el admin puede crearlas desde el editor.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { CATEGORIAS_GASTO, type CategoriaGasto, type Etiquetas } from '../services/gastosResumen'

export interface CategoriaFila {
  id:     string
  clave:  string
  nombre: string
  activa: boolean
  orden:  number
}

export interface UseCategoriasGasto {
  categorias:   CategoriaGasto[]
  etiquetas:    Etiquetas
  filas:        CategoriaFila[]
  usaSugeridas: boolean
  loading:      boolean
  reload:       () => Promise<void>
}

export function useCategoriasGasto(): UseCategoriasGasto {
  const [filas, setFilas] = useState<CategoriaFila[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('categorias_gasto')
      .select('id, clave, nombre, activa, orden').order('orden').order('nombre')
    // Sin tabla (migración pendiente) o sin permiso: se usan las sugeridas y el resto de la caja sigue igual.
    setFilas(error ? [] : ((data ?? []) as CategoriaFila[]))
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  return useMemo(() => {
    const usaSugeridas = filas.length === 0
    return {
      categorias: usaSugeridas
        ? CATEGORIAS_GASTO
        : filas.filter(f => f.activa).map(f => ({ key: f.clave, label: f.nombre })),
      etiquetas: Object.fromEntries(filas.map(f => [f.clave, f.nombre])),
      filas,
      usaSugeridas,
      loading,
      reload,
    }
  }, [filas, loading, reload])
}
