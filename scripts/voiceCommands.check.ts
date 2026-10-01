// Chequeo rápido de voiceCommands (sin framework):
//   node --experimental-strip-types scripts/voiceCommands.check.ts
import assert from 'node:assert/strict'
import { buildProposals, bogotaNow, money, toPromptContext, type CommandContext, type RawAction } from '../src/services/voiceCommands.ts'

const base = (): CommandContext => ({
  today: '2026-10-01', weekday: 'jueves',
  dishes: [
    { id: 'd1', name: 'Cholao con helado', price: 12000, has_sizes: true, available: true,
      sizes: [{ nombre: 'Pequeño', precio: 12000 }, { nombre: 'Grande', precio: 14000 }] },
    { id: 'd2', name: 'Limonada', price: 5000, has_sizes: false, available: true, sizes: [] },
    { id: 'd3', name: 'Jugo único', price: 6000, has_sizes: true, available: true, sizes: [{ nombre: 'Normal', precio: 6000 }] },
  ],
  ingredients: [
    { id: 'i1', nombre: 'Fresa', unidad_medida: 'kg', stock_actual: 5 },
    { id: 'i2', nombre: 'Limón', unidad_medida: 'kg', stock_actual: 1 },
  ],
  employees: [{ id: 'e1', full_name: 'Juan Pérez' }, { id: 'e2', full_name: 'María López' }],
  mesas: [{ id: 'm1', numero: 4, capacidad: 4, estado: 'libre' }, { id: 'm2', numero: 5, capacidad: 2, estado: 'ocupada' }],
})
const one = (a: RawAction, ctx = base()) => buildProposals([a], ctx, 'admin1')[0]

// money
assert.equal(money(14000), '$14.000')
assert.equal(money(1250000), '$1.250.000')
assert.equal(money(0), '$0')

// Hora de Colombia: 03:00 UTC del 2 de octubre = 22:00 del 1 de octubre en Bogotá
assert.deepEqual(bogotaNow(new Date('2026-10-02T03:00:00Z')), { today: '2026-10-01', weekday: 'jueves' })

// ── Precio ──
{
  const p = one({ type: 'dish_price', dish: 'Limonada', price: 6000 })
  assert.equal(p.detail, '$5.000 → $6.000')
  assert.deepEqual(p.change, { op: 'dish_price', dishId: 'd2', price: 6000 })
}
{ // con tamaños: cambia solo el tamaño pedido y el precio base queda en el menor
  const p = one({ type: 'dish_price', dish: 'Cholao con helado', size: 'Grande', price: 15000 })
  assert.equal(p.title, 'Cholao con helado · Grande')
  assert.equal(p.detail, '$14.000 → $15.000')
  assert.deepEqual(p.change, { op: 'dish_price', dishId: 'd1', price: 12000, sizes: [{ nombre: 'Pequeño', precio: 12000 }, { nombre: 'Grande', precio: 15000 }] })
}
{ // bajar el tamaño menor mueve el precio base
  const p = one({ type: 'dish_price', dish: 'Cholao con helado', size: 'Pequeño', price: 9000 })
  assert.equal((p.change as { price: number }).price, 9000)
}
{ // con tamaños y sin decir cuál: problema, no cambia nada
  const p = one({ type: 'dish_price', dish: 'Cholao con helado', price: 15000 })
  assert.equal(p.change, null)
  assert.match(p.problem!, /Pequeño, Grande/)
}
assert.match(one({ type: 'dish_price', dish: 'Cholao con helado', size: 'Gigante', price: 1 }).problem!, /no tiene el tamaño/)
assert.equal(one({ type: 'dish_price', dish: 'Jugo único', price: 7000 }).change?.op, 'dish_price') // un solo tamaño: se infiere
assert.match(one({ type: 'dish_price', dish: 'Pizza', price: 1000 }).problem!, /No encontré el plato/)
assert.match(one({ type: 'dish_price', dish: 'Limonada' }).problem!, /precio/)
assert.match(one({ type: 'dish_price', dish: 'Limonada', price: -5 }).problem!, /precio/)

