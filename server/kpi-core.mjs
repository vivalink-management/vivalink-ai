// Gegenstelle der Vivalink-Verwaltung für zusammengefasste Kennzahlen (Kern-Logik, laufzeitunabhängig).
// Läuft später als Supabase Edge Function (server/supabase/functions/management-kpis) – NICHT bereitgestellt,
// Umsetzung nur nach gesonderter Freigabe des Gründers, zuerst in der Testumgebung.
// Grundsatz: keine Doppelentwicklung. Die Kennzahlen kommen aus den VORHANDENEN Auswertungen der Verwaltung;
// die Zuordnung (welche bestehende Auswertung liefert welchen Schlüssel) steht in mapping.json.
//
//   POST /pair  {code, device}            → 200 {token} | 401 (falsch) | 410 (abgelaufen/benutzt) | 429 (gesperrt)
//   GET  /kpis  Authorization: Bearer …   → 200 vivalink-kpis | 401 (unbekannt/widerrufen) | 429
//   Speicherfehler → 503 ohne Einzelheiten (keine Datenbankmeldungen nach außen)
//
// repo (wird von der Edge Function bzw. im Test bereitgestellt):
//   pairCode(hash) → {expiresAt, usedAt} | null      useCode(hash, now) → true nur beim ersten Mal (atomar)
//   addDevice({name, tokenHash, now})                 device(tokenHash) → {revokedAt} | null
//   touch(tokenHash, now)                             calls(tokenHash, sinceMs) → Anzahl   logCall(tokenHash, now)
//   aggregates() → [{key, date, value}]   (aus den vorhandenen Auswertungen gemäß mapping.json)
//   meta() → {excludesTestAccounts, excludesDemoMeetups}  (vom Gründer bestätigte Angaben aus mapping.json, sonst false)

export const KPI_KEYS = ["reg_total", "reg_week", "active_users", "signups", "attend", "noshow", "invites", "invite_rate", "payments", "refunds", "inc", "exp", "meetup_days", "meetup_capacity"];
// meetup_days: Tage bis zum nächsten Meetup (0 = heute), meetup_capacity: Plätze des nächsten Meetups – füllen die Meetup-Karte der App
export const MAX_CALLS_PER_HOUR = 60;
// Schutz vor dem Durchprobieren von Kopplungscodes: höchstens 10 Fehlversuche je 10 Minuten (insgesamt), danach 429
export const MAX_PAIR_FAILS = 10;
export const PAIR_FAIL_WINDOW = 600e3;
const PAIR_FAIL = "pair:fail";

async function sha256hex(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const json = (status, body) => ({ status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });

/* Nur erlaubte Schlüssel, nur Zahlen, nur Tagesdatum – alles andere wird verworfen (Schutz vor Personendaten) */
export function buildKpis(rows, now = Date.now(), meta = {}) {
  const values = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !KPI_KEYS.includes(r.key)) continue;
    const v = Number(r.value);
    if (!isFinite(v) || typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    values.push({ key: r.key, date: r.date, value: Math.round(v * 100) / 100, source: "verwaltung" });
  }
  const out = { format: "vivalink-kpis", version: 1, generatedAt: new Date(now).toISOString(), meta: { excludesTestAccounts: meta.excludesTestAccounts === true, excludesDemoMeetups: meta.excludesDemoMeetups === true, timezone: "Europe/Berlin" }, values };
  // Strukturprüfung statt Textsuche: jeder Wert hat genau diese vier Felder in erlaubter Form (keine Freitexte → keine Personendaten)
  if (!values.every((x) => Object.keys(x).join() === "key,date,value,source" && KPI_KEYS.includes(x.key) && typeof x.value === "number")) throw new Error("Strukturprüfung fehlgeschlagen");
  return out;
}

export async function handleKpi(req, repo) {
  try {
    return await route(req, repo);
  } catch {
    return json(503, { error: "unavailable" }); // keine Einzelheiten (Datenbankmeldungen könnten interne Namen enthalten)
  }
}
async function route({ method, path, auth, body, now = Date.now() }, repo) {
  const p = path.replace(/\/+$/, "");
  if (method === "POST" && p.endsWith("/pair")) {
    if ((await repo.calls(PAIR_FAIL, now - PAIR_FAIL_WINDOW)) >= MAX_PAIR_FAILS) return json(429, { error: "too many attempts" });
    const fail = async (status, error) => (await repo.logCall(PAIR_FAIL, now), json(status, { error }));
    let b;
    try {
      b = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
    } catch {
      return json(400, { error: "bad json" });
    }
    if (!/^\d{6,8}$/.test(String(b.code || ""))) return fail(401, "invalid");
    const h = await sha256hex("vivalink-pair:" + b.code);
    const c = await repo.pairCode(h);
    if (!c) return fail(401, "invalid");
    if (c.usedAt || c.expiresAt <= now) return fail(410, "expired");
    if (!(await repo.useCode(h, now))) return fail(410, "expired"); // gleichzeitige Nutzung: nur der erste gewinnt
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, "0")).join("");
    await repo.addDevice({ name: String(b.device || "Management AI").replace(/[^\w .-]/g, "").slice(0, 60) || "Management AI", tokenHash: await sha256hex(token), now });
    return json(200, { token });
  }
  if (method === "GET" && p.endsWith("/kpis")) {
    const tok = (auth || "").replace(/^Bearer\s+/i, "");
    if (!/^[0-9a-f]{64}$/.test(tok)) return json(401, { error: "unauthorized" });
    const th = await sha256hex(tok);
    const d = await repo.device(th);
    if (!d || d.revokedAt) return json(401, { error: "unauthorized" });
    if ((await repo.calls(th, now - 3600e3)) >= MAX_CALLS_PER_HOUR) return json(429, { error: "too many requests" });
    await repo.logCall(th, now);
    await repo.touch(th, now);
    return json(200, buildKpis(await repo.aggregates(now), now, repo.meta ? await repo.meta() : {}));
  }
  return json(404, { error: "not found" });
}

/* Testspeicher (nur für automatische Tests mit künstlichen Daten) */
export function memoryRepo(aggregates = []) {
  const codes = new Map(),
    devices = new Map(),
    calls = [];
  return {
    async addCode(code, expiresAt) {
      codes.set(await sha256hex("vivalink-pair:" + code), { expiresAt, usedAt: null });
    },
    revokeAll() {
      for (const d of devices.values()) d.revokedAt = Date.now();
    },
    async revokeToken(token) {
      const d = devices.get(await sha256hex(token));
      if (d) d.revokedAt = Date.now();
    },
    pairCode: async (h) => codes.get(h) || null,
    useCode: async (h, now) => {
      const c = codes.get(h);
      if (!c || c.usedAt) return false;
      c.usedAt = now;
      return true;
    },
    addDevice: async ({ name, tokenHash, now }) => void devices.set(tokenHash, { name, createdAt: now, revokedAt: null }),
    device: async (h) => devices.get(h) || null,
    touch: async (h, now) => void (devices.get(h).lastUsedAt = now),
    calls: async (h, since) => calls.filter((c) => c.h === h && c.at > since).length,
    logCall: async (h, now) => void calls.push({ h, at: now }),
    aggregates: async () => aggregates,
    meta: async () => ({ excludesTestAccounts: true, excludesDemoMeetups: true }),
    devices,
  };
}
