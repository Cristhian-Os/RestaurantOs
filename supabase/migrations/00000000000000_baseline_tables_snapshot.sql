-- ============================================================
-- TABLAS (public schema) -- snapshot desde produccion
-- Generado automaticamente. NO editar a mano.
-- ============================================================

-- public.profiles (16 filas al momento del snapshot, RLS ON)
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role text NOT NULL DEFAULT 'waiter'::text CHECK (role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'waiter'::text, 'kitchen'::text, 'cashier'::text, 'client'::text])),
  full_name text,
  email text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  avatar_url text,
  recovery_email text,
  restaurant_id uuid DEFAULT current_restaurant_id(),
  must_change_password boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id),
  FOREIGN KEY (id) REFERENCES auth.users (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (owner_id) REFERENCES public.profiles (id),
  FOREIGN KEY (employee_id) REFERENCES public.profiles (id),
  FOREIGN KEY (created_by) REFERENCES public.profiles (id)
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- public.mesas (34 filas al momento del snapshot, RLS ON)
CREATE TABLE public.mesas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero integer NOT NULL CHECK (numero >= 1 AND numero <= 100),
  capacidad integer NOT NULL DEFAULT 4,
  estado text NOT NULL DEFAULT 'libre'::text CHECK (estado = ANY (ARRAY['libre'::text, 'ocupada'::text, 'reservada'::text, 'cuenta'::text])),
  zona text DEFAULT 'principal'::text,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  PRIMARY KEY (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (mesa_id) REFERENCES public.mesas (id)
);
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;

-- public.dishes (70 filas al momento del snapshot, RLS ON)
CREATE TABLE public.dishes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
  description text CHECK (char_length(description) <= 500),
  price numeric NOT NULL CHECK (price >= 0::numeric),
  category text NOT NULL DEFAULT 'principal'::text,
  image_url text,
  available boolean NOT NULL DEFAULT true,
  availability_status text NOT NULL DEFAULT 'available'::text CHECK (availability_status = ANY (ARRAY['available'::text, 'out_of_stock'::text, 'discontinued'::text])),
  tags ARRAY DEFAULT '{}'::text[],
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  has_sizes boolean NOT NULL DEFAULT false,
  sizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  PRIMARY KEY (id),
  FOREIGN KEY (dish_id) REFERENCES public.dishes (id),
  FOREIGN KEY (dish_id) REFERENCES public.dishes (id),
  FOREIGN KEY (dish_id) REFERENCES public.dishes (id),
  FOREIGN KEY (dish_id) REFERENCES public.dishes (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (producto_id) REFERENCES public.dishes (id)
);
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;

-- public.orders (62 filas al momento del snapshot, RLS ON)
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  mesa_id uuid,
  table_num integer,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0 CHECK (total >= 0::numeric),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'cooking'::text, 'ready'::text, 'completed'::text, 'cancelled'::text])),
  tipo_pedido text NOT NULL DEFAULT 'LOCAL'::text CHECK (tipo_pedido = ANY (ARRAY['LOCAL'::text, 'LLEVAR'::text, 'DOMICILIO'::text, 'RAPPI'::text])),
  notes text CHECK (char_length(notes) <= 500),
  payment_method text CHECK ((payment_method = ANY (ARRAY['efectivo'::text, 'transferencia'::text, 'tarjeta'::text])) OR payment_method IS NULL),
  amount_paid numeric,
  change_amount numeric DEFAULT 
CASE
    WHEN ((payment_method = 'efectivo'::text) AND (amount_paid IS NOT NULL)) THEN GREATEST((amount_paid - total), (0)::numeric)
    ELSE (0)::numeric
