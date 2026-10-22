/**
 * Cambios de OPERACIÓN que Resti propone: editar o borrar gastos, borrar proveedores, altas y datos del equipo, tareas, ingredientes y mesas.
 * Parte pura (sin red): con lo entendido por la IA y los datos reales arma el «antes → después» y el cambio exacto. Aplicar es `applyChange`
 * con los permisos del administrador, solo tras su confirmación. La clave temporal de un alta se genera AQUÍ, en el navegador: nunca pasa por la IA.
 */
import { norm } from './menuCambios.ts'

export type AccionOp =
  | { type: 'expense_edit'; ref: { concepto?: string; monto?: number }; set: { concepto?: string; monto?: number; categoria?: 'proveedor' | 'otro' } }
  | { type: 'expense_delete'; ref: { concepto?: string; monto?: number } }
  | { type: 'supplier_delete'; proveedor: string }
  | { type: 'staff_add'; nombre: string; email: string; rol: 'waiter' | 'kitchen' | 'cashier'; telefono?: string }
  | { type: 'staff_edit'; nombre: string; field: 'nombre' | 'telefono' | 'rol'; value: string }
  | { type: 'task_status'; tarea: string; status: 'pending' | 'in_progress' | 'completed' | 'rejected' }
  | { type: 'task_edit'; tarea: string; field: 'title' | 'description' | 'priority'; value: string }
  | { type: 'ingredient_add'; nombre: string; unidad_medida: string; stock_actual?: number; stock_minimo?: number; costo_unitario?: number }
  | { type: 'ingredient_edit'; ingrediente: string; field: 'nombre' | 'costo' | 'minimo' | 'unidad'; value: string }
  | { type: 'table_add'; numero: number; capacidad: number }
  | { type: 'table_remove'; numero: number }

export interface DatosOp {
  gastos: { id: string; concepto: string; monto: number; categoria: string | null; created_at?: string }[]
  proveedores: { id: string; nombre: string }[]
  equipo: { id: string; full_name: string | null; role: string; phone?: string | null; active?: boolean | null }[]
  tareas: { id: string; title: string; status: string; priority?: string }[]
  ingredientes: { id: string; nombre: string; unidad_medida: string; costo_unitario: number; stock_minimo?: number }[]
  mesas: { id: string; numero: number; capacidad: number }[]
}

export type CambioOpe =
  | { op: 'expense_patch'; gastoId: string; patch: { concepto?: string; monto?: number; categoria?: string | null } }
  | { op: 'expense_delete'; gastoId: string }
  | { op: 'supplier_delete'; supplierId: string }
  | { op: 'staff_create'; email: string; nombre: string; rol: string; telefono: string | null; password: string }
  | { op: 'staff_update'; profileId: string; nombre?: string; telefono?: string; rol?: string }
  | { op: 'task_patch'; taskId: string; patch: Record<string, unknown> }
  | { op: 'ingredient_insert'; row: Record<string, unknown> }
  | { op: 'ingredient_patch'; ingredientId: string; patch: Record<string, unknown> }
  | { op: 'table_insert'; numero: number; capacidad: number }
  | { op: 'table_disable'; mesaId: string }
export interface Propuesta { index: number; title: string; detail: string; change: CambioOpe | null; problem?: string; riesgo?: 'alto' }

const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const ROL: Record<string, string> = { waiter: 'mesero', kitchen: 'cocina', cashier: 'cajero', admin: 'administrador' }
const ESTADO_TAREA: Record<string, string> = { pending: 'Pendiente', in_progress: 'En progreso', completed: 'Completada', rejected: 'Rechazada' }
const PRIORIDAD: Record<string, string> = { low: 'baja', medium: 'media', high: 'alta', urgent: 'urgente' }
const UNIDAD: Record<string, string> = { kg: 'kg', litro: 'litros', pieza: 'piezas', gramo: 'gramos', ml: 'ml', paquete: 'paquetes' }

/** Clave temporal legible (sin 0/O/1/l) con mayúscula, minúscula, número y símbolo. Solo se muestra al administrador, una vez. */
export function claveTemporal(aleatorio: (n: number) => number = n => Math.floor(Math.random() * n)): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz', mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ', nums = '23456789', sim = '!@#$%'
  const de = (s: string) => s[aleatorio(s.length)]
  let c = de(mayus) + de(letras) + de(letras) + de(letras) + de(nums) + de(nums) + de(sim) + de(letras) + de(mayus) + de(nums)
  c = c.split('').sort(() => aleatorio(3) - 1).join('')
  return c
}
const claveSegura = () => { try { const b = new Uint32Array(16); crypto.getRandomValues(b); let i = 0; return claveTemporal(n => b[i++ % 16] % n) } catch { return claveTemporal() } }

function elegir<T>(cand: T[], qué: string, nombre: (x: T) => string): { uno?: T; problema?: string } {
  if (cand.length === 0) return { problema: `No encontré ${qué}.` }
  if (cand.length > 1) return { problema: `Hay varios que encajan (${cand.slice(0, 4).map(nombre).join(', ')}). Dime cuál.` }
  return { uno: cand[0] }
}
const coincide = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }

