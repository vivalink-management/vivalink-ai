// Werkzeuge für die Verwaltungs-Gegenstelle (ändern selbst NICHTS an einer Datenbank; sie erzeugen nur Dateien bzw. SQL-Text).
//   node scripts/verwaltung.mjs inventory                    → lesende Bestandsaufnahme-SQL (nur Strukturangaben, keine Daten)
//   node scripts/verwaltung.mjs grants [mapping.json]        → Leserechte der Rolle management_ai auf die zugeordneten Auswertungen
//   node scripts/verwaltung.mjs bundle [mapping.json] <ziel> → Bereitstellungsordner (Edge Function + Migration + Rechte)
//   node scripts/verwaltung.mjs check [mapping.json]         → Zuordnung prüfen
//   node scripts/verwaltung.mjs dryrun <mapping.json> [zusatz.sql …] → Probelauf ohne bleibende Wirkung (alles wird zurückgenommen)
//   node scripts/verwaltung.mjs facts <fragen.json>          → datensparsame zweite Bestandsaufnahme ({functions, tables, terms})
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KPI_KEYS } from "../server/kpi-core.mjs";
import { parseMapping } from "../server/kpi-pg.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FN = join(ROOT, "server/supabase/functions/management-kpis");
const MIGRATION = join(ROOT, "server/supabase/migrations/20261126_management_kpis.sql");
const load = (f) => JSON.parse(readFileSync(f || join(FN, "mapping.json"), "utf8"));

export function grantsSql(mapping) {
  const M = parseMapping(mapping, KPI_KEYS);
  if (M.errors.length) throw new Error("mapping.json fehlerhaft: " + M.errors.join("; "));
  const q = (s) => s.split(".").map((x) => '"' + x + '"').join(".");
  const out = ["-- Leserechte der Rolle management_ai NUR auf die in mapping.json zugeordneten, vorhandenen Auswertungen.", "-- Erzeugt von scripts/verwaltung.mjs – keine Rechte auf Basistabellen."];
  const schemas = new Set(),
    objs = new Set();
  for (const e of M.entries) {
    const schema = e.source.includes(".") ? e.source.split(".")[0] : "public";
    schemas.add(schema);
    objs.add((e.fn ? "function " : "table ") + q(e.source.includes(".") ? e.source : "public." + e.source) + (e.fn ? "()" : ""));
  }
  for (const s of schemas) out.push(`grant usage on schema "${s}" to management_ai;`);
  for (const o of objs) out.push(o.startsWith("function") ? `grant execute on ${o} to management_ai;` : `grant select on ${o.replace(/^table /, "")} to management_ai;`);
  return out.join("\n") + "\n";
}

/* Bestandsaufnahme: liest ausschließlich Strukturangaben aus dem Systemkatalog (Namen, Spalten, Datentypen).
   Bewusst NICHT enthalten: Tabelleninhalte, Zeilenzahlen (wären Unternehmenskennzahlen), View-Definitionen und
   Kommentare (könnten Werte wie E-Mail-Adressen enthalten). Ein einzelnes SELECT kann nichts verändern. */
export const INVENTORY_SQL = `-- Vivalink Management AI: lesende Bestandsaufnahme der vorhandenen Auswertungen.
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
`;

/* Zweite Bestandsaufnahme, datensparsam: Die Ausgabe besteht AUSSCHLIESSLICH aus Werten, die wir selbst vorgeben.
   - Funktionen (nur die genannten): welche Begriffe aus unserer Liste im Funktionsrumpf vorkommen.
   - Tabellenregeln (CHECK, nur die genannten Tabellen): welche Codes aus unserer Positivliste vorkommen, dazu nur die
     ANZAHL weiterer, unbekannter Zeichenketten (nie deren Inhalt). Statt des Regelnamens: Tabellenname + laufende Nummer.
   Nichts aus der Datenbank wird als Text ausgegeben, außer den von uns genannten Tabellen-/Funktionsnamen.
   Nur Systemkatalog, keine Tabelleninhalte, keine Änderungen. Echte Namen nur im privaten Repository. */
const IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const TERM_RE = /^('[a-z_]{1,30}'|[a-z_][a-z0-9_.]{0,40}(\(\))?)$/;
const CODE_RE = /^[a-z_]{1,30}$/;
export function factsSql({ functions = [], tables = [], terms = [], codes = [] }) {
  for (const n of [...functions, ...tables]) if (!IDENT_RE.test(n)) throw new Error("Ungültiger Name: " + n);
  for (const t of terms) if (!TERM_RE.test(t)) throw new Error("Ungültiger Begriff: " + t);
  for (const c of codes) if (!CODE_RE.test(c)) throw new Error("Ungültiger Code: " + c);
  if (!functions.length && !tables.length) throw new Error("Keine Namen angegeben");
  const list = (a) => a.map((x) => `'${x}'`).join(", ") || "''";
  const pattern = (t) => {
    if (t.startsWith("'")) return "'" + t.slice(1, -1) + "'";
    const body = t.replace(/\./g, "\\.").replace(/\(\)$/, "\\s*\\(");
    return "\\m" + body + (t.endsWith("()") ? "" : "\\M");
  };
  const label = (t) => (t.startsWith("'") ? "code:" + t.slice(1, -1) : t);
  const checks = terms.map((t) => `case when d ~* $t$${pattern(t)}$t$ then '${label(t)}' end`);
  const codeChecks = codes.map((c) => `case when r.d ~ $t$'${c}'$t$ then '${c}' end`);
  return `-- Vivalink Management AI: zweite lesende Bestandsaufnahme (datensparsam, nur Positivlisten).
-- Ausgabe: je Funktion nur Begriffe aus unserer Liste; je Tabellenregel nur Codes aus unserer Positivliste und die
-- ANZAHL weiterer Zeichenketten (nie deren Inhalt). Keine Tabelleninhalte, keine Änderungen.
with f as (
  select p.proname as name, p.prosecdef as definer, p.prosrc as d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.proname in (${list(functions)})
),
r as (
  select c.relname as tab, row_number() over (partition by c.relname order by k.oid) as nr, pg_get_constraintdef(k.oid) as d
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and k.contype = 'c' and c.relname in (${list(tables)})
)
select 'funktion' as art, name,
       concat_ws(', ', case when definer then 'security_definer' end${checks.length ? ",\n         " + checks.join(",\n         ") : ""}) as befund
from f
union all
select 'regel', r.tab || ' #' || r.nr,
       concat_ws(', '${codeChecks.length ? ",\n         " + codeChecks.join(",\n         ") : ""},
         (select case when count(*) > 0 then 'weitere: ' || count(*) end
            from regexp_matches(r.d, $re$'([^']*)'$re$, 'g') as m
            where m[1] <> all (array[${codes.map((c) => `'${c}'`).join(", ") || "''"}]::text[])))
from r
order by 1, 2;
`;
}