END,
  paid_at timestamp with time zone,
  paid_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  customer_name text,
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  delivered_at timestamp with time zone,
  propina numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  FOREIGN KEY (order_id) REFERENCES public.orders (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (order_id) REFERENCES public.orders (id),
  FOREIGN KEY (order_id) REFERENCES public.orders (id),
  FOREIGN KEY (paid_by) REFERENCES auth.users (id),
  FOREIGN KEY (mesa_id) REFERENCES public.mesas (id),
  FOREIGN KEY (user_id) REFERENCES auth.users (id)
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- public.ingredientes (50 filas al momento del snapshot, RLS ON)
CREATE TABLE public.ingredientes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (char_length(nombre) >= 2 AND char_length(nombre) <= 100),
  unidad_medida text NOT NULL CHECK (unidad_medida = ANY (ARRAY['kg'::text, 'litro'::text, 'pieza'::text, 'gramo'::text, 'ml'::text, 'paquete'::text])),
  stock_actual numeric NOT NULL DEFAULT 0 CHECK (stock_actual >= 0::numeric),
  stock_minimo numeric NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0::numeric),
  costo_unitario numeric NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  cantidad_necesaria_manual numeric CHECK (cantidad_necesaria_manual >= 0::numeric),
  PRIMARY KEY (id),
  FOREIGN KEY (ingrediente_id) REFERENCES public.ingredientes (id),
  FOREIGN KEY (ingrediente_id) REFERENCES public.ingredientes (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (ingrediente_id) REFERENCES public.ingredientes (id)
);
ALTER TABLE public.ingredientes ENABLE ROW LEVEL SECURITY;

-- public.recetas (6 filas al momento del snapshot, RLS ON)
CREATE TABLE public.recetas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  ingrediente_id uuid,
  cantidad_necesaria numeric NOT NULL CHECK (cantidad_necesaria > 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  nombre text,
  costo_unitario numeric NOT NULL DEFAULT 0,
  unidad text,
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  PRIMARY KEY (id),
  FOREIGN KEY (ingrediente_id) REFERENCES public.ingredientes (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (producto_id) REFERENCES public.dishes (id)
);
ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;

-- public.detalles_pedidos (114 filas al momento del snapshot, RLS ON)
CREATE TABLE public.detalles_pedidos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  dish_id uuid,
  cantidad integer NOT NULL CHECK (cantidad > 0),
  precio_unit numeric NOT NULL CHECK (precio_unit >= 0::numeric),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  PRIMARY KEY (id),
  FOREIGN KEY (dish_id) REFERENCES public.dishes (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (order_id) REFERENCES public.orders (id)
);
ALTER TABLE public.detalles_pedidos ENABLE ROW LEVEL SECURITY;

-- public.cortes_caja (10 filas al momento del snapshot, RLS ON)
CREATE TABLE public.cortes_caja (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  total_efectivo numeric NOT NULL DEFAULT 0,
  total_transferencia numeric NOT NULL DEFAULT 0,
  total_ordenes integer NOT NULL DEFAULT 0,
  ordenes_ids ARRAY,
  notas text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  total_gastos numeric NOT NULL DEFAULT 0,
  total_neto numeric NOT NULL DEFAULT 0,
  denominaciones jsonb,
  total_propinas numeric NOT NULL DEFAULT 0,
  total_propinas_efectivo numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (cashier_id) REFERENCES auth.users (id)
);
ALTER TABLE public.cortes_caja ENABLE ROW LEVEL SECURITY;

-- public.push_subscriptions (8 filas al momento del snapshot, RLS ON)
CREATE TABLE public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  auth text,
  p256dh text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  PRIMARY KEY (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (user_id) REFERENCES auth.users (id)
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- public.tasks (1 filas al momento del snapshot, RLS ON)
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description text CHECK (char_length(description) <= 1000),
  assigned_to uuid NOT NULL,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'rejected'::text])),
  priority text NOT NULL DEFAULT 'medium'::text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])),
  due_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  PRIMARY KEY (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (task_id) REFERENCES public.tasks (id),
  FOREIGN KEY (created_by) REFERENCES auth.users (id),
  FOREIGN KEY (assigned_to) REFERENCES auth.users (id)
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- public.task_evidence (1 filas al momento del snapshot, RLS ON)
CREATE TABLE public.task_evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  photo_url text NOT NULL,
  storage_path text NOT NULL,
  notes text CHECK (char_length(notes) <= 500),
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  PRIMARY KEY (id),
  FOREIGN KEY (uploaded_by) REFERENCES auth.users (id),
  FOREIGN KEY (task_id) REFERENCES public.tasks (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id)
);
ALTER TABLE public.task_evidence ENABLE ROW LEVEL SECURITY;