// ── Disponibilidad ──
assert.deepEqual(one({ type: 'dish_availability', dish: 'Limonada', available: false }).change, { op: 'dish_availability', dishId: 'd2', available: false })
assert.equal(one({ type: 'dish_availability', dish: 'Limonada', available: false }).detail, 'Disponible → Agotado')
assert.match(one({ type: 'dish_availability', dish: 'Limonada' }).problem!, /disponible o agotado/)

// ── Inventario ──
assert.deepEqual(one({ type: 'ingredient_stock', ingredient: 'Fresa', mode: 'set', quantity: 0 }).change, { op: 'ingredient_stock', ingredientId: 'i1', stock: 0 })
assert.equal(one({ type: 'ingredient_stock', ingredient: 'Fresa', mode: 'add', quantity: 2.5 }).detail, '5 → 7.5 kg')
assert.equal((one({ type: 'ingredient_stock', ingredient: 'Fresa', mode: 'subtract', quantity: 2 }).change as { stock: number }).stock, 3)
{ // restar de más: se queda en 0 (la base no admite negativos) y lo avisa
  const p = one({ type: 'ingredient_stock', ingredient: 'Limón', mode: 'subtract', quantity: 5 })
  assert.equal((p.change as { stock: number }).stock, 0)
  assert.match(p.detail, /no puede bajar de 0/)
}
assert.equal((one({ type: 'ingredient_stock', ingredient: 'Fresa', quantity: 9 }).change as { stock: number }).stock, 9) // sin modo = set
assert.match(one({ type: 'ingredient_stock', ingredient: 'Mango', quantity: 1 }).problem!, /No encontré el ingrediente/)
assert.match(one({ type: 'ingredient_stock', ingredient: 'Fresa' }).problem!, /cantidad/)

// Dos cambios al mismo ingrediente se acumulan (no se pisan)
{
  const [a, b] = buildProposals([
    { type: 'ingredient_stock', ingredient: 'Fresa', mode: 'add', quantity: 2 },
    { type: 'ingredient_stock', ingredient: 'Fresa', mode: 'add', quantity: 3 },
  ], base(), 'admin1')
  assert.equal((a.change as { stock: number }).stock, 7)
  assert.equal((b.change as { stock: number }).stock, 10)
  assert.equal(b.detail, '7 → 10 kg')
}
{ // dos precios del mismo plato con tamaños: el segundo parte del primero
  const [, b] = buildProposals([
    { type: 'dish_price', dish: 'Cholao con helado', size: 'Grande', price: 15000 },
    { type: 'dish_price', dish: 'Cholao con helado', size: 'Pequeño', price: 13000 },
  ], base(), 'admin1')
  assert.deepEqual((b.change as { sizes: unknown }).sizes, [{ nombre: 'Pequeño', precio: 13000 }, { nombre: 'Grande', precio: 15000 }])
}

// ── Tareas ──
{
  const p = one({ type: 'task_create', title: 'Limpiar la nevera', assignee: 'María López', priority: 'high', due_date: '2026-10-03' })
  assert.deepEqual(p.change, { op: 'task_create', title: 'Limpiar la nevera', description: '', assignedTo: 'e2', priority: 'high', dueDate: '2026-10-03', createdBy: 'admin1' })
  assert.match(p.detail, /Para María López · prioridad alta · vence 2026-10-03/)
}
assert.equal((one({ type: 'task_create', title: 'Barrer', assignee: 'Juan Pérez', priority: 'enorme', due_date: 'mañana' }).change as { priority: string; dueDate: unknown }).priority, 'medium')
assert.equal((one({ type: 'task_create', title: 'Barrer', assignee: 'Juan Pérez', due_date: 'mañana' }).change as { dueDate: unknown }).dueDate, null)
assert.match(one({ type: 'task_create', title: 'Barrer' }).problem!, /a quién/)
assert.match(one({ type: 'task_create', title: 'Barrer', assignee: 'Pedro' }).problem!, /No encontré al empleado/)
assert.match(one({ type: 'task_create', title: 'ab', assignee: 'Juan Pérez' }).problem!, /título/)

