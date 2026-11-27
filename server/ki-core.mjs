// KI-Gegenstelle der Management AI (Cloudflare Workers AI) – VORBEREITET, NICHT BEREITGESTELLT.
// Bereitstellung nur nach ausdrücklicher Freigabe des Gründers (neuer Worker „vivalink-ki“, Daten gehen an Cloudflare).
//
//   POST /v1/ki/chat  {vault, messages, tools}   Authorization: Bearer <Zugang der Synchronisierung>
//                     → 200 {text, tool_calls, usage:{neurons, remaining}} | 400 | 401 | 413 | 429 (Kontingent/Limit) | 503
//   POST /v1/ki/stt   {vault, audio(base64), type} → 200 {text} | … (Spracherkennung, Whisper)
//
// Sicherheit und Kosten:
// - Zugang nur für gekoppelte Geräte: derselbe Tresor-Zugang wie bei der Synchronisierung (Hash-Vergleich, gesperrte Tresore → 401).
//   Kein API-Schlüssel im Browser: Workers AI ist eine Bindung des Workers, es gibt keinen Schlüssel.
// - Tagesbudget (BUDGET) UNTER dem kostenlosen Kontingent (10.000 Neurons/Tag): Anfragen, die es überschreiten würden,
//   werden vorher abgelehnt (429) – auch im kostenpflichtigen Workers-Tarif entstehen dadurch keine Kosten.
// - Begrenzung je Gerät und Stunde; Größenlimits; keine Protokollierung von Inhalten; Fehler ohne Einzelheiten.
// - Inhalte werden nicht gespeichert; gezählt werden nur Neurons je Tag (Schlüssel „ki:tag:JJJJ-MM-TT“).

