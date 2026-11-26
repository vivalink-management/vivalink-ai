-- Nachbildung der Supabase-Standard-Ereignistrigger für die lokale Testumgebung (nur Tests).
-- Aufbau und Funktionsrümpfe sinngemäß nach dem öffentlichen Supabase-Postgres-Image; keine Vivalink-Interna.
create schema if not exists extensions;

create or replace function extensions.pgrst_ddl_watch() returns event_trigger language plpgsql as $$
declare
  cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands()
  loop
    if cmd.command_tag in (
      'CREATE SCHEMA', 'ALTER SCHEMA', 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE',
      'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE', 'CREATE VIEW', 'ALTER VIEW', 'CREATE MATERIALIZED VIEW',
      'ALTER MATERIALIZED VIEW', 'CREATE FUNCTION', 'ALTER FUNCTION', 'CREATE TRIGGER', 'CREATE TYPE', 'ALTER TYPE', 'CREATE RULE', 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    and cmd.schema_name is distinct from 'pg_temp'
    then
      notify pgrst, 'reload schema';
    end if;
  end loop;
end; $$;

create or replace function extensions.pgrst_drop_watch() returns event_trigger language plpgsql as $$
declare
  obj record;
begin
  for obj in select * from pg_event_trigger_dropped_objects()
  loop
    if obj.object_type in ('schema', 'table', 'foreign table', 'view', 'materialized view', 'function', 'trigger', 'type', 'rule')
    and obj.is_temporary is false -- no pg_temp objects
    then
      notify pgrst, 'reload schema';
    end if;
  end loop;
end; $$;

-- Reagieren nur auf CREATE EXTENSION bzw. bestimmte Funktionen (Rumpf vereinfacht; enthält Rechtevergaben)
create or replace function extensions.grant_pg_net_access() returns event_trigger language plpgsql as $$
begin
  if exists (select 1 from pg_event_trigger_ddl_commands() as ev join pg_extension as ext on ev.objid = ext.oid where ext.extname = 'pg_net') then
    grant usage on schema extensions to postgres;
  end if;
end; $$;
create or replace function extensions.grant_pg_cron_access() returns event_trigger language plpgsql as $$
begin
  if exists (select 1 from pg_event_trigger_ddl_commands() as ev join pg_extension as ext on ev.objid = ext.oid where ext.extname = 'pg_cron') then
    grant usage on schema extensions to postgres;
  end if;
end; $$;
create or replace function extensions.grant_pg_graphql_access() returns event_trigger language plpgsql as $$
declare
  func_is_graphql_resolve bool;
begin
  func_is_graphql_resolve = exists (select 1 from pg_event_trigger_ddl_commands() as ev join pg_extension as ext on ev.objid = ext.oid where ext.extname = 'pg_graphql');
  if func_is_graphql_resolve then
    grant usage on schema extensions to postgres;
  end if;
end; $$;
create or replace function extensions.set_graphql_placeholder() returns event_trigger language plpgsql as $$
begin
  if exists (select 1 from pg_event_trigger_dropped_objects() where object_type = 'extension') then
    perform 1;
  end if;
end; $$;

create event trigger pgrst_ddl_watch on ddl_command_end execute function extensions.pgrst_ddl_watch();
create event trigger pgrst_drop_watch on sql_drop execute function extensions.pgrst_drop_watch();
create event trigger issue_pg_net_access on ddl_command_end when tag in ('CREATE EXTENSION') execute function extensions.grant_pg_net_access();
create event trigger issue_pg_cron_access on ddl_command_end when tag in ('CREATE EXTENSION') execute function extensions.grant_pg_cron_access();
-- aktuelle Form seit supabase/postgres 20260421000001_rescope_pg_graphql_access_trigger: nur CREATE EXTENSION
create event trigger issue_pg_graphql_access on ddl_command_end when tag in ('CREATE EXTENSION') execute function extensions.grant_pg_graphql_access();
create event trigger issue_graphql_placeholder on sql_drop when tag in ('DROP EXTENSION') execute function extensions.set_graphql_placeholder();
