/**
 * voiceCommandsApi.ts
 * Parte de voiceCommands que habla con Supabase: cargar el contexto del restaurante
 * y aplicar un cambio ya aprobado. Escribe con los permisos (RLS) de la sesión.
 */
import { supabase } from './supabaseClient'
import { bogotaNow, type Change, type CommandContext } from './voiceCommands'

interface Size { nombre: string; precio: number }

// ─── Carga del contexto ──────────────────────────────────────────────────────

export async function loadCommandContext(): Promise<CommandContext> {
  const [dishes, ingredients, employees, mesas] = await Promise.all([
    supabase.from('dishes').select('id, name, price, has_sizes, sizes, available').neq('availability_status', 'discontinued').order('name'),
    supabase.from('ingredientes').select('id, nombre, unidad_medida, stock_actual').order('nombre'),
    supabase.from('profiles').select('id, full_name').in('role', ['waiter', 'kitchen', 'cashier']).order('full_name'),
    supabase.from('mesas').select('id, numero, capacidad, estado').eq('activa', true).order('numero'),
  ])
  const failed = [dishes, ingredients, employees, mesas].find(r => r.error)
  if (failed?.error) throw new Error('No pude cargar los datos del restaurante: ' + failed.error.message)

  return {
    ...bogotaNow(),
    dishes: (dishes.data ?? []).map(d => ({
      id: d.id, name: d.name, price: Number(d.price), has_sizes: !!d.has_sizes,
      sizes: Array.isArray(d.sizes) ? (d.sizes as Size[]) : [], available: !!d.available,
    })),
    ingredients: (ingredients.data ?? []).map(i => ({ id: i.id, nombre: i.nombre, unidad_medida: i.unidad_medida, stock_actual: Number(i.stock_actual) })),
    employees:   (employees.data ?? []).filter(e => e.full_name).map(e => ({ id: e.id, full_name: e.full_name as string })),
    mesas:       (mesas.data ?? []).map(m => ({ id: m.id, numero: m.numero, capacidad: m.capacidad, estado: m.estado })),
  }
}

// ─── Aplicar ─────────────────────────────────────────────────────────────────

/** Un update/delete que RLS bloquea no da error, solo 0 filas: lo tratamos como fallo. */
function expectRows(res: { data: unknown[] | null; error: { message: string } | null }, what: string) {
  if (res.error) throw new Error(res.error.message)
  if (!res.data || res.data.length === 0) throw new Error(`${what}: no se pudo modificar (¿ya no existe o no tienes permiso?)`)
}

export async function applyChange(c: Change): Promise<void> {
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
    case 'ingredient_stock':
      return expectRows(await supabase.from('ingredientes').update({ stock_actual: c.stock, updated_at: now }).eq('id', c.ingredientId).select('id'), 'Ingrediente')
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
    case 'table_capacity':
      return expectRows(await supabase.from('mesas').update({ capacidad: c.capacidad, updated_at: now }).eq('id', c.mesaId).select('id'), 'Mesa')
  }
}
