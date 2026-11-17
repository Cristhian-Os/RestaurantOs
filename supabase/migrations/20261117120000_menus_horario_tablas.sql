-- Menús por franjas horarias — 1/3: tablas, columnas, RLS, auditoría.
-- ADITIVA: solo crea tablas y agrega columnas con valor por defecto. No toca filas existentes.
-- Con restaurant_config.menus_horario_activo = false (por defecto) nada cambia para el restaurante.
-- Reversa: supabase/rollback/20261117120000_menus_horario_down.sql

-- ─── Columnas nuevas en tablas existentes ────────────────────────────────────
ALTER TABLE public.dishes ADD COLUMN IF NOT EXISTS todo_el_dia boolean NOT NULL DEFAULT false;

ALTER TABLE public.restaurant_config
  ADD COLUMN IF NOT EXISTS menus_horario_activo  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zona_horaria          text    NOT NULL DEFAULT 'America/Bogota',
  ADD COLUMN IF NOT EXISTS menus_gracia_min      integer NOT NULL DEFAULT 10 CHECK (menus_gracia_min BETWEEN 0 AND 60),
  ADD COLUMN IF NOT EXISTS menus_staff_fuera_horario boolean NOT NULL DEFAULT false;

-- La zona horaria debe existir en Postgres (una zona mal escrita rompería todos los cálculos).
CREATE OR REPLACE FUNCTION public._zona_horaria_valida(p text) RETURNS boolean
 LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p);
$$;
CREATE OR REPLACE FUNCTION public._restaurant_config_zona_trg() RETURNS trigger
 LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.zona_horaria IS DISTINCT FROM OLD.zona_horaria AND NOT public._zona_horaria_valida(NEW.zona_horaria) THEN
    RAISE EXCEPTION 'Zona horaria no válida: %', NEW.zona_horaria;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS restaurant_config_zona ON public.restaurant_config;
CREATE TRIGGER restaurant_config_zona BEFORE INSERT OR UPDATE OF zona_horaria ON public.restaurant_config
  FOR EACH ROW EXECUTE FUNCTION public._restaurant_config_zona_trg();

-- ─── Menús ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.menus_horario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id),
  nombre        text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 60),
  descripcion   text CHECK (char_length(descripcion) <= 300),
  estado        text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','pausado','inactivo')),
  mostrar_en_qr boolean NOT NULL DEFAULT true,
  fecha_inicio  date,
  fecha_fin     date,
  prioridad     integer NOT NULL DEFAULT 100 CHECK (prioridad BETWEEN 0 AND 1000),
  color         text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
);
CREATE INDEX IF NOT EXISTS menus_horario_rid_idx ON public.menus_horario (restaurant_id);

-- Días especiales (festivos, eventos): ese día se ignoran las franjas normales y valen solo las suyas.
CREATE TABLE IF NOT EXISTS public.menu_horario_dias_especiales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id),
  fecha         date NOT NULL,
  nombre        text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 60),
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, fecha)
);

-- Franjas: semanales (dias) o de un día especial (dia_especial_id). hora_fin <= hora_inicio = cruza la medianoche
-- (hora_fin = hora_inicio = 24 horas). El día que cuenta es el día en que la franja EMPIEZA.
CREATE TABLE IF NOT EXISTS public.menu_horario_franjas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id         uuid NOT NULL REFERENCES public.menus_horario(id) ON DELETE CASCADE,
  restaurant_id   uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id),
  dias            smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  dia_especial_id uuid REFERENCES public.menu_horario_dias_especiales(id) ON DELETE CASCADE,
  hora_inicio     time NOT NULL,
  hora_fin        time NOT NULL,
  CHECK (dias <@ '{0,1,2,3,4,5,6}'::smallint[]),
  CHECK (dia_especial_id IS NOT NULL OR cardinality(dias) > 0)
);
CREATE INDEX IF NOT EXISTS menu_horario_franjas_rid_idx ON public.menu_horario_franjas (restaurant_id);
CREATE INDEX IF NOT EXISTS menu_horario_franjas_menu_idx ON public.menu_horario_franjas (menu_id);