// Modelle in Reihenfolge: Ist das erste nicht (mehr) verfügbar – z. B. außer Betrieb genommen (410) oder nur im
// kostenpflichtigen Tarif (403) –, wird das nächste versucht. Beide sind laut Cloudflare im kostenlosen Tarif nutzbar
// (Stand 11/2026; vor der Bereitstellung im Modellkatalog prüfen). Über die Variable KI_MODELS änderbar.
export const KI_MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/google/gemma-4-26b-a4b-it"];
export const KI_MODEL = KI_MODELS[0];
export const STT_MODEL = "@cf/openai/whisper-large-v3-turbo";
export const BUDGET = 8000; // Neurons je Tag (kostenlos: 10.000; 2.000 Sicherheitsabstand für Schätzfehler)
export const MAX_TOKENS = 800;
export const PER_HOUR = 120;
export const AUTH_FAILS = 30; // Fehlversuche je Absender in 10 Minuten
// Neurons je Token laut Preisliste Workers AI (Stand 11/2026). Für Modelle ohne bekannte Werte wird vorsichtig
// (deutlich höher) geschätzt, damit das Tagesbudget nie unterschätzt wird.
const RATES = { "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668 / 1e6, 204805 / 1e6] };
const RATE_UNKNOWN = [60000 / 1e6, 400000 / 1e6];
const rate = (m) => RATES[m] || RATE_UNKNOWN;
const N_STT_MIN = 46.63;
const ID_RE = /^[0-9a-f]{32}$/; // wie Tresor-Kennungen der Synchronisierung

async function sha256hex(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const json = (status, body) => ({ status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });
const day = (now) => new Date(now).toISOString().slice(0, 10);

export function estimateChat(messages, tools, model = KI_MODEL) {
  const chars = JSON.stringify(messages).length + JSON.stringify(tools || []).length;
  const [ni, no] = rate(model);
  return Math.ceil((chars / 3) * ni + MAX_TOKENS * no); // ~3 Zeichen je Token (Deutsch, eher zu viel geschätzt)
}
export const estimateStt = (b64len) => Math.ceil(Math.max(0.1, (b64len * 0.75) / 4000 / 60) * N_STT_MIN); // ~32 kbit/s, aufgerundet

async function authorize(store, b, auth) {
  const tok = String(auth || "").replace(/^Bearer\s+/i, "");
  if (!b || !ID_RE.test(String(b.vault || "")) || !/^[0-9a-f]{64}$/.test(tok)) return false;
  const cur = await store.get("v:" + b.vault);
  return !!(cur && !cur.revoked && cur.th === (await sha256hex(tok)));
}
/* Vorab-Buchung: Die geschätzten Neurons werden VOR dem Aufruf gebucht (gleichzeitige Anfragen sehen sie sofort) und
   danach auf den tatsächlichen Verbrauch korrigiert – nie nach unten unter die Schätzung, wenn keine Angabe vorliegt. */
async function reserve(store, vault, est, now) {
  const hk = "ki:std:" + (await sha256hex(vault)).slice(0, 24) + ":" + Math.floor(now / 3600e3);
  const h = (await store.get(hk)) || { n: 0 };
  if (h.n >= PER_HOUR) return { ok: false, why: "limit" };
  const dk = "ki:tag:" + day(now);
  const d = (await store.get(dk)) || { neurons: 0 };
  if (d.neurons + est > BUDGET) return { ok: false, why: "budget", remaining: Math.max(0, BUDGET - d.neurons) };
  await store.put(hk, { n: h.n + 1 }, 7200);
  await store.put(dk, { neurons: d.neurons + est }, 3 * 86400);
  return { ok: true, dk, est };
}
async function book(store, r, neurons) {
  const d = (await store.get(r.dk)) || { neurons: 0 };
  d.neurons = Math.max(0, d.neurons - r.est + neurons);
  await store.put(r.dk, d, 3 * 86400);
  return Math.max(0, BUDGET - d.neurons);
}
async function authFailed(store, client, now) {
  if (!client) return false;
  const k = "ki:fail:" + (await sha256hex("c:" + client)).slice(0, 24);
  const c = (await store.get(k)) || { n: 0, until: now + 600e3 };
  if (c.until < now) (c.n = 0), (c.until = now + 600e3);
  c.n++;
  await store.put(k, c, 600);
  return c.n > AUTH_FAILS;
}
async function blocked(store, client, now) {
  if (!client) return false;
  const c = await store.get("ki:fail:" + (await sha256hex("c:" + client)).slice(0, 24));
  return !!(c && c.until >= now && c.n >= AUTH_FAILS);
}

function cleanMessages(m) {
  if (!Array.isArray(m) || !m.length || m.length > 40) return null;
  const out = [];
  let total = 0;
  for (const x of m) {
    if (!x || !["system", "user", "assistant", "tool"].includes(x.role)) return null;
    const content = typeof x.content === "string" ? x.content : "";
    if (content.length > 8000) return null;
    total += content.length;
    const o = { role: x.role, content };
    if (x.role === "tool" && typeof x.name === "string") o.name = x.name.slice(0, 64);
    if (x.role === "assistant" && Array.isArray(x.tool_calls)) o.tool_calls = x.tool_calls.slice(0, 6).map((c) => ({ name: String(c.name || "").slice(0, 64), arguments: c.arguments && typeof c.arguments === "object" ? c.arguments : {} }));
    out.push(o);
  }
  return total > 60000 ? null : out;
}
function cleanTools(t) {
  if (t == null) return [];
  if (!Array.isArray(t) || t.length > 20 || JSON.stringify(t).length > 20000) return null;
  return t.filter((x) => x && x.type === "function" && x.function && /^[a-z_]{2,40}$/.test(x.function.name));
}

export async function handleKi({ method, path, auth, body, client = "", now = Date.now() }, { ai, store, models = KI_MODELS }) {
  try {
    // Erreichbarkeit für die App (ohne Zugang, ohne Daten, ohne KI-Aufruf)
    if (method === "GET" && path === "/v1/ki/status") return json(200, { ok: true, service: "vivalink-ki", budget: BUDGET });
    if (method !== "POST" || !/^\/v1\/ki\/(chat|stt)$/.test(path)) return json(404, { error: "not found" });
    if (await blocked(store, client, now)) return json(429, { error: "too many attempts" });
    if (typeof body !== "string" || body.length > 3_000_000) return json(413, { error: "too large" });
    let b;
    try {
      b = JSON.parse(body);
    } catch {
      return json(400, { error: "bad json" });
    }
    if (!(await authorize(store, b, auth))) {
      await authFailed(store, client, now);
      return json(401, { error: "unauthorized" });
    }
    if (path.endsWith("/stt")) {
      if (typeof b.audio !== "string" || !b.audio.length || b.audio.length > 2_500_000 || !/^[A-Za-z0-9+/=]+$/.test(b.audio)) return json(400, { error: "bad audio" });
      const est = estimateStt(b.audio.length);
      const r = await reserve(store, b.vault, est, now);
      if (!r.ok) return json(429, { error: r.why });
      const out = await ai.run(STT_MODEL, { audio: b.audio, language: "de" });
      await book(store, r, est);
      return json(200, { text: String((out && out.text) || "").slice(0, 4000) });
    }
    const messages = cleanMessages(b.messages),
      tools = cleanTools(b.tools);
    if (!messages || !tools) return json(400, { error: "bad request" });
    // Schätzung mit dem teuersten möglichen Modell der Liste (falls auf das nächste ausgewichen wird)
    const est = Math.max(...models.map((m) => estimateChat(messages, tools, m)));
    const r = await reserve(store, b.vault, est, now);
    if (!r.ok) return json(429, { error: r.why, remaining: r.remaining });
    let out = null,
      model = null;
    for (const m of models) {
      try {
        out = await ai.run(m, { messages, ...(tools.length ? { tools } : {}), max_tokens: MAX_TOKENS, temperature: 0.3 });
        model = m;
        break;
      } catch (e) {
        if (!/\b(410|403|5028|5035|404|5007)\b/.test(String((e && e.message) || e))) {
          await book(store, r, est);
          throw e; // anderer Fehler: nicht auf das nächste Modell ausweichen
        }
      }
    }
    if (!model) {
      await book(store, r, 0);
      return json(503, { error: "unavailable" });
    }
    const u = out && out.usage;
    const [ni, no] = rate(model);
    const used = u && Number.isFinite(u.prompt_tokens) ? Math.max(1, Math.ceil(u.prompt_tokens * ni + (u.completion_tokens || 0) * no)) : est;
    const remaining = await book(store, r, used);
    const calls = Array.isArray(out && out.tool_calls) ? out.tool_calls.slice(0, 6).map((c) => ({ name: String(c.name || "").slice(0, 64), arguments: typeof c.arguments === "string" ? safeJson(c.arguments) : c.arguments || {} })) : [];
    return json(200, { text: String((out && out.response) || "").slice(0, 12000), tool_calls: calls, model, usage: { neurons: used, remaining } });
  } catch {
    return json(503, { error: "unavailable" }); // keine Einzelheiten, keine Inhalte
  }
}
function safeJson(s) {
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}
