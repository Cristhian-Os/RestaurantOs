-- Rollback Bloque 7, pasos 3 y 4 (funciones de la ficha). No toca datos: las tablas son del paso 1.
DROP FUNCTION IF EXISTS public.plataforma_auditoria(text, integer);
DROP FUNCTION IF EXISTS public.plataforma_activar_restaurante(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.plataforma_agregar_contacto(uuid, text, text, date);
DROP FUNCTION IF EXISTS public.plataforma_actualizar_ficha(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.plataforma_restaurante_ficha(uuid);
DROP FUNCTION IF EXISTS public.plataforma_restaurantes();
DROP FUNCTION IF EXISTS public.plataforma_salud_restaurantes();
DROP FUNCTION IF EXISTS public._exigir_dueno();
-- Rollback Bloque 7, paso 4: quita la función del Inicio. No toca datos.
DROP FUNCTION IF EXISTS public.plataforma_atencion();
