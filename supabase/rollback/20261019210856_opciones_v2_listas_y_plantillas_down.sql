-- Reversa de 20261017000001. Borra las listas y plantillas (los platos creados por plantillas NO se borran: revísalos a mano).
DROP FUNCTION IF EXISTS public.plataforma_aplicar_plantilla(uuid, text);
DROP FUNCTION IF EXISTS public.aplicar_plantilla(text);
DROP FUNCTION IF EXISTS public._aplicar_plantilla(uuid, text);
DROP FUNCTION IF EXISTS public.option_lista_set_activo(text, text, boolean);
DROP FUNCTION IF EXISTS public.listas_opciones_publicas(uuid);
DROP TABLE IF EXISTS public.restaurant_template_versions;
DROP TABLE IF EXISTS public.restaurant_templates;
DROP TABLE IF EXISTS public.option_lists;
ALTER TABLE public.restaurant_config DROP COLUMN IF EXISTS plantillas_aplicadas;
