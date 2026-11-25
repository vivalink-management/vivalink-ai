-- Vivalink Management AI: lesende Bestandsaufnahme der vorhandenen Auswertungen.
-- Liest nur Namen, Spalten und Datentypen aus dem Systemkatalog. Keine Inhalte, keine Zeilenzahlen, keine Änderungen.
with schemas as (
  select n.oid, n.nspname from pg_namespace n
  where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage', 'realtime', 'extensions', 'graphql',
    'graphql_public', 'vault', 'pgsodium', 'pgsodium_masks', 'supabase_functions', 'supabase_migrations', 'net', 'cron', 'pgbouncer', 'management_ai')
    and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
)
select case c.relkind when 'v' then 'view' when 'm' then 'materialisierte view' else 'tabelle' end as art,
       s.nspname || '.' || c.relname as quelle,
       string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum) as spalten,
       case when c.relkind = 'v' and coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%' then 'security_invoker' else '' end as hinweis
from pg_class c
join schemas s on s.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relkind in ('r', 'p', 'v', 'm')
group by c.relkind, s.nspname, c.relname, c.reloptions
union all
select 'funktion', s.nspname || '.' || p.proname || '()', pg_get_function_result(p.oid),
       case when p.prosecdef then 'security_definer' else '' end
from pg_proc p
join schemas s on s.oid = p.pronamespace
where p.pronargs = 0 and p.prokind = 'f'
  and pg_get_function_result(p.oid) not in ('trigger', 'event_trigger', 'void')
order by 1 desc, 2;
