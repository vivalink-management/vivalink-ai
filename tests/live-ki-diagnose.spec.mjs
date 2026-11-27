// LIVE-Diagnose (nur manuell, LIVE_DIAG=1): Welche Nachrichtenform für den zweiten Schritt (Werkzeugergebnisse zurück
// an das Modell) akzeptiert der Worker/Workers AI? Ausschließlich künstliche Inhalte, vorübergehender Test-Zugang,
// danach gesperrt. Wenige Dutzend kostenlose Neurons.
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

const KI = process.env.LIVE_KI_URL || "https://vivalink-ki.hidden-art-0326.workers.dev";
const SYNC = process.env.LIVE_SYNC || "https://vivalink-sync.hidden-art-0326.workers.dev";
const ORIGIN = "https://vivalink-management.github.io";
test.skip(!process.env.LIVE_DIAG, "nur mit LIVE_DIAG=1");
test.setTimeout(180_000);

test("Diagnose: zweiter Schritt mit Werkzeugergebnissen in verschiedenen Formen", async () => {
  const vid = randomBytes(16).toString("hex"),
    tok = randomBytes(32).toString("hex");
  const h = { origin: ORIGIN, "content-type": "application/json", authorization: "Bearer " + tok };
  expect((await fetch(SYNC + "/v1/vault/" + vid, { method: "PUT", headers: h, body: JSON.stringify({ blob: randomBytes(48).toString("base64"), expected: 0 }) })).status).toBe(200);
  const tools = [{ type: "function", function: { name: "test_zahlen", description: "Liefert künstliche Testzahlen", parameters: { type: "object", properties: {} } } }];
  const q = { role: "user", content: "Technischer Test ohne echte Daten: Wie viele Testpunkte gibt es laut Werkzeug?" };
  const res = "[Fakt] Testpunkte: 7 (künstlich)";
  const call = async (name, messages, withTools = true) => {
    const r = await fetch(KI + "/v1/ki/chat", { method: "POST", headers: h, body: JSON.stringify({ vault: vid, messages, ...(withTools ? { tools } : {}) }) });
    const j = await r.json().catch(() => ({}));
    console.log("FORM", name, "→", r.status, JSON.stringify({ error: j.error, model: j.model, text: (j.text || "").slice(0, 80), calls: j.tool_calls }));
    return r.status;
  };
  try {
    const out = {};
    out.A_app_aktuell = await call("A: assistant.tool_calls + role tool (wie App 2.11.0)", [q, { role: "assistant", content: "", tool_calls: [{ name: "test_zahlen", arguments: {} }] }, { role: "tool", name: "test_zahlen", content: res }]);
    out.B_nur_tool = await call("B: nur role tool", [q, { role: "tool", name: "test_zahlen", content: res }]);
    out.C_assistant_text = await call("C: assistant-Text + role tool", [q, { role: "assistant", content: "Ich rufe test_zahlen auf." }, { role: "tool", name: "test_zahlen", content: res }]);
    out.D_klartext = await call("D: Ergebnisse als Nutzer-Nachricht, ohne Werkzeuge", [q, { role: "assistant", content: "(Werkzeug test_zahlen aufgerufen)" }, { role: "user", content: "Ergebnisse der Werkzeuge:\n" + res + "\nBeantworte jetzt die ursprüngliche Frage." }], false);
    console.log("ERGEBNIS", JSON.stringify(out));
  } finally {
    await fetch(SYNC + "/v1/vault/" + vid, { method: "DELETE", headers: h });
  }
});
