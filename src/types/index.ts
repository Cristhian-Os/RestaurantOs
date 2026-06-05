export interface Order {
  id:            string
  user_id:       string
  items:         string
  total:         number
  status:        'pending' | 'completed' | 'cancelled' | 'cooking' | 'ready'
  table_num:     number | null
  created_at:    string
  updated_at:    string
  tipo_pedido?:  'LOCAL' | 'LLEVAR' | 'DOMICILIO' | 'RAPPI'
  notes?:        string
  customer_name?: string | null
  paid_at?:      string | null
}

export interface User {
  id: string
  email: string
}

// ─── Tipos del Menú Digital (ClientView) ─────────────────────
// String abierto para soportar categorías personalizadas creadas por el admin
export type DishCategory = string

// Tamaño con su propio precio (ej: Pequeño $9.000, Grande $14.000)
export interface DishSize {
  nombre: string
  precio: number
}

// Grupo de opciones de un plato (sabores de helado, queso/helado, etc.)
export interface DishOptionChoice {
  label:   string
  helado?: number   // si se elige esta opción, pide N sabores de helado
}
export interface DishOptionGroup {
  tipo:      'helado' | 'opcion'
  nombre:    string
  cantidad?: number              // tipo 'helado': cuántos sabores elegir
  opciones?: DishOptionChoice[]  // tipo 'opcion': opciones a elegir (single)
}

export interface Dish {
  id:          string
  name:        string
  description: string
  price:       number
  category:    DishCategory
  image_url?:  string       // opcional: imagen del plato
  available:   boolean
  availability_status?: 'available' | 'out_of_stock' | 'discontinued'
  tags?:       string[]     // ej: ['vegano', 'sin gluten', 'picante']
  has_sizes?:  boolean      // true = el plato se vende por tamaños, cada uno con su precio
  sizes?:      DishSize[]   // tamaños con precio propio cuando has_sizes = true
  options?:    DishOptionGroup[]  // grupos de opciones (sabores de helado, queso/helado…)
  created_at?: string       // timestamp de creación
  updated_at?: string       // timestamp de actualización
  sort_order?: number       // orden de visualización
  _customIngredients?: Record<string, number> // para platos custom: { ingrediente_id: cantidad }
}

// ─── Tipos del Sistema de Tareas ─────────────────────────────
export type TaskStatus   = 'pending' | 'in_progress' | 'completed' | 'rejected'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id:          string
  title:       string
  description: string | null
  assigned_to: string           // UUID del empleado
  created_by:  string           // UUID del admin
  status:      TaskStatus
  priority:    TaskPriority
  due_date:    string | null
  created_at:  string
  updated_at:  string
  // Joins opcionales (cuando se hace SELECT con relaciones)
  assignee?:   { id: string; full_name: string | null; role: string }
  evidence?:   TaskEvidence[]
}

export interface TaskEvidence {
  id:           string
  task_id:      string
  uploaded_by:  string
  photo_url:    string          // URL pública de Supabase Storage
  storage_path: string          // path interno del bucket
  notes:        string | null
  submitted_at: string
  uploader?:    { full_name: string | null }
}

export interface Profile {
  id:          string
  role:        'admin' | 'waiter' | 'kitchen' | 'cashier' | 'client'
  full_name:   string | null
  email?:      string
  phone?:      string | null
  avatar_url?: string | null
  active?:     boolean
}
