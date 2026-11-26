-- KÜNSTLICHE Verwaltungsdatenbank für die getrennte Testumgebung (keine echten Daten, keine echte Struktur):
-- Basistabellen MIT künstlichen Personendaten (um zu prüfen, dass davon nichts übertragen wird),
-- Testkonten und Demo-Meetups (müssen herausgefiltert sein) und „vorhandene Auswertungen“ als Views/Funktion,
-- so wie eine Verwaltung sie typischerweise schon für ihr Dashboard hat. Die echte Zuordnung folgt erst nach der
-- lesenden Bestandsaufnahme der echten Verwaltung.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, email text not null, phone text,
  is_test_account boolean not null default false,
  created_at timestamptz not null, last_seen_at timestamptz
);
create table public.meetups (id serial primary key, title text not null, starts_at timestamptz not null, is_demo boolean not null default false, capacity int not null default 12);
create table public.meetup_participants (
  meetup_id int not null references public.meetups, profile_id uuid not null references public.profiles,
  status text not null check (status in ('angemeldet', 'teilgenommen', 'abgesagt', 'nicht_erschienen')),
  created_at timestamptz not null default now()
);
create table public.invitations (id serial primary key, inviter_id uuid references public.profiles, invitee_email text not null, sent_at timestamptz not null, accepted_at timestamptz);
create table public.payments (id serial primary key, profile_id uuid references public.profiles, amount_cents int not null, kind text not null check (kind in ('zahlung', 'erstattung')), created_at timestamptz not null);

-- 120 künstliche Personen über 60 Tage verteilt, jede 10. ist ein Testkonto
insert into public.profiles (full_name, email, phone, is_test_account, created_at, last_seen_at)
select 'Testperson ' || i, 'person' || i || '@example.invalid', '+00 000 ' || lpad(i::text, 6, '0'), i % 10 = 0,
       now() - make_interval(days => 60 - (i / 2)), now() - make_interval(days => i % 45)
from generate_series(1, 120) i;
-- Meetups: vergangenes, nächstes und ein Demo-Meetup (darf nirgends zählen)
insert into public.meetups (title, starts_at, is_demo) values
  ('Meetup vergangen', now() - interval '6 days', false),
  ('Meetup nächstes', now() + interval '8 days', false),
  ('Demo-Meetup', now() + interval '3 days', true);
insert into public.meetup_participants (meetup_id, profile_id, status)
select 1, id, case when n % 5 = 0 then 'nicht_erschienen' when n % 7 = 0 then 'abgesagt' else 'teilgenommen' end
from (select id, row_number() over (order by created_at) n from public.profiles) p where n <= 30;
insert into public.meetup_participants (meetup_id, profile_id, status)
select 2, id, 'angemeldet' from (select id, row_number() over (order by created_at desc) n from public.profiles) p where n <= 25;
insert into public.meetup_participants (meetup_id, profile_id, status)
select 3, id, 'angemeldet' from (select id, row_number() over (order by created_at) n from public.profiles) p where n <= 40;
insert into public.invitations (inviter_id, invitee_email, sent_at, accepted_at)
select (select id from public.profiles order by created_at limit 1), 'gast' || i || '@example.invalid', now() - make_interval(days => i % 20), case when i % 3 = 0 then now() - make_interval(days => i % 20) end
from generate_series(1, 60) i;
insert into public.payments (profile_id, amount_cents, kind, created_at)
select (select id from public.profiles order by created_at limit 1), 900, case when i % 9 = 0 then 'erstattung' else 'zahlung' end, now() - make_interval(days => i)
from generate_series(1, 40) i;

-- ===== „Vorhandene Auswertungen“ (Dashboard der Verwaltung), Testkonten und Demo-Meetups ausgeschlossen =====
create view public.admin_stats_daily as
select d::date as day,
  (select count(*) from public.profiles p where not p.is_test_account and p.created_at < d + interval '1 day') as registrations_total,
  (select count(*) from public.profiles p where not p.is_test_account and p.created_at >= d - interval '6 days' and p.created_at < d + interval '1 day') as registrations_7d,
  (select count(*) from public.profiles p where not p.is_test_account and p.last_seen_at >= d - interval '29 days' and p.last_seen_at < d + interval '1 day') as active_users_30d
from generate_series(current_date - 30, current_date, interval '1 day') d;

create view public.admin_meetup_overview as
select
  (select count(*) from public.meetup_participants mp join public.meetups m on m.id = mp.meetup_id join public.profiles p on p.id = mp.profile_id
     where not m.is_demo and not p.is_test_account and mp.status = 'angemeldet' and m.starts_at = (select min(starts_at) from public.meetups where not is_demo and starts_at > now())) as next_signups,
  (select count(*) from public.meetup_participants mp join public.meetups m on m.id = mp.meetup_id join public.profiles p on p.id = mp.profile_id
     where not m.is_demo and not p.is_test_account and mp.status = 'teilgenommen' and m.starts_at = (select max(starts_at) from public.meetups where not is_demo and starts_at <= now())) as last_attended,
  (select count(*) from public.meetup_participants mp join public.meetups m on m.id = mp.meetup_id join public.profiles p on p.id = mp.profile_id
     where not m.is_demo and not p.is_test_account and mp.status in ('abgesagt', 'nicht_erschienen') and m.starts_at = (select max(starts_at) from public.meetups where not is_demo and starts_at <= now())) as last_noshow,
  (select (m.starts_at at time zone 'Europe/Berlin')::date - (now() at time zone 'Europe/Berlin')::date from public.meetups m where not m.is_demo and m.starts_at > now() order by m.starts_at limit 1) as next_days,
  (select m.capacity from public.meetups m where not m.is_demo and m.starts_at > now() order by m.starts_at limit 1) as next_capacity;

create view public.admin_invitation_stats as
select d::date as day,
  (select count(*) from public.invitations i where i.sent_at >= d - interval '6 days' and i.sent_at < d + interval '1 day') as invites_7d,
  (select round(100.0 * count(*) filter (where accepted_at is not null) / nullif(count(*), 0), 1) from public.invitations i where i.sent_at >= d - interval '29 days' and i.sent_at < d + interval '1 day') as acceptance_rate
from generate_series(current_date - 30, current_date, interval '1 day') d;

create function public.admin_finance_summary() returns table (payments_30d_eur numeric, refunds_30d_eur numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(amount_cents) filter (where kind = 'zahlung'), 0) / 100.0, coalesce(sum(amount_cents) filter (where kind = 'erstattung'), 0) / 100.0
  from public.payments where created_at >= now() - interval '30 days'
$$;

-- Eine Auswertung MIT Personendaten (darf nie erreichbar sein; nicht in mapping.json)
create view public.admin_user_list as select full_name, email, phone, created_at from public.profiles;

-- Admin-Funktion mit einer Adresse im Programmcode (für den Test der Unkenntlichmachung in der zweiten Bestandsaufnahme)
create function public.admin_kontakt() returns text language sql as $$ select 'leitung@example.invalid'::text $$;
