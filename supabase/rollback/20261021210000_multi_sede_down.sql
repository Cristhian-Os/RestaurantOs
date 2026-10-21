-- Reversa de 20261021210000_multi_sede.
-- Antes de borrar el vínculo, devuelve a cada dueño a su sede principal (la más antigua de su cuenta) para que no
-- quede apuntando a una sede que ya no tiene cómo cambiar. Las sedes creadas NO se borran (son restaurantes con datos).
UPDATE public.profiles p SET restaurant_id = s.principal
FROM (SELECT c.owner_id, (SELECT r.id FROM public.restaurants r WHERE r.cuenta_id = c.id ORDER BY r.created_at LIMIT 1) AS principal
        FROM public.cuentas c) s
WHERE p.id = s.owner_id AND s.principal IS NOT NULL;

DROP FUNCTION IF EXISTS public.crear_sede(text);
DROP FUNCTION IF EXISTS public.cambiar_sede(uuid);
DROP FUNCTION IF EXISTS public.mis_sedes();
DROP TABLE IF EXISTS public.sede_cargos;
ALTER TABLE public.restaurants DROP COLUMN IF EXISTS cuenta_id;
DROP TABLE IF EXISTS public.cuentas;
ALTER TABLE public.planes DROP COLUMN IF EXISTS max_sedes;
