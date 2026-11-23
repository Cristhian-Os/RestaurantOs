// Banco de pruebas local (PGlite, sin red ni Supabase): node scripts/probar-central-runtime.mjs migrations/20261124120000_central_runtime_trabajos.sql tests/central_runtime.sql
// Requiere: npm i --no-save @electric-sql/pglite. Rutas relativas a /supabase. Es un molde mínimo de Supabase: no sustituye la prueba en el proyecto de prueba.
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
const R = new URL('../supabase/', import.meta.url).pathname
const db = new PGlite()
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; alter default privileges in schema public grant all on tables to service_role;
create schema auth; create schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), aud text, role text, email text);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
create table public.restaurants (id uuid primary key default gen_random_uuid(), name text, slug text, email_domain text);
create table public.profiles (id uuid primary key, role text, full_name text, email text, restaurant_id uuid);
create function public.is_super_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id = auth.uid() and role='super_admin') $$;
create function public._auditoria_inmutable() returns trigger language plpgsql as $$ begin raise exception 'inmutable'; end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
`)
const files = ['migrations/20261114130000_central_acceso_auditoria.sql','migrations/20261114140000_central_nucleo.sql','migrations/20261119120000_crecimiento_fase1.sql', ...process.argv.slice(2).filter(a=>a.startsWith('migrations/'))]
for (const f of files) { try { await db.exec(fs.readFileSync(R+f,'utf8')); console.log('OK  ', f) } catch (e) { console.log('FALLA', f, '\n  ', e.message); process.exit(1) } }
const t = process.argv.find(a=>a.startsWith('tests/'))
if (t) { try { await db.exec(fs.readFileSync(R+t,'utf8')); console.log('el test no lanzó resultado') } catch (e) { console.log(e.message) } }
