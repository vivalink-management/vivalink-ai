// LIVE (nur manuell, LIVE_GESPRAECH=1): Gesprächsqualität und Absichtsprüfung der NEUEN App-Version (lokal ausgeliefert,
// nicht veröffentlicht) mit dem bereitgestellten Worker „vivalink-ki“ (Llama 3.3 70B). Künstliche Daten in einem frischen
// Browser, vorübergehender Test-Zugang, danach gesperrt. Anfragen an den Worker werden mit der App-Herkunft weitergereicht
// (die App läuft hier nicht unter der echten Adresse). Verbrauch: wenige hundert der kostenlosen Neurons.
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { ready } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const KI = "https://vivalink-ki.hidden-art-0326.workers.dev";
const SYNC = "https://vivalink-sync.hidden-art-0326.workers.dev";
const ORIGIN = "https://vivalink-management.github.io";
test.skip(!process.env.LIVE_GESPRAECH, "nur mit LIVE_GESPRAECH=1");
test.setTimeout(300_000);

test("Live: Rückfragen im Zusammenhang, keine Aufgabe bei Fragen, genau eine bei ausdrücklichem Auftrag, kurz im Sprachmodus", async ({ page }) => {
  const vid = randomBytes(16).toString("hex"),
    tok = randomBytes(32).toString("hex");
  const h = { origin: ORIGIN, "content-type": "application/json", authorization: "Bearer " + tok };
  expect((await fetch(SYNC + "/v1/vault/" + vid, { method: "PUT", headers: h, body: JSON.stringify({ blob: randomBytes(48).toString("base64"), expected: 0 }) })).status).toBe(200);
  const log = [];
  try {
    await page.route((u) => u.href.startsWith(KI), async (route) => {
      const r = route.request();
      const res = await fetch(r.url(), { method: r.method(), headers: { ...h, authorization: (await r.headerValue("authorization")) || "" }, body: r.method() === "POST" ? r.postData() : undefined });
      const body = await res.text();
      const j = JSON.parse(body || "{}");
      const req = JSON.parse(r.postData() || "{}");
      log.push({ status: res.status, tools: (req.tools || []).map((t) => t.function.name), calls: (j.tool_calls || []).map((c) => c.name), neurons: j.usage && j.usage.neurons });
      await route.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body });
    });
    await page.route((u) => u.href.startsWith(SYNC) || u.hostname.endsWith("supabase.co"), (r) => r.abort()); // nichts an Synchronisierung/Verwaltung
    await page.goto("/");
    await ready(page);
    await page.evaluate(
      async ({ s, vid, tok }) => {
        await kvPut("state", s);
        await kvPut("sync-config", { vid, token: tok, mk: "x", kv: 1, version: 1, devices: {} });
        await kvPut("ki-config", { on: true, freigaben: { kennzahlen: true, aufgaben: true, meetup: true } });
      },
      { s: v2State(), vid, tok },
    );
    await page.reload();
    await ready(page);
    const tasks0 = await page.evaluate(() => S.tasks.filter((t) => !t.deleted).length);
    await page.click('nav button[data-id="ai"]');
    await page.click('button[data-a="chatNew"]');
    const ask = async (q, via = "text") => {
      const n = await page.evaluate(() => S.chatMsgs.length);
      const n0 = log.length;
      if (via === "voice") await page.evaluate((q) => chatSend(q, "voice"), q);
      else {
        await page.fill("#chatIn", q);
        await page.click('button[data-a="chatSend"]');
      }
      await expect.poll(() => page.evaluate(() => S.chatMsgs.length), { timeout: 120_000 }).toBe(n + 2);
      const m = await page.evaluate(() => S.chatMsgs.at(-1));
      console.log("\nFRAGE:", q, via === "voice" ? "(Sprachmodus)" : "", "\nAUFRUFE:", JSON.stringify(log.slice(n0)), "\nANTWORT (" + m.engine + ", " + m.text.length + " Zeichen):\n" + m.text.slice(0, 1200), "\nAUFTRÄGE:", JSON.stringify((m.actions || []).map((a) => [a.title, a.status])));
      expect(m.engine).toBe("ki");
      return m;
    };
    await ask("Wie entwickeln sich die Anmeldungen bei Vivalink?");
    const m2 = await ask("Du hast mir gerade empfohlen, mehr Marketing zu machen. Welche konkrete Maßnahme würdest du als Erstes umsetzen und warum?");
    expect(await page.evaluate(() => S.tasks.filter((t) => !t.deleted).length), "keine Aufgabe bei einer Frage").toBe(tasks0);
    expect((m2.actions || []).filter((a) => a.status === "erledigt")).toEqual([]);
    const m3 = await ask("Und woran würden wir nach vier Wochen merken, ob das funktioniert?", "voice");
    expect(m3.text.length, "kurz im Sprachmodus").toBeLessThan(900);
    await ask("Lege eine Aufgabe an: Wöchentliche Instagram-Serie mit Meetup-Momenten starten");
    const created = await page.evaluate(() => S.tasks.filter((t) => !t.deleted && t.src === "chat").map((t) => t.title));
    console.log("ANGELEGT:", JSON.stringify(created));
    expect(created.length, "genau eine Aufgabe").toBe(1);
    console.log("VERBRAUCH Neurons:", log.reduce((a, x) => a + (x.neurons || 0), 0));
  } finally {
    console.log("Test-Zugang gesperrt:", (await fetch(SYNC + "/v1/vault/" + vid, { method: "DELETE", headers: h })).status);
  }
});