-- Productos del menú. Un plato puede estar en varios menús (no se duplican platos).
-- precio_especial: plato sin tamaños. precios_tamano: {"Pequeño": 9000, "Grande": 14000} para platos con tamaños.
-- Lo que no tenga precio especial usa el precio general del plato.
CREATE TABLE IF NOT EXISTS public.menu_horario_productos (
  menu_id         uuid NOT NULL REFERENCES public.menus_horario(id) ON DELETE CASCADE,
  dish_id         uuid NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  restaurant_id   uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id),
  precio_especial numeric CHECK (precio_especial IS NULL OR precio_especial >= 0),
  precios_tamano  jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(precios_tamano) = 'object'),
  sort_order      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (menu_id, dish_id)
);
CREATE INDEX IF NOT EXISTS menu_horario_productos_dish_idx ON public.menu_horario_productos (dish_id);
CREATE INDEX IF NOT EXISTS menu_horario_productos_rid_idx ON public.menu_horario_productos (restaurant_id);

-- Control manual: forzar (solo ese menú), extender (sumar ese menú un rato), suspender (quitarlo un rato).
-- hasta NULL = hasta que el admin vuelva a automático. cerrada_at = el admin la terminó antes.
CREATE TABLE IF NOT EXISTS public.menu_horario_excepciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants(id),
  tipo          text NOT NULL CHECK (tipo IN ('forzar','extender','suspender')),
  menu_id       uuid NOT NULL REFERENCES public.menus_horario(id) ON DELETE CASCADE,
  desde         timestamptz NOT NULL DEFAULT now(),
  hasta         timestamptz,
  nota          text CHECK (char_length(nota) <= 200),
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  cerrada_at    timestamptz,
  cerrada_by    uuid,
  CHECK (hasta IS NULL OR hasta > desde)
);
CREATE INDEX IF NOT EXISTS menu_horario_excepciones_rid_idx ON public.menu_horario_excepciones (restaurant_id, desde);

