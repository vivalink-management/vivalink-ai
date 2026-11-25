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

/* Bestandsaufnahme: listet nur Namen und Spaltentypen vorhandener Views und parameterloser Funktionen (keine Inhalte) */
export const INVENTORY_SQL = `-- Lesende Bestandsaufnahme der vorhandenen Auswertungen (nur Struktur, keine Daten, ändert nichts).
-- Im Supabase-SQL-Editor ausführen und das Ergebnis für die Zuordnung (mapping.json) verwenden.
select 'view' as art, v.table_schema || '.' || v.table_name as quelle,
       string_agg(c.column_name || ':' || c.data_type, ', ' order by c.ordinal_position) as spalten
from information_schema.views v
join information_schema.columns c on c.table_schema = v.table_schema and c.table_name = v.table_name
where v.table_schema not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'extensions', 'graphql', 'graphql_public', 'vault', 'pgsodium', 'supabase_functions', 'net', 'cron', 'management_ai')
group by 1, 2
union all
select 'funktion', n.nspname || '.' || p.proname || '()', pg_get_function_result(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.pronargs = 0 and p.prokind = 'f'
  and n.nspname not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'extensions', 'graphql', 'graphql_public', 'vault', 'pgsodium', 'supabase_functions', 'net', 'cron', 'management_ai')
  and pg_get_function_result(p.oid) not in ('trigger', 'event_trigger', 'void')
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
  else if (cmd === "grants") process.stdout.write(grantsSql(load(a)));
  else if (cmd === "check") {
    const M = parseMapping(load(a), KPI_KEYS);
    console.log(M.errors.length ? "Fehler: " + M.errors.join("; ") : `${M.entries.length} von ${KPI_KEYS.length} Kennzahlen zugeordnet: ${M.entries.map((e) => e.key).join(", ") || "keine"}`);
    process.exit(M.errors.length ? 1 : 0);
  } else if (cmd === "bundle" && (b || a)) console.log("Bereitstellungsordner: " + bundle(load(b ? a : null), b || a));
  else console.error("Aufruf: node scripts/verwaltung.mjs inventory | grants [mapping] | check [mapping] | bundle [mapping] <ziel>"), process.exit(2);
}
