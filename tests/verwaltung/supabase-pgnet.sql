-- Nachbildung des in Supabase vorgefundenen Zustands zweier Erweiterungen (nur Struktur, künstlich, ohne Daten):
-- Netzwerk-Erweiterung: Schema für alle nutzbar, Anfrage-Warteschlange und Antworttabelle für alle (PUBLIC) beschreibbar;
-- Zeitplan-Erweiterung: Protokolltabelle für alle löschbar, Schema aber ohne Zugriff für alle.
-- Als Erweiterungsmitglied registriert (Platzhalter-Erweiterung plpgsql, da die echten Erweiterungen hier nicht installiert sind).
create schema net;
grant usage on schema net to public;
create table net.http_request_queue (id bigserial primary key, method text, url text, headers jsonb, body bytea, timeout_milliseconds int);
create table net._http_response (id bigint, status_code int, content text, created timestamptz default now());
grant all on net.http_request_queue, net._http_response to public;
grant usage on sequence net.http_request_queue_id_seq to public;
create function net.http_post(url text) returns bigint language sql as 'insert into net.http_request_queue (method, url) values (''POST'', url) returning id';
alter extension plpgsql add table net.http_request_queue;
alter extension plpgsql add table net._http_response;
create schema cron;
revoke all on schema cron from public;
create table cron.job_run_details (runid bigint, status text);
grant delete on cron.job_run_details to public;
alter extension plpgsql add table cron.job_run_details;
