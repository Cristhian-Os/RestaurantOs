-- Bloque 3, arreglo critico: nadie sin iniciar sesion debe poder leer pedidos.
--
-- Hallazgo (AUDITORIA.md): la politica "Kitchen TV anon read active orders" dejaba que el rol
-- anon (la llave publica que va dentro del JS de la app) leyera los pedidos activos COMPLETOS
-- de TODOS los restaurantes: nombre del cliente, items, notas y total.
-- La TV de cocina real entra con usuario de cocina (rol authenticated), cubierto por la politica
-- "Staff view orders"; el "Kitchen TV" anonimo era solo un entorno de prueba.
--
-- No toca "Public read config": el menu publico por QR la necesita (nombre, logo, horarios...).
-- Solo quita la politica abierta del todo (USING true), redundante con esa.
--
-- REVERSA: supabase/rollback/20261014142351_cerrar_lectura_anonima_pedidos_y_config_down.sql

DROP POLICY IF EXISTS "Kitchen TV anon read active orders" ON public.orders;
DROP POLICY IF EXISTS "Kitchen TV anon read config" ON public.restaurant_config;
