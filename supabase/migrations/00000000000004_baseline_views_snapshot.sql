-- ============================================================
-- VISTAS (public schema) -- snapshot desde produccion
-- Generado automaticamente el 2026-09-26. NO editar a mano.
-- ============================================================

CREATE OR REPLACE VIEW public.ingredientes_disponibles AS
 SELECT id,
    nombre,
    unidad_medida,
    stock_actual,
    stock_minimo,
    costo_unitario,
        CASE
            WHEN (stock_actual <= (0)::numeric) THEN 'agotado'::text
            WHEN (stock_actual < stock_minimo) THEN 'bajo'::text
            ELSE 'disponible'::text
        END AS disponibilidad
   FROM ingredientes
  WHERE (stock_actual > (0)::numeric)
  ORDER BY nombre;

CREATE OR REPLACE VIEW public.ingredientes_menu_publico AS
 SELECT id,
    restaurant_id,
    nombre,
    unidad_medida,
    round((costo_unitario / 0.65), 2) AS precio_venta_unitario,
    (stock_actual > (0)::numeric) AS disponible
   FROM ingredientes
  WHERE (stock_actual > (0)::numeric)
  ORDER BY nombre;

CREATE OR REPLACE VIEW public.pedido_estado_publico AS
 SELECT id,
    status,
    table_num,
    tipo_pedido,
    created_at,
    updated_at,
    (paid_at IS NOT NULL) AS pagado
   FROM orders;

CREATE OR REPLACE VIEW public.restaurant_payment_config_status AS
 SELECT restaurant_id,
    enabled,
    wompi_public_key,
    ((wompi_private_key IS NOT NULL) AND (wompi_private_key <> ''::text)) AS has_private_key,
    ((wompi_events_secret IS NOT NULL) AND (wompi_events_secret <> ''::text)) AS has_events_secret,
    ((wompi_integrity_secret IS NOT NULL) AND (wompi_integrity_secret <> ''::text)) AS has_integrity_secret
   FROM restaurant_payment_config;

CREATE OR REPLACE VIEW public.restaurants_public AS
 SELECT id,
    slug,
    name
   FROM restaurants
  WHERE (active = true);

CREATE OR REPLACE VIEW public.tasks_with_profiles AS
 SELECT t.id,
    t.title,
    t.description,
    t.assigned_to,
    t.created_by,
    t.status,
    t.priority,
    t.due_date,
    t.created_at,
    t.updated_at,
    p.full_name AS assignee_name,
    p.role AS assignee_role,
    creator.full_name AS creator_name,
    ( SELECT count(*) AS count
           FROM task_evidence e
          WHERE (e.task_id = t.id)) AS evidence_count
   FROM ((tasks t
     LEFT JOIN profiles p ON ((p.id = t.assigned_to)))
     LEFT JOIN profiles creator ON ((creator.id = t.created_by)));

CREATE OR REPLACE VIEW public.vista_lista_compras AS
 SELECT id,
    nombre,
    unidad_medida,
    stock_actual,
    stock_minimo,
    costo_unitario,
    GREATEST(((stock_minimo * (2)::numeric) - stock_actual), (0)::numeric) AS cantidad_sugerida,
    cantidad_necesaria_manual,
    COALESCE(cantidad_necesaria_manual, GREATEST(((stock_minimo * (2)::numeric) - stock_actual), (0)::numeric)) AS cantidad_necesaria,
    (COALESCE(cantidad_necesaria_manual, GREATEST(((stock_minimo * (2)::numeric) - stock_actual), (0)::numeric)) * costo_unitario) AS costo_total,
        CASE
            WHEN (stock_actual = (0)::numeric) THEN 'URGENTE'::text
            WHEN (stock_actual < stock_minimo) THEN 'ALTO'::text
            ELSE 'NORMAL'::text
        END AS prioridad
   FROM ingredientes i
  WHERE (stock_actual <= (stock_minimo * 1.2))
  ORDER BY
        CASE
            WHEN (stock_actual = (0)::numeric) THEN 0
            WHEN (stock_actual < stock_minimo) THEN 1
            ELSE 2
        END, nombre;

CREATE OR REPLACE VIEW public.vista_productos_disponibles AS
 SELECT d.id,
    d.name,
    d.description,
    d.price,
    d.category,
    d.image_url,
    d.available,
    d.availability_status,
    d.tags,
    count(r.id) AS ingredientes_totales,
    count(
        CASE
            WHEN (i.stock_actual < r.cantidad_necesaria) THEN 1
            ELSE NULL::integer
        END) AS ingredientes_faltantes
   FROM ((dishes d
     LEFT JOIN recetas r ON ((r.producto_id = d.id)))
     LEFT JOIN ingredientes i ON ((i.id = r.ingrediente_id)))
  WHERE ((d.available = true) AND (d.availability_status = 'available'::text))
  GROUP BY d.id;
