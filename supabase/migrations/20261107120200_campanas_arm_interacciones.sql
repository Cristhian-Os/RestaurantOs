-- Fidelización, paso 3: campañas, interacciones del cliente y ARM (el CRM manejado por IA).
-- Diseño en docs/informes/FIDELIZACION_ARQUITECTURA.md.
--
--  * ARM = Resti trabajando como gestor de relaciones con clientes. NO ejecuta nada por su cuenta: PROPONE.
--    Cada propuesta queda en arm_acciones con su razón y la evidencia (datos reales). El administrador aprueba o rechaza.
--    Solo después, un proceso con rol de servicio ejecuta la acción usando las funciones oficiales (fid_*, wa_*, dom_*).
--  * Mientras WhatsApp esté desactivado, una campaña aprobada no envía nada: queda lista, sin simular envíos.
--  * Campañas y propuestas solo las ve y gestiona el administrador.

-- ─── Interacciones: la línea de tiempo de cada cliente ──────────────────────
CREATE TABLE IF NOT EXISTS public.cliente_interacciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  cliente_id    uuid NOT NULL REFERENCES public.clientes (id),
  canal         text NOT NULL DEFAULT 'otro' CHECK (canal IN ('mesa','caja','whatsapp','qr','telefono','correo','otro')),
  tipo          text NOT NULL CHECK (tipo IN ('visita','pedido','mensaje_entrante','mensaje_saliente','campana','canje','nota','queja','opinion')),
  resumen       text CHECK (resumen IS NULL OR char_length(resumen) <= 500),
  ref_tipo      text CHECK (ref_tipo IS NULL OR char_length(ref_tipo) <= 40),
  ref_id        uuid,
  creado_por    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cliente_interacciones_idx ON public.cliente_interacciones (cliente_id, created_at DESC);
ALTER TABLE public.cliente_interacciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cliente_interacciones FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cliente_interacciones FROM authenticated;
CREATE POLICY "interacciones: admin y cajero leen" ON public.cliente_interacciones FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) IN ('admin','cashier'));
CREATE TRIGGER cliente_interacciones_no_update BEFORE UPDATE ON public.cliente_interacciones FOR EACH ROW EXECUTE FUNCTION public._fid_no_editar();

-- Nota manual en la ficha del cliente (administrador o cajero).
CREATE OR REPLACE FUNCTION public.fid_agregar_nota(p_cliente_id uuid, p_texto text, p_tipo text DEFAULT 'nota')
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_rol text := get_user_role();
BEGIN
  IF v_rid IS NULL OR v_rol IS NULL OR v_rol NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Solo el administrador o el cajero agregan notas'; END IF;
  IF p_tipo NOT IN ('nota','queja','opinion') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF char_length(btrim(COALESCE(p_texto, ''))) < 2 THEN RAISE EXCEPTION 'Escribe la nota'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND restaurant_id = v_rid) THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  INSERT INTO cliente_interacciones (restaurant_id, cliente_id, canal, tipo, resumen, creado_por)
  VALUES (v_rid, p_cliente_id, 'otro', p_tipo, left(btrim(p_texto), 500), auth.uid());
END;
$$;

-- ─── Campañas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fid_campanas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid NOT NULL DEFAULT public.current_restaurant_id() REFERENCES public.restaurants (id) ON DELETE CASCADE,
  nombre           text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 100),
  objetivo         text CHECK (objetivo IS NULL OR char_length(objetivo) <= 400),
  segmento         jsonb NOT NULL DEFAULT '{}'::jsonb,      -- criterios del público: {"inactivos_dias":30,"nivel_id":"…","cumple_esta_semana":true}
  canal            text NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp','correo','interno')),
  plantilla_id     uuid REFERENCES public.wa_plantillas (id),
  mensaje          text CHECK (mensaje IS NULL OR char_length(mensaje) <= 1024),
  estado           text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','pendiente_aprobacion','aprobada','en_curso','finalizada','cancelada')),
  inicia_at        timestamptz,
  termina_at       timestamptz,
  presupuesto      numeric CHECK (presupuesto IS NULL OR presupuesto >= 0),
  propuesta_por    text NOT NULL DEFAULT 'admin' CHECK (propuesta_por IN ('admin','arm')),
  aprobada_por     uuid,
  aprobada_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (termina_at IS NULL OR inicia_at IS NULL OR termina_at > inicia_at)
);
CREATE INDEX IF NOT EXISTS fid_campanas_rest_idx ON public.fid_campanas (restaurant_id, estado, created_at DESC);
ALTER TABLE public.fid_campanas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_campanas FROM anon;
REVOKE DELETE ON public.fid_campanas FROM authenticated;
CREATE POLICY "fid_campanas: lee el admin" ON public.fid_campanas FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "fid_campanas: crea el admin" ON public.fid_campanas FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE POLICY "fid_campanas: edita el admin" ON public.fid_campanas FOR UPDATE TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin')
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
CREATE TRIGGER fid_campanas_set_updated_at BEFORE UPDATE ON public.fid_campanas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Quién recibe cada campaña y qué pasó con cada uno. Solo entran clientes con consentimiento (lo valida el proceso que la ejecuta).
CREATE TABLE IF NOT EXISTS public.fid_campana_destinatarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  campana_id    uuid NOT NULL REFERENCES public.fid_campanas (id),
  cliente_id    uuid NOT NULL REFERENCES public.clientes (id),
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','encolado','enviado','entregado','respondio','omitido_sin_consentimiento','fallido')),
  mensaje_id    uuid REFERENCES public.wa_mensajes (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campana_id, cliente_id)
);
CREATE INDEX IF NOT EXISTS fid_campana_dest_idx ON public.fid_campana_destinatarios (campana_id, estado);
ALTER TABLE public.fid_campana_destinatarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fid_campana_destinatarios FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fid_campana_destinatarios FROM authenticated;
CREATE POLICY "fid_campana_dest: lee el admin" ON public.fid_campana_destinatarios FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');

