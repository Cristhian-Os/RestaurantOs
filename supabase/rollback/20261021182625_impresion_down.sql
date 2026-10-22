-- Reversa del Bloque 10 paso 2 (impresión). Borra solo lo que creó esa migración.
DO $$ BEGIN PERFORM cron.unschedule('purgar-print-jobs'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DROP TABLE IF EXISTS public.print_jobs;
DROP TABLE IF EXISTS public.restaurant_printing;
DROP FUNCTION IF EXISTS public.datos_recibo();
DROP FUNCTION IF EXISTS public.numero_recibo_orden(uuid);
DROP TABLE IF EXISTS public.receipt_counters;
DROP INDEX IF EXISTS public.orders_receipt_unico;
ALTER TABLE public.orders DROP COLUMN IF EXISTS receipt_number;
