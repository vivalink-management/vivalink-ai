// Tresor-Server für die Synchronisierung (Ende-zu-Ende verschlüsselt).
// Der Server speichert je Tresor nur: verschlüsselten Datenblock, Versionsnummer, Hash des Zugangsschlüssels.
// Er kann die Inhalte nicht lesen. Dieselbe Logik läuft im lokalen Testserver und später als Cloudflare Worker.
//
// API (Version 1):
//   GET  /v1/vault/:id          Authorization: Bearer <token>  → 200 {version, blob, updatedAt} | 404 | 401
//   PUT  /v1/vault/:id          Authorization: Bearer <token>  body {blob, expected} → 200 {version} | 409 {version} | 401 | 413
// Der erste PUT legt den Tresor an und bindet ihn an den Token-Hash (expected muss 0 sein).

export const MAX_BLOB = 4 * 1024 * 1024; // 4 MB verschlüsselte Daten
const ID_RE = /^[0-9a-f]{32}$/;

async function sha256hex(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const json = (status, body, extra = {}) => ({ status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra }, body: JSON.stringify(body) });

/* store: { get(id) → Promise<obj|null>, put(id, obj) → Promise<void> } */
export async function handleVault({ method, path, auth, body }, store) {
  const m = path.match(/^\/v1\/vault\/([^/]+)$/);
  if (!m) return json(404, { error: "not found" });
  const id = m[1];
  if (!ID_RE.test(id)) return json(400, { error: "bad id" });
  const tok = (auth || "").replace(/^Bearer\s+/i, "");
  if (!/^[0-9a-f]{64}$/.test(tok)) return json(401, { error: "unauthorized" });
  const th = await sha256hex(tok);
  const cur = await store.get(id);
  if (method === "GET") {
    if (!cur) return json(404, { error: "empty" });
    if (cur.th !== th) return json(401, { error: "unauthorized" });
    return json(200, { version: cur.version, blob: cur.blob, updatedAt: cur.updatedAt });
  }
  if (method === "PUT") {
    let b;
    try {
      b = typeof body === "string" ? JSON.parse(body) : body;
    } catch {
      return json(400, { error: "bad json" });
    }
    if (!b || typeof b.blob !== "string" || !Number.isInteger(b.expected)) return json(400, { error: "bad body" });
    if (b.blob.length > MAX_BLOB) return json(413, { error: "too large" });
    if (cur && cur.th !== th) return json(401, { error: "unauthorized" });
    const version = cur ? cur.version : 0;
    if (b.expected !== version) return json(409, { version });
    const next = { th, version: version + 1, blob: b.blob, updatedAt: Date.now() };
    await store.put(id, next);
    return json(200, { version: next.version });
  }
  return json(405, { error: "method" });
}
