// LIVE (nur manuell, LIVE_QUALITAET=1): Qualitäts-Testset gegen das echte kostenlose Modell (Worker „vivalink-ki“),
// einmal mit der VERÖFFENTLICHTEN App (Basis) und einmal mit der neuen App (lokal ausgeliefert, nicht veröffentlicht;
// künstliches Testprofil und Playbook freigegeben). Künstliche Daten in frischen Browsern, vorübergehende Test-Zugänge,
// danach gesperrt. Verbrauch: je Lauf ca. 1.500–2.500 der kostenlosen Neurons.
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { ready } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";
import { GESPRAECHE, TESTPROFIL, bewerte, zusammenfassung } from "./qualitaet-rubrik.mjs";

const SITE = process.env.LIVE_SITE || "https://vivalink-management.github.io/vivalink-ai/";
const KI = "https://vivalink-ki.hidden-art-0326.workers.dev";
const SYNC = "https://vivalink-sync.hidden-art-0326.workers.dev";
const ORIGIN = "https://vivalink-management.github.io";
test.skip(!process.env.LIVE_QUALITAET, "nur mit LIVE_QUALITAET=1");
test.setTimeout(900_000);
const ERG = {};

for (const variante of ["basis", "neu"]) {
  test(`Live-Qualität: ${variante === "basis" ? "veröffentlichte App (Basis)" : "neue App (lokal)"}`, async ({ browser, baseURL }) => {
    const vid = randomBytes(16).toString("hex"),
      tok = randomBytes(32).toString("hex");
    const h = { origin: ORIGIN, "content-type": "application/json", authorization: "Bearer " + tok };
    expect((await fetch(SYNC + "/v1/vault/" + vid, { method: "PUT", headers: h, body: JSON.stringify({ blob: randomBytes(48).toString("base64"), expected: 0 }) })).status).toBe(200);
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    let neurons = 0,
      aufrufe = 0;
    try {
      // KI-Anfragen: bei der lokalen App mit der App-Herkunft weiterreichen; Verbrauch mitzählen
      await page.route((u) => u.href.startsWith(KI), async (route) => {
        const r = route.request();
        const res = await fetch(r.url(), { method: r.method(), headers: { ...h, authorization: (await r.headerValue("authorization")) || "" }, body: r.method() === "POST" ? r.postData() : undefined });
        const body = await res.text();
        try {
          const j = JSON.parse(body);
          if (j.usage) (neurons += j.usage.neurons || 0), aufrufe++;
        } catch {}
        await route.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body });
      });
      await page.route((u) => u.href.startsWith(SYNC) || u.hostname.endsWith("supabase.co"), (r) => r.abort());
      await page.goto(variante === "basis" ? SITE : baseURL + "/");
      await ready(page);
      const version = await page.evaluate(() => APP_VERSION);
      await page.evaluate(
        async ({ s, vid, tok }) => {
          await kvPut("state", s);
          await kvPut("sync-config", { vid, token: tok, mk: "x", kv: 1, version: 1, devices: {} });
          await kvPut("ki-config", { on: true, freigaben: { kennzahlen: true, aufgaben: true, meetup: true, technik: true, instagram: true } });
        },
        { s: v2State(), vid, tok },
      );
      await page.reload();
      await ready(page);
      const mitProfil = await page.evaluate(async (p) => {
        if (typeof profileSave !== "function") return null;
        profileSave(p, true);
        playbookSetApproved(true);
        await save();
        return true;
      }, TESTPROFIL);
      const R = [];
      for (const gespraech of GESPRAECHE) {
        await page.evaluate(() => {
          const c = newChat("Qualitätstest");
          chatOpen = c.id;
        });
        const prevs = [];
        for (const [frage, art] of gespraech) {
          const tasks0 = await page.evaluate(() => S.tasks.filter((t) => !t.deleted).length);
          const m = await page.evaluate((q) => chatSend(q, "text"), frage);
          const tasks1 = await page.evaluate(() => S.tasks.filter((t) => !t.deleted).length);
          const text = (m.blocks || []).filter((b) => b.k === "ki").map((b) => b.t).join("\n") || m.text;
          const r = bewerte({ frage, art, text, prevs, aktionenNeu: tasks1 - tasks0, mitProfil });
          R.push(r);
          prevs.push(text);
          console.log(`\n[${variante} ${version}] ${art.toUpperCase()} – ${frage}\n${text.slice(0, 900)}\n→ ${r.punkte}/${r.max} ${JSON.stringify(r.k)}`);
        }
      }
      const z = zusammenfassung(R);
      ERG[variante] = { version, ...z, neurons, aufrufe };
      console.log(`\nERGEBNIS ${variante} ${version}: ${z.prozent} % (${z.punkte}/${z.max}) · Kriterien ${JSON.stringify(z.kriterien)} · ${aufrufe} Modellaufrufe, ${neurons} Neurons`);
      if (variante === "neu") console.log("VERGLEICH", JSON.stringify(ERG));
    } finally {
      await ctx.close();
      console.log("Test-Zugang gesperrt:", (await fetch(SYNC + "/v1/vault/" + vid, { method: "DELETE", headers: h })).status);
    }
  });
}
