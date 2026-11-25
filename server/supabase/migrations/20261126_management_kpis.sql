-- Vivalink-Verwaltung: Gerätezugänge für die Management AI (nur lesend, zusammengefasste Kennzahlen).
-- VORLAGE – nur nach gesonderter Freigabe des Gründers ausführen, zuerst in der Supabase-Testumgebung.
-- Keine Personendaten. RLS aktiv, keine Policies: Zugriff ausschließlich über die Edge Function (service role).
create table if not exists management_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create table if not exists management_pair_codes (
  code_hash text primary key,
  expires_at timestamptz not null,
  used_at timestamptz
);
create table if not exists management_calls (
  token_hash text not null,
  at timestamptz not null default now()
);
create index if not exists management_calls_idx on management_calls (token_hash, at);
alter table management_devices enable row level security;
alter table management_pair_codes enable row level security;
alter table management_calls enable row level security;
-- Rückbau: drop table management_calls, management_pair_codes, management_devices;