ALTER TABLE public.wa_mensajes ADD COLUMN IF NOT EXISTS campana_id uuid REFERENCES public.fid_campanas (id);

-- ─── ARM: propuestas de la IA, pendientes de aprobación ─────────────────────
CREATE TABLE IF NOT EXISTS public.arm_acciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('campana','mensaje','ajuste_saldo','regla','recompensa','promocion','otro')),
  titulo        text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 3 AND 140),
  razon         text NOT NULL CHECK (char_length(razon) <= 1500),              -- por qué lo propone, en palabras sencillas
  evidencia     jsonb NOT NULL DEFAULT '{}'::jsonb,                            -- datos reales de los que sale (conteos, fechas, ids)
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,                            -- exactamente lo que ejecutaría si se aprueba
  estado        text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta','aprobada','rechazada','ejecutada','fallida','expirada')),
  propuesta_por text NOT NULL DEFAULT 'resti',
  conversacion  text,                                                          -- la pregunta del administrador que originó la propuesta
  decidida_por  uuid,
  decidida_at   timestamptz,
  nota_decision text CHECK (nota_decision IS NULL OR char_length(nota_decision) <= 500),
  ejecutada_at  timestamptz,
  error         text CHECK (error IS NULL OR char_length(error) <= 500),
  expira_at     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arm_acciones_rest_idx ON public.arm_acciones (restaurant_id, estado, created_at DESC);
ALTER TABLE public.arm_acciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arm_acciones FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.arm_acciones FROM authenticated;
CREATE POLICY "arm_acciones: lee el admin" ON public.arm_acciones FOR SELECT TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id()) AND (SELECT public.get_user_role()) = 'admin');
-- (Las propuestas las INSERTA la Edge Function de Resti con rol de servicio; ninguna sesión de usuario puede crearlas.)

-- El administrador decide. Solo desde 'propuesta' y antes de que expire.
CREATE OR REPLACE FUNCTION public.arm_decidir(p_id uuid, p_aprobar boolean, p_nota text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); x arm_acciones%ROWTYPE;
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador aprueba o rechaza propuestas'; END IF;
  SELECT * INTO x FROM arm_acciones WHERE id = p_id AND restaurant_id = v_rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Propuesta no encontrada'; END IF;
  IF x.estado <> 'propuesta' THEN RAISE EXCEPTION 'Esta propuesta ya fue decidida'; END IF;
  IF x.expira_at < now() THEN
    UPDATE arm_acciones SET estado = 'expirada' WHERE id = x.id;
    RAISE EXCEPTION 'La propuesta expiró: pídele a Resti que la prepare de nuevo con datos actuales';
  END IF;
  UPDATE arm_acciones SET estado = CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END,
         decidida_por = auth.uid(), decidida_at = now(), nota_decision = NULLIF(btrim(p_nota), '')
   WHERE id = x.id;
  PERFORM _fid_audit(v_rid, CASE WHEN p_aprobar THEN 'arm_aprobada' ELSE 'arm_rechazada' END, 'arm_accion', x.id,
                     jsonb_build_object('tipo', x.tipo, 'titulo', x.titulo));
END;
$$;

