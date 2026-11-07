# Pendientes: lo que el diseño muestra y el código aún no tiene

Regla: no se inventa nada en el rediseño. Todo lo de esta lista se deja para una fase posterior,
**después de revisar cada función con Cristhian y decidir qué se desarrolla de verdad**.
Cada punto indica la lámina/pantalla, qué falta y qué necesitaría (datos, tablas, lógica).

## Caja / Ventas / Proveedores / Facturas
- **Variaciones con flecha (+12 %)** en tarjetas: requieren comparar contra el periodo anterior (no se consulta hoy).
- **Gráficos de evolución y de dona** (ventas, métodos de pago): faltan series por periodo anterior.
- **Botón Exportar** en Ventas: no existe función de exportación.
- **Proveedores:** categoría, estado activo/inactivo y "pedidos este mes" no existen en la base de datos.
- **Facturas:** pestañas Ventas/Gastos, escáner con IA y factura de venta son funciones distintas a las actuales (hoy son facturas de compra con foto).
- **Caja:** bloque lateral "Cobros pendientes / Acciones principales / Herramientas" y botón "Cerrar caja" ancho; exigen reorganizar la lógica de cobro y corte (zona sensible, solo con aprobación).
- Sin revisar aún: lámina de cierre de caja (si existe).

## Cocina
- Tarjeta "Entregados hoy": el tablero solo carga pedidos pendientes, en cocina y listos.
- Franja "Preparar ahora" y reloj: no existen.

## Dispositivos e impresión
- Pestañas **Estaciones** y **Avanzadas**, asignación de impresora por estación, historial de impresión y vista previa del ticket: el código no tiene esas funciones.

## Mesas
- Plano con mesas dibujadas, zoom y "tiempo en mesa": no existen.
- Botones "Ver detalles", "Cerrar cuenta" y "Liberar mesa" del panel lateral: no existen.

## Pedidos
- Lista "Pedidos en tiempo real" con detalle: no existe (OrderFlow solo crea órdenes). Pantalla nueva a definir.

## Inicio (dashboard)
- Banner promocional "¡Tu restaurante en su mejor versión!": sin función real.
- Selector de periodo ("Hoy / Esta semana"): la gráfica queda fija en 7 días y los KPI en el día.
- Tiempo promedio de preparación, Satisfacción y minigráficas dentro de los KPI: no hay dato que los alimente.
- Widgets por usuario/rol con layout guardado: requiere tablas nuevas (autorización).

## Landing
- Recursos gráficos que faltan (los debe suministrar Cristhian): foto de fondo del restaurante, foto del plato junto al monitor, mascota robot chef, mockups reales de monitor y celular, avatares de clientes.
- Tarjeta de resultados (+300 %, +10K restaurantes, 4.9/5) y prueba social con estrellas: cifras no verificadas; decidir si se tienen datos reales.
- Funciones "Personalización total" y "Soporte 24/7": no se prometen hasta confirmar que existen.
- Pestaña "Integraciones": no hay integraciones; se reemplazó por "Soporte".
- Sección "Contacto" propia: hoy lleva al bloque "Activa tu restaurante".

## Login / registro
- Botones Google, Microsoft y Apple ("o continuar con"): el código solo tiene correo y contraseña; requeriría configurar proveedores en Supabase Auth.
- "Recordar mi sesión": sin soporte.
- Fotos de fondo (cocina y plato): faltan; hoy es degradado con resplandor naranja.
- Textos de garantías al pie ("Seguro y confiable", "Soporte 24/7", etc.): puestos como en la lámina; confirmar que son ciertos.

## Configuración → Personalidad (por definir con Cristhian)
Centro de personalización: cada restaurante adapta cómo se presenta y organiza RestaurantOS, sin cambiar identidad, funciones ni permisos. Hoy NO existe en el código (ni pantalla ni tablas). Contenido pedido:
1. **Experiencia por roles:** vista predeterminada de cada uno de los 4 roles operativos, con vista previa de la pantalla completa del rol antes de guardar.
2. **Dashboard:** organizar widgets e indicadores por rol (catálogo de widgets, plantillas por rol, guardado de layout).
3. **Distribución personal por usuario:** cada usuario ajusta su pantalla dentro de los límites de su permiso (dos cajeros con layouts distintos sin acceder a datos ajenos). Personalidad = predeterminado del admin; Dashboard = ajuste personal.
4. **Plano del restaurante:** configurar zonas y mesas (hoy el módulo Mesas no tiene plano dibujado).
5. **Preferencias visuales:** ajustes permitidos de apariencia.
Requiere: tablas nuevas (layouts por rol y por usuario), reglas RLS, migración probada en el proyecto de prueba y "apruebo, aplica". Antes: definir con Cristhian qué roles, qué widgets y qué límites. Nombre acordado: "Personalidad".

## Plataforma (superadmin)
- Sin lámina propia; se dejó con el lenguaje visual general.

<!-- Los demás módulos se agregan aquí cuando cada agente reporte. -->

## Pendientes de la revisión general (2026-11-07)
- **Resti sin fondo:** el archivo recibido es un JPG con el cuadriculado dibujado. El recorte automático queda con bordes ásperos (`public/brand/resti/resti-transparente.png`, solo se usa en el carrito vacío del menú público). Falta el PNG transparente original. Resti se quitó de la landing.
- **Logo oficial:** tiene fondo blanco; en paneles oscuros se muestra en una baldosa blanca redondeada. Falta una versión con fondo transparente o clara.
- **Código huérfano:** `src/components/shell/Sidebar.tsx` (sin uso), estado `brand` en `Dashboard.tsx`, prop `onSelectMesa` en `TableMap.tsx`.
- **Landing:** la pestaña "Características" siempre aparece marcada, aunque se esté en otra sección.
- **Aviso antd:** `destroyOnClose` está obsoleto en algunos Modal (usar `destroyOnHidden`).
- **Lo que las láminas muestran y el código no tiene:** Exportar, Filtros y menú de tres puntos en varias pantallas.
