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
  const [dishes, ingredients, employees, mesas, recetas, suppliers] = await Promise.all([
    supabase.from('dishes').select('id, name, price, has_sizes, sizes, available').neq('availability_status', 'discontinued').order('name'),
    supabase.from('ingredientes').select('id, nombre, unidad_medida, stock_actual, costo_unitario').order('nombre'),
    // Empleados solo se necesitan para tareas y turnos, que son del admin.
    role === 'admin'
      ? supabase.from('profiles').select('id, full_name').in('role', ['waiter', 'kitchen', 'cashier']).eq('active', true).order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null }),
    supabase.from('mesas').select('id, numero, capacidad, estado').eq('activa', true).order('numero'),
    // Recetas actuales: solo el admin las edita por voz.
    role === 'admin'
      ? supabase.from('recetas').select('producto_id, ingrediente_id, nombre, costo_unitario, unidad, cantidad_necesaria')
      : Promise.resolve({ data: [] as RecetaRow[], error: null }),
    supabase.from('proveedores').select('id, nombre, telefono, email, producto, notas').order('nombre'),
  ])
  const failed = [dishes, ingredients, employees, mesas, recetas, suppliers].find(r => r.error)
  if (failed?.error) throw new Error('No pude cargar los datos del restaurante: ' + failed.error.message)
  const listas = await loadListas()

  return {
    ...bogotaNow(),
    dishes: (dishes.data ?? []).map(d => ({
      id: d.id, name: d.name, price: Number(d.price), has_sizes: !!d.has_sizes,
      sizes: Array.isArray(d.sizes) ? (d.sizes as Size[]) : [], available: !!d.available,
    })),
    ingredients: (ingredients.data ?? []).map(i => ({ id: i.id, nombre: i.nombre, unidad_medida: i.unidad_medida, stock_actual: Number(i.stock_actual), costo_unitario: Number(i.costo_unitario) || 0 })),
    recipes:     groupRecipes((recetas.data ?? []) as RecetaRow[], new Map((ingredients.data ?? []).map(i => [i.id, i.nombre as string]))),
    employees:   (employees.data ?? []).filter(e => e.full_name && !/^(\[Cuenta eliminada\]|Empleado eliminado)$/i.test(e.full_name)).map(e => ({ id: e.id, full_name: e.full_name as string })),
    suppliers:   (suppliers.data ?? []).filter(x => x.nombre).map(x => ({
      id: x.id, nombre: x.nombre as string, telefono: x.telefono ?? null, email: x.email ?? null, producto: x.producto ?? null, notas: x.notas ?? null,
    })),
    mesas:       (mesas.data ?? []).map(m => ({ id: m.id, numero: m.numero, capacidad: m.capacidad, estado: m.estado })),
    listas,
  }
}

/**
 * Listas cuyos ítems se pueden agotar por voz. Con las opciones nuevas encendidas son las listas del
 * restaurante (option_lists); si no, los sabores de helado y de jugo de siempre. Un fallo aquí no
 * debe impedir los demás comandos: sin listas, simplemente no se ofrece esa acción.
 */