/* Probelauf OHNE bleibende Wirkung (Free-Tarif, kein eigenes Testprojekt). Aufbau:
     BEGIN  →  Zeitlimits  →  Ergebnistabelle (temporär, verschwindet mit der Transaktion)
     DO-Block: Fingerabdruck VORHER → [Sicherungspunkt: Einrichtung + Prüfungen → absichtliche Ausnahme = Rücknahme]
               → Fingerabdruck NACHHER, Schreibzähler → Ergebniszeilen
     SELECT Ergebnis  →  ROLLBACK (ausdrücklich)
   Alle Fehler werden im DO-Block abgefangen, damit das abschließende ROLLBACK immer ausgeführt wird; selbst wenn
   nicht, wird eine abgebrochene Transaktion nie bestätigt. Ausgegeben werden nur Prüfungen (ja/nein/Fehlertext),
   keine Kennzahlen und keine Daten. */
const FP = (ohne) => `(select md5(coalesce(string_agg(x, '|' order by x), '')) from (
      select 'c:' || n.nspname || '.' || c.relname || ':' || c.relkind::text || ':' || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text as x
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and n.nspname not like 'pg\\_temp%' and n.nspname not like 'pg\\_toast\\_temp%'
      union all
      select 'f:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || md5(coalesce(p.prosrc, '')) || ':' || coalesce(p.proacl::text, '') || ':' || p.prosecdef::text
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\\_temp%'
      union all
      select 'n:' || nspname || ':' || coalesce(nspacl::text, '') from pg_namespace where nspname not like 'pg\\_temp%' and nspname not like 'pg\\_toast\\_temp%'
      union all
      select 'r:' || rolname || ':' || rolsuper::text || ':' || rolcanlogin::text || ':' || rolbypassrls::text from pg_roles
      union all
      select 'm:' || pg_get_userbyid(roleid) || '>' || pg_get_userbyid(member) from pg_auth_members
      union all
      select 'p:' || schemaname || '.' || tablename || '.' || policyname || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') from pg_policies
      union all
      select 't:' || tgrelid::text || '.' || tgname || ':' || tgenabled::text from pg_trigger where not tgisinternal
      union all
      select 'e:' || evtname || ':' || evtenabled::text from pg_event_trigger
      union all
      select 'd:' || defaclrole::text || ':' || defaclnamespace::text || ':' || defaclobjtype::text || ':' || coalesce(defaclacl::text, '') from pg_default_acl
    ) s${ohne ? " where x !~ 'management_ai'" : ""})`;
