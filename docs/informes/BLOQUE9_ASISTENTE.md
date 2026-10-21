# Bloque 9: asistente de configuración completo (informe)

Estado: **construido y probado en el proyecto de prueba y en el simulador. Nada en producción.** Commits locales 2f5fa0b, 9f7a222, 950fc5e, 142859d y 24c581a.

## Qué cambia para el administrador

El asistente pasa de 8 a **9 pasos**: Tipo de negocio · Mesas · Proveedores · Inventario · **Menú (con fotos)** · **Recetas (nuevo)** · **Marca (con vista previa)** · Equipo · Listo.

1. **Menú con foto y descripción por plato.** Tras guardar los platos aparece una cuadrícula con una tarjeta por plato (foto, descripción, aviso amable si falta algo). Se pueden subir **varias fotos juntas**: se asignan solas si el archivo se llama como el plato ("brownie.jpg" va a "Brownie") y las que no coinciden se asignan a mano. Solo JPEG, PNG o WebP de hasta 5 MB; se reducen a 1600 px antes de subir.
2. **Recetas (qué lleva cada plato).** Un plato a la vez ("12 de 30 platos con receta"), buscador de ingredientes, cantidad y unidad, **costo y margen en vivo** (verde, amarillo o rojo), crear un ingrediente sin salir del paso y carga por Excel. Las cantidades se guardan siempre en la unidad del ingrediente (kg↔gramo y litro↔ml se convierten; pieza contra kg se bloquea), porque al vender el sistema las resta directo del inventario. Un archivo con errores no guarda nada y dice qué fila corregir.
3. **Marca con vista previa real.** Editor a la izquierda y, a la derecha, el **menú público real** del restaurante en un marco de celular que cambia al instante con el color, el nombre, el logo y la portada sin guardar. Interruptores Celular/Tablet y Abierto/Cerrado, y aviso si el color es tan claro que el texto blanco no se lee. En celular el botón "Ver cómo queda" abre la vista a pantalla completa.
4. **Cierre.** Resumen con fotos y recetas, **PDF de QR por mesa** (reutiliza el generador que ya existe) y un **pedido de prueba guiado** (abrir el menú, verlo en Cocina, cobrarlo en Caja y comprobar que el inventario bajó).
5. **Configuración guiada** en el menú del administrador: cuántos pasos van hechos, cuáles faltan y cada uno abre el asistente en ese paso. El aviso del panel ahora dice "(X de 8 pasos)". Quien ya iba a medias conserva su lugar.

## Hallazgo de seguridad (confirmado en producción)

La regla de fotos del bucket `restaurant-assets` dejaba que **cualquier usuario con sesión, de cualquier restaurante, sobrescribiera cualquier foto** (los ids de plato se ven en el menú público). Comprobado en producción con una prueba que se revierte sola: un administrador de otro restaurante alcanzó la foto de un plato ajeno. Además, **"Subir portada" hoy falla para todos los restaurantes** porque la regla vieja no permitía esa carpeta.

La migración `fotos_por_restaurante` deja: carpeta del restaurante → solo su admin; fotos de platos → solo su admin y solo de sus platos; fotos de perfil → la propia persona o el admin de su restaurante; lectura sigue pública. Todo lo que la app sube hoy sigue funcionando (verificado).

## Pruebas hechas

- Base de prueba (revertidas solas): el ataque de sobrescritura funcionaba antes (1 fila) y después queda en 0; los casos legítimos pasan; `importar_recetas`: conversiones correctas (250 g → 0,25 kg; 0,5 L + 100 ml → 0,6 L), costo del plato correcto, errores sin guardar nada, reemplazo de receta, máximo 500 filas, cajero y anónimo bloqueados, un restaurante no toca otro.
- Simulador: fotos en lote (PNG de 2400×1800 → JPEG de 1600×1200, 33 KB), recetas con costo y margen, Excel con errores y correcto, vista previa en vivo (escritorio y celular), cierre con QR y pedido de prueba, Configuración guiada.
- **No probado:** el asistente completo con un restaurante nuevo real y con internet lento, ni la impresión real de los QR.

## Para pasar a producción (con tu "apruebo, aplica")

1. Migraciones `20261021160000_importar_recetas` (solo funciones nuevas) y `20261021160100_fotos_por_restaurante` (cambia 2 reglas de fotos; reversa en `supabase/rollback/`).
2. Publicar la app (despliegue manual en Vercel).
3. Prueba: crear un restaurante de prueba, recorrer el asistente y subir una portada.

## Decisiones tomadas por defecto

- Recetas sugeridas por plantilla: **fuera** (las plantillas no traen cantidades; inventarlas descontaría mal el inventario).
- Descripción con IA: **fuera** de esta versión.
- Vista previa: el menú real dentro de un marco (no una réplica); el menú público solo reacciona a este modo con `?preview=1` y desde la misma página.
