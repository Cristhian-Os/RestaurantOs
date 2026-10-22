-- Reversa de 20261022123000_pagos_en_linea_verificados
DROP FUNCTION IF EXISTS public.guardar_config_pagos(boolean, text, text, text, text);
DROP FUNCTION IF EXISTS public.procesar_pago_wompi(text,text,text,integer,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.suscripcion_puede_cobrar(uuid);
DROP FUNCTION IF EXISTS public.mark_order_paid(uuid, text, text, integer);
DROP INDEX IF EXISTS public.payments_wompi_tx_uniq;
CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid, p_method text DEFAULT 'ONLINE'::text, p_tx_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.orders
     set payment_method = 'tarjeta',   -- pago con tarjeta/en línea (encaja con el CHECK existente)
         paid_at = now()
   where id = p_order_id;
end;
$function$;
REVOKE ALL ON FUNCTION public.mark_order_paid(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.enforce_subscription_lifecycle()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  if not exists (
    select 1 from public.platform_secrets
    where key = 'wompi_public_key' and value is not null and value <> ''
  ) then
    return;
  end if;

  -- 1) Periodo/trial vencido → MORA (7 días), guardando la fecha límite
  update public.subscriptions
     set status = 'past_due',
         grace_ends_at = coalesce(grace_ends_at, now() + interval '7 days')
   where status in ('active','trialing')
     and is_promo = false
     and coalesce(current_period_end, trial_ends_at) is not null
     and coalesce(current_period_end, trial_ends_at) < now();

  -- 2) Mora vencida → CANCELADO + programar borrado a los 30 días
  update public.subscriptions
     set status = 'canceled',
         purge_at = coalesce(purge_at, now() + interval '30 days')
   where status = 'past_due'
     and is_promo = false
     and grace_ends_at is not null
     and grace_ends_at < now();

  -- 3) Bloquear acceso de los cancelados (defensa extra; la app ya lo valida)
  update public.restaurants
     set active = false
   where active = true
     and id in (select restaurant_id from public.subscriptions where status = 'canceled' and is_promo = false);

  -- 4) Reactivar acceso de los que volvieron a estar al día
  update public.restaurants
     set active = true
   where active = false
     and id in (select restaurant_id from public.subscriptions where status in ('active','trialing','past_due'));

  -- 5) Borrado definitivo de los cancelados cuyo plazo de 30 días ya venció
  for r in
    select restaurant_id from public.subscriptions
    where status = 'canceled' and is_promo = false and purge_at is not null and purge_at < now()
  loop
    perform public.purge_restaurant(r.restaurant_id);
  end loop;
end;
$function$;
REVOKE ALL ON FUNCTION public.enforce_subscription_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_lifecycle() TO service_role;
ALTER TABLE public.restaurants DROP COLUMN IF EXISTS desactivado_por_cobro;
DROP VIEW IF EXISTS public.restaurant_payment_config_status;
CREATE VIEW public.restaurant_payment_config_status WITH (security_invoker = true) AS
 SELECT restaurant_id,
     enabled,
     wompi_public_key,
     ((wompi_private_key IS NOT NULL) AND (wompi_private_key <> ''::text)) AS has_private_key,
     ((wompi_events_secret IS NOT NULL) AND (wompi_events_secret <> ''::text)) AS has_events_secret,
     ((wompi_integrity_secret IS NOT NULL) AND (wompi_integrity_secret <> ''::text)) AS has_integrity_secret
    FROM restaurant_payment_config;
REVOKE ALL ON public.restaurant_payment_config FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.restaurant_payment_config TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.restaurant_payment_config TO authenticated;
REVOKE ALL ON public.restaurant_payment_config_status FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.restaurant_payment_config_status TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.restaurant_payment_config_status TO authenticated;
