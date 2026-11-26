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
const FINGERPRINT = `(select md5(coalesce(string_agg(x, '|' order by x), '')) from (
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
      select 'm:' || roleid::text || '>' || member::text from pg_auth_members
      union all
      select 'p:' || schemaname || '.' || tablename || '.' || policyname || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') from pg_policies
      union all
      select 't:' || tgrelid::text || '.' || tgname || ':' || tgenabled::text from pg_trigger where not tgisinternal
      union all
      select 'e:' || evtname || ':' || evtenabled::text from pg_event_trigger
      union all
      select 'd:' || defaclrole::text || ':' || defaclnamespace::text || ':' || defaclobjtype::text || ':' || coalesce(defaclacl::text, '') from pg_default_acl
    ) s)`;
export function dryRunSql(mapping, extraSql = []) {
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
  return `-- Vivalink Management AI: PROBELAUF der Verwaltungsanbindung – ohne bleibende Wirkung.
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
create temporary table vl_probelauf (nr int, pruefung text, ergebnis text) on commit drop;
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
  et_bekannt int;
  et_unbekannt int;
  et_namen text;
begin
 begin

  -- Schreibzähler zu Beginn (enthält ggf. noch nicht verbuchte Vorgänge früherer Abfragen – deshalb zählt die Differenz)
  select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) into schreib0 from pg_stat_xact_user_tables;
  vorher := ${FINGERPRINT};
  -- Ereignistrigger (laufen bei Strukturänderungen mit) VOR jeder Änderung prüfen – nicht nur nach Namen, sondern nach
  -- tatsächlicher Zuordnung. Als unbedenklich gilt ein aktiver Ereignistrigger nur, wenn ALLES zutrifft:
  --  * Name, Ereignis und Funktion entsprechen genau dem Supabase-Standard (Funktion im Schema extensions, erwarteter Name),
  --  * die Befehlsfilter (WHEN TAG) stimmen: issue_pg_net/cron nur CREATE EXTENSION, issue_graphql_placeholder nur
  --    DROP EXTENSION, issue_pg_graphql_access nur CREATE FUNCTION,
  --  * Trigger, die bei unseren Befehlen anspringen können (pgrst_ddl_watch, pgrst_drop_watch, issue_pg_graphql_access),
  --    enthalten im Funktionsrumpf (ohne Kommentare und Zeichenketten) keine Netzwerk-, Datei- oder Hintergrundaufrufe
  --    (http, net., dblink, pg_background, copy, lo_, pg_read, pg_write, pg_file); pgrst_* zusätzlich keine Schreib-/
  --    Strukturbefehle und müssen eine Benachrichtigung (NOTIFY) enthalten. NOTIFY wird nur beim Bestätigen zugestellt.
  -- Jeder andere, veränderte oder abweichend zugeordnete aktive Ereignistrigger → Abbruch ohne jede Änderung (E-ET).
  select count(*) filter (where ok), count(*) filter (where not ok),
         coalesce(string_agg(evtname, ', ' order by evtname) filter (where not ok and bekannt), '')
    into et_bekannt, et_unbekannt, et_namen
  from (
    select e.evtname,
      e.evtname in ('pgrst_ddl_watch', 'pgrst_drop_watch', 'issue_pg_net_access', 'issue_pg_cron_access', 'issue_pg_graphql_access', 'issue_graphql_placeholder') as bekannt,
      coalesce(
        n.nspname = 'extensions' and (
          (e.evtname = 'pgrst_ddl_watch' and e.evtevent = 'ddl_command_end' and p.proname = 'pgrst_ddl_watch')
          or (e.evtname = 'pgrst_drop_watch' and e.evtevent = 'sql_drop' and p.proname = 'pgrst_drop_watch')
          or (e.evtname = 'issue_pg_net_access' and e.evtevent = 'ddl_command_end' and p.proname = 'grant_pg_net_access' and e.evttags is not null and e.evttags <@ array['CREATE EXTENSION'])
          or (e.evtname = 'issue_pg_cron_access' and e.evtevent = 'ddl_command_end' and p.proname = 'grant_pg_cron_access' and e.evttags is not null and e.evttags <@ array['CREATE EXTENSION'])
          or (e.evtname = 'issue_graphql_placeholder' and e.evtevent = 'sql_drop' and p.proname = 'set_graphql_placeholder' and e.evttags is not null and e.evttags <@ array['DROP EXTENSION'])
          or (e.evtname = 'issue_pg_graphql_access' and e.evtevent = 'ddl_command_end' and p.proname = 'grant_pg_graphql_access' and e.evttags is not null and e.evttags <@ array['CREATE FUNCTION'])
        )
        and (e.evtname not in ('pgrst_ddl_watch', 'pgrst_drop_watch', 'issue_pg_graphql_access')
             or (b.rumpf !~* '(\\mhttp|\\mnet\\.|\\mdblink|\\mpg_background|\\mcopy\\M|\\mlo_|\\mpg_read|\\mpg_write|\\mpg_file)'))
        and (e.evtname not in ('pgrst_ddl_watch', 'pgrst_drop_watch')
             or (b.rumpf ~* '\\mnotify\\M' and b.rumpf !~* '\\m(insert|update|delete|truncate|merge|create|alter|drop|grant|revoke|execute|perform|call|set_config|copy)\\M'))
      , false) as ok
    from pg_event_trigger e
    join pg_proc p on p.oid = e.evtfoid
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral (select regexp_replace(regexp_replace(coalesce(p.prosrc, ''), '--[^\\n]*', '', 'g'), '''[^'']*''', '''''', 'g') as rumpf) b
    where e.evtenabled <> 'D'
  ) t;
  zeilen := zeilen || ('Ereignistrigger: geprüft und unbedenklich (Supabase-Standard, Zuordnung und Inhalt passen)|' || et_bekannt);
  zeilen := zeilen || ('Ereignistrigger: unbekannt oder verändert|' || et_unbekannt
    || case when et_namen <> '' then ' (bekannter Name, aber abweichend: ' || et_namen || ')' else '' end
    || case when et_unbekannt > 0 then ' – ABBRUCH E-ET, nichts eingerichtet' else '' end);
  if et_unbekannt > 0 then
    fehler := fehler + 1;
    raise exception 'vl_probelauf_et';
  end if;
  -- Sicherungspunkt: alles in diesem Block wird am Ende durch eine absichtliche Ausnahme zurückgenommen
  begin
    begin
      execute ${inner}${body}${inner};
      zeilen := zeilen || 'Einrichtung (probeweise)|ok'::text;
    exception when others then
      zeilen := zeilen || ('Einrichtung (probeweise)|FEHLER E-EINR (SQLSTATE ' || sqlstate || ')'); fehler := fehler + 1;
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
    raise exception 'vl_probelauf_zuruecknehmen';
  exception when others then
    if sqlerrm <> 'vl_probelauf_zuruecknehmen' then
      zeilen := zeilen || ('Prüfung abgebrochen|FEHLER E-PRF (SQLSTATE ' || sqlstate || ')'); fehler := fehler + 1;
    end if;
  end;
  -- Nachweise nach der Rücknahme des Sicherungspunkts
  nachher := ${FINGERPRINT};
  select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) - schreib0 into schreib from pg_stat_xact_user_tables;
  zeilen := zeilen || ('Teilnachweis: Tabellen, Funktionen, Rollen, Rechte, Richtlinien, Trigger nach der Rücknahme unverändert|' || case when vorher = nachher then 'ja' else 'NEIN (PROBLEM)' end);
  zeilen := zeilen || ('Teilnachweis: Schreibvorgänge in Tabellen (auch Warteschlangen für Benachrichtigungen/Netzwerk)|' || schreib);
  zeilen := zeilen || ('Hinweis|Die Teilnachweise decken nur die geprüften Bereiche ab und sind kein vollständiger Nachweis für das Ausbleiben jeder Nebenwirkung; maßgeblich ist das abschließende ROLLBACK.'::text);
  if vorher <> nachher or schreib <> 0 then fehler := fehler + 1; end if;
  exception when others then
    -- Sicherheitsnetz: jeder unerwartete Fehler wird gemeldet (nur Code), damit das abschließende ROLLBACK sicher ausgeführt wird
    if sqlerrm <> 'vl_probelauf_et' then
      zeilen := zeilen || ('Unerwarteter Fehler|FEHLER E-UNERW (SQLSTATE ' || sqlstate || ')'); fehler := fehler + 1;
    end if;
 end;
  zeilen := zeilen || ('GESAMT|' || case when fehler = 0 then 'OK – alles wird mit ROLLBACK zurückgenommen' else 'PROBLEM (' || fehler || ') – alles wird mit ROLLBACK zurückgenommen' end);
  insert into vl_probelauf select i, split_part(zeilen[i], '|', 1), substr(zeilen[i], length(split_part(zeilen[i], '|', 1)) + 2) from generate_subscripts(zeilen, 1) i;
end ${tag};
select pruefung as "Prüfung", ergebnis as "Ergebnis" from vl_probelauf order by nr;
rollback;
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
  else if (cmd === "dryrun") process.stdout.write(dryRunSql(load(a), process.argv.slice(4).map((f) => readFileSync(f, "utf8"))));
  else if (cmd === "facts") process.stdout.write(factsSql(JSON.parse(readFileSync(a, "utf8"))));
  else if (cmd === "grants") process.stdout.write(grantsSql(load(a)));
  else if (cmd === "check") {
    const M = parseMapping(load(a), KPI_KEYS);
    console.log(M.errors.length ? "Fehler: " + M.errors.join("; ") : `${M.entries.length} von ${KPI_KEYS.length} Kennzahlen zugeordnet: ${M.entries.map((e) => e.key).join(", ") || "keine"}`);
    process.exit(M.errors.length ? 1 : 0);
  } else if (cmd === "bundle" && (b || a)) console.log("Bereitstellungsordner: " + bundle(load(b ? a : null), b || a));
  else console.error("Aufruf: node scripts/verwaltung.mjs inventory | grants [mapping] | check [mapping] | bundle [mapping] <ziel>"), process.exit(2);
}