const FINGERPRINT = FP(false);
export function dryRunSql(mapping, extraSql = [], { rlsAutoMd5 = [], einrichtung = false } = {}) {
  const E = einrichtung; // true: dauerhafte Einrichtung (COMMIT nur bei vollständigem Erfolg), false: Probelauf (ROLLBACK)
  for (const h of rlsAutoMd5) if (!/^[0-9a-f]{32}$/.test(h)) throw new Error("Ungültige Prüfsumme");
  const M = parseMapping(mapping, KPI_KEYS);
  if (M.errors.length) throw new Error("mapping.json fehlerhaft: " + M.errors.join("; "));
  // ganze Kommentarzeilen entfernen (z. B. Rückbau-Hinweise), damit nur ausführbare Anweisungen im Probelauf stehen
  const body = [readFileSync(MIGRATION, "utf8"), ...extraSql, grantsSql(mapping)]
    .join("\n")
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
  const tag = "$vlprobe$",
    inner = "$vlsql$";
  if (body.includes(tag) || body.includes(inner)) throw new Error("Marke kommt im SQL vor");
  if (/\b(commit|rollback|savepoint)\b/i.test(body.replace(/--.*$/gm, ""))) throw new Error("Transaktionsbefehle im Einrichtungs-SQL sind nicht erlaubt");
  const q = (x) => x.replace(/'/g, "''");
  const sources = [...new Set(M.entries.map((e) => (e.source.includes(".") ? e.source : "public." + e.source)))];
  const keyChecks = M.entries
    .map((e) => {
      const src = (e.source.includes(".") ? e.source : "public." + e.source).split(".").map((x) => `"${x}"`).join(".") + (e.fn ? "()" : "");
      // Abfrage wie die Gegenstelle (alle Zeilen, nur die Wertspalte); leeres Ergebnis bzw. NULL ist KEIN Fehler
      return `    begin
      execute 'select count("${e.value}") from ${q(src)} as q' into n;
      zeilen := zeilen || ('Kennzahl ${e.key}|' || case when n > 0 then 'funktioniert (Werte vorhanden)' else 'funktioniert (derzeit keine Werte)' end);
    exception when others then
      zeilen := zeilen || ('Kennzahl ${e.key}|FEHLER E-KZ (SQLSTATE ' || sqlstate || ')'); fehler := fehler + 1;
    end;`;
    })
    .join("\n");
  const kopf = E
    ? `-- Vivalink Management AI: DAUERHAFTE EINRICHTUNG der Verwaltungsanbindung (nur nach ausdrücklicher Freigabe ausführen).
-- Gleiche Prüfungen wie der Probelauf. Gespeichert wird NUR, wenn alle Prüfungen bestehen; sonst wird innerhalb der
-- Transaktion alles zurückgenommen und das abschließende COMMIT speichert nichts. Neue Objekte nur im Schema und in der
-- Rolle management_ai; bestehende Tabellen, Funktionen, Rechte und Daten werden nicht verändert.
-- Bereits eingerichtet → Abbruch ohne Änderung (für eine Neueinrichtung zuerst den Rückbau ausführen).
`
    : "";
  return `${kopf}-- Vivalink Management AI: ${E ? "Einrichtung" : "PROBELAUF"} der Verwaltungsanbindung${E ? "" : " – ohne bleibende Wirkung"}.
-- Läuft vollständig in einer ausdrücklich gestarteten Transaktion, die am Ende mit ROLLBACK zurückgenommen wird.
-- Schreibt in keine bestehende Tabelle und ruft keine Zahlungs-, Buchungs-, Benachrichtigungs- oder Netzwerkfunktionen auf.
-- Ereignistrigger werden vorab geprüft (unbekannte → Abbruch ohne Änderung). Die Teilnachweise (Fingerabdruck,
-- Schreibzähler) decken nur die geprüften Bereiche ab; maßgeblich für „nichts bleibt zurück“ ist das ROLLBACK.
-- Ausgabe: eine Tabelle mit Prüfungen (ja/nein bzw. feste Fehlercodes) – keine Kennzahlen, keine Personendaten,
-- keine Fehlertexte der Datenbank. Fehlercodes: E-ET unbekannte Ereignistrigger (Abbruch VOR jeder Änderung),
-- E-EINR Einrichtung fehlgeschlagen, E-KZ Kennzahl technisch fehlerhaft, E-PRF Prüfung abgebrochen, E-UNERW unerwartet;
-- jeweils mit dem standardisierten SQLSTATE-Code (5 Zeichen, ohne Inhalte).
begin;
set local statement_timeout = '60s';
set local lock_timeout = '3s';
do ${tag}
declare
  n bigint;
  fehler int := 0;
  zeilen text[] := '{}';
  vorher text;
  nachher text;
  basis int;
  api boolean;
  schreib bigint;
  schreib0 bigint;
  vorher_ohne text;
  et_bekannt int;
  et_unbekannt int;
  et_namen text;
  et_fremd text;
  et_rls boolean;
  et_grund text;
begin
 begin

  -- Schreibzähler zu Beginn (enthält ggf. noch nicht verbuchte Vorgänge früherer Abfragen – deshalb zählt die Differenz)
  select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) into schreib0 from pg_stat_xact_user_tables;
  vorher := ${FINGERPRINT};
  vorher_ohne := ${FP(true)};
  -- Ereignistrigger (laufen bei Strukturänderungen mit) VOR jeder Änderung prüfen – nicht nur nach Namen, sondern nach
  -- tatsächlicher Zuordnung. Als unbedenklich gilt ein aktiver Ereignistrigger nur, wenn ALLES zutrifft:
  --  * Name, Ereignis und Funktion entsprechen genau dem Supabase-Standard (Funktion im Schema extensions, erwarteter Name),
  --  * die Befehlsfilter (WHEN TAG) stimmen: issue_pg_net/cron nur CREATE EXTENSION, issue_graphql_placeholder nur
  --    DROP EXTENSION, issue_pg_graphql_access nur CREATE EXTENSION (aktuelle Supabase-Form seit Migration
  --    20260421000001_rescope_pg_graphql_access_trigger) oder – ältere Form – nur CREATE FUNCTION mit Inhaltsprüfung,
  --  * Trigger, die bei unseren Befehlen anspringen können (pgrst_ddl_watch, pgrst_drop_watch, issue_pg_graphql_access),
  --    enthalten im Funktionsrumpf (ohne Kommentare und Zeichenketten) keine Netzwerk-, Datei- oder Hintergrundaufrufe
  --    (http, net., dblink, pg_background, copy, lo_, pg_read, pg_write, pg_file); pgrst_* zusätzlich keine Schreib-/
  --    Strukturbefehle und müssen eine Benachrichtigung (NOTIFY) enthalten. NOTIFY wird nur beim Bestätigen zugestellt.
  --  * ensure_rls (Funktion public.rls_auto_enable, „Row Level Security für neue Tabellen automatisch aktivieren“) nur, wenn:
  --    Ereignis ddl_command_end, Befehlsfilter nur CREATE TABLE / CREATE TABLE AS / SELECT INTO, Sprache plpgsql,
  --    Prüfsumme des Funktionsrumpfs exakt wie bei der Diagnose festgestellt, im Rumpf (ohne Kommentare/Zeichenketten)
  --    keine Netzwerk-, Datei-, Schreib-, Rechte- oder Strukturbefehle außer EXECUTE/RAISE, und ALLE Zeichenketten im
  --    Rumpf sind unbedenklich (keine solchen Befehlswörter außer den drei Befehlsnamen des Filters) und mindestens eine
  --    enthält „enable row level security“ – damit kann der Trigger höchstens RLS für eine neu angelegte Tabelle einschalten.
  -- Jeder andere, veränderte oder abweichend zugeordnete aktive Ereignistrigger → Abbruch ohne jede Änderung (E-ET).
  -- Ausgegeben werden dann nur die Namen (Bezeichner) der abweichenden Trigger, nie ihr Inhalt.
  select count(*) filter (where ok), count(*) filter (where not ok),
         coalesce(string_agg(evtname, ', ' order by evtname) filter (where not ok and bekannt), ''),
         coalesce(string_agg(evtname, ', ' order by evtname) filter (where not ok and not bekannt), ''),
         coalesce(bool_or(ok and rls), false)
    into et_bekannt, et_unbekannt, et_namen, et_fremd, et_rls
  from (
    select e.evtname,
      e.evtname in ('pgrst_ddl_watch', 'pgrst_drop_watch', 'issue_pg_net_access', 'issue_pg_cron_access', 'issue_pg_graphql_access', 'issue_graphql_placeholder', 'ensure_rls') as bekannt,
      e.evtname = 'ensure_rls' as rls,
      coalesce(
        (e.evtname = 'ensure_rls' and n.nspname = 'public' and p.proname = 'rls_auto_enable' and e.evtevent = 'ddl_command_end'
          and e.evttags is not null and e.evttags <@ array['CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO'] and l.lanname = 'plpgsql'
          and md5(coalesce(p.prosrc, '')) in (${rlsAutoMd5.map((h) => `'${h}'`).join(", ") || "''"})
          and b.rumpf !~* '\\m(http\\w*|dblink\\w*|pg_background\\w*|copy|insert|update|delete|truncate|merge|grant|revoke|create|drop|call|perform|set_config|notify|listen|lo_\\w+|pg_read\\w*|pg_write\\w*|pg_file\\w*|dblink)\\M'
          and b.rumpf !~* '\\mnet\\.'
          and not exists (select 1 from regexp_matches(coalesce(p.prosrc, ''), '''([^'']*)''', 'g') as m
                          where upper(m[1]) not in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
                            and (m[1] ~* '\\m(http\\w*|dblink\\w*|pg_background\\w*|copy|insert|update|delete|truncate|merge|grant|revoke|create|drop|call|perform|set_config|notify|lo_\\w+|pg_read\\w*|pg_write\\w*|pg_file\\w*)\\M' or m[1] ~* 'security\\s+definer|owner\\s+to|set\\s+role|session_authorization' or m[1] ~* '\\mnet\\.'))
          and exists (select 1 from regexp_matches(coalesce(p.prosrc, ''), '''([^'']*)''', 'g') as m where m[1] ~* 'enable\\s+row\\s+level\\s+security'))
        or
        n.nspname = 'extensions' and (
          (e.evtname = 'pgrst_ddl_watch' and e.evtevent = 'ddl_command_end' and p.proname = 'pgrst_ddl_watch')
          or (e.evtname = 'pgrst_drop_watch' and e.evtevent = 'sql_drop' and p.proname = 'pgrst_drop_watch')
          or (e.evtname = 'issue_pg_net_access' and e.evtevent = 'ddl_command_end' and p.proname = 'grant_pg_net_access' and e.evttags is not null and e.evttags <@ array['CREATE EXTENSION'])
          or (e.evtname = 'issue_pg_cron_access' and e.evtevent = 'ddl_command_end' and p.proname = 'grant_pg_cron_access' and e.evttags is not null and e.evttags <@ array['CREATE EXTENSION'])
          or (e.evtname = 'issue_graphql_placeholder' and e.evtevent = 'sql_drop' and p.proname = 'set_graphql_placeholder' and e.evttags is not null and e.evttags <@ array['DROP EXTENSION'])
          or (e.evtname = 'issue_pg_graphql_access' and e.evtevent = 'ddl_command_end' and p.proname = 'grant_pg_graphql_access' and e.evttags is not null
              and (e.evttags <@ array['CREATE EXTENSION'] or e.evttags <@ array['CREATE FUNCTION']))
        )
        and (e.evtname not in ('pgrst_ddl_watch', 'pgrst_drop_watch', 'issue_pg_graphql_access')
             or (e.evtname = 'issue_pg_graphql_access' and e.evttags <@ array['CREATE EXTENSION'])
             or (b.rumpf !~* '(\\mhttp|\\mnet\\.|\\mdblink|\\mpg_background|\\mcopy\\M|\\mlo_|\\mpg_read|\\mpg_write|\\mpg_file)'))
        and (e.evtname not in ('pgrst_ddl_watch', 'pgrst_drop_watch')
             or (b.rumpf ~* '\\mnotify\\M' and b.rumpf !~* '\\m(insert|update|delete|truncate|merge|create|alter|drop|grant|revoke|execute|perform|call|set_config|copy)\\M'))
      , false) as ok
    from pg_event_trigger e
    join pg_proc p on p.oid = e.evtfoid
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    cross join lateral (select regexp_replace(regexp_replace(coalesce(p.prosrc, ''), '--[^\\n]*', '', 'g'), '''[^'']*''', '''''', 'g') as rumpf) b
    where e.evtenabled <> 'D'
  ) t;
  zeilen := zeilen || ('Ereignistrigger: geprüft und unbedenklich (Supabase-Standard, Zuordnung und Inhalt passen)|' || et_bekannt);
  if et_rls then
    zeilen := zeilen || 'Ereignistrigger ensure_rls (RLS automatisch aktivieren): geprüft – kann höchstens RLS für neue Tabellen einschalten|ja'::text;
  elsif exists (select 1 from pg_event_trigger where evtname = 'ensure_rls' and evtenabled <> 'D') then
    -- Welche Einzelprüfung scheitert? Nur feste Kürzel, kein Inhalt:
    -- R1 Zuordnung (Schema/Funktion/Ereignis/Sprache), R2 Befehlsfilter, R3 Prüfsumme unbekannt, R4 Befehle im Rumpf,
    -- R5 bedenkliche Zeichenkette, R6 kein „enable row level security“
    select concat_ws(', ',
        case when not (n.nspname = 'public' and p.proname = 'rls_auto_enable' and e.evtevent = 'ddl_command_end' and l.lanname = 'plpgsql') then 'R1' end,
        case when not (e.evttags is not null and e.evttags <@ array['CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO']) then 'R2' end,
        case when md5(coalesce(p.prosrc, '')) not in (${rlsAutoMd5.map((h) => `'${h}'`).join(", ") || "''"}) then 'R3' end,
        case when b.rumpf ~* '\\m(http\\w*|dblink\\w*|pg_background\\w*|copy|insert|update|delete|truncate|merge|grant|revoke|create|drop|call|perform|set_config|notify|listen|lo_\\w+|pg_read\\w*|pg_write\\w*|pg_file\\w*|dblink)\\M' or b.rumpf ~* '\\mnet\\.' then 'R4' end,
        case when exists (select 1 from regexp_matches(coalesce(p.prosrc, ''), '''([^'']*)''', 'g') as m
                          where upper(m[1]) not in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
                            and (m[1] ~* '\\m(http\\w*|dblink\\w*|pg_background\\w*|copy|insert|update|delete|truncate|merge|grant|revoke|create|drop|call|perform|set_config|notify|lo_\\w+|pg_read\\w*|pg_write\\w*|pg_file\\w*)\\M' or m[1] ~* 'security\\s+definer|owner\\s+to|set\\s+role|session_authorization' or m[1] ~* '\\mnet\\.')) then 'R5' end,
        case when not exists (select 1 from regexp_matches(coalesce(p.prosrc, ''), '''([^'']*)''', 'g') as m where m[1] ~* 'enable\\s+row\\s+level\\s+security') then 'R6' end)
      into et_grund
      from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
      cross join lateral (select regexp_replace(regexp_replace(coalesce(p.prosrc, ''), '--[^\\n]*', '', 'g'), '''[^'']*''', '''''', 'g') as rumpf) b
     where e.evtname = 'ensure_rls';
    zeilen := zeilen || ('Ereignistrigger ensure_rls: nicht anerkannt, gescheiterte Prüfungen|' || coalesce(nullif(et_grund, ''), 'unbekannt'));
  end if;
  zeilen := zeilen || ('Ereignistrigger: unbekannt oder verändert|' || et_unbekannt
    || case when et_namen <> '' then ' (bekannter Name, aber abweichend: ' || et_namen || ')' else '' end
    || case when et_fremd <> '' then ' (unbekannter Name: ' || et_fremd || ')' else '' end
    || case when et_unbekannt > 0 then ' – ABBRUCH E-ET, nichts eingerichtet' else '' end);
  if et_unbekannt > 0 then
    fehler := fehler + 1;
    raise exception 'vl_probelauf_et';
  end if;${E ? `
  if exists (select 1 from pg_namespace where nspname = 'management_ai') or exists (select 1 from pg_roles where rolname = 'management_ai') then
    zeilen := zeilen || 'Bereits eingerichtet|ja – nichts verändert (für eine Neueinrichtung zuerst den Rückbau ausführen)'::text;
    fehler := fehler + 1;
    raise exception 'vl_probelauf_et';
  end if;` : ""}
  -- Sicherungspunkt: alles in diesem Block wird am Ende durch eine absichtliche Ausnahme zurückgenommen
  begin
    begin
      execute ${inner}${body}${inner};
      zeilen := zeilen || '${E ? "Einrichtung" : "Einrichtung (probeweise)"}|ok'::text;
    exception when others then
      zeilen := zeilen || ('${E ? "Einrichtung" : "Einrichtung (probeweise)"}|FEHLER E-EINR (SQLSTATE ' || sqlstate || ')'); fehler := fehler + 1;
      raise exception 'vl_probelauf_zuruecknehmen';
    end;
    -- Kennzahlen als eingeschränkte Rolle lesen
    set local role management_ai;
${keyChecks}
    reset role;
    -- Rechte: keine weitere Tabelle/View in public lesbar, kein Zugriff für die API-Rollen
    select count(*) into basis from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
       and (s.nspname || '.' || c.relname) not in (${sources.map((x) => `'${q(x)}'`).join(", ") || "''"})
       and has_table_privilege('management_ai', c.oid, 'select');
    select has_schema_privilege('anon', 'management_ai', 'usage') or has_schema_privilege('authenticated', 'management_ai', 'usage') into api;
    zeilen := zeilen || ('Rechte: weitere lesbare Tabellen der Verwaltung|' || case when basis = 0 then 'keine' else basis || ' (PROBLEM)' end);
    zeilen := zeilen || ('Rechte: Zugriff über die Supabase-API|' || case when api then 'ja (PROBLEM)' else 'nein' end);
    if basis > 0 or api then fehler := fehler + 1; end if;
    ${E ? "-- Einrichtung: nur bei einem Fehler zurücknehmen, sonst bleibt alles für das abschließende COMMIT erhalten\n    if fehler > 0 then raise exception 'vl_probelauf_zuruecknehmen'; end if;" : "raise exception 'vl_probelauf_zuruecknehmen';"}
  exception when others then
    if sqlerrm <> 'vl_probelauf_zuruecknehmen' then
      zeilen := zeilen || ('Prüfung abgebrochen|FEHLER E-PRF (SQLSTATE ' || sqlstate || ')'); fehler := fehler + 1;
    end if;
  end;
  -- Nachweise nach der Rücknahme des Sicherungspunkts
  nachher := ${FINGERPRINT};
  select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) - schreib0 into schreib from pg_stat_xact_user_tables;
  ${E ? `zeilen := zeilen || ('Teilnachweis: bestehende Tabellen, Funktionen, Rollen, Rechte, Richtlinien, Trigger unverändert (neu nur Schema und Rolle management_ai)|' || case when vorher_ohne = ${FP(true)} then 'ja' else 'NEIN (PROBLEM)' end);
  if vorher_ohne <> ${FP(true)} then fehler := fehler + 1; end if;` : "zeilen := zeilen || ('Teilnachweis: Tabellen, Funktionen, Rollen, Rechte, Richtlinien, Trigger nach der Rücknahme unverändert|' || case when vorher = nachher then 'ja' else 'NEIN (PROBLEM)' end);"}
  zeilen := zeilen || ('Teilnachweis: Schreibvorgänge in Tabellen (auch Warteschlangen für Benachrichtigungen/Netzwerk)|' || schreib);
  zeilen := zeilen || ('Hinweis|Die Teilnachweise decken nur die geprüften Bereiche ab und sind kein vollständiger Nachweis für das Ausbleiben jeder Nebenwirkung; maßgeblich ist das abschließende ${E ? "COMMIT nur bei Erfolg" : "ROLLBACK"}.'::text);
  if ${E ? "" : "vorher <> nachher or "}schreib <> 0 then fehler := fehler + 1; end if;${E ? `
  -- Problem erst nach der Einrichtung festgestellt → alles zurücknehmen (gesamter äußerer Block)
  if fehler > 0 then raise exception 'vl_einrichtung_zuruecknehmen'; end if;` : ""}
  exception when others then
    -- Sicherheitsnetz: jeder unerwartete Fehler wird gemeldet (nur Code), damit das abschließende ROLLBACK sicher ausgeführt wird
    if sqlerrm not in ('vl_probelauf_et', 'vl_einrichtung_zuruecknehmen') then
      zeilen := zeilen || ('Unerwarteter Fehler|FEHLER E-UNERW (SQLSTATE ' || sqlstate || ')'); fehler := fehler + 1;
    end if;
 end;
  zeilen := zeilen || ('GESAMT|' || case when fehler = 0 then '${E ? "OK – Anbindung eingerichtet (wird mit COMMIT dauerhaft gespeichert)" : "OK – alles wird mit ROLLBACK zurückgenommen"}' else 'PROBLEM (' || fehler || ') – ${E ? "nichts eingerichtet, alle Änderungen zurückgenommen" : "alles wird mit ROLLBACK zurückgenommen"}' end);
  -- Ergebnis ohne jede Strukturänderung weitergeben (transaktionslokale Einstellung, verschwindet mit dem ROLLBACK)
  perform set_config('vl.probelauf', array_to_string(zeilen, chr(10)), true);
end ${tag};
select split_part(z, '|', 1) as "Prüfung", substr(z, length(split_part(z, '|', 1)) + 2) as "Ergebnis"
  from unnest(string_to_array(current_setting('vl.probelauf', true), chr(10))) with ordinality as t(z, nr) order by nr;
${E ? "commit;" : "rollback;"}
`;
}

/* Diagnose der Ereignistrigger (nur lesend): je Trigger nur technische Eigenschaften – Ereignis, Befehlsfilter, Status,
   zugeordnete Funktion, Sprache, Eigentümer, Security Definer, eine Prüfsumme des Funktionsrumpfs (MD5, kein Inhalt) und
   welche Begriffe aus UNSERER Liste im Rumpf vorkommen (ohne Kommentare/Zeichenketten), außerdem ob der Rumpf auf eine
   bestimmte Erweiterung prüft (nur Namen aus unserer Liste). Kein Programmcode, keine Daten, keine Änderungen. */
export const ET_TERMS = ["notify", "insert", "update", "delete", "truncate", "merge", "create", "alter", "drop", "grant", "revoke", "execute", "perform", "call", "set_config", "copy", "http", "net.", "dblink", "pg_background", "lo_", "pg_read", "pg_write", "pg_file", "security label", "raise"];
export const ET_EXT = ["pg_graphql", "pg_cron", "pg_net", "pgsodium", "supabase_vault", "pg_stat_statements", "pgmq", "postgis", "pg_jsonschema"];
export function eventTriggerDiagSql() {
  const strip = "regexp_replace(regexp_replace(coalesce(p.prosrc, ''), '--[^\\n]*', '', 'g'), '''[^'']*''', '''''', 'g')";
  const term = (t) => `case when r.rumpf ~* $t$${t === "net." ? "\\mnet\\." : t.endsWith("_") ? "\\m" + t : "\\m" + t.replace(/ /g, "\\s+") + "\\M"}$t$ then '${t}' end`;
  const ext = (x) => `case when coalesce(p.prosrc, '') ~ $t$'${x}'$t$ then '${x}' end`;
  return `-- Vivalink Management AI: Diagnose der Ereignistrigger (nur lesend; kein Programmcode, keine Daten, keine Änderungen).
select e.evtname as trigger,
       e.evtevent as ereignis,
       coalesce(array_to_string(e.evttags, ', '), '(alle Befehle)') as befehlsfilter,
       case e.evtenabled when 'D' then 'aus' else 'aktiv' end as status,
       n.nspname || '.' || p.proname as funktion,
       l.lanname as sprache,
       pg_get_userbyid(p.proowner) as eigentuemer,
       p.prosecdef as security_definer,
       md5(coalesce(p.prosrc, '')) as rumpf_pruefsumme,
       concat_ws(', ', ${ET_TERMS.map(term).join(", ")}) as befehle_im_rumpf,
       concat_ws(', ', ${ET_EXT.map(ext).join(", ")}) as prueft_erweiterung
from pg_event_trigger e
join pg_proc p on p.oid = e.evtfoid
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
cross join lateral (select ${strip} as rumpf) r
order by 1;
`;
}

/* ---------- Bereitstellungspaket (alles nur als Text; ausgeführt wird nichts) ---------- */

/* Edge Function als EINE Datei (zum Einfügen im Supabase-Dashboard: Edge Functions › Deploy a new function › Via Editor).
   Enthält dieselbe, getestete Logik wie kpi-core.mjs und kpi-pg.mjs sowie die Zuordnung. */
export function edgeSingleFile(mapping) {
  const M = parseMapping(mapping, KPI_KEYS);
  if (M.errors.length) throw new Error("mapping.json fehlerhaft: " + M.errors.join("; "));
  const strip = (src) =>
    src
      .split("\n")
      .filter((l) => !/^import\s/.test(l))
      .join("\n")
      .replace(/^export\s+(async\s+function|function|const)\s/gm, "$1 ");
  const core = strip(readFileSync(join(ROOT, "server/kpi-core.mjs"), "utf8"));
  const pg = strip(readFileSync(join(ROOT, "server/kpi-pg.mjs"), "utf8"));
  const main = readFileSync(join(FN, "index.ts"), "utf8")
    .split("\n")
    .filter((l) => !/^import\s.*from\s+"\.\/(kpi-core|kpi-pg)\.mjs"/.test(l) && !/^import mapping from/.test(l))
    .join("\n");
  return `// Vivalink Management AI – Supabase Edge Function „management-kpis“ (EINE Datei, automatisch erzeugt; nicht von Hand ändern).
// Bereitstellung nur nach ausdrücklicher Freigabe. Einstellung im Dashboard: JWT-Prüfung AUS (verify_jwt = false),
// weil sich die App mit einem widerrufbaren Gerätezugang anmeldet. SUPABASE_DB_URL stellt Supabase automatisch bereit.
// @ts-nocheck
${main.replace(/^\/\/.*\n/gm, "").split("\n").filter((l) => /^import\s/.test(l)).join("\n")}
// ---- Zuordnung der Kennzahlen (aus mapping.json) ----
const mapping = ${JSON.stringify(mapping, null, 2)};
// ---- Logik aus server/kpi-core.mjs ----
${core}
// ---- Datenbankzugriff aus server/kpi-pg.mjs ----
${pg}
// ---- Edge Function (aus server/supabase/functions/management-kpis/index.ts) ----
${main.replace(/^\/\/.*\n/gm, "").split("\n").filter((l) => !/^import\s/.test(l)).join("\n")}
`;
}

/* Rückbau: entfernt ausschließlich Schema und Rolle management_ai (bestehende Objekte bleiben unberührt) */
export const RUECKBAU_SQL = `-- Vivalink Management AI: RÜCKBAU der Verwaltungsanbindung (nur nach Entscheidung des Gründers ausführen).
-- Entfernt nur das Schema management_ai (Gerätezugänge, Kopplungscodes, Kennzahl-Auswertungen) und die Rolle management_ai.
-- Bestehende Tabellen, Funktionen und Daten der Verwaltung werden nicht verändert. Danach die Edge Function löschen.
begin;
set local lock_timeout = '3s';
drop schema if exists management_ai cascade;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'management_ai') then
    execute 'drop owned by management_ai';
    execute 'drop role management_ai';
  end if;
end $$;
select 'Schema management_ai vorhanden' as "Prüfung", case when exists (select 1 from pg_namespace where nspname = 'management_ai') then 'ja (PROBLEM)' else 'nein' end as "Ergebnis"
union all
select 'Rolle management_ai vorhanden', case when exists (select 1 from pg_roles where rolname = 'management_ai') then 'ja (PROBLEM)' else 'nein' end;
commit;
`;

/* Kopplungscode (8 Ziffern, 10 Minuten gültig; gespeichert wird nur der Hash) */
export const KOPPLUNGSCODE_SQL = `-- Vivalink Management AI: Kopplungscode erzeugen (8 Ziffern, 10 Minuten gültig, nur einmal verwendbar).
select management_ai.new_pair_code() as "Kopplungscode";
`;

/* Geräte anzeigen bzw. alle Zugänge widerrufen */
export const GERAETE_SQL = `-- Vivalink Management AI: gekoppelte Geräte (Name = interne Gerätekennung der App, keine Personendaten).
select name as "Gerät", created_at as "gekoppelt am", last_used_at as "zuletzt abgerufen", revoked_at as "widerrufen am"
  from management_ai.devices order by created_at;
`;
export const WIDERRUF_SQL = `-- Vivalink Management AI: ALLE Gerätezugänge sofort widerrufen (die App ruft danach nichts mehr ab).
update management_ai.devices set revoked_at = now() where revoked_at is null;
select count(*) as "aktive Zugänge" from management_ai.devices where revoked_at is null;
`;

/* Abgleich mit dem Admin-Dashboard: zeigt die aktuellen Werte genau so, wie die Management AI sie erhält.
   Die Zahlen sieht nur, wer die Abfrage ausführt (Gründer im SQL-Editor); sie werden nirgends gespeichert. */
const KPI_LABELS = { reg_total: "Registrierungen gesamt (ohne Admins)", reg_week: "Neue Registrierungen (7 Tage)", active_users: "Aktive Nutzer (30 Tage)", signups: "Anmeldungen nächstes Meetup", attend: "Teilnehmer letztes Meetup", noshow: "Absagen letztes Meetup", invites: "Einladungen (7 Tage)", invite_rate: "Annahmequote Einladungen (30 Tage, %)", payments: "Zahlungen (30 Tage, €)", refunds: "Erstattungen (30 Tage, €)", inc: "Einnahmen", exp: "Ausgaben", meetup_days: "Tage bis zum nächsten Meetup", meetup_capacity: "Plätze nächstes Meetup" };
export function abgleichSql(mapping) {
  const M = parseMapping(mapping, KPI_KEYS);
  if (M.errors.length) throw new Error("mapping.json fehlerhaft: " + M.errors.join("; "));
  const q = (x) => x.replace(/'/g, "''");
  const parts = M.entries.map((e) => {
    const src = e.source.split(".").map((x) => `"${x}"`).join(".") + (e.fn ? "()" : "");
    const v = e.snapshot ? `(select "${e.value}"::text from ${src} limit 1)` : `(select "${e.value}"::text from ${src} order by "${e.date}" desc limit 1)`;
    return `select ${M.entries.indexOf(e)} as nr, '${q(KPI_LABELS[e.key] || e.key)}' as "Kennzahl", ${v} as "Wert heute"`;
  });
  return `-- Vivalink Management AI: Abgleich mit dem Admin-Dashboard (nur lesend). Zeigt die Werte, die die Management AI erhält.
-- Hinweis: Admin-Konten sind ausgeschlossen; ob weitere Testkonten enthalten sind, ist nicht bekannt.
select "Kennzahl", "Wert heute" from (
${parts.join("\n union all\n")}
) t order by nr;
`;
}

export function bundle(mapping, dir) {
  const fn = join(dir, "supabase/functions/management-kpis");
  mkdirSync(fn, { recursive: true });
  mkdirSync(join(dir, "supabase/migrations"), { recursive: true });
  for (const f of ["index.ts"]) copyFileSync(join(FN, f), join(fn, f));
  for (const f of ["kpi-core.mjs", "kpi-pg.mjs"]) copyFileSync(join(ROOT, "server", f), join(fn, f));
  writeFileSync(join(fn, "mapping.json"), JSON.stringify(mapping, null, 2) + "\n");
  copyFileSync(MIGRATION, join(dir, "supabase/migrations/20261126_management_kpis.sql"));
  writeFileSync(join(dir, "supabase/migrations/20261126_management_kpis_grants.sql"), grantsSql(mapping));
  // Gateway-JWT-Prüfung aus: die App meldet sich mit ihrem Gerätezugang an (nicht mit einem Supabase-Konto)
  writeFileSync(join(dir, "supabase/config.toml"), '[functions.management-kpis]\nverify_jwt = false\n');
  return fn;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "inventory") process.stdout.write(INVENTORY_SQL);
  else if (cmd === "dryrun") process.stdout.write(dryRunSql(load(a), process.argv.slice(4).filter((f) => !f.startsWith("--rls-md5=")).map((f) => readFileSync(f, "utf8")), { rlsAutoMd5: process.argv.slice(4).filter((f) => f.startsWith("--rls-md5=")).map((f) => f.slice(10)) }));
  else if (cmd === "paket") {
    // node scripts/verwaltung.mjs paket <mapping> <zusatz.sql> <zielordner> [--rls-md5=…]
    const args = process.argv.slice(3);
    const md5 = args.filter((x) => x.startsWith("--rls-md5=")).map((x) => x.slice(10));
    const [mp, zus, ziel] = args.filter((x) => !x.startsWith("--"));
    const map = load(mp),
      extra = [readFileSync(zus, "utf8")];
    mkdirSync(ziel, { recursive: true });
    const files = {
      "1-probelauf.sql": dryRunSql(map, extra, { rlsAutoMd5: md5 }),
      "2-einrichtung.sql": dryRunSql(map, extra, { rlsAutoMd5: md5, einrichtung: true }),
      "3-edge-function-index.ts": edgeSingleFile(map),
      "4-kopplungscode.sql": KOPPLUNGSCODE_SQL,
      "5-abgleich.sql": abgleichSql(map),
      "geraete.sql": GERAETE_SQL,
      "widerruf.sql": WIDERRUF_SQL,
      "rueckbau.sql": RUECKBAU_SQL,
    };
    for (const [f, t] of Object.entries(files)) writeFileSync(join(ziel, f), t);
    console.log("Paket: " + Object.keys(files).join(", "));
  } else if (cmd === "etdiag") process.stdout.write(eventTriggerDiagSql());
  else if (cmd === "facts") process.stdout.write(factsSql(JSON.parse(readFileSync(a, "utf8"))));
  else if (cmd === "grants") process.stdout.write(grantsSql(load(a)));
  else if (cmd === "check") {
    const M = parseMapping(load(a), KPI_KEYS);
    console.log(M.errors.length ? "Fehler: " + M.errors.join("; ") : `${M.entries.length} von ${KPI_KEYS.length} Kennzahlen zugeordnet: ${M.entries.map((e) => e.key).join(", ") || "keine"}`);
    process.exit(M.errors.length ? 1 : 0);
  } else if (cmd === "bundle" && (b || a)) console.log("Bereitstellungsordner: " + bundle(load(b ? a : null), b || a));
  else console.error("Aufruf: node scripts/verwaltung.mjs inventory | grants [mapping] | check [mapping] | bundle [mapping] <ziel>"), process.exit(2);
}