-- public.restaurant_config (4 filas al momento del snapshot, RLS ON)
CREATE TABLE public.restaurant_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  display_name text NOT NULL DEFAULT 'RestaurantOS'::text,
  modules_enabled jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  logo_url text,
  color_primario text,
  color_acento text,
  slogan text,
  currency_code character varying DEFAULT 'COP'::character varying,
  promo_texto text,
  promo_activo boolean NOT NULL DEFAULT false,
  whatsapp_numero text,
  direccion text,
  instagram_url text,
  facebook_url text,
  propina_sugerida_pct integer,
  portada_url text,
  horario_activo boolean NOT NULL DEFAULT false,
  horario_apertura text,
  horario_cierre text,
  cerrado_manual boolean NOT NULL DEFAULT false,
  cerrado_mensaje text,
  PRIMARY KEY (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id)
);
ALTER TABLE public.restaurant_config ENABLE ROW LEVEL SECURITY;

-- public.employee_schedules (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.employee_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  shift_start time without time zone NOT NULL,
  shift_end time without time zone NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  PRIMARY KEY (id),
  FOREIGN KEY (created_by) REFERENCES public.profiles (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (employee_id) REFERENCES public.profiles (id)
);
ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;

-- public.custom_dishes (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.custom_dishes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
  description text,
  base_price numeric NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  order_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  PRIMARY KEY (id),
  FOREIGN KEY (order_id) REFERENCES public.orders (id),
  FOREIGN KEY (created_by) REFERENCES auth.users (id),
  FOREIGN KEY (custom_dish_id) REFERENCES public.custom_dishes (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id)
);
ALTER TABLE public.custom_dishes ENABLE ROW LEVEL SECURITY;

-- public.custom_dish_ingredients (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.custom_dish_ingredients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  custom_dish_id uuid NOT NULL,
  ingrediente_id uuid NOT NULL,
  cantidad numeric NOT NULL CHECK (cantidad > 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  PRIMARY KEY (id),
  FOREIGN KEY (custom_dish_id) REFERENCES public.custom_dishes (id),
  FOREIGN KEY (ingrediente_id) REFERENCES public.ingredientes (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id)
);
ALTER TABLE public.custom_dish_ingredients ENABLE ROW LEVEL SECURITY;

-- public.restaurants (4 filas al momento del snapshot, RLS ON)
CREATE TABLE public.restaurants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  email_domain text NOT NULL,
  plan text NOT NULL DEFAULT 'trial'::text CHECK (plan = ANY (ARRAY['trial'::text, 'emprende'::text, 'pro'::text, 'premium'::text])),
  active boolean NOT NULL DEFAULT true,
  owner_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_promo boolean NOT NULL DEFAULT false,
  is_founder boolean NOT NULL DEFAULT false,
  trial_ends_at timestamp with time zone,
  PRIMARY KEY (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (owner_id) REFERENCES public.profiles (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id)
);
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- public.platform_secrets (6 filas al momento del snapshot, RLS ON)
CREATE TABLE public.platform_secrets (
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (key)
);
ALTER TABLE public.platform_secrets ENABLE ROW LEVEL SECURITY;

-- public.subscriptions (4 filas al momento del snapshot, RLS ON)
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  plan text NOT NULL DEFAULT 'emprende'::text,
  status text NOT NULL DEFAULT 'trialing'::text CHECK (status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text])),
  amount_in_cents integer,
  currency text NOT NULL DEFAULT 'COP'::text,
  is_promo boolean NOT NULL DEFAULT false,
  trial_ends_at timestamp with time zone,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  grace_ends_at timestamp with time zone,
  purge_at timestamp with time zone,
  wompi_payment_source_id text,
  wompi_customer_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id)
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- public.payments (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['subscription'::text, 'diner'::text])),
  order_id uuid,
  reference text NOT NULL,
  wompi_transaction_id text,
  amount_in_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'COP'::text,
  status text NOT NULL DEFAULT 'PENDING'::text,
  payment_method_type text,
  customer_email text,
  raw jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (order_id) REFERENCES public.orders (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id)
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- public.restaurant_payment_config (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.restaurant_payment_config (
  restaurant_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'wompi'::text,
  enabled boolean NOT NULL DEFAULT false,
  wompi_public_key text,
  wompi_private_key text,
  wompi_events_secret text,
  wompi_integrity_secret text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id)
);
ALTER TABLE public.restaurant_payment_config ENABLE ROW LEVEL SECURITY;

