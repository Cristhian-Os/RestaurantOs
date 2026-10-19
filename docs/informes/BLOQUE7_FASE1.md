# Bloque 7: Panel de plataforma, Fase 1 (registro y seguimiento)

Estado: aplicado en producción el 19-oct-2026 (versiones 20261019225118, 20261019225215 y 20261019225250), verificado con prueba revertida (FALLAS=0). Código publicado: commit 367d60c.

## Qué hace
- **Inicio ("¿qué necesita atención hoy?")**: acciones pendientes con fecha vencida, pruebas que vencen en 3 días, restaurantes sin pedidos en más de 7 días, pagos atrasados y códigos de vendedor inválidos. Cada elemento abre la ficha. Arriba, el conteo del semáforo.
- **Restaurantes**: la lista de siempre (planes, claves) con semáforo, estado comercial, pedidos de 7 días, filtros (nombre, estado, semáforo, origen) y botón "Abrir ficha".
- **Ficha editable**: estado comercial, próxima acción con fecha, precio especial, notas (solo las ves tú), historial de contactos (canal + resumen), prueba extendida con motivo, activar/desactivar con motivo y confirmación, pagos de suscripción y últimos cambios.
- **Nuevo restaurante**: ahora pide "¿Cómo se enteró de nosotros?" (o el código de vendedor). El código gana sobre cualquier respuesta; uno inválido o inactivo no bloquea (queda anotado para revisar); un vendedor no puede traerse a sí mismo.
- **/registro**: guarda `?v=CODIGO` y `?o=instagram|tiktok|facebook|whatsapp` y los añade al mensaje de WhatsApp para que los veas al crear el restaurante.
- **Registro de cambios** (`auditoria_plataforma`): nadie puede editarlo ni borrarlo.

## Decisiones que cambian el spec
- El registro público está cerrado, así que "¿cómo te enteraste?" va en tu formulario, no en el registro.
- Los datos internos (estado comercial, notas, vendedor, origen) van en la tabla `restaurant_crm`, no como columnas de `restaurants`: el administrador de cada restaurante puede leer su fila de `restaurants` y no debe ver tus notas.
- Fuera por ahora: comisiones por aprobar y contratos por vencer (Bloque 8); mensajes de soporte sin respuesta (no hay forma de saberlo); asignar vendedor desde la ficha (hace falta la pantalla de vendedores del Bloque 8; la función ya existe y exige motivo y 30 días).

## Seguridad
- Tablas nuevas sin permisos para sesiones normales ni anónimas; todo por funciones que exigen dueño de la plataforma + verificación de 2 pasos.
- Pruebas (`supabase/tests/panel_plataforma_fase1.sql`): FALLAS=0 en los tres bloques. Cubren: ningún admin, cajero, anónimo ni dueño sin 2 pasos puede leer ni ejecutar nada; registro de cambios inmutable; código válido/inválido/inactivo/propio; una sola versión de `crear_restaurante`.

## Para pasar a producción (necesita backup reciente y tu confirmación)
Migraciones (en orden): `20261019225118_panel_crm_tablas`, `20261019225215_panel_restaurantes_ficha` (incluye la función del Inicio), `20261019225250_crear_restaurante_con_origen`. Solo agregan tablas y funciones; el paso 2 reemplaza `crear_restaurante` (quedaría una sola versión).
Orden: las 4 migraciones y enseguida el código. Entre una cosa y otra solo falla "Nuevo restaurante" (el formulario viejo no manda el origen que la función nueva exige); el resto de la app y los restaurantes no se tocan. Nadie más usa esa función.
Estado inicial de las fichas: Cholaos y Bremantia piloto, Demo demo, Sabor encantado y Meriyein prueba.
Reversas: `supabase/rollback/<versión>_*_down.sql` de cada una.

## Pendiente
- WhatsApp de la página /registro: el número del código (+57 304 538 8425) no es de RestaurantOS según Cristhian; decidir si se deja vacío hasta tener uno.
- Bloque 8: pantalla de vendedores y contratos, comisiones y pagos.
