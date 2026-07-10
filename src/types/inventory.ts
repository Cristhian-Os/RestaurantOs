export interface Ingrediente {
  id: string
  nombre: string
  unidad_medida: 'kg' | 'litro' | 'pieza' | 'gramo' | 'ml' | 'paquete'
  stock_actual: number
  stock_minimo: number
  costo_unitario: number
  created_at: string
  updated_at: string
}

export interface Receta {
  id: string
  producto_id: string
  ingrediente_id?: string | null   // opcional: las líneas manuales no enlazan al catálogo
  nombre?: string | null           // nombre libre de la materia prima (flujo manual)
  costo_unitario: number           // precio unitario manual
  unidad?: string | null           // unidad libre (opcional)
  cantidad_necesaria: number
  created_at: string
}

// Línea de receta en edición (flujo manual, estado local del editor)
export interface RecetaLine {
  id?: string
  nombre: string
  costo_unitario: number
  cantidad_necesaria: number
  unidad?: string | null
}

export interface DetallesPedido {
  id: string
  order_id: string
  dish_id: string
  cantidad: number
  precio_unit: number
  created_at: string
}

export interface ListaCompras {
  id: string
  nombre: string
  unidad_medida: string
  stock_actual: number
  stock_minimo: number
  costo_unitario: number
  cantidad_sugerida: number
  cantidad_necesaria_manual: number | null
  cantidad_necesaria: number
  costo_total: number
  prioridad: 'URGENTE' | 'ALTO' | 'NORMAL'
}

export interface ProductoDisponible {
  id: string
  name: string
  description: string
  price: number
  category: string
  image_url?: string
  availability_status: 'available' | 'out_of_stock' | 'discontinued'
  ingredientes_totales: number
  ingredientes_faltantes: number
}
