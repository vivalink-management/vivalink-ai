// Cloudflare Worker „vivalink-ki“ – VORBEREITET, NICHT BEREITGESTELLT (Freigabe des Gründers nötig).
// KI-Chat und Spracherkennung über Workers AI (Bindung „AI“, kein API-Schlüssel), Zugang nur für gekoppelte Geräte
// (Tresor-Zugang der Synchronisierung aus derselben D1-Datenbank, nur lesend; zusätzlich Tageszähler „ki:…“).
// Konfiguration: server/ki-wrangler.toml · Logik und Grenzen: server/ki-core.mjs
import { handleKi } from "./ki-core.mjs";
import { d1Store } from "./d1-store.mjs";

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "";
    const reqOrigin = request.headers.get("origin");
    const cors = { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "86400", vary: "origin" };
    // nur die eigene App (Browser schicken immer einen Origin); andere Aufrufer ohne gültigen Zugang erhalten 401
    if (reqOrigin !== origin) return new Response("forbidden", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const r = await handleKi(
      { method: request.method, path: url.pathname, auth: request.headers.get("authorization"), body: request.method === "POST" ? await request.text() : null },
      { ai: env.AI, store: d1Store(env.DB) },
    );
    return new Response(r.body, { status: r.status, headers: { ...r.headers, ...cors } });
  },
};
