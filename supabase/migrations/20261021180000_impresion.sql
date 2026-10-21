-- Bloque 10, paso 2: base de datos de la impresión (Anexo H, 6). Aditiva: una columna, tablas y funciones nuevas.
-- NO toca cobrar_orden ni crear_orden_completa: el número de recibo se asigna al imprimir el recibo (idempotente).

-- ── Consecutivo de recibo por restaurante, sin saltos ni repetidos ──
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_number bigint;
CREATE UNIQUE INDEX IF NOT EXISTS orders_receipt_unico ON public.orders (restaurant_id, receipt_number) WHERE receipt_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.receipt_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants (id) ON DELETE CASCADE,
  last_number   bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;      -- sin políticas: solo la función de abajo lo toca
REVOKE ALL ON public.receipt_counters FROM anon, authenticated;

-- Devuelve el número de recibo de un pedido PAGADO; si no tenía, le asigna el siguiente. Pedir dos veces da el mismo número.
-- El pedido se bloquea primero y el contador después (mismo orden siempre), así dos cobros a la vez nunca reciben el mismo número.
CREATE OR REPLACE FUNCTION public.numero_recibo_orden(p_order_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE rid uuid := public.current_restaurant_id(); n bigint; pagado timestamptz;
BEGIN
  IF rid IS NULL OR public.get_user_role() NOT IN ('admin', 'cashier') THEN RAISE EXCEPTION 'Solo caja y administrador pueden emitir recibos'; END IF;
  SELECT receipt_number, paid_at INTO n, pagado FROM public.orders WHERE id = p_order_id AND restaurant_id = rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF n IS NOT NULL THEN RETURN n; END IF;
  IF pagado IS NULL THEN RAISE EXCEPTION 'El pedido aun no esta pagado'; END IF;
  INSERT INTO public.receipt_counters (restaurant_id, last_number) VALUES (rid, 1)
    ON CONFLICT (restaurant_id) DO UPDATE SET last_number = public.receipt_counters.last_number + 1
    RETURNING last_number INTO n;
  UPDATE public.orders SET receipt_number = n WHERE id = p_order_id;
  RETURN n;
END;
$function$;

-- Encabezado del recibo para el personal (razón social y NIT viven en una tabla privada que solo lee el admin).
CREATE OR REPLACE FUNCTION public.datos_recibo()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE rid uuid := public.current_restaurant_id();
BEGIN
  IF rid IS NULL OR public.get_user_role() NOT IN ('admin', 'cashier', 'waiter') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN (SELECT jsonb_build_object(
      'nombre', coalesce(c.display_name, r.name), 'razon_social', f.razon_social, 'nit', f.nit,
      'direccion', c.direccion, 'telefono', c.whatsapp_numero, 'propina_sugerida_pct', c.propina_sugerida_pct)
    FROM public.restaurants r
    LEFT JOIN public.restaurant_config c ON c.restaurant_id = r.id
    LEFT JOIN public.restaurant_fiscal f ON f.restaurant_id = r.id
   WHERE r.id = rid);
END;
$function$;

REVOKE ALL ON FUNCTION public.numero_recibo_orden(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.datos_recibo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.numero_recibo_orden(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.datos_recibo() TO authenticated;

-- ── Configuración de impresión por restaurante (impresoras, reglas por categoría, encabezado). Tabla aparte: restaurant_config la lee cualquiera ──
CREATE TABLE IF NOT EXISTS public.restaurant_printing (
  restaurant_id uuid PRIMARY KEY DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurant_printing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_printing FROM anon;
CREATE POLICY "impresion: el personal lee la de su restaurante" ON public.restaurant_printing FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin', 'cashier', 'waiter', 'kitchen'));
CREATE POLICY "impresion: solo el admin crea" ON public.restaurant_printing FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "impresion: solo el admin cambia" ON public.restaurant_printing FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER restaurant_printing_updated_at BEFORE UPDATE ON public.restaurant_printing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Registro de impresiones: qué se imprimió, si falló y permitir "Reintentar" desde otro equipo ──
-- `clave` evita que dos equipos impriman la misma comanda: quien logra insertarla primero es quien imprime.
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  clave         text CHECK (clave IS NULL OR char_length(clave) <= 120),
  tipo          text NOT NULL CHECK (tipo IN ('comanda', 'precuenta', 'recibo', 'cierre', 'prueba')),
  order_id      uuid REFERENCES public.orders (id) ON DELETE SET NULL,
  estacion      text CHECK (estacion IS NULL OR char_length(estacion) <= 60),
  detalle       jsonb,
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'impreso', 'error')),
  intentos      integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  error         text CHECK (error IS NULL OR char_length(error) <= 300),
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_clave_unica ON public.print_jobs (restaurant_id, clave) WHERE clave IS NOT NULL;
CREATE INDEX IF NOT EXISTS print_jobs_rest_idx ON public.print_jobs (restaurant_id, created_at DESC);
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.print_jobs FROM anon;
CREATE POLICY "impresiones: el personal lee las de su restaurante" ON public.print_jobs FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin', 'cashier', 'waiter', 'kitchen'));
CREATE POLICY "impresiones: el personal registra las de su restaurante" ON public.print_jobs FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin', 'cashier', 'waiter', 'kitchen'));
CREATE POLICY "impresiones: el personal actualiza las de su restaurante" ON public.print_jobs FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin', 'cashier', 'waiter', 'kitchen'))
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin', 'cashier', 'waiter', 'kitchen'));
CREATE POLICY "impresiones: solo el admin borra" ON public.print_jobs FOR DELETE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER print_jobs_updated_at BEFORE UPDATE ON public.print_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Retención de 30 días (cada día a las 3 a. m. de Colombia). Si la base no tiene pg_cron, se omite sin romper la migración.
DO $$
BEGIN
  PERFORM cron.schedule('purgar-print-jobs', '0 8 * * *', $job$DELETE FROM public.print_jobs WHERE created_at < now() - interval '30 days'$job$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible: la limpieza de print_jobs queda sin programar (%)', SQLERRM;
END $$;
