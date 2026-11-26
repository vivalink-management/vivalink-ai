// Werkzeuge für die Verwaltungs-Gegenstelle (ändern selbst NICHTS an einer Datenbank; sie erzeugen nur Dateien bzw. SQL-Text).
//   node scripts/verwaltung.mjs inventory                    → lesende Bestandsaufnahme-SQL (nur Strukturangaben, keine Daten)
//   node scripts/verwaltung.mjs grants [mapping.json]        → Leserechte der Rolle management_ai auf die zugeordneten Auswertungen
//   node scripts/verwaltung.mjs bundle [mapping.json] <ziel> → Bereitstellungsordner (Edge Function + Migration + Rechte)
//   node scripts/verwaltung.mjs check [mapping.json]         → Zuordnung prüfen
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

/* Zweite Bestandsaufnahme: Programmcode der vorhandenen Admin-Auswertungen (Funktionen admin_* und is_admin, ohne
   Aktionen wie run_now/reset/ack) und die Prüfregeln (CHECK) der Tabellen – daraus ergeben sich Filter (Testkonten,
   Beispiel-Meetups) und Statuswerte. Nur Systemkatalog, KEINE Tabelleninhalte. Zeichenketten mit „@“ oder über
   60 Zeichen werden geleert (falls im Code z. B. eine E-Mail-Adresse stünde); jede Zeichenkette wird
   als Ganzes erkannt, damit die Zuordnung von Anfangs- und End-Anführungszeichen nicht verrutscht. */
export const DEFINITIONS_SQL = `-- Vivalink Management AI: zweite lesende Bestandsaufnahme (nur Programmcode und Regeln, keine Inhalte, keine Änderungen).
-- Zeichenketten mit @ oder über 60 Zeichen werden geleert ('').
select 'funktion' as art, p.proname as name,
       regexp_replace(pg_get_functiondef(p.oid), $re$'([^'@]{0,60})'|'[^']*'$re$, $r$'\\1'$r$, 'g') as inhalt
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and (p.proname = 'is_admin' or p.proname like 'admin\\_%')
  and p.proname !~ '(run_now|reset|ack)'
union all
select 'regel', c.relname || '.' || k.conname,
       regexp_replace(pg_get_constraintdef(k.oid), $re$'([^'@]{0,60})'|'[^']*'$re$, $r$'\\1'$r$, 'g')
from pg_constraint k
join pg_class c on c.oid = k.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and k.contype = 'c'
order by 1, 2;
`;

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
  else if (cmd === "definitions") process.stdout.write(DEFINITIONS_SQL);
  else if (cmd === "grants") process.stdout.write(grantsSql(load(a)));
  else if (cmd === "check") {
    const M = parseMapping(load(a), KPI_KEYS);
    console.log(M.errors.length ? "Fehler: " + M.errors.join("; ") : `${M.entries.length} von ${KPI_KEYS.length} Kennzahlen zugeordnet: ${M.entries.map((e) => e.key).join(", ") || "keine"}`);
    process.exit(M.errors.length ? 1 : 0);
  } else if (cmd === "bundle" && (b || a)) console.log("Bereitstellungsordner: " + bundle(load(b ? a : null), b || a));
  else console.error("Aufruf: node scripts/verwaltung.mjs inventory | grants [mapping] | check [mapping] | bundle [mapping] <ziel>"), process.exit(2);
}
