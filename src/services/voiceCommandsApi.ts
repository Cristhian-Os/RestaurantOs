/**
 * voiceCommandsApi.ts
 * Parte de voiceCommands que habla con Supabase: cargar el contexto del restaurante
 * y aplicar un cambio ya aprobado. Escribe con los permisos (RLS) de la sesión.
 */
import { supabase } from './supabaseClient'
import { bogotaNow, type Change, type CommandContext, type VoiceRole } from './voiceCommands'

interface Size { nombre: string; precio: number }
interface RecetaRow {
  producto_id: string; ingrediente_id: string | null; nombre: string | null
  costo_unitario: number | null; unidad: string | null; cantidad_necesaria: number
}

// ─── Carga del contexto ──────────────────────────────────────────────────────

export async function loadCommandContext(role: VoiceRole = 'admin'): Promise<CommandContext> {
  const [dishes, ingredients, employees, mesas, recetas] = await Promise.all([
    supabase.from('dishes').select('id, name, price, has_sizes, sizes, available').neq('availability_status', 'discontinued').order('name'),
    supabase.from('ingredientes').select('id, nombre, unidad_medida, stock_actual, costo_unitario').order('nombre'),
    // Empleados solo se necesitan para tareas y turnos, que son del admin.
    role === 'admin'
      ? supabase.from('profiles').select('id, full_name').in('role', ['waiter', 'kitchen', 'cashier']).order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null }),
    supabase.from('mesas').select('id, numero, capacidad, estado').eq('activa', true).order('numero'),
    // Recetas actuales: solo el admin las edita por voz.
    role === 'admin'
      ? supabase.from('recetas').select('producto_id, ingrediente_id, nombre, costo_unitario, unidad, cantidad_necesaria')
      : Promise.resolve({ data: [] as RecetaRow[], error: null }),
  ])
  const failed = [dishes, ingredients, employees, mesas, recetas].find(r => r.error)
  if (failed?.error) throw new Error('No pude cargar los datos del restaurante: ' + failed.error.message)

  return {
    ...bogotaNow(),
    dishes: (dishes.data ?? []).map(d => ({
      id: d.id, name: d.name, price: Number(d.price), has_sizes: !!d.has_sizes,
      sizes: Array.isArray(d.sizes) ? (d.sizes as Size[]) : [], available: !!d.available,
    })),
    ingredients: (ingredients.data ?? []).map(i => ({ id: i.id, nombre: i.nombre, unidad_medida: i.unidad_medida, stock_actual: Number(i.stock_actual), costo_unitario: Number(i.costo_unitario) || 0 })),
    recipes:     groupRecipes((recetas.data ?? []) as RecetaRow[], new Map((ingredients.data ?? []).map(i => [i.id, i.nombre as string]))),
    employees:   (employees.data ?? []).filter(e => e.full_name).map(e => ({ id: e.id, full_name: e.full_name as string })),
    mesas:       (mesas.data ?? []).map(m => ({ id: m.id, numero: m.numero, capacidad: m.capacidad, estado: m.estado })),
  }
}

function groupRecipes(rows: RecetaRow[], names: Map<string, string>): CommandContext['recipes'] {
  const out: CommandContext['recipes'] = {}
  for (const r of rows) {
    const nombre = (r.nombre ?? (r.ingrediente_id ? names.get(r.ingrediente_id) : '') ?? '').trim()
    if (!nombre) continue
    ;(out[r.producto_id] ??= []).push({
      nombre, costo_unitario: Number(r.costo_unitario) || 0, unidad: r.unidad,
      cantidad_necesaria: Number(r.cantidad_necesaria), ingrediente_id: r.ingrediente_id,
    })
  }
  return out
}

// ─── Aplicar ─────────────────────────────────────────────────────────────────

/** Un update/delete que RLS bloquea no da error, solo 0 filas: lo tratamos como fallo. */
function expectRows(res: { data: unknown[] | null; error: { message: string } | null }, what: string) {
  if (res.error) throw new Error(res.error.message)
  if (!res.data || res.data.length === 0) throw new Error(`${what}: no se pudo modificar (¿ya no existe o no tienes permiso?)`)
}

export async function applyChange(c: Change, role: VoiceRole = 'admin'): Promise<void> {
  const now = new Date().toISOString()
  switch (c.op) {
    case 'dish_price': {
      const patch: Record<string, unknown> = { price: c.price, updated_at: now }
      if (c.sizes) patch.sizes = c.sizes
      return expectRows(await supabase.from('dishes').update(patch).eq('id', c.dishId).select('id'), 'Plato')
    }
    case 'dish_availability': {
      const { error } = await supabase.rpc('set_plato_disponible', { p_dish_id: c.dishId, p_disponible: c.available })
      if (error) throw new Error(error.message)
      return
    }
    case 'ingredient_stock': {
      if (role === 'cashier') {
        // El cajero no puede escribir `ingredientes` directo (RLS): usa la función que valida su rol.
        const { error } = await supabase.rpc('ajustar_stock_ingrediente', { p_ingrediente_id: c.ingredientId, p_stock: c.stock })
        if (error) throw new Error(error.message)
        return
      }
      return expectRows(await supabase.from('ingredientes').update({ stock_actual: c.stock, updated_at: now }).eq('id', c.ingredientId).select('id'), 'Ingrediente')
    }
    case 'task_create': {
      const { error } = await supabase.from('tasks').insert({
        title: c.title, description: c.description || null, assigned_to: c.assignedTo, created_by: c.createdBy,
        priority: c.priority, due_date: c.dueDate, status: 'pending',
      })
      if (error) throw new Error(error.message)
      return
    }
    case 'shift_set': {
      const found = await supabase.from('employee_schedules').select('id').eq('employee_id', c.employeeId).eq('work_date', c.date).limit(1)
      if (found.error) throw new Error(found.error.message)
      const existing = found.data?.[0]
      if (existing) {
        return expectRows(await supabase.from('employee_schedules')
          .update({ shift_start: c.start, shift_end: c.end, notes: c.notes || null, updated_at: now }).eq('id', existing.id).select('id'), 'Turno')
      }
      const { error } = await supabase.from('employee_schedules')
        .insert({ employee_id: c.employeeId, work_date: c.date, shift_start: c.start, shift_end: c.end, notes: c.notes || null })
      if (error) throw new Error(error.message)
      return
    }
    case 'shift_delete': {
      const res = await supabase.from('employee_schedules').delete().eq('employee_id', c.employeeId).eq('work_date', c.date).select('id')
      if (res.error) throw new Error(res.error.message)
      if (!res.data || res.data.length === 0) throw new Error('Ese empleado no tenía turno ese día.')
      return
    }
    case 'table_status':
      return expectRows(await supabase.from('mesas').update({ estado: c.estado, updated_at: now }).eq('id', c.mesaId).select('id'), 'Mesa')
    case 'recipe_save': {
      // Función transaccional de la base: reemplaza la receta completa o no toca nada.
      const { data, error } = await supabase.rpc('guardar_receta_manual', { p_producto_id: c.dishId, p_lineas: c.lines })
      if (error) throw new Error(error.message)
      if ((data as number) < c.lines.length) throw new Error('La receta se guardó incompleta: revisa los ingredientes.')
      return
    }
    case 'table_capacity':
      return expectRows(await supabase.from('mesas').update({ capacidad: c.capacidad, updated_at: now }).eq('id', c.mesaId).select('id'), 'Mesa')
  }
}