// ── Turnos ──
assert.deepEqual(one({ type: 'shift_set', employee: 'Juan Pérez', date: '2026-10-05', start: '8:00', end: '17:00' }).change,
  { op: 'shift_set', employeeId: 'e1', date: '2026-10-05', start: '08:00', end: '17:00', notes: '' })
assert.equal(one({ type: 'shift_set', employee: 'Juan Pérez', date: '2026-10-05', start: '08:00', end: '17:00' }).detail, '2026-10-05 · 08:00–17:00')
assert.match(one({ type: 'shift_set', employee: 'Juan Pérez', date: '2026-10-05', start: '17:00', end: '08:00' }).problem!, /antes de la de fin/)
assert.match(one({ type: 'shift_set', employee: 'Juan Pérez', date: '2026-10-05', start: '25:00', end: '26:00' }).problem!, /hora/)
assert.match(one({ type: 'shift_set', employee: 'Juan Pérez', date: '2026-02-31', start: '08:00', end: '17:00' }).problem!, /fecha/)
assert.match(one({ type: 'shift_set', employee: 'Juan Pérez', start: '08:00', end: '17:00' }).problem!, /fecha/)
assert.match(one({ type: 'shift_set', employee: 'Nadie', date: '2026-10-05', start: '08:00', end: '17:00' }).problem!, /No encontré al empleado/)
assert.deepEqual(one({ type: 'shift_delete', employee: 'María López', date: '2026-10-06' }).change, { op: 'shift_delete', employeeId: 'e2', date: '2026-10-06' })
assert.match(one({ type: 'shift_delete', employee: 'María López' }).problem!, /fecha/)

// ── Mesas ──
assert.deepEqual(one({ type: 'table_status', mesa: 4, estado: 'ocupada' }).change, { op: 'table_status', mesaId: 'm1', estado: 'ocupada' })
assert.equal(one({ type: 'table_status', mesa: 5, estado: 'libre' }).detail, 'ocupada → libre')
assert.match(one({ type: 'table_status', mesa: 99, estado: 'libre' }).problem!, /No encontré la mesa 99/)
assert.match(one({ type: 'table_status', mesa: 4, estado: 'rota' }).problem!, /estado/)
assert.deepEqual(one({ type: 'table_capacity', mesa: 5, capacidad: 6 }).change, { op: 'table_capacity', mesaId: 'm2', capacidad: 6 })
assert.equal(one({ type: 'table_capacity', mesa: 5, capacidad: 6 }).detail, '2 → 6 personas')
assert.match(one({ type: 'table_capacity', mesa: 5, capacidad: 0 }).problem!, /capacidad/)
assert.match(one({ type: 'table_capacity', mesa: 5, capacidad: 2.5 }).problem!, /capacidad/)

// ── Otros ──
assert.match(one({ type: 'borrar_todo' }).title, /no reconocida/i)
assert.ok(one({ type: 'borrar_todo' }).problem)
assert.equal(one({ type: 'borrar_todo' }).change, null)
assert.deepEqual(buildProposals([], base(), 'admin1'), [])

// El índice apunta a la acción de origen (para poder quitarla en la pantalla)
assert.deepEqual(buildProposals([{ type: 'x' }, { type: 'table_status', mesa: 4, estado: 'cuenta' }], base(), 'a').map(p => p.index), [0, 1])

// No muta el contexto original
{
  const ctx = base()
  buildProposals([{ type: 'ingredient_stock', ingredient: 'Fresa', mode: 'set', quantity: 0 }], ctx, 'a')
  assert.equal(ctx.ingredients[0].stock_actual, 5)
}

// Contexto para la IA: solo nombres, sin ids ni precios
{
  const pc = toPromptContext(base())
  assert.deepEqual(pc.dishes[0], { name: 'Cholao con helado', sizes: ['Pequeño', 'Grande'] })
  assert.deepEqual(pc.dishes[1], { name: 'Limonada', sizes: [] })
  assert.deepEqual(pc.ingredients[0], { name: 'Fresa', unit: 'kg' })
  assert.deepEqual(pc.employees, ['Juan Pérez', 'María López'])
  assert.deepEqual(pc.mesas, [4, 5])
  assert.ok(!JSON.stringify(pc).includes('"id"'))
}

process.stdout.write('voiceCommands: todo OK\n')
