// Edge Function: voice-parse
// Recibe un audio (WAV 16 kHz mono en base64) y lo convierte, con Gemini, en la
// transcripción + datos estructurados según `kind`. NUNCA escribe en la base:
// el frontend muestra el resultado para que la persona lo revise y lo guarde
// con sus propios permisos (RLS normal).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_AUDIO_B64 = 4_000_000 // ~3 MB de audio ≈ 90 s a 16 kHz mono

const S = { type: 'STRING' }
const N = { type: 'NUMBER' }
const arr = (props: Record<string, unknown>, required: string[]) => ({
  type: 'ARRAY', items: { type: 'OBJECT', properties: props, required },
})
const obj = (props: Record<string, unknown>, required: string[]) => ({ type: 'OBJECT', properties: props, required })

const PESOS = 'Los precios están en pesos colombianos: "14 mil" = 14000, "dos mil quinientos" = 2500.'

interface Kind { roles: string[]; prompt: string; schema: unknown }

const KINDS: Record<string, Kind> = {
  transcribe: {
    roles: ['admin', 'cashier'],
    prompt: 'Transcribe el audio en español tal cual se dijo, sin agregar nada.',
    schema: obj({ transcript: S }, ['transcript']),
  },
  menu: {
    roles: ['admin'],
    prompt: `El administrador de un restaurante dicta platos de su menú. Extrae TODOS los platos mencionados. ${PESOS}
Si un plato se vende por tamaños, llena "sizes" (nombre y precio de cada uno) y deja "price" en el menor. Toppings/adicionales opcionales van en "toppings" (precio 0 si son gratis).
"category" debe ser el valor EXACTO de una de las categorías existentes (context.categories) si alguna encaja; si ninguna encaja, propone un nombre corto en minúsculas.`,
    schema: obj({
      transcript: S,
      dishes: arr({
        name: S, price: N, category: S, description: S,
        sizes: arr({ nombre: S, precio: N }, ['nombre', 'precio']),
        toppings: arr({ nombre: S, precio: N }, ['nombre', 'precio']),
      }, ['name', 'price']),
    }, ['transcript', 'dishes']),
  },
  topping: {
    roles: ['admin'],
    prompt: `El administrador dicta toppings opcionales de un plato. ${PESOS} Precio 0 si son gratis o no se menciona precio.`,
    schema: obj({ transcript: S, toppings: arr({ nombre: S, precio: N }, ['nombre', 'precio']) }, ['transcript', 'toppings']),
  },
  recipe: {
    roles: ['admin'],
    prompt: `El administrador dicta la receta de un plato: qué ingredientes y cuánto lleva UNA porción.
"plato": el nombre del plato, igual a uno de context.dishes si alguno encaja. Cada ingrediente: nombre (igual a uno de context.ingredients si alguno encaja), cantidad numérica y unidad (g, kg, ml, litro, pieza…).`,
    schema: obj({
      transcript: S, plato: S,
      lineas: arr({ nombre: S, cantidad: N, unidad: S, precio_unitario: N }, ['nombre', 'cantidad']),
        concepto: S, monto: N, categoria: { type: 'STRING', enum: ['proveedor', 'otro'] },
    }, ['transcript', 'lineas']),
  },
  ingredient: {
    roles: ['admin'],
    prompt: `El administrador dicta ingredientes de inventario. ${PESOS}
"unidad_medida" debe ser exactamente una de: kg, litro, pieza, gramo, ml, paquete. "costo_unitario" es el precio por unidad de medida. stock_minimo 0 si no se menciona.`,
    schema: obj({
      transcript: S,
      ingredientes: arr({
        nombre: S, unidad_medida: { type: 'STRING', enum: ['kg', 'litro', 'pieza', 'gramo', 'ml', 'paquete'] },
        stock_actual: N, stock_minimo: N, costo_unitario: N,
      }, ['nombre', 'unidad_medida']),
    }, ['transcript', 'ingredientes']),
  },
  purchase: {
    roles: ['admin', 'cashier'],
    prompt: `Se dicta una compra a un proveedor. ${PESOS} "concepto": el nombre del proveedor. Cada producto: nombre, cantidad, unidad y precio UNITARIO (si solo dicen el total de la línea, divídelo entre la cantidad). Usa el nombre de context.ingredients si alguno encaja.`,
    schema: obj({
      transcript: S, concepto: S,
      items: arr({ nombre_producto: S, cantidad: N, unidad: S, precio_unitario: N }, ['nombre_producto', 'cantidad', 'precio_unitario']),
    }, ['transcript', 'items']),
  },
  command: {
    // El cajero también dicta comandos, pero solo los operativos: eso lo limita el cliente
    // (ALLOWED_ACTIONS) y, al escribir, la base (RLS / funciones que validan el rol).
    roles: ['admin', 'cashier'],
    prompt: `El administrador de un restaurante da órdenes de voz para CAMBIAR datos que ya existen. Devuelve una acción por cada cambio pedido, en el orden dicho. ${PESOS}
Tipos de acción ("type") y los campos que usa cada uno:
- dish_price: cambiar el precio de un plato. Campos: dish, price, y size SOLO si el plato se vende por tamaños (context.dishes[].sizes no vacío) y dijeron cuál.
- dish_availability: marcar un plato disponible o agotado ("se acabó el cholao" = available false). Campos: dish, available.
- ingredient_stock: cambiar el inventario de un ingrediente. Campos: ingredient, mode ("set" = dejar en esa cantidad, "add" = sumar, "subtract" = restar), quantity. "Se acabó la fresa" = set con quantity 0. Expresa quantity en la unidad del ingrediente (context.ingredients[].unit): si dicen gramos y la unidad es kg, convierte.
- task_create: crear una tarea. Campos: title, description, assignee, priority (low, medium, high, urgent; medium por defecto), due_date (YYYY-MM-DD calculado con context.today, "" si no hay fecha).
- shift_set: asignar o cambiar el turno de un empleado. Campos: employee, date (YYYY-MM-DD calculado con context.today y context.weekday; "el lunes" es el próximo lunes), start y end en formato 24 h HH:MM ("de ocho a cinco" = 08:00 y 17:00), notes opcional.
- shift_delete: quitar el turno de un empleado un día. Campos: employee, date.
- table_status: cambiar el estado de una mesa. Campos: mesa (número), estado (libre, ocupada, reservada o cuenta).
- table_capacity: cambiar cuántas personas caben en una mesa. Campos: mesa (número), capacidad.
- recipe_set: dictar o cambiar la receta de un plato (qué ingredientes y cuánto lleva UNA porción). Campos: dish, lineas (nombre del ingrediente, cantidad numérica y unidad TAL COMO SE DIJO: "g", "kg", "ml", "litro", "pieza"…; NO conviertas unidades aquí, la app lo hace), mode: "add" (por defecto: agregar o actualizar ingredientes de la receta que ya tiene, p. ej. "agrégale 50 gramos de leche condensada al cholao") o "set" (la receta es exactamente esta, p. ej. "la receta del cholao es…"). Cada ingrediente de lineas debe ser el valor EXACTO de context.ingredients cuando alguno encaje.
- expense_add: registrar un gasto o un pago que NO trae lista de productos (arriendo, servicios, nómina, transporte, o "le pagué 50 mil a Coca-Cola"). Campos: concepto (qué se pagó y a quién), monto (pesos), categoria: "proveedor" si es un pago a un proveedor, "otro" en cualquier otro caso.
- purchase_add: compra a un proveedor donde SÍ dicen productos con cantidad y precio; suma al inventario. Campos: concepto (nombre del proveedor), lineas (nombre del ingrediente, cantidad, unidad TAL COMO SE DIJO sin convertir, precio_unitario = precio por UNA unidad de la unidad dicha; si solo dicen el total de la línea, divídelo entre la cantidad). Si solo dicen un monto sin productos, usa expense_add, no purchase_add.
Los campos dish, ingredient, assignee y employee deben ser el valor EXACTO de la lista correspondiente del context cuando alguno encaje; si ninguno encaja, déjalo tal como se dijo. No inventes valores que no se dijeron: omite el campo. Si lo dicho no es ninguna de estas acciones, devuelve la lista vacía.`,
    schema: obj({
      transcript: S,
      actions: arr({
        type: { type: 'STRING', enum: [
          'dish_price', 'dish_availability', 'ingredient_stock', 'task_create',
          'shift_set', 'shift_delete', 'table_status', 'table_capacity', 'recipe_set', 'expense_add', 'purchase_add',
        ] },
        dish: S, size: S, price: N, available: { type: 'BOOLEAN' },
        ingredient: S, mode: { type: 'STRING', enum: ['set', 'add', 'subtract'] }, quantity: N,
        title: S, description: S, assignee: S,
        priority: { type: 'STRING', enum: ['low', 'medium', 'high', 'urgent'] }, due_date: S,
        employee: S, date: S, start: S, end: S, notes: S,
        lineas: arr({ nombre: S, cantidad: N, unidad: S, precio_unitario: N }, ['nombre', 'cantidad']),
        concepto: S, monto: N, categoria: { type: 'STRING', enum: ['proveedor', 'otro'] },
        mesa: N, estado: { type: 'STRING', enum: ['libre', 'ocupada', 'reservada', 'cuenta'] }, capacidad: N,
      }, ['type']),
    }, ['transcript', 'actions']),
  },
  task: {
    roles: ['admin'],
    prompt: `El administrador asigna una tarea a un empleado. "assignee_name": el nombre exacto de context.employees que mejor coincida ("" si no se menciona). "priority": low, medium, high o urgent (medium por defecto). "due_date": formato YYYY-MM-DD calculado con context.today ("" si no hay fecha).`,
    schema: obj({
      transcript: S, title: S, description: S, assignee_name: S,
      priority: { type: 'STRING', enum: ['low', 'medium', 'high', 'urgent'] }, due_date: S,
    }, ['transcript', 'title']),
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const { kind, audio, mime = 'audio/wav', context = {} } = await req.json().catch(() => ({}))
    const cfg = KINDS[kind as string]
    if (!cfg) return json({ error: 'Tipo de dictado inválido' }, 400)
    if (typeof audio !== 'string' || audio.length < 100) return json({ error: 'Audio vacío' }, 400)
    if (audio.length > MAX_AUDIO_B64) return json({ error: 'El audio es muy largo. Dicta en partes de máximo 90 segundos.' }, 413)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return json({ error: 'no autenticado' }, 401)
    const { data: prof } = await supabase.from('profiles').select('role, restaurant_id').eq('id', user.id).maybeSingle()
    if (!prof?.restaurant_id || !cfg.roles.includes(prof.role)) return json({ error: 'Sin permiso para este dictado' }, 403)

    // Cada llamada cuesta dinero: máx 30 dictados por usuario cada 10 min.
    const { data: ok } = await supabase.rpc('check_rate_limit', { p_key: `voice:${user.id}`, p_max: 30, p_window_seconds: 600 })
    if (ok === false) return json({ error: 'Muchos dictados seguidos. Espera unos minutos.' }, 429)

    const { data: secret } = await supabase.from('platform_secrets').select('value').eq('key', 'gemini_api_key').single()
    if (!secret?.value) return json({ error: 'Config faltante' }, 500)

    // Los comandos llevan menú + inventario + equipo + mesas, así que necesitan más espacio.
    const ctx = JSON.stringify(context).slice(0, kind === 'command' ? 20000 : 8000)
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${secret.value}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { text: `${cfg.prompt}\nResponde solo con el JSON pedido. No inventes datos que no se dijeron.\ncontext: ${ctx}` },
            { inlineData: { mimeType: mime, data: audio } },
          ] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: cfg.schema },
        }),
      },
    )
    const data = await resp.json()
    if (!resp.ok) {
      console.error('Gemini error', JSON.stringify(data))
      return json({ error: 'No pude procesar el audio. Intenta de nuevo.' }, 502)
    }
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
    try {
      return json({ result: JSON.parse(text) })
    } catch {
      return json({ error: 'No entendí el audio. Intenta hablar más claro.' }, 502)
    }
  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
