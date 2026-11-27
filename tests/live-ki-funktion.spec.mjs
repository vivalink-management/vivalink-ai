// LIVE-Funktionsprüfung des Workers „vivalink-ki“ mit AUSSCHLIESSLICH künstlichen Inhalten (keine Unternehmensdaten):
// legt einen vorübergehenden Test-Zugang (Zufallsschlüssel, leerer verschlüsselter Block) im Synchronisierungs-Server an,
// stellt eine neutrale Testfrage mit einem Test-Werkzeug und sperrt den Test-Zugang danach wieder.
// Verbraucht wenige hundert der 10.000 kostenlosen Neurons. Nur mit LIVE=1 (Ablauf „Live-Prüfung KI“, manuell).
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

const KI = process.env.LIVE_KI_URL || "https://vivalink-ki.hidden-art-0326.workers.dev";
const SYNC = process.env.LIVE_SYNC || "https://vivalink-sync.hidden-art-0326.workers.dev";
const ORIGIN = "https://vivalink-management.github.io";
test.skip(!process.env.LIVE, "nur mit LIVE=1");
test.setTimeout(120_000);

test("Live: echte KI-Antwort und Werkzeugaufruf mit künstlichem Test-Zugang; danach gesperrt", async () => {
  const vid = randomBytes(16).toString("hex"),
    tok = randomBytes(32).toString("hex");
  const h = { origin: ORIGIN, "content-type": "application/json", authorization: "Bearer " + tok };
  // vorübergehender Test-Tresor (Inhalt: zufällige Bytes, keine Daten)
  let r = await fetch(SYNC + "/v1/vault/" + vid, { method: "PUT", headers: h, body: JSON.stringify({ blob: randomBytes(48).toString("base64"), expected: 0 }) });
  expect(r.status).toBe(200);
  try {
    const tools = [{ type: "function", function: { name: "test_werkzeug", description: "Liefert eine Testzahl (künstlich)", parameters: { type: "object", properties: {} } } }];
    r = await fetch(KI + "/v1/ki/chat", { method: "POST", headers: h, body: JSON.stringify({ vault: vid, messages: [{ role: "system", content: "Antworte auf Deutsch in einem kurzen Satz." }, { role: "user", content: "Dies ist ein technischer Test ohne echte Daten. Sag bitte: Verbindung funktioniert." }] }) });
    const j = await r.json();
    console.log("Antwort:", r.status, JSON.stringify({ model: j.model, text: j.text, usage: j.usage, error: j.error }));
    expect(r.status).toBe(200);
    expect(j.text.length).toBeGreaterThan(3);
    expect(j.usage.remaining).toBeLessThanOrEqual(8000);
    r = await fetch(KI + "/v1/ki/chat", { method: "POST", headers: h, body: JSON.stringify({ vault: vid, tools, messages: [{ role: "user", content: "Rufe das Werkzeug test_werkzeug auf, um die Testzahl zu erhalten." }] }) });
    const k = await r.json();
    console.log("Werkzeug:", r.status, JSON.stringify({ model: k.model, tool_calls: k.tool_calls, text: (k.text || "").slice(0, 120), usage: k.usage }));
    expect(r.status).toBe(200);
    expect(k.tool_calls.map((c) => c.name)).toContain("test_werkzeug");
  } finally {
    // Test-Zugang sperren (Daten werden gelöscht) – danach weist die KI ihn ab
    r = await fetch(SYNC + "/v1/vault/" + vid, { method: "DELETE", headers: h });
    console.log("Test-Zugang gesperrt:", r.status);
  }
  r = await fetch(KI + "/v1/ki/chat", { method: "POST", headers: h, body: JSON.stringify({ vault: vid, messages: [{ role: "user", content: "x" }] }) });
  expect(r.status).toBe(401);
});
