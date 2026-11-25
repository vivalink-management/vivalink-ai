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
grant select, insert, update on management_ai.devices, management_ai.pair_codes to management_ai;
grant select, insert on management_ai.calls to management_ai;
create policy management_ai_devices on management_ai.devices for all to management_ai using (true) with check (true);
create policy management_ai_codes on management_ai.pair_codes for all to management_ai using (true) with check (true);
create policy management_ai_calls on management_ai.calls for all to management_ai using (true) with check (true);
-- anon und authenticated erhalten ausdrücklich keinen Zugriff
revoke all on all tables in schema management_ai from anon, authenticated;

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
