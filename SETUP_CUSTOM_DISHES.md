# 🍽️ Platos Personalizados (Custom Dishes)

Funcionalidad que permite al cliente armar su propio plato eligiendo ingredientes
del stock disponible. El precio se calcula con el costo real de los ingredientes
y el stock se descuenta automáticamente al enviar el pedido.

## ✅ Estado

**La migración de base de datos YA está aplicada en Supabase** (proyecto `RestaurantOs`),
aplicada vía MCP y verificada con pruebas end-to-end. No necesitas ejecutar SQL manualmente.

El archivo `schema_custom_dishes.sql` queda en el repo como **referencia/respaldo**
por si se reconstruye la base de datos desde cero.

## 🧩 Qué se creó en la base de datos

| Objeto | Tipo | Función |
|--------|------|---------|
| `custom_dishes` | tabla | Cabecera del plato personalizado (nombre, precio, orden) |
| `custom_dish_ingredients` | tabla | Ingredientes elegidos para cada plato custom |
| `ingredientes_disponibles` | vista | Ingredientes con `stock_actual > 0` para el selector |
| `crear_plato_custom()` | función | Crea el plato custom y descuenta su stock (atómico) |
| `crear_orden_con_custom()` | función | **RPC principal**: crea la orden con items normales + custom |

Todas las tablas tienen **RLS habilitado** y la vista usa `security_invoker`.

## 🖥️ Qué se agregó en el frontend

- `src/components/CustomDishBuilder.tsx` — modal para armar el plato
- `src/components/ClientMenuSection.tsx` — botón "🎨 Crear mi propio plato" + integración
- `src/types/index.ts` — campos extra en `Dish`

## 🔄 Cómo funciona el flujo

1. El cliente abre el menú y pulsa **"🎨 Crear mi propio plato"**.
2. Elige ingredientes disponibles y sus cantidades (la cantidad nunca excede el stock).
3. El precio se calcula en vivo: `costo_unitario × cantidad` de cada ingrediente.
4. El plato se agrega al carrito como un item más (marcado como custom).
5. Al enviar el pedido, una sola RPC atómica (`crear_orden_con_custom`):
   - crea la orden,
   - descuenta el stock de los platos normales (vía receta) **y** de los custom (vía ingredientes elegidos),
   - guarda el plato custom en `orders.items` para que la cocina lo vea.

## 💰 Notas

- Los precios están en **pesos colombianos** (sin decimales).
- Para ingredientes en `kg`/`litro`, el incremento por defecto es 0.1 (100 g/ml);
  para `pieza`/`paquete`, es 1 unidad.
- Si no hay stock suficiente, la RPC aborta toda la orden (transacción atómica) y
  el cliente ve el error.

## 🧪 Verificación realizada

- ✅ Vista `ingredientes_disponibles` devuelve ingredientes reales.
- ✅ `crear_plato_custom`: descuenta stock exacto y calcula precio correcto.
- ✅ `crear_orden_con_custom`: orden con item normal + custom → total y stock correctos.
- ✅ `npm run build` compila sin errores.
