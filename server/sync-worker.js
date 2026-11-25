// Cloudflare Worker (kostenloser Tarif) für die Synchronisierung – NOCH NICHT EINGERICHTET.
// Einrichtung erst nach Freigabe des Gründers (siehe docs/SYNCHRONISIERUNG.md):
//   KV-Namespace "VAULT" anlegen, ALLOWED_ORIGIN auf die Adresse der Management AI setzen, Worker veröffentlichen.
// Keine Geheimnisse im Worker: Er speichert nur verschlüsselte Blöcke, Token-Hashes und Kopplungsplätze (10 Minuten).
import { handleVault } from "./vault-core.mjs";

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "";
    const cors = { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "86400", vary: "origin" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.headers.get("origin") !== origin) return new Response("forbidden", { status: 403 });
    const url = new URL(request.url);
    const store = {
      get: async (k) => (await env.VAULT.get(k, "json")) || null,
      // KV verlangt mindestens 60 Sekunden Ablaufzeit
      put: async (k, obj, ttl) => env.VAULT.put(k, JSON.stringify(obj), ttl ? { expirationTtl: Math.max(60, ttl) } : undefined),
      del: async (k) => env.VAULT.delete(k),
    };
    const body = ["PUT", "POST", "DELETE"].includes(request.method) ? await request.text() : null;
    const r = await handleVault({ method: request.method, path: url.pathname, auth: request.headers.get("authorization"), body, client: request.headers.get("cf-connecting-ip") || "" }, store);
    return new Response(r.body, { status: r.status, headers: { ...r.headers, ...cors } });
  },
};
