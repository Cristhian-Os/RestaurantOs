-- Corrige 20261117135000: al cerrar _zona_horaria_valida(text) al público, el disparador de zona horaria
-- (que corría con los permisos de quien edita) ya no podía llamarla → el admin recibía "permission denied" al cambiar la zona.
-- Ahora el disparador corre con los permisos del dueño (SECURITY DEFINER, search_path fijo), como los demás de este módulo.
-- Hallado en las pruebas como admin real en restaurantos-prueba.
CREATE OR REPLACE FUNCTION public._restaurant_config_zona_trg() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.zona_horaria IS DISTINCT FROM OLD.zona_horaria AND NOT public._zona_horaria_valida(NEW.zona_horaria) THEN
    RAISE EXCEPTION 'Zona horaria no válida: %', NEW.zona_horaria;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._restaurant_config_zona_trg() FROM PUBLIC, anon, authenticated;