-- Auditoría: quién, cuándo y qué cambió.
CREATE TABLE IF NOT EXISTS public.menu_horario_auditoria (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  actor_id      uuid,
  accion        text NOT NULL,
  tabla         text,
  detalle       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_horario_auditoria_rid_idx ON public.menu_horario_auditoria (restaurant_id, created_at DESC);

-- ─── Coherencia: todo lo que se enlaza debe ser del mismo restaurante ─────────
CREATE OR REPLACE FUNCTION public._menu_horario_coherencia_trg() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_TABLE_NAME IN ('menu_horario_franjas','menu_horario_productos','menu_horario_excepciones') THEN
    IF NOT EXISTS (SELECT 1 FROM menus_horario WHERE id = NEW.menu_id AND restaurant_id = NEW.restaurant_id) THEN
      RAISE EXCEPTION 'El menú no pertenece a este restaurante';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'menu_horario_productos'
     AND NOT EXISTS (SELECT 1 FROM dishes WHERE id = NEW.dish_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'El producto no pertenece a este restaurante';
  END IF;
  IF TG_TABLE_NAME = 'menu_horario_franjas' AND NEW.dia_especial_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM menu_horario_dias_especiales WHERE id = NEW.dia_especial_id AND restaurant_id = NEW.restaurant_id) THEN
    RAISE EXCEPTION 'El día especial no pertenece a este restaurante';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS menu_horario_franjas_coh ON public.menu_horario_franjas;
CREATE TRIGGER menu_horario_franjas_coh BEFORE INSERT OR UPDATE ON public.menu_horario_franjas
  FOR EACH ROW EXECUTE FUNCTION public._menu_horario_coherencia_trg();
DROP TRIGGER IF EXISTS menu_horario_productos_coh ON public.menu_horario_productos;
CREATE TRIGGER menu_horario_productos_coh BEFORE INSERT OR UPDATE ON public.menu_horario_productos
  FOR EACH ROW EXECUTE FUNCTION public._menu_horario_coherencia_trg();
DROP TRIGGER IF EXISTS menu_horario_excepciones_coh ON public.menu_horario_excepciones;
CREATE TRIGGER menu_horario_excepciones_coh BEFORE INSERT OR UPDATE ON public.menu_horario_excepciones
  FOR EACH ROW EXECUTE FUNCTION public._menu_horario_coherencia_trg();

-- ─── Auditoría automática de cualquier cambio de configuración ───────────────
CREATE OR REPLACE FUNCTION public._menu_horario_auditar_trg() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid; v_old jsonb; v_new jsonb;
BEGIN
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_rid := COALESCE((v_new->>'restaurant_id')::uuid, (v_old->>'restaurant_id')::uuid);
  IF TG_TABLE_NAME = 'restaurant_config' THEN
    -- Solo interesa si cambió algo de menús por horario
    IF (v_old->>'menus_horario_activo', v_old->>'zona_horaria', v_old->>'menus_gracia_min', v_old->>'menus_staff_fuera_horario')
       IS NOT DISTINCT FROM
       (v_new->>'menus_horario_activo', v_new->>'zona_horaria', v_new->>'menus_gracia_min', v_new->>'menus_staff_fuera_horario') THEN
      RETURN NULL;
    END IF;
    v_old := jsonb_build_object('menus_horario_activo', v_old->'menus_horario_activo', 'zona_horaria', v_old->'zona_horaria',
               'menus_gracia_min', v_old->'menus_gracia_min', 'menus_staff_fuera_horario', v_old->'menus_staff_fuera_horario');
    v_new := jsonb_build_object('menus_horario_activo', v_new->'menus_horario_activo', 'zona_horaria', v_new->'zona_horaria',
               'menus_gracia_min', v_new->'menus_gracia_min', 'menus_staff_fuera_horario', v_new->'menus_staff_fuera_horario');
  ELSIF TG_TABLE_NAME = 'dishes' THEN
    IF (v_old->>'todo_el_dia') IS NOT DISTINCT FROM (v_new->>'todo_el_dia') THEN RETURN NULL; END IF;
    v_old := jsonb_build_object('dish_id', v_old->'id', 'nombre', v_old->'name', 'todo_el_dia', v_old->'todo_el_dia');
    v_new := jsonb_build_object('dish_id', v_new->'id', 'nombre', v_new->'name', 'todo_el_dia', v_new->'todo_el_dia');
  END IF;
  INSERT INTO menu_horario_auditoria (restaurant_id, actor_id, accion, tabla, detalle)
  VALUES (v_rid, auth.uid(), lower(TG_OP), TG_TABLE_NAME,
          jsonb_strip_nulls(jsonb_build_object('antes', v_old, 'despues', v_new)));
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['menus_horario','menu_horario_franjas','menu_horario_productos',
                           'menu_horario_excepciones','menu_horario_dias_especiales'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public._menu_horario_auditar_trg()', t || '_audit', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS restaurant_config_menus_audit ON public.restaurant_config;
CREATE TRIGGER restaurant_config_menus_audit AFTER UPDATE ON public.restaurant_config
  FOR EACH ROW EXECUTE FUNCTION public._menu_horario_auditar_trg();
DROP TRIGGER IF EXISTS dishes_todo_el_dia_audit ON public.dishes;
CREATE TRIGGER dishes_todo_el_dia_audit AFTER UPDATE OF todo_el_dia ON public.dishes
  FOR EACH ROW EXECUTE FUNCTION public._menu_horario_auditar_trg();

-- updated_at
DROP TRIGGER IF EXISTS menus_horario_updated ON public.menus_horario;
CREATE TRIGGER menus_horario_updated BEFORE UPDATE ON public.menus_horario
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS: admin gestiona lo suyo; personal lee lo suyo; público nada (usa funciones) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['menus_horario','menu_horario_franjas','menu_horario_productos',
                           'menu_horario_excepciones','menu_horario_dias_especiales'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin gestiona" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "Admin gestiona" ON public.%I FOR ALL TO authenticated
      USING (((SELECT public.is_admin()) AND restaurant_id = (SELECT public.current_restaurant_id())) OR (SELECT public.is_super_admin()))
      WITH CHECK (((SELECT public.is_admin()) AND restaurant_id = (SELECT public.current_restaurant_id())) OR (SELECT public.is_super_admin()))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS "Personal lee" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "Personal lee" ON public.%I FOR SELECT TO authenticated
      USING (restaurant_id = (SELECT public.current_restaurant_id()))$p$, t);
  END LOOP;
END $$;

ALTER TABLE public.menu_horario_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.menu_horario_auditoria FROM anon, authenticated;
GRANT SELECT ON public.menu_horario_auditoria TO authenticated;
DROP POLICY IF EXISTS "Admin lee auditoria" ON public.menu_horario_auditoria;
CREATE POLICY "Admin lee auditoria" ON public.menu_horario_auditoria FOR SELECT TO authenticated
  USING (((SELECT public.is_admin()) AND restaurant_id = (SELECT public.current_restaurant_id())) OR (SELECT public.is_super_admin()));

-- Avisos en vivo para el personal (el público consulta por función)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['menus_horario','menu_horario_franjas','menu_horario_productos',
                           'menu_horario_excepciones','menu_horario_dias_especiales'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
