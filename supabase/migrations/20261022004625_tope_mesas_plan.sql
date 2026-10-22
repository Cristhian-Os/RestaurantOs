-- Módulo C (prompt maestro Resti): el tope de mesas del plan se hace cumplir en el SERVIDOR, no solo en la pantalla.
-- Hoy crear_mesas acepta hasta 100 y "+ Agregar mesa" inserta directo en la tabla: un trigger en mesas cubre los dos caminos.
-- El límite sale de planes.max_mesas (NULL = sin tope) según la suscripción del restaurante. No toca mesas ya creadas:
-- un restaurante que hoy supera el tope sigue como está, solo no puede agregar más.
-- Aditiva: función nueva + trigger. Reversa: supabase/rollback/20261022004625_tope_mesas_plan_down.sql

CREATE OR REPLACE FUNCTION public._limite_mesas_plan()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_max integer; v_n integer;
BEGIN
  -- ON CONFLICT DO NOTHING (crear_mesas repetida): esa mesa ya existe, no es una mesa nueva
  IF EXISTS (SELECT 1 FROM mesas WHERE restaurant_id = NEW.restaurant_id AND numero = NEW.numero) THEN RETURN NEW; END IF;
  SELECT p.max_mesas INTO v_max FROM subscriptions s JOIN planes p ON p.id = s.plan WHERE s.restaurant_id = NEW.restaurant_id;
  IF v_max IS NULL THEN RETURN NEW; END IF;   -- plan sin tope (o restaurante sin plan de la lista)
  PERFORM pg_advisory_xact_lock(hashtext('mesas:' || NEW.restaurant_id::text));   -- dos altas a la vez no se pasan del tope
  SELECT count(*) INTO v_n FROM mesas WHERE restaurant_id = NEW.restaurant_id;
  IF v_n + 1 > v_max THEN RAISE EXCEPTION 'Tu plan permite hasta % mesas', v_max; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public._limite_mesas_plan() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mesas_limite_plan ON public.mesas;
CREATE TRIGGER mesas_limite_plan BEFORE INSERT ON public.mesas FOR EACH ROW EXECUTE FUNCTION public._limite_mesas_plan();
