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
      lineas: arr({ nombre: S, cantidad: N, unidad: S }, ['nombre', 'cantidad']),
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

    const ctx = JSON.stringify(context).slice(0, 8000)
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
