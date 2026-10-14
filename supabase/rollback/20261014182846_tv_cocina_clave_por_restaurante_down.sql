-- Reversa de 20261014182846_tv_cocina_clave_por_restaurante.sql
-- Quita las funciones, el trigger y la tabla de claves. NO restaura la lectura anonima de pedidos
-- (para eso: 20261014142351_cerrar_lectura_anonima_pedidos_y_config_down.sql).
DROP TRIGGER IF EXISTS crear_clave_tv ON public.restaurants;
DROP FUNCTION IF EXISTS public.mi_clave_tv(boolean);
DROP FUNCTION IF EXISTS public.tv_cocina_cancelar(text, uuid);
DROP FUNCTION IF EXISTS public.tv_cocina_avanzar(text, uuid, text);
DROP FUNCTION IF EXISTS public.tv_cocina_datos(text);
DROP FUNCTION IF EXISTS public._tv_restaurante(text);
DROP FUNCTION IF EXISTS public.tg_crear_clave_tv();
DROP TABLE IF EXISTS public.kitchen_tv_tokens;
