// Supabase Edge Function „management-kpis“ – NICHT BEREITGESTELLT.
// Bereitstellung nur nach gesonderter Freigabe des Gründers, zuerst in einer getrennten Supabase-Testumgebung.
// Bereitstellungsordner erzeugen (kopiert kpi-core.mjs, kpi-pg.mjs und mapping.json dazu):
//   node scripts/verwaltung.mjs bundle <mapping.json> <zielordner>
// Wichtig: ohne JWT-Prüfung des Gateways bereitstellen (verify_jwt = false), denn die Management AI meldet sich
// mit ihrem widerrufbaren Gerätezugang an, nicht mit einem Supabase-Konto.
// Datenbankzugang: SUPABASE_DB_URL stellt Supabase der Funktion automatisch bereit (serverseitig, nie im Browser).
// Jede Abfrage läuft in der eingeschränkten Rolle management_ai (siehe Migration und kpi-pg.mjs).
import postgres from "npm:postgres@3.4.9";
import { handleKpi, KPI_KEYS } from "./kpi-core.mjs";
import { pgRepo } from "./kpi-pg.mjs";
import mapping from "./mapping.json" with { type: "json" };

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 5, onnotice: () => {} });
const ORIGIN = Deno.env.get("VL_ALLOWED_ORIGIN") ?? "https://vivalink-management.github.io";
// Fehler einzelner Auswertungen nur als Schlüssel protokollieren (keine Datenbankmeldungen mit Inhalten)
const repo = pgRepo(sql, mapping, KPI_KEYS, { onError: (key: string) => console.warn("Auswertung nicht lesbar:", key) });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors: Record<string, string> = { "access-control-allow-origin": ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-max-age": "600", vary: "origin" };
  if (origin && origin !== ORIGIN) return new Response('{"error":"forbidden"}', { status: 403, headers: { "content-type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const body = req.method === "POST" ? (await req.text()).slice(0, 2000) : null;
  const r = await handleKpi({ method: req.method, path: new URL(req.url).pathname, auth: req.headers.get("authorization") ?? "", body }, repo);
  return new Response(r.body, { status: r.status, headers: { ...r.headers, ...cors, "x-content-type-options": "nosniff" } });
});
