// LIVE (nur manuell, LIVE_DIAG=1): Die VERÖFFENTLICHTE App (GitHub Pages) erhält vom bereitgestellten Worker
// „vivalink-ki“ vollständige KI-Antworten – auch bei Fragen mit Werkzeugaufrufen.
// Nur künstliche Daten in einem frischen Browser (nichts von echten Geräten), vorübergehender Test-Zugang, danach
// gesperrt. Synchronisierung und Verwaltung werden im Browser blockiert (es wird dort nichts gelesen oder geschrieben).
// Verbrauch: wenige hundert der kostenlosen täglichen Neurons.
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { ready } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const SITE = process.env.LIVE_SITE || "https://vivalink-management.github.io/vivalink-ai/";
const KI = "https://vivalink-ki.hidden-art-0326.workers.dev";
const SYNC = "https://vivalink-sync.hidden-art-0326.workers.dev";
const ORIGIN = "https://vivalink-management.github.io";
test.skip(!process.env.LIVE_DIAG, "nur mit LIVE_DIAG=1");
test.setTimeout(240_000);

test("Live: veröffentlichte App erhält vollständige KI-Antworten mit Werkzeugaufrufen (künstliche Daten)", async ({ browser }) => {
  const vid = randomBytes(16).toString("hex"),
    tok = randomBytes(32).toString("hex");
  const h = { origin: ORIGIN, "content-type": "application/json", authorization: "Bearer " + tok };
  expect((await fetch(SYNC + "/v1/vault/" + vid, { method: "PUT", headers: h, body: JSON.stringify({ blob: randomBytes(48).toString("base64"), expected: 0 }) })).status).toBe(200);
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  try {
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const ki = [];
    // nur App-Adresse und KI-Worker; alles andere (Synchronisierung, Verwaltung, sonstige Ziele) blockiert
    await p.route((u) => !u.href.startsWith(SITE) && !u.href.startsWith(KI), (r) => r.abort());
    p.on("response", async (r) => {
      if (!r.url().startsWith(KI) || r.request().method() !== "POST") return;
      const body = JSON.parse(r.request().postData() || "{}");
      const j = await r.json().catch(() => ({}));
      ki.push({ status: r.status(), tools: Array.isArray(body.tools) && body.tools.length > 0, roles: (body.messages || []).map((m) => m.role + ("tool_calls" in m ? "+tool_calls" : "")).join(","), model: j.model, calls: (j.tool_calls || []).map((c) => c.name), neurons: j.usage && j.usage.neurons, code: j.code });
    });
    await p.goto(SITE);
    await ready(p);
    const version = await p.evaluate(() => APP_VERSION);
    console.log("VERSION der veröffentlichten App:", version);
    await p.evaluate(
      async ({ s, vid, tok }) => {
        await kvPut("state", s);
        await kvPut("sync-config", { vid, token: tok, mk: "x", kv: 1, version: 1, devices: {} });
        await kvPut("ki-config", { on: true, freigaben: { kennzahlen: true, aufgaben: true, meetup: true, technik: true } });
      },
      { s: v2State(), vid, tok },
    );
    await p.reload();
    await ready(p);
    await p.click('nav button[data-id="ai"]');
    await p.click('button[data-a="chatNew"]');
    const fragen = ["Wie entwickelt sich Vivalink aktuell? Wie viele echte Nutzer haben wir, und was würdest du als Nächstes empfehlen?", "Welche Aufgaben sind offen?"];
    for (let i = 0; i < fragen.length; i++) {
      const n0 = ki.length;
      await p.fill("#chatIn", fragen[i]);
      await p.click('button[data-a="chatSend"]');
      await expect.poll(() => p.evaluate(() => S.chatMsgs.length), { timeout: 90_000 }).toBe(2 * (i + 1));
      const last = await p.evaluate(() => S.chatMsgs.at(-1));
      const text = await p.locator(".msg.ai .bub").last().innerText();
      console.log("FRAGE", i + 1, "Aufrufe:", JSON.stringify(ki.slice(n0)));
      console.log("ANTWORT", i + 1, "engine=" + last.engine, "Länge=" + text.length, "\n" + text.slice(0, 1500));
      expect(text, "kein Ausweichen auf den lokalen Assistenten").not.toContain("KI nicht verfügbar");
      expect(last.engine).toBe("ki");
      expect(ki.slice(n0).every((x) => x.status === 200), "alle KI-Aufrufe erfolgreich").toBe(true);
      expect(text.trim().length).toBeGreaterThan(40);
    }
    expect(ki.some((x) => x.calls.length > 0), "mindestens ein Werkzeugaufruf im Test").toBe(true);
    console.log("VERBRAUCH Neurons:", ki.reduce((a, x) => a + (x.neurons || 0), 0));
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    console.log("Test-Zugang gesperrt:", (await fetch(SYNC + "/v1/vault/" + vid, { method: "DELETE", headers: h })).status);
  }
});
