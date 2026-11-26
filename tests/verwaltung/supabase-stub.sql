-- Nachbildung der Supabase-Grundeinstellungen für die lokale Testumgebung (nur Tests, KEINE echte Datenbank):
-- API-Rollen anon und authenticated erhalten wie bei Supabase standardmäßig Rechte auf neue Objekte im Schema public.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
-- Supabase-Anmeldefunktion (nachgebildet; ohne angemeldetes Konto immer leer)
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid';
