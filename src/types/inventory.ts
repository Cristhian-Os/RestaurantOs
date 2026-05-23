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
  ingrediente_id: string
  cantidad_necesaria: number
  created_at: string
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
  costo_sugerido: number
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
