-- Rollback Bloque 8, paso 6 (funciones de vendedores). No toca datos.
DROP FUNCTION IF EXISTS public.plataforma_settings_guardar(text, numeric, text);
DROP FUNCTION IF EXISTS public.plataforma_settings_listar();
DROP FUNCTION IF EXISTS public.plataforma_prospecto_actualizar(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.plataforma_prospectos_listar(uuid);
DROP FUNCTION IF EXISTS public.plataforma_prospecto_agregar(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.plataforma_vendedor_estado(uuid, boolean, text, text);
DROP FUNCTION IF EXISTS public.plataforma_vendedor_guardar(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.plataforma_vendedores_listar();
DROP TRIGGER IF EXISTS restaurant_crm_terminos ON public.restaurant_crm;
DROP FUNCTION IF EXISTS public._crm_copiar_terminos();
DROP FUNCTION IF EXISTS public._terminos_vigentes(uuid);
