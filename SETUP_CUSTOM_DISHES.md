# ⚙️ Configuración: Platos Personalizados (Custom Dishes)

## 📋 Requisitos

La funcionalidad de "platos custom" necesita las siguientes migraciones en Supabase.

## 🚀 Pasos de instalación

### 1️⃣ Aplicar migración SQL en Supabase

1. Abre tu proyecto en **Supabase Dashboard**: https://supabase.com/
2. Ve a **SQL Editor**
3. Copia TODO el contenido del archivo `schema_custom_dishes.sql`
4. Pégalo en el editor SQL
5. Haz clic en **"Run"** para ejecutar la migración

Esto creará:
- Tabla `custom_dishes`
- Tabla `custom_dish_ingredients`
- Función `crear_plato_custom()`
- Vista `ingredientes_disponibles`
- Políticas RLS

### 2️⃣ Verificar que la migración funcionó

En SQL Editor, ejecuta:

```sql
SELECT * FROM public.ingredientes_disponibles LIMIT 5;
```

Deberías ver ingredientes con `stock_actual > 0`.

### 3️⃣ Instalar dependencias (si es necesario)

```bash
npm install
```

### 4️⃣ Testear la app

```bash
npm run dev
```

Luego:
1. Abre el menú (ClientMenuSection)
2. Verás el botón **"🎨 Crear mi propio plato"**
3. Haz clic para abrir el builder
4. Selecciona ingredientes
5. Agrega al carrito
6. Envía la orden

## ⚠️ Notas importantes

- Los platos custom usan los **mismos ingredientes que el stock**
- El stock se descuenta **automáticamente** cuando se crea el plato custom
- Los platos custom se guardañ en `custom_dishes` y `custom_dish_ingredients`
- El desayuno se calcula basándose en el costo de los ingredientes

## 🔧 Si algo falla

Si ves un error en la app:

1. **"Ingredientes no encontrados"** → Verifica que hay ingredientes en la BD con `stock_actual > 0`
2. **"Error al crear plato"** → Revisa la consola del navegador (F12)
3. **Stock no descuenta** → Verifica que el trigger en `detalles_pedidos` se activó

---

**Status:** ✅ Listo para usar después de ejecutar la migración SQL
