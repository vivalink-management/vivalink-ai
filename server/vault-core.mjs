// Tresor-Server für die Synchronisierung (Ende-zu-Ende verschlüsselt), Version 2.
// Der Server speichert je Tresor nur: verschlüsselten Datenblock, Versionsnummer, Hash des Zugangsschlüssels.
// Er kennt keine Schlüssel und kann Inhalte nicht lesen. Dieselbe Logik läuft im lokalen Testserver
// und später als Cloudflare Worker (server/sync-worker.js).
//
// Tresor:
//   GET    /v1/vault/:id   Authorization: Bearer <token> → 200 {version, blob, updatedAt} | 404 | 401 | 410 (gesperrt)
//   PUT    /v1/vault/:id   Authorization: Bearer <token>, body {blob, expected} → 200 {version} | 409 {version} | 401 | 410 | 413
//   DELETE /v1/vault/:id   Authorization: Bearer <token> → 200 {revoked:true}  (Sperre nach Schlüsselwechsel; Daten werden gelöscht)
//   Der erste PUT legt den Tresor an und bindet ihn an den Token-Hash (expected muss 0 sein).
//
// Kopplung neuer Geräte (Schlüsselvereinbarung ECDH P-256, Bestätigung per Prüfzahl auf beiden Geräten):
//   PUT    /v1/pair/:slot          {pubA, ownHash}  → 201 | 409          (Gerät A öffnet einen Platz, 10 Minuten gültig)
//   GET    /v1/pair/:slot                           → 200 {pubA, pubB, bundle} | 404   (mit bundle: danach gelöscht = einmalig)
//   POST   /v1/pair/:slot/join     {pubB}           → 200 | 409 (schon belegt) | 404
//   POST   /v1/pair/:slot/bundle   {own, bundle}    → 200 | 403 | 409 | 404   (nur Gerät A, nach Bestätigung der Prüfzahl)
//   DELETE /v1/pair/:slot          {own}            → 200 (abbrechen)
// Der Server sieht nur öffentliche Schlüssel und einen Block, den nur Gerät B entschlüsseln kann.
// Schutz vor Durchprobieren: Fehlversuche je Absender begrenzt (429).

export const MAX_BLOB = 4 * 1024 * 1024; // 4 MB verschlüsselte Daten
export const PAIR_TTL = 10 * 60; // Sekunden
export const RL_MAX = 30; // Fehlversuche je Absender …
export const RL_WINDOW = 10 * 60; // … in 10 Minuten
const ID_RE = /^[0-9a-f]{32}$/;
const PUB_RE = /^[A-Za-z0-9+/=]{40,200}$/;

async function sha256hex(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const json = (status, body, extra = {}) => ({ status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra }, body: JSON.stringify(body) });
const parse = (body) => {
  try {
    return typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return null;
  }
};

/* store: { get(key) → Promise<obj|null>, put(key, obj, ttlSeconds?) → Promise<void>, del(key) → Promise<void> } */
async function limited(store, client, now) {
  if (!client) return false;
  const k = "rl:" + (await sha256hex("rl:" + client)).slice(0, 24);
  const r = await store.get(k);
  return !!(r && r.until > now && r.n >= RL_MAX);
}
async function fail(store, client, now) {
  if (!client) return;
  const k = "rl:" + (await sha256hex("rl:" + client)).slice(0, 24);
  const r = await store.get(k);
  const cur = r && r.until > now ? r : { n: 0, until: now + RL_WINDOW * 1000 };
  cur.n++;
  await store.put(k, cur, RL_WINDOW);
}

export async function handleVault({ method, path, auth, body, client, now = Date.now() }, store) {
  if (await limited(store, client, now)) return json(429, { error: "too many attempts" });
  let m = path.match(/^\/v1\/vault\/([^/]+)$/);
  if (m) return vault(m[1], method, auth, body, client, now, store);
  m = path.match(/^\/v1\/pair\/([^/]+?)(\/join|\/bundle)?$/);
  if (m) return pair(m[1], m[2] || "", method, body, client, now, store);
  return json(404, { error: "not found" });
}

