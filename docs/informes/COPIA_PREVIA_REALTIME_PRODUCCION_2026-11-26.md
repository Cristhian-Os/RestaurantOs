# Copia previa · Realtime de producción · 2026-11-26

Proyecto `RestaurantOs` (`ifypeslrcdebvdqglywt`). Las migraciones `20261126120000_central_realtime` y `20261126130000_central_realtime_crecimiento` solo agregan tablas a la publicación `supabase_realtime`. No cambian filas, columnas ni permisos, así que la "copia" que importa es el estado de esa publicación **antes** del cambio.

## Publicadas antes (17)
comentarios_platos, dishes, llamadas_mesa, menu_horario_dias_especiales, menu_horario_excepciones, menu_horario_franjas, menu_horario_productos, menus_horario, mesas, option_lists, orders, pedidos_mesa_pendientes, profiles, resenas_platos, restaurant_config, task_evidence, tasks.

Ninguna tabla `central_*` ni `growth_*` estaba publicada.

## Se agregan (17, todas existen en producción)
central_mensajes, central_notificaciones, central_aprobaciones, central_tareas, central_agentes, central_trabajos, central_propuestas, central_plan_semanal, central_plan_items, growth_prospectos, growth_historial, growth_mensajes, growth_citas, growth_misiones, growth_autorizaciones, growth_funciones, growth_supresion.

## Cómo volver atrás
Ejecutar, en este orden, `supabase/rollback/20261126130000_central_realtime_crecimiento_down.sql` y `supabase/rollback/20261126120000_central_realtime_down.sql`. Las 17 tablas de "Publicadas antes" no se tocan.

## Anexo · `20261126140000_central_realtime_consumo` (aplicada en producción el 2026-11-26)
Antes: `central_consumo` existía y no estaba publicada (las otras 35 publicadas quedan igual). Se agrega solo esa tabla.
Reversa: `supabase/rollback/20261126140000_central_realtime_consumo_down.sql`.
