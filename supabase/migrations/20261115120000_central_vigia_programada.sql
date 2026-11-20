-- Central: programa al vigía para que revise la plataforma cada hora, sin que el dueño esté presente.
-- Solo LLAMA a la función central-vigia (que únicamente lee y crea tareas propuestas). No toca datos de restaurantes.
-- Configuración por entorno (NO va en la migración): platform_secrets 'central_vigia_url' y 'central_vigia_jwt' (llave pública anon).
-- Si faltan, la tarea no hace nada.
-- REVERSA:
--   select cron.unschedule('central-vigia-hora');
--   drop function if exists public.central_vigia_programada();
--   delete from platform_secrets where key in ('central_vigia_secreto','central_vigia_url','central_vigia_jwt');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secreto aleatorio que autoriza la llamada programada (solo la base y la función lo conocen).
insert into public.platform_secrets (key, value)
select 'central_vigia_secreto', encode(extensions.gen_random_bytes(24), 'hex')
where not exists (select 1 from public.platform_secrets where key = 'central_vigia_secreto');

create or replace function public.central_vigia_programada()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text; v_jwt text; v_sec text;
begin
  select value into v_url from public.platform_secrets where key = 'central_vigia_url';
  select value into v_jwt from public.platform_secrets where key = 'central_vigia_jwt';
  select value into v_sec from public.platform_secrets where key = 'central_vigia_secreto';
  if v_url is null or v_jwt is null or v_sec is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_jwt, 'x-vigia-secreto', v_sec),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function public.central_vigia_programada() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'central-vigia-hora';
select cron.schedule('central-vigia-hora', '0 * * * *', $$select public.central_vigia_programada()$$);
