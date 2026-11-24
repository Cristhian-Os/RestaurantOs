-- Central: programa al trabajador para que corra solo, sin que el dueño abra la app. SOLO LLAMA a la función central-trabajador (misma puerta, misma cabecera secreta que el vigía).
-- No crea tablas ni toca datos de restaurantes. Con los agentes apagados (interruptor) o sin campaña vigente, cada llamada no hace nada.
--   · 7:30 a. m. (Bogotá), lunes a sábado: "encolar" crea el trabajo del día por cada campaña vigente (sin duplicar).
--   · Cada 10 min entre 7:00 a. m. y 6:59 p. m. (Bogotá), lunes a sábado: "ejecutar" toma hasta 2 trabajos de la cola.
--   · 6:00 a. m. (Bogotá), todos los días: "sincronizar_funciones" compara el código de la app con la matriz de funciones.
-- Configuración por entorno: reutiliza platform_secrets 'central_vigia_url' / 'central_vigia_jwt' / 'central_vigia_secreto' (ya existen). Si faltan, no hace nada.
-- REVERSA:
--   select cron.unschedule(jobid) from cron.job where jobname in ('central-trabajador-encolar','central-trabajador-ejecutar','central-trabajador-funciones');
--   drop function if exists public.central_trabajador_programado(text);

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.central_trabajador_programado(p_accion text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text; v_jwt text; v_sec text;
begin
  if p_accion not in ('encolar', 'ejecutar', 'sincronizar_funciones') then return; end if;
  select value into v_url from public.platform_secrets where key = 'central_vigia_url';
  select value into v_jwt from public.platform_secrets where key = 'central_vigia_jwt';
  select value into v_sec from public.platform_secrets where key = 'central_vigia_secreto';
  if v_url is null or v_jwt is null or v_sec is null then return; end if;
  perform net.http_post(
    url := replace(v_url, '/central-vigia', '/central-trabajador'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_jwt, 'x-vigia-secreto', v_sec),
    body := jsonb_build_object('accion', p_accion),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.central_trabajador_programado(text) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('central-trabajador-encolar', 'central-trabajador-ejecutar', 'central-trabajador-funciones');
-- Horas en UTC (Bogotá = UTC-5, sin horario de verano)
select cron.schedule('central-trabajador-encolar',  '30 12 * * 1-6',      $$select public.central_trabajador_programado('encolar')$$);
select cron.schedule('central-trabajador-ejecutar', '*/10 12-23 * * 1-6', $$select public.central_trabajador_programado('ejecutar')$$);
select cron.schedule('central-trabajador-funciones', '0 11 * * *',        $$select public.central_trabajador_programado('sincronizar_funciones')$$);
