-- Vivalink-Verwaltung: Gerätezugänge für die Management AI (nur lesend, zusammengefasste Kennzahlen).
-- VORLAGE – nur nach gesonderter Freigabe des Gründers ausführen, zuerst in der Supabase-Testumgebung.
-- Ändert KEINE bestehende Tabelle, View oder Funktion der Verwaltung. Alles liegt im eigenen Schema management_ai,
-- das die Supabase-API (PostgREST) nicht ausliefert. Keine Personendaten.
-- Die Leserechte auf die vorhandenen Auswertungen erzeugt scripts/verwaltung-sql.mjs aus mapping.json (gesonderte Datei).

create schema if not exists management_ai;
revoke all on schema management_ai from public;

create table if not exists management_ai.devices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) <= 60),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create table if not exists management_ai.pair_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz
);
-- Abrufprotokoll für die Begrenzung (60 je Stunde und Gerät; „pair:fail“ = Fehlversuche beim Koppeln)
create table if not exists management_ai.calls (
  token_hash text not null,
  at timestamptz not null default now()
);
create index if not exists calls_idx on management_ai.calls (token_hash, at);

alter table management_ai.devices enable row level security;
alter table management_ai.pair_codes enable row level security;
alter table management_ai.calls enable row level security;

-- Eingeschränkte Rolle für die Edge Function (ohne Anmeldung; die Funktion wechselt je Transaktion in diese Rolle)
do $$ begin
  if not exists (select from pg_roles where rolname = 'management_ai') then create role management_ai nologin; end if;
end $$;
grant management_ai to current_user;
grant usage on schema management_ai to management_ai;
-- Die Rolle selbst darf in ihrem Bereich NUR LESEN. Geschrieben wird ausschließlich über die drei festgelegten
-- Funktionen unten (einloesen, beruehren, protokollieren). Die Edge Function liest nur in READ-ONLY-Transaktionen.
grant select on management_ai.devices, management_ai.pair_codes, management_ai.calls to management_ai;
create policy management_ai_devices on management_ai.devices for select to management_ai using (true);
create policy management_ai_codes on management_ai.pair_codes for select to management_ai using (true);
create policy management_ai_calls on management_ai.calls for select to management_ai using (true);
-- anon und authenticated erhalten ausdrücklich keinen Zugriff
revoke all on all tables in schema management_ai from anon, authenticated;

-- Schreibschutz für die gesamte Transaktion: Hält die laufende Transaktion eine Schreibsperre (INSERT/UPDATE/DELETE/
-- TRUNCATE oder stärker) auf irgendeiner Tabelle AUSSERHALB von management_ai, wird sie abgebrochen und vollständig
-- zurückgenommen. Grund: An PUBLIC vergebene Rechte (z. B. von Erweiterungen) erbt in PostgreSQL jede Rolle; sie lassen
-- sich für eine einzelne Rolle nicht entziehen. Jeder Schreibzugriff braucht aber eine solche Sperre bis zum Ende der
-- Transaktion – das wird hier geprüft, unabhängig von Rechten.
create or replace function management_ai.schreibschutz_pruefen() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from pg_catalog.pg_locks l join pg_catalog.pg_class c on c.oid = l.relation
     where l.pid = pg_catalog.pg_backend_pid() and l.locktype = 'relation' and l.granted
       and l.database = (select d.oid from pg_catalog.pg_database d where d.datname = pg_catalog.current_database())
       and l.mode in ('RowExclusiveLock', 'ShareUpdateExclusiveLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')
       and c.relnamespace <> 'management_ai'::regnamespace
       and not exists (select 1 from pg_catalog.pg_class t where t.reltoastrelid = c.oid and t.relnamespace = 'management_ai'::regnamespace))
  then
    raise exception 'vl_schreibschutz' using errcode = '42501';
  end if;
end $$;
create or replace function management_ai.schreibschutz_ausloeser() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform management_ai.schreibschutz_pruefen();
  return null;