export function proponerCambiosOp(acciones: AccionOp[], d: DatosOp): Propuesta[] {
  const borrados = new Set<string>()
  const gastos = d.gastos.map(g => ({ ...g })), tareas = d.tareas.map(t => ({ ...t })), mesas = d.mesas.map(m => ({ ...m })), proveedores = d.proveedores.map(p => ({ ...p }))
  return acciones.map((a, index): Propuesta => {
    const sin = (title: string, problem: string): Propuesta => ({ index, title, detail: '', change: null, problem })
    const buscarGasto = (ref: { concepto?: string; monto?: number }) => gastos.filter(g => !borrados.has(g.id)
      && (ref.concepto === undefined || coincide(g.concepto, ref.concepto)) && (ref.monto === undefined || Math.round(g.monto) === Math.round(ref.monto)))
    switch (a.type) {
      case 'expense_edit': case 'expense_delete': {
        const edita = a.type === 'expense_edit', t = edita ? 'Corregir gasto' : 'Eliminar gasto'
        const { uno, problema } = elegir(buscarGasto(a.ref), 'ese gasto', g => `${g.concepto} ${cop(g.monto)}`)
        if (!uno) return sin(t, problema!)
        if (!edita) { borrados.add(uno.id); return { index, title: `Eliminar el gasto «${uno.concepto}»`, detail: `${cop(uno.monto)} · se borra de los gastos`, change: { op: 'expense_delete', gastoId: uno.id }, riesgo: 'alto' } }
        const patch: { concepto?: string; monto?: number; categoria?: string | null } = {}, cambios: string[] = []
        if (a.set.concepto !== undefined && a.set.concepto !== uno.concepto) { patch.concepto = a.set.concepto; cambios.push(`concepto «${uno.concepto}» → «${a.set.concepto}»`) }
        if (a.set.monto !== undefined && Math.round(a.set.monto) !== Math.round(uno.monto)) { patch.monto = a.set.monto; cambios.push(`${cop(uno.monto)} → ${cop(a.set.monto)}`) }
        if (a.set.categoria !== undefined) { const nueva = a.set.categoria === 'proveedor' ? 'proveedor' : null; if (nueva !== (uno.categoria ?? null)) { patch.categoria = nueva; cambios.push(`categoría → ${nueva ?? 'otro'}`) } }
        if (!cambios.length) return sin(`Gasto «${uno.concepto}»`, 'Ya está así.')
        uno.concepto = patch.concepto ?? uno.concepto; uno.monto = patch.monto ?? uno.monto
        return { index, title: `Gasto «${uno.concepto}»`, detail: cambios.join(' · '), change: { op: 'expense_patch', gastoId: uno.id, patch } }
      }
      case 'supplier_delete': {
        const { uno, problema } = elegir(proveedores.filter(p => !borrados.has(p.id) && coincide(p.nombre, a.proveedor)), `al proveedor «${a.proveedor}»`, p => p.nombre)
        if (!uno) return sin(`Eliminar proveedor ${a.proveedor}`, problema!)
        borrados.add(uno.id)
        return { index, title: `Eliminar al proveedor ${uno.nombre}`, detail: 'Se quita de la lista de proveedores (los gastos ya registrados se conservan)', change: { op: 'supplier_delete', supplierId: uno.id }, riesgo: 'alto' }
      }
      case 'staff_add': {
        if (d.equipo.some(p => p.full_name && norm(p.full_name) === norm(a.nombre))) return sin(`Agregar a ${a.nombre}`, 'Ya hay alguien en el equipo con ese nombre.')
        return { index, title: `Agregar a ${a.nombre} como ${ROL[a.rol]}`, detail: `${a.email}${a.telefono ? ` · ${a.telefono}` : ''} · se crea con una clave temporal que verás una sola vez`, change: { op: 'staff_create', email: a.email, nombre: a.nombre, rol: a.rol, telefono: a.telefono ?? null, password: claveSegura() }, riesgo: 'alto' }
      }
      case 'staff_edit': {
        const { uno, problema } = elegir(d.equipo.filter(p => p.full_name && coincide(p.full_name, a.nombre)), `a «${a.nombre}» en el equipo`, p => p.full_name ?? '')
        if (!uno) return sin(`Cambiar a ${a.nombre}`, problema!)
        if (uno.role === 'admin') return sin(`Cambiar a ${uno.full_name}`, 'No se puede cambiar al administrador.')
        if (a.field === 'rol') {
          if (uno.role === a.value) return sin(uno.full_name!, `Ya es ${ROL[a.value]}.`)
          return { index, title: `Cambiar el rol de ${uno.full_name}`, detail: `${ROL[uno.role] ?? uno.role} → ${ROL[a.value]}`, change: { op: 'staff_update', profileId: uno.id, rol: a.value }, riesgo: 'alto' }
        }
        if (a.field === 'telefono') return { index, title: `Teléfono de ${uno.full_name}`, detail: `${uno.phone || '—'} → ${a.value}`, change: { op: 'staff_update', profileId: uno.id, telefono: a.value } }
        return { index, title: `Cambiar el nombre de ${uno.full_name}`, detail: `«${uno.full_name}» → «${a.value}»`, change: { op: 'staff_update', profileId: uno.id, nombre: a.value } }
      }
      case 'task_status': case 'task_edit': {
        const { uno, problema } = elegir(tareas.filter(t => coincide(t.title, a.tarea)), `la tarea «${a.tarea}»`, t => t.title)
        if (!uno) return sin(`Tarea ${a.tarea}`, problema!)
        if (a.type === 'task_status') {
          if (uno.status === a.status) return sin(`Tarea «${uno.title}»`, `Ya está ${ESTADO_TAREA[a.status].toLowerCase()}.`)
          const antes = uno.status; uno.status = a.status
          return { index, title: `Tarea «${uno.title}»`, detail: `${ESTADO_TAREA[antes] ?? antes} → ${ESTADO_TAREA[a.status]}`, change: { op: 'task_patch', taskId: uno.id, patch: { status: a.status } } }
        }
        const clave = a.field === 'title' ? 'title' : a.field === 'description' ? 'description' : 'priority'
        if (clave === 'title' && a.value.length < 3) return sin(`Tarea «${uno.title}»`, 'El título es muy corto.')
        const antes = clave === 'priority' ? PRIORIDAD[uno.priority ?? 'medium'] : clave === 'title' ? `«${uno.title}»` : 'descripción actual'
        const despues = clave === 'priority' ? PRIORIDAD[a.value] : `«${a.value}»`
        const t = { index, title: `Tarea «${uno.title}»`, detail: `${clave === 'priority' ? 'Prioridad' : clave === 'title' ? 'Título' : 'Descripción'}: ${antes} → ${despues}`, change: { op: 'task_patch' as const, taskId: uno.id, patch: { [clave]: a.value } } }
        if (clave === 'title') uno.title = a.value
        return t
      }
      case 'ingredient_add': {
        if (d.ingredientes.some(i => norm(i.nombre) === norm(a.nombre))) return sin(`Crear ${a.nombre}`, 'Ya existe un ingrediente con ese nombre.')
        const row = { nombre: a.nombre, unidad_medida: a.unidad_medida, stock_actual: a.stock_actual ?? 0, stock_minimo: a.stock_minimo ?? 0, costo_unitario: a.costo_unitario ?? 0 }
        return { index, title: `Crear el ingrediente ${a.nombre}`, detail: `${row.stock_actual} ${UNIDAD[a.unidad_medida] ?? a.unidad_medida} · costo ${cop(row.costo_unitario)} · mínimo ${row.stock_minimo}`, change: { op: 'ingredient_insert', row } }
      }
      case 'ingredient_edit': {
        const { uno, problema } = elegir(d.ingredientes.filter(i => coincide(i.nombre, a.ingrediente)), `el ingrediente «${a.ingrediente}»`, i => i.nombre)
        if (!uno) return sin(`Ingrediente ${a.ingrediente}`, problema!)
        if (a.field === 'costo') return { index, title: `Costo de ${uno.nombre}`, detail: `${cop(uno.costo_unitario)} → ${cop(Number(a.value))}`, change: { op: 'ingredient_patch', ingredientId: uno.id, patch: { costo_unitario: Number(a.value) } } }
        if (a.field === 'minimo') return { index, title: `Stock mínimo de ${uno.nombre}`, detail: `${uno.stock_minimo ?? 0} → ${Number(a.value)}`, change: { op: 'ingredient_patch', ingredientId: uno.id, patch: { stock_minimo: Number(a.value) } } }
        if (a.field === 'unidad') return { index, title: `Unidad de ${uno.nombre}`, detail: `${UNIDAD[uno.unidad_medida] ?? uno.unidad_medida} → ${UNIDAD[a.value] ?? a.value}`, change: { op: 'ingredient_patch', ingredientId: uno.id, patch: { unidad_medida: a.value } } }
        return { index, title: 'Renombrar ingrediente', detail: `«${uno.nombre}» → «${a.value}»`, change: { op: 'ingredient_patch', ingredientId: uno.id, patch: { nombre: a.value } } }
      }
      case 'table_add': {
        if (mesas.some(m => m.numero === a.numero)) return sin(`Agregar la mesa ${a.numero}`, `Ya existe la mesa ${a.numero}.`)
        mesas.push({ id: `nueva-${a.numero}`, numero: a.numero, capacidad: a.capacidad })
        return { index, title: `Agregar la mesa ${a.numero}`, detail: `Capacidad ${a.capacidad} personas`, change: { op: 'table_insert', numero: a.numero, capacidad: a.capacidad } }
      }
      case 'table_remove': {
        const m = mesas.find(x => x.numero === a.numero && !borrados.has(x.id))
        if (!m) return sin(`Quitar la mesa ${a.numero}`, `No encontré la mesa ${a.numero}.`)
        borrados.add(m.id)
        return { index, title: `Quitar la mesa ${a.numero}`, detail: 'Se desactiva y deja de aparecer en el mapa de mesas', change: { op: 'table_disable', mesaId: m.id }, riesgo: 'alto' }
      }
    }
  })
}