async function loadListas(): Promise<NonNullable<CommandContext['listas']>> {
  try {
    const cfg = await supabase.from('restaurant_config').select('modules_enabled').maybeSingle()
    const mods = (cfg.data?.modules_enabled ?? {}) as Record<string, unknown>
    if (mods.options_v2 === true) {
      const { data, error } = await supabase.from('option_lists').select('key, nombre, items').order('sort_order')
      if (error) return []
      return (data ?? []).map(l => ({
        key: l.key as string, nombre: l.nombre as string,
        items: ((l.items as { label?: string; activo?: boolean }[] | null) ?? [])
          .filter(i => i?.label).map(i => ({ label: i.label as string, activo: i.activo !== false })),
      })).filter(l => l.items.length > 0)
    }
    const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])
    const heredada = (key: string, nombre: string, todos: unknown, off: unknown) => {
      const fuera = strs(off)
      return { key, nombre, items: strs(todos).map(label => ({ label, activo: !fuera.includes(label) })) }
    }
    return [
      heredada('legacy:helado', 'Sabores de helado', mods.helado_flavors, mods.helado_flavors_off),
      heredada('legacy:jugo', 'Sabores de jugo', mods.jugo_flavors, mods.jugo_flavors_off),
    ].filter(l => l.items.length > 0)
  } catch {
    return []
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

/** Aplica un cambio ya confirmado. Devuelve un aviso opcional para mostrar al administrador (p. ej. la clave temporal de un alta). */
export async function applyChange(c: Change, role: VoiceRole = 'admin'): Promise<string | void> {
  const now = new Date().toISOString()
  switch (c.op) {
    case 'dish_price': {
      const patch: Record<string, unknown> = { price: c.price, updated_at: now }
      if (c.sizes) patch.sizes = c.sizes
      return expectRows(await supabase.from('dishes').update(patch).eq('id', c.dishId).select('id'), 'Plato')
    }
    case 'dish_patch':
      return expectRows(await supabase.from('dishes').update({ ...c.patch, updated_at: now }).eq('id', c.dishId).select('id'), 'Plato')
    case 'order_status':
      return expectRows(await supabase.from('orders').update({ status: c.status, updated_at: now }).eq('id', c.orderId).in('status', ['pending', 'cooking', 'ready']).select('id'), 'Pedido')
    case 'order_cancel': {
      const { error } = await supabase.rpc('cancelar_orden', { p_order_id: c.orderId })
      if (error) throw new Error(error.message)
      return
    }
    case 'staff_active': {
      // El cambio de estado va por RPC (banea/reactiva la cuenta y cierra sesiones); profiles.active ya no se escribe directo.
      const { error } = await supabase.rpc('set_employee_active', { p_employee_id: c.profileId, p_active: c.active })
      if (error) throw new Error(error.message)
      return
    }
    case 'expense_patch':
      return expectRows(await supabase.from('gastos').update(c.patch).eq('id', c.gastoId).select('id'), 'Gasto')
    case 'expense_delete':
      return expectRows(await supabase.from('gastos').delete().eq('id', c.gastoId).select('id'), 'Gasto')
    case 'supplier_delete':
      return expectRows(await supabase.from('proveedores').delete().eq('id', c.supplierId).select('id'), 'Proveedor')
    case 'staff_create': {
      const { error } = await supabase.rpc('create_employee_profile', { p_email: c.email, p_full_name: c.nombre, p_role: c.rol, p_password: c.password, p_recovery_email: null, p_phone: c.telefono })
      if (error) throw new Error(error.message.includes('duplicate') ? 'Ya existe una cuenta con ese correo.' : error.message)
      return `${c.nombre} · ${c.email} · clave temporal: ${c.password}`
    }
    case 'staff_update': {
      const { error } = await supabase.rpc('admin_update_employee', { p_user_id: c.profileId, p_email: null, p_password: null, p_full_name: c.nombre ?? null, p_phone: c.telefono ?? null, p_role: c.rol ?? null })
      if (error) throw new Error(error.message)
      return
    }
    case 'task_patch':
      return expectRows(await supabase.from('tasks').update({ ...c.patch, updated_at: now }).eq('id', c.taskId).select('id'), 'Tarea')
    case 'ingredient_insert': {
      const { error } = await supabase.from('ingredientes').insert(c.row)
      if (error) throw new Error(error.message)
      return
    }
    case 'ingredient_patch':
      return expectRows(await supabase.from('ingredientes').update({ ...c.patch, updated_at: now }).eq('id', c.ingredientId).select('id'), 'Ingrediente')
    case 'table_insert': {
      const { error } = await supabase.from('mesas').insert({ numero: c.numero, capacidad: c.capacidad, zona: 'principal', estado: 'libre', activa: true })
      if (error) throw new Error(error.code === '23505' ? `Ya existe la mesa ${c.numero}.` : error.message)
      return
    }
    case 'table_disable':
      return expectRows(await supabase.from('mesas').update({ activa: false, updated_at: now }).eq('id', c.mesaId).select('id'), 'Mesa')
    case 'biz_name': {
      const { data: cfg } = await supabase.from('restaurant_config').select('id').maybeSingle()
      if (!cfg?.id) throw new Error('No encontré la configuración del restaurante.')
      return expectRows(await supabase.from('restaurant_config').update({ display_name: c.name }).eq('id', cfg.id).select('id'), 'Restaurante')
    }
    case 'flavors_set': {
      const { data: cfg } = await supabase.from('restaurant_config').select('id, modules_enabled').maybeSingle()
      if (!cfg?.id) throw new Error('No encontré la configuración del restaurante.')
      const mods = (cfg.modules_enabled ?? {}) as Record<string, unknown>
      const off = c.clave === 'helado_flavors' ? 'helado_flavors_off' : 'jugo_flavors_off'
      const apagados = Array.isArray(mods[off]) ? (mods[off] as string[]).filter(x => c.lista.includes(x)) : []   // un sabor quitado deja también de estar «agotado»
      return expectRows(await supabase.from('restaurant_config').update({ modules_enabled: { ...mods, [c.clave]: c.lista, [off]: apagados } }).eq('id', cfg.id).select('id'), 'Sabores')
    }
    case 'dish_insert': {
      const { error } = await supabase.from('dishes').insert(c.row)
      if (error) throw new Error(error.message)
      return
    }
    case 'dish_availability': {
      const { error } = await supabase.rpc('set_plato_disponible', { p_dish_id: c.dishId, p_disponible: c.available })
      if (error) throw new Error(error.message)
      return
    }
    case 'option_availability': {
      // Con opciones nuevas: función de la lista del restaurante. Sin ellas: la de sabores heredados de siempre.
      const { error } = c.key.startsWith('legacy:')
        ? await supabase.rpc('set_opcion_menu_activa', { p_tipo: c.key.slice('legacy:'.length), p_nombre: c.label, p_activo: c.available })
        : await supabase.rpc('option_lista_set_activo', { p_key: c.key, p_label: c.label, p_activo: c.available })
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
    case 'expense_add': {
      // restaurant_id lo pone la base por defecto, igual que el formulario de gastos de la caja.
      // Con "lo pagó Fulano" el gasto es dinero propio: no resta del cajón y queda por reembolsar.
      return expectRows(await supabase.from('gastos')
        .insert({
          concepto: c.concepto, monto: c.monto, categoria: c.categoria, registrado_por: c.registradoPor,
          fuente: c.pagadoPor ? 'propio' : 'caja', pagado_por_nombre: c.pagadoPor,
        }).select('id'), 'Gasto')
    }
    case 'purchase_add': {
      // Misma función que usa la caja: registra el gasto, sus productos y suma el stock, todo junto.
      const { error } = await supabase.rpc('registrar_compra_proveedor', { p_concepto: c.concepto, p_items: c.items })
      if (error) throw new Error(error.message)
      return
    }
    case 'supplier_add':
      return expectRows(await supabase.from('proveedores')
        .insert({ nombre: c.nombre, telefono: c.telefono, email: c.email, producto: c.producto, notas: c.notas }).select('id'), 'Proveedor')
    case 'supplier_update':
      return expectRows(await supabase.from('proveedores').update({ ...c.patch, updated_at: now }).eq('id', c.supplierId).select('id'), 'Proveedor')
    case 'table_capacity':
      return expectRows(await supabase.from('mesas').update({ capacidad: c.capacidad, updated_at: now }).eq('id', c.mesaId).select('id'), 'Mesa')
  }
}