async function vault(id, method, auth, body, client, now, store) {
  if (!ID_RE.test(id)) return json(400, { error: "bad id" });
  const tok = (auth || "").replace(/^Bearer\s+/i, "");
  if (!/^[0-9a-f]{64}$/.test(tok)) return json(401, { error: "unauthorized" });
  const th = await sha256hex(tok);
  const key = "v:" + id;
  const cur = await store.get(key);
  if (cur && cur.th !== th) {
    await fail(store, client, now);
    return json(401, { error: "unauthorized" });
  }
  if (cur && cur.revoked) return json(410, { error: "revoked" });
  if (method === "GET") {
    if (!cur) return json(404, { error: "empty" });
    return json(200, { version: cur.version, blob: cur.blob, updatedAt: cur.updatedAt });
  }
  if (method === "PUT") {
    const b = parse(body);
    if (!b || typeof b.blob !== "string" || !Number.isInteger(b.expected)) return json(400, { error: "bad body" });
    if (b.blob.length > MAX_BLOB) return json(413, { error: "too large" });
    const version = cur ? cur.version : 0;
    if (b.expected !== version) return json(409, { version });
    const next = { th, version: version + 1, blob: b.blob, updatedAt: now };
    await store.put(key, next);
    return json(200, { version: next.version });
  }
  if (method === "DELETE") {
    if (!cur) return json(404, { error: "empty" });
    // Sperrvermerk statt Löschen: ein altes (verlorenes) Gerät kann den Tresor nicht neu anlegen
    await store.put(key, { th, revoked: true, version: cur.version, updatedAt: now });
    return json(200, { revoked: true });
  }
  return json(405, { error: "method" });
}

async function pair(slot, sub, method, body, client, now, store) {
  if (!ID_RE.test(slot)) return json(400, { error: "bad slot" });
  const key = "p:" + slot;
  let cur = await store.get(key);
  if (cur && cur.exp <= now) {
    await store.del(key);
    cur = null;
  }
  const b = parse(body);
  if (b === null) return json(400, { error: "bad json" });
  if (!sub && method === "PUT") {
    if (cur) return json(409, { error: "exists" });
    if (!PUB_RE.test(b.pubA || "") || !/^[0-9a-f]{64}$/.test(b.ownHash || "")) return json(400, { error: "bad body" });
    await store.put(key, { pubA: b.pubA, ownHash: b.ownHash, pubB: null, bundle: null, exp: now + PAIR_TTL * 1000 }, PAIR_TTL);
    return json(201, { exp: now + PAIR_TTL * 1000 });
  }
  if (!cur) {
    await fail(store, client, now);
    return json(404, { error: "not found" });
  }
  const ttl = Math.max(60, Math.ceil((cur.exp - now) / 1000));
  if (!sub && method === "GET") {
    const out = { pubA: cur.pubA, pubB: cur.pubB, bundle: cur.bundle, exp: cur.exp };
    if (cur.bundle) await store.del(key); // einmalig: nach Abholung gelöscht
    return json(200, out);
  }
  if (sub === "/join" && method === "POST") {
    if (cur.pubB) return json(409, { error: "taken" });
    if (!PUB_RE.test(b.pubB || "")) return json(400, { error: "bad body" });
    await store.put(key, { ...cur, pubB: b.pubB }, ttl);
    return json(200, { ok: true });
  }
  const owner = typeof b.own === "string" && (await sha256hex(b.own)) === cur.ownHash;
  if (sub === "/bundle" && method === "POST") {
    if (!owner) {
      await fail(store, client, now);
      return json(403, { error: "forbidden" });
    }
    if (!cur.pubB || cur.bundle) return json(409, { error: "state" });
    if (typeof b.bundle !== "string" || b.bundle.length > 4000) return json(400, { error: "bad body" });
    await store.put(key, { ...cur, bundle: b.bundle }, ttl);
    return json(200, { ok: true });
  }
  if (!sub && method === "DELETE") {
    if (!owner) return json(403, { error: "forbidden" });
    await store.del(key);
    return json(200, { ok: true });
  }
  return json(405, { error: "method" });
}
