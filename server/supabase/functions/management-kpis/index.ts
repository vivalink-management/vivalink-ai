// Supabase Edge Function „management-kpis“ – VORLAGE, NICHT BEREITGESTELLT.
// Umsetzung nur nach gesonderter Freigabe des Gründers, zuerst in der Supabase-Testumgebung.
// Vor dem Bereitstellen: server/kpi-core.mjs in diesen Ordner kopieren (gleiche, getestete Logik wie in der Management AI).
// Der Service-Role-Schlüssel bleibt ausschließlich serverseitig (Umgebungsvariable der Funktion), nie im Browser.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleKpi } from "./kpi-core.mjs";
import mapping from "./mapping.json" with { type: "json" };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ORIGIN = "https://vivalink-management.github.io";
const iso = (t: number) => new Date(t).toISOString();

const repo = {
  pairCode: async (h: string) => {
    const { data } = await db.from("management_pair_codes").select("expires_at, used_at").eq("code_hash", h).maybeSingle();
    return data ? { expiresAt: Date.parse(data.expires_at), usedAt: data.used_at } : null;
  },
  useCode: async (h: string, now: number) => void (await db.from("management_pair_codes").update({ used_at: iso(now) }).eq("code_hash", h)),
  addDevice: async ({ name, tokenHash }: { name: string; tokenHash: string }) => void (await db.from("management_devices").insert({ name, token_hash: tokenHash })),
  device: async (h: string) => {
    const { data } = await db.from("management_devices").select("revoked_at").eq("token_hash", h).maybeSingle();
    return data ? { revokedAt: data.revoked_at } : null;
  },
  touch: async (h: string, now: number) => void (await db.from("management_devices").update({ last_used_at: iso(now) }).eq("token_hash", h)),
  calls: async (h: string, since: number) => {
    const { count } = await db.from("management_calls").select("*", { count: "exact", head: true }).eq("token_hash", h).gt("at", iso(since));
    return count || 0;
  },
  logCall: async (h: string) => void (await db.from("management_calls").insert({ token_hash: h })),
  // Kennzahlen aus den VORHANDENEN Auswertungen gemäß mapping.json (nur die letzten 30 Tage)
  aggregates: async () => {
    const rows: { key: string; date: string; value: number }[] = [];
    for (const [key, m] of Object.entries(mapping as Record<string, any>)) {
      if (key.startsWith("_") || !m.source) continue;
      const { data, error } = await db.from(m.source).select(`${m.date}, ${m.value}`).order(m.date, { ascending: false }).limit(30);
      if (error) continue;
      for (const r of data || []) rows.push({ key, date: String(r[m.date]).slice(0, 10), value: Number(r[m.value]) });
    }
    return rows;
  },
};

Deno.serve(async (req) => {
  const cors = { "access-control-allow-origin": ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const r = await handleKpi({ method: req.method, path: new URL(req.url).pathname, auth: req.headers.get("authorization") ?? "", body: req.method === "POST" ? await req.text() : null }, repo);
  return new Response(r.body, { status: r.status, headers: { ...r.headers, ...cors } });
});