end $$;
-- Marke: jede Schreibfunktion trägt hier eine Zeile ein und löscht sie sofort wieder (Tabelle bleibt leer). Dadurch wird
-- die Prüfung beim Abschluss der Transaktion IMMER ausgelöst – auch wenn die Funktion sonst nichts schreibt.
create table if not exists management_ai.schreibschutz_marke (tx xid8 not null);
alter table management_ai.schreibschutz_marke enable row level security;
-- Prüfung beim Abschluss jeder Transaktion, die in management_ai schreibt (auch nach späteren Anweisungen derselben Transaktion)
create constraint trigger vl_schreibschutz after insert or update or delete on management_ai.schreibschutz_marke deferrable initially deferred for each row execute function management_ai.schreibschutz_ausloeser();
create constraint trigger vl_schreibschutz after insert or update or delete on management_ai.devices deferrable initially deferred for each row execute function management_ai.schreibschutz_ausloeser();
create constraint trigger vl_schreibschutz after insert or update or delete on management_ai.pair_codes deferrable initially deferred for each row execute function management_ai.schreibschutz_ausloeser();
create constraint trigger vl_schreibschutz after insert or update or delete on management_ai.calls deferrable initially deferred for each row execute function management_ai.schreibschutz_ausloeser();
revoke all on function management_ai.schreibschutz_pruefen() from public;
revoke all on function management_ai.schreibschutz_ausloeser() from public;
grant execute on function management_ai.schreibschutz_pruefen() to management_ai;

-- Die einzigen Schreibvorgänge der Edge Function: feste Anweisungen NUR auf Tabellen in management_ai, Werte nur als
-- Parameter, leerer Suchpfad. Jede Funktion prüft am Ende zusätzlich den Schreibschutz der ganzen Transaktion.
create or replace function management_ai.einloesen(p_code_hash text, p_name text, p_token_hash text, p_now timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  update management_ai.pair_codes set used_at = p_now where code_hash = p_code_hash and used_at is null and expires_at > p_now;
  ok := found;
  if ok then
    insert into management_ai.devices (name, token_hash, created_at) values (p_name, p_token_hash, p_now);
  end if;
  insert into management_ai.schreibschutz_marke (tx) values (pg_catalog.pg_current_xact_id());
  delete from management_ai.schreibschutz_marke where tx = pg_catalog.pg_current_xact_id();
  perform management_ai.schreibschutz_pruefen();
  return ok;
end $$;
create or replace function management_ai.beruehren(p_token_hash text, p_now timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update management_ai.devices set last_used_at = p_now where token_hash = p_token_hash;
  insert into management_ai.schreibschutz_marke (tx) values (pg_catalog.pg_current_xact_id());
  delete from management_ai.schreibschutz_marke where tx = pg_catalog.pg_current_xact_id();
  perform management_ai.schreibschutz_pruefen();
end $$;
create or replace function management_ai.protokollieren(p_token_hash text, p_now timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into management_ai.calls (token_hash, at) values (p_token_hash, p_now);
  insert into management_ai.schreibschutz_marke (tx) values (pg_catalog.pg_current_xact_id());
  delete from management_ai.schreibschutz_marke where tx = pg_catalog.pg_current_xact_id();
  perform management_ai.schreibschutz_pruefen();
end $$;
revoke all on function management_ai.einloesen(text, text, text, timestamptz) from public;
revoke all on function management_ai.beruehren(text, timestamptz) from public;
revoke all on function management_ai.protokollieren(text, timestamptz) from public;
grant execute on function management_ai.einloesen(text, text, text, timestamptz) to management_ai;
grant execute on function management_ai.beruehren(text, timestamptz) to management_ai;
grant execute on function management_ai.protokollieren(text, timestamptz) to management_ai;

-- Kopplungscode erzeugen (Admin, z. B. im SQL-Editor): select management_ai.new_pair_code();
-- liefert einen 8-stelligen Code, 10 Minuten gültig; gespeichert wird nur der Hash.
create or replace function management_ai.new_pair_code() returns text
language plpgsql security invoker set search_path = management_ai, pg_temp as $$
-- gen_random_uuid nutzt einen kryptografisch sicheren Zufallsgenerator (random() wäre vorhersagbar)
declare c text := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint) % 100000000)::text, 8, '0');
begin
  insert into management_ai.pair_codes (code_hash, expires_at)
    values (encode(sha256(convert_to('vivalink-pair:' || c, 'UTF8')), 'hex'), now() + interval '10 minutes');
  delete from management_ai.calls where at < now() - interval '2 days';
  return c;
end $$;
revoke all on function management_ai.new_pair_code() from public;

-- Gerät widerrufen: update management_ai.devices set revoked_at = now() where name = '…';
-- Rückbau (vollständig): drop schema management_ai cascade; drop owned by management_ai; drop role management_ai;