-- public.gastos (2 filas al momento del snapshot, RLS ON)
CREATE TABLE public.gastos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id(),
  concepto text NOT NULL CHECK (char_length(concepto) >= 1 AND char_length(concepto) <= 200),
  monto numeric NOT NULL CHECK (monto > 0::numeric),
  categoria text,
  registrado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants (id),
  FOREIGN KEY (registrado_por) REFERENCES auth.users (id),
  FOREIGN KEY (gasto_id) REFERENCES public.gastos (id)
);
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

-- public.order_rate_limit (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.order_rate_limit (
  identifier text NOT NULL,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (identifier)
);
ALTER TABLE public.order_rate_limit ENABLE ROW LEVEL SECURITY;

-- public.gasto_items (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.gasto_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gasto_id uuid NOT NULL,
  ingrediente_id uuid,
  nombre_producto text NOT NULL CHECK (char_length(nombre_producto) >= 1 AND char_length(nombre_producto) <= 120),
  cantidad numeric NOT NULL CHECK (cantidad > 0::numeric),
  unidad text,
  precio_unitario numeric NOT NULL CHECK (precio_unitario >= 0::numeric),
  subtotal numeric DEFAULT (cantidad * precio_unitario),
  restaurant_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (ingrediente_id) REFERENCES public.ingredientes (id),
  FOREIGN KEY (gasto_id) REFERENCES public.gastos (id)
);
ALTER TABLE public.gasto_items ENABLE ROW LEVEL SECURITY;

-- public.likes_platos (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.likes_platos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  dish_id uuid NOT NULL,
  cliente_nombre text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reaccion text NOT NULL DEFAULT 'like'::text CHECK (reaccion = ANY (ARRAY['like'::text, 'dislike'::text])),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (dish_id) REFERENCES public.dishes (id)
);
ALTER TABLE public.likes_platos ENABLE ROW LEVEL SECURITY;

-- public.resenas_platos (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.resenas_platos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  dish_id uuid NOT NULL,
  cliente_nombre text NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comentario text,
  estado text NOT NULL DEFAULT 'pendiente'::text CHECK (estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (dish_id) REFERENCES public.dishes (id)
);
ALTER TABLE public.resenas_platos ENABLE ROW LEVEL SECURITY;

-- public.comentarios_platos (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.comentarios_platos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  dish_id uuid NOT NULL,
  parent_id uuid,
  cliente_nombre text NOT NULL,
  texto text NOT NULL,
  estado text NOT NULL DEFAULT 'visible'::text CHECK (estado = ANY (ARRAY['visible'::text, 'eliminado'::text, 'oculto'::text])),
  reportado_count integer NOT NULL DEFAULT 0,
  edit_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (dish_id) REFERENCES public.dishes (id),
  FOREIGN KEY (comment_id) REFERENCES public.comentarios_platos (id),
  FOREIGN KEY (parent_id) REFERENCES public.comentarios_platos (id)
);
ALTER TABLE public.comentarios_platos ENABLE ROW LEVEL SECURITY;

-- public.comentario_likes (0 filas al momento del snapshot, RLS ON)
CREATE TABLE public.comentario_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL,
  cliente_nombre text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (comment_id) REFERENCES public.comentarios_platos (id)
);
ALTER TABLE public.comentario_likes ENABLE ROW LEVEL SECURITY;
