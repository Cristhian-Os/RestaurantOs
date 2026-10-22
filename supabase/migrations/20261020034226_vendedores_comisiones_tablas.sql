-- Bloque 8, paso 5: tablas de vendedores y pagos (Anexo C, secciones 5, 5.1 y 7).
-- Todo es SOLO del dueño de la plataforma (sin permisos directos; todo por funciones con verificación de 2 pasos).
-- La app calcula, aprueba y registra; NO mueve dinero.

-- ── Cambios a tablas existentes (solo columnas nuevas, opcionales) ──────────────────────────
ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS documento text CHECK (documento IS NULL OR char_length(documento) <= 40),
  ADD COLUMN IF NOT EXISTS causa_estado text CHECK (causa_estado IS NULL OR causa_estado IN ('termino_normal','incumplimiento'));

-- Condiciones del contrato con las que quedó atribuido cada restaurante (no cambian si luego cambian las del vendedor).
ALTER TABLE public.restaurant_crm ADD COLUMN IF NOT EXISTS terminos_vendedor jsonb;

-- Precio sin IVA y IVA de cada pago de suscripción (los llena el Bloque 6; mientras tanto el cálculo usa total / (1 + IVA)).
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS base_cop numeric CHECK (base_cop IS NULL OR base_cop >= 0),
  ADD COLUMN IF NOT EXISTS iva_cop numeric CHECK (iva_cop IS NULL OR iva_cop >= 0),
  ADD COLUMN IF NOT EXISTS total_cop numeric CHECK (total_cop IS NULL OR total_cop >= 0);

-- ── Tablas nuevas ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_settings (
  clave       text PRIMARY KEY CHECK (clave ~ '^[a-z_]{3,40}$'),
  valor       numeric NOT NULL CHECK (valor >= 0),
  descripcion text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);
INSERT INTO public.platform_settings (clave, valor, descripcion) VALUES
  ('bono_meses', 1, 'Meses del plan que gana el vendedor como bono (la mitad con el primer pago y la mitad con el segundo)'),
  ('recurrente_pct', 10, 'Porcentaje recurrente del vendedor sobre el precio sin IVA'),
  ('recurrente_meses', 12, 'Meses que dura la comisión recurrente desde el primer pago'),
  ('aliado_pct', 10, 'Porcentaje recurrente del aliado (sin bono)'),
  ('ventana_devolucion_dias', 30, 'Días en que una devolución genera ajuste negativo'),
  ('iva_pct', 19, 'IVA que paga el cliente; nunca entra en la base de comisiones'),
  ('dia_pago_mes', 10, 'Día del mes límite para pagar las liquidaciones')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.prospectos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id     uuid NOT NULL REFERENCES public.vendedores (id) ON DELETE RESTRICT,
  nombre_negocio  text NOT NULL CHECK (char_length(btrim(nombre_negocio)) BETWEEN 2 AND 160),
  ciudad          text CHECK (ciudad IS NULL OR char_length(ciudad) <= 80),
  contacto        text CHECK (contacto IS NULL OR char_length(contacto) <= 200),
  etapa           text NOT NULL DEFAULT 'prospecto' CHECK (etapa IN ('prospecto','demo','prueba','cerrado','perdido')),
  fecha_registro  date NOT NULL DEFAULT current_date,
  vence_at        date NOT NULL DEFAULT (current_date + 60),
  restaurant_id   uuid REFERENCES public.restaurants (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- Si dos vendedores registran el mismo negocio, gana el primer registro.
CREATE UNIQUE INDEX IF NOT EXISTS prospectos_negocio_unico ON public.prospectos (lower(btrim(nombre_negocio)), lower(btrim(coalesce(ciudad, ''))))
  WHERE etapa <> 'perdido';
CREATE INDEX IF NOT EXISTS prospectos_vendedor_idx ON public.prospectos (vendedor_id, fecha_registro DESC);

CREATE TABLE IF NOT EXISTS public.liquidaciones_vendedor (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              text UNIQUE,                       -- LIQ-AAAA-NNNN, se asigna al registrar el pago
  vendedor_id         uuid NOT NULL REFERENCES public.vendedores (id) ON DELETE RESTRICT,
  periodo             date NOT NULL,                     -- primer día del mes liquidado
  total_bruto_cop     numeric NOT NULL DEFAULT 0 CHECK (total_bruto_cop >= 0),
  retencion_cop       numeric NOT NULL DEFAULT 0 CHECK (retencion_cop >= 0),
  total_pagar_cop     numeric NOT NULL DEFAULT 0 CHECK (total_pagar_cop >= 0),
  estado              text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','aprobada','pagada')),
  cuenta_cobro_numero text CHECK (cuenta_cobro_numero IS NULL OR char_length(cuenta_cobro_numero) <= 60),
  cuenta_cobro_ruta   text,
  aprobada_por        uuid,
  aprobada_at         timestamptz,
  pagada_at           timestamptz,
  medio_pago          text CHECK (medio_pago IS NULL OR medio_pago IN ('nequi','bancolombia','otro')),
  referencia_pago     text CHECK (referencia_pago IS NULL OR char_length(referencia_pago) <= 120),
  comprobante_ruta    text,
  recibo_ruta         text,
  pagada_por          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id, periodo)
);
CREATE SEQUENCE IF NOT EXISTS public.liquidacion_numero_seq;

CREATE TABLE IF NOT EXISTS public.comisiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id     uuid NOT NULL REFERENCES public.vendedores (id) ON DELETE RESTRICT,
  restaurant_id   uuid REFERENCES public.restaurants (id) ON DELETE SET NULL,
  payment_id      uuid REFERENCES public.payments (id) ON DELETE SET NULL,
  tipo            text NOT NULL CHECK (tipo IN ('bono_1','bono_2','recurrente','ajuste')),
  periodo         date NOT NULL,
  base_cop        numeric NOT NULL,
  porcentaje      numeric NOT NULL,
  monto_cop       numeric NOT NULL,                      -- negativo en los ajustes por devolución
  estado          text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','pagada','anulada','congelada')),
  liquidacion_id  uuid REFERENCES public.liquidaciones_vendedor (id) ON DELETE SET NULL,
  motivo          text CHECK (motivo IS NULL OR char_length(motivo) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, vendedor_id, tipo),
  CHECK ((tipo = 'ajuste' AND monto_cop <= 0) OR (tipo <> 'ajuste' AND monto_cop >= 0))
);
CREATE INDEX IF NOT EXISTS comisiones_vendedor_idx ON public.comisiones (vendedor_id, estado, periodo);
CREATE INDEX IF NOT EXISTS comisiones_liquidacion_idx ON public.comisiones (liquidacion_id);

-- Sin permisos directos: todo por funciones del dueño de la plataforma.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_settings','prospectos','liquidaciones_vendedor','comisiones'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.liquidacion_numero_seq FROM PUBLIC, anon, authenticated;

-- ── Almacenamiento privado: contratos y comprobantes (solo el dueño, con 2 pasos) ───────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('contratos-vendedores', 'contratos-vendedores', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png','image/webp']),
  ('comprobantes-vendedores', 'comprobantes-vendedores', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Vendedores: dueño lee contratos y comprobantes" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('contratos-vendedores','comprobantes-vendedores') AND (SELECT public.is_super_admin())
         AND coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2');
CREATE POLICY "Vendedores: dueño sube contratos y comprobantes" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('contratos-vendedores','comprobantes-vendedores') AND (SELECT public.is_super_admin())
         AND coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2');
