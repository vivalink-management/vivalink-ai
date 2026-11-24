// Cloudflare Worker (kostenloser Tarif) für die Synchronisierung – NOCH NICHT EINGERICHTET.
// Einrichtung erst nach Freigabe des Gründers (siehe docs/SYNCHRONISIERUNG.md):
//   KV-Namespace "VAULT" anlegen, ALLOWED_ORIGIN auf die Adresse der Management AI setzen, Worker veröffentlichen.
import { handleVault } from "./vault-core.mjs";

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "";
    const cors = { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "86400" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.headers.get("origin") !== origin) return new Response("forbidden", { status: 403 });
    const url = new URL(request.url);
    const store = {
      get: async (id) => (await env.VAULT.get("v:" + id, "json")) || null,
      put: async (id, obj) => env.VAULT.put("v:" + id, JSON.stringify(obj)),
    };
    const r = await handleVault({ method: request.method, path: url.pathname, auth: request.headers.get("authorization"), body: request.method === "PUT" ? await request.text() : null }, store);
    return new Response(r.body, { status: r.status, headers: { ...r.headers, ...cors } });
  },
};