-- Aprobar una campaña (solo administrador): pasa de borrador/pendiente a aprobada. No envía nada por sí sola.
CREATE OR REPLACE FUNCTION public.fid_campana_aprobar(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id();
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador aprueba campañas'; END IF;
  UPDATE fid_campanas SET estado = 'aprobada', aprobada_por = auth.uid(), aprobada_at = now()
   WHERE id = p_id AND restaurant_id = v_rid AND estado IN ('borrador','pendiente_aprobacion');
  IF NOT FOUND THEN RAISE EXCEPTION 'La campaña no existe o ya no está pendiente'; END IF;
  PERFORM _fid_audit(v_rid, 'campana_aprobada', 'campana', p_id, '{}'::jsonb);
END;
$$;

-- Segmentos que la IA y el panel necesitan, calculados con datos reales (solo administrador).
-- Clientes inactivos: sin visita hace más de p_dias (o que nunca vinieron y se registraron hace más de p_dias).
CREATE OR REPLACE FUNCTION public.fid_clientes_inactivos(p_dias int DEFAULT 30, p_limite int DEFAULT 200)
 RETURNS TABLE (cliente_id uuid, nombre text, ultima_visita timestamptz, dias_sin_venir int, visitas int, gasto_total numeric, puntos_saldo int, acepta_mensajes boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id();
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador consulta este informe'; END IF;
  RETURN QUERY
    SELECT c.id, c.nombre, a.ultima_visita, (extract(day FROM now() - COALESCE(a.ultima_visita, c.created_at)))::int,
           a.visitas, a.gasto_total, a.puntos_saldo, c.consentimiento_marketing
      FROM clientes c JOIN fid_cuentas a ON a.cliente_id = c.id
     WHERE c.restaurant_id = v_rid AND c.activo AND COALESCE(a.ultima_visita, c.created_at) < now() - make_interval(days => GREATEST(p_dias, 1))
     ORDER BY a.gasto_total DESC, a.ultima_visita NULLS FIRST
     LIMIT LEAST(GREATEST(p_limite, 1), 1000);
END;
$$;

-- Mejores clientes por gasto en un periodo (compras acreditadas y no reversadas).
CREATE OR REPLACE FUNCTION public.fid_mejores_clientes(p_desde timestamptz DEFAULT (now() - interval '90 days'), p_hasta timestamptz DEFAULT now(), p_limite int DEFAULT 20)
 RETURNS TABLE (cliente_id uuid, nombre text, compras bigint, gasto numeric, ultima_compra timestamptz, nivel text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id();
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador consulta este informe'; END IF;
  RETURN QUERY
    SELECT c.id, c.nombre, count(*), sum(x.total), max(x.created_at), n.nombre
      FROM fid_acreditaciones x JOIN clientes c ON c.id = x.cliente_id
      JOIN fid_cuentas a ON a.cliente_id = c.id LEFT JOIN fid_niveles n ON n.id = a.nivel_id
     WHERE x.restaurant_id = v_rid AND x.reversada_at IS NULL AND x.created_at >= p_desde AND x.created_at < p_hasta
     GROUP BY c.id, c.nombre, n.nombre
     ORDER BY sum(x.total) DESC
     LIMIT LEAST(GREATEST(p_limite, 1), 200);
END;
$$;

-- Cumpleaños en los próximos p_dias días (por mes y día, sin importar el año).
CREATE OR REPLACE FUNCTION public.fid_cumpleanos_proximos(p_dias int DEFAULT 7)
 RETURNS TABLE (cliente_id uuid, nombre text, cumpleanos date, en_dias int, acepta_mensajes boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rid uuid := current_restaurant_id(); v_hoy date := hoy_local();
BEGIN
  IF v_rid IS NULL OR get_user_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo el administrador consulta este informe'; END IF;
  RETURN QUERY
    SELECT s.id, s.nombre, s.cumpleanos, (s.prox - v_hoy)::int, s.acepta
      FROM (SELECT c.id, c.nombre, c.cumpleanos, c.consentimiento_marketing AS acepta,
                   CASE WHEN make_date(extract(year FROM v_hoy)::int, extract(month FROM c.cumpleanos)::int, LEAST(extract(day FROM c.cumpleanos)::int, 28)) >= v_hoy
                        THEN make_date(extract(year FROM v_hoy)::int, extract(month FROM c.cumpleanos)::int, LEAST(extract(day FROM c.cumpleanos)::int, 28))
                        ELSE make_date(extract(year FROM v_hoy)::int + 1, extract(month FROM c.cumpleanos)::int, LEAST(extract(day FROM c.cumpleanos)::int, 28)) END AS prox
              FROM clientes c WHERE c.restaurant_id = v_rid AND c.activo AND c.cumpleanos IS NOT NULL) s
     WHERE s.prox - v_hoy <= GREATEST(p_dias, 0)
     ORDER BY s.prox - v_hoy;
END;
$$;

REVOKE ALL ON FUNCTION public.fid_agregar_nota(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arm_decidir(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_campana_aprobar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_clientes_inactivos(int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_mejores_clientes(timestamptz, timestamptz, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fid_cumpleanos_proximos(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fid_agregar_nota(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arm_decidir(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_campana_aprobar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_clientes_inactivos(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_mejores_clientes(timestamptz, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fid_cumpleanos_proximos(int) TO authenticated;
