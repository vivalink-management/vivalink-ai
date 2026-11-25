// Cloudflare Worker (kostenloser Tarif) für Synchronisierung und Aufgaben-Postfach.
// Speicher: Cloudflare D1 (Bindung „DB“), atomare Versionsprüfung. Keine Geheimnisse im Worker:
// gespeichert werden nur verschlüsselte Blöcke, Token-Hashes, Kopplungsplätze (10 Minuten) und das Aufgaben-Postfach.
// Konfiguration: server/wrangler.toml · Einrichtung: docs/SYNCHRONISIERUNG.md
import { handleVault } from "./vault-core.mjs";
import { d1Store } from "./d1-store.mjs";

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "";
    const reqOrigin = request.headers.get("origin");
    const cors = { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS", "access-control-allow-headers": "authorization, content-type, x-vl-task-token", "access-control-max-age": "86400", vary: "origin" };
    // Browser: nur die eigene App-Adresse. Ohne Origin (z. B. geplante Aufgabe): erlaubt, Zugriff nur mit Token.
    if (reqOrigin && reqOrigin !== origin) return new Response("forbidden", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/v1/health") return new Response(JSON.stringify({ ok: true, service: "vivalink-sync" }), { headers: { "content-type": "application/json", ...cors } });
    const body = ["PUT", "POST", "DELETE"].includes(request.method) ? await request.text() : null;
    const r = await handleVault(
      { method: request.method, path: url.pathname, auth: request.headers.get("authorization"), taskToken: request.headers.get("x-vl-task-token"), body, client: request.headers.get("cf-connecting-ip") || "" },
      d1Store(env.DB),
    );
    return new Response(r.body, { status: r.status, headers: { ...r.headers, ...cors } });
  },
  // Täglich: abgelaufene Einträge löschen (Kopplungsplätze, Fehlversuchszähler, alte Postfächer)
  async scheduled(event, env) {
    await d1Store(env.DB).sweep();
  },
};
