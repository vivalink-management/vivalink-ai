// Autonomie: Zyklus, widerrufbare Berechtigungen (Stufe 2 automatisch nur damit, Stufe 3 nie),
// Aufgaben-Kanal für geplante KI-Aufgaben (nur öffentliche Fakten, Ergebnisse nur als Entwürfe). Nur künstliche Daten.
import { test, expect } from "@playwright/test";
import { guard, seed, nav, state, kv, expectToast } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";
import { holen, abgeben, pruefen } from "../scripts/ki-aufgabe.mjs";

const BASE = "http://127.0.0.1:4173";
const NOW = new Date("2026-03-02T09:00:00");
function brandOk(s) {
  s.studio = { brand: { region: "Testregion", signup: "Registrierung über vivalink.me", colorsConfirmed: true, website: "vivalink.me" }, settings: {}, posts: [], learned: {} };
  return s;
}
test.beforeEach(async ({ page }) => page.clock.setFixedTime(NOW));

test("Ohne Berechtigung keine automatische Freigabe; mit Berechtigung nur geprüfte Beiträge, begrenzt und widerrufbar", async ({ page }) => {
  const g = await guard(page);
  await seed(page, { state: brandOk(v2State()) });
  await page.evaluate(() => {
    const mk = (date, title, caption) => S.studio.posts.push(makePost({ date, pillar: "community", type: "einzelbild", title, hook: title, slides: [{ template: "frage", title }], caption }, "ki"));
    mk("2026-03-03", "Eins", "Text eins vivalink.me");
    mk("2026-03-04", "Zwei", "Text zwei vivalink.me");
    mk("2026-03-05", "Drei", "Text drei vivalink.me");
    mk("2026-03-05", "Mit Preis", "Nur 5 € vivalink.me");
    mk("2026-03-20", "Zu spät", "Text vier vivalink.me");
    return save();
  });
  // Ohne Berechtigung: Zyklus gibt nichts frei
  let rep = await page.evaluate(() => runCycle("test"));
  expect(rep.steps.map((s) => s.k)).toEqual(["erfassen", "analysieren", "aufgaben", "massnahmen", "entwuerfe", "freigaben", "ausfuehren", "pruefen"]);
  expect((await state(page)).studio.posts.filter((p) => p.status === "freigegeben")).toHaveLength(0);
  expect(await page.evaluate(() => mayRun("post.approve", "auto").ok)).toBe(false);
  // Berechtigung in der Oberfläche erteilen: höchstens 2 pro Woche
  await nav(page, "more");
  await page.click('button[data-a="auto"]');
  await page.locator("#sheet summary", { hasText: "Neue Berechtigung" }).click();
  await page.selectOption("#au-act", "post.approve");
  await page.fill("#au-max", "2");
  await page.click('button[data-a="auGrant"]');
  await expectToast(page, "Berechtigung erteilt");
  await expect(page.locator("#sheet")).toContainText("höchstens 2 pro Woche");
  rep = await page.evaluate(() => runCycle("test"));
  let P = (await state(page)).studio.posts;
  expect(P.filter((p) => p.status === "freigegeben").map((p) => p.title).sort()).toEqual(["Eins", "Zwei"]); // Limit 2
  expect(P.find((p) => p.title === "Mit Preis").status).toBe("entwurf"); // Prüfhinweis → nie automatisch
  expect(P.find((p) => p.title === "Zu spät").status).toBe("entwurf"); // außerhalb von 7 Tagen
  expect(await page.evaluate(() => ACTIONS.filter((a) => a.name === "post.approve" && a.by === "auto" && a.ok).every((a) => a.grant && a.detail.startsWith("mit Berechtigung")))).toBe(true);
  // Gleichzeitige Abläufe überschreiten das Limit nicht
  await page.evaluate(() => {
    for (const p of S.studio.posts.filter((x) => x.status === "freigegeben")) (p.status = "entwurf"), (p.approvedHash = null);
    ACTIONS = ACTIONS.filter((a) => !a.grant);
  });
  await page.evaluate(() => Promise.all([runCycle("a"), runCycle("b"), runCycle("c")]));
  expect((await state(page)).studio.posts.filter((p) => p.status === "freigegeben")).toHaveLength(2);
  // Ausgeschöpft
  expect(await page.evaluate(() => mayRun("post.approve", "auto"))).toMatchObject({ ok: false, why: expect.stringContaining("ausgeschöpft") });
  // Widerrufen
  await page.click('button[data-a="auCycle"]');
  await expect.poll(() => kv(page, "cycle-last").then((x) => x.reason)).toBe("manuell");
  await expect(page.locator('button[data-a="auRevoke"]')).toBeVisible();
  await page.click('button[data-a="auRevoke"]');
  await expectToast(page, "widerrufen");
  expect(await page.evaluate(() => mayRun("post.approve", "auto").why)).toContain("keine aktive Berechtigung");
  const gr = (await state(page)).grants;
  expect(gr).toHaveLength(1);
  expect(gr[0].revokedAt).toBeTruthy(); // Widerruf bleibt nachvollziehbar
  expect(await page.evaluate(() => ACTIONS.filter((a) => a.name === "grant.manage" && a.ok).length)).toBe(2);
  expect(g.errors).toEqual([]);
});

test("Stufe 3 bleibt gesperrt; Berechtigungen sind befristet und werden mit synchronisiert", async ({ page }) => {
  await seed(page, { state: brandOk(v2State()) });
  const r = await page.evaluate(async () => {
    const a = addGrant("price.change", addDays(today(), 10), 1);
    const b = addGrant("post.approve", addDays(today(), 200), 1);
    const c = addGrant("post.approve", addDays(today(), -1), 1);
    // manipulierter Eintrag (z. B. aus einem Backup) wird verworfen
    const inc = cleanIncoming({ memory: [], tasks: [], grants: [{ id: "g1", action: "payment.trigger", until: "2099-01-01", max: 50 }, { id: "g2", action: "post.publish", until: "2026-03-20", max: 2, updatedAt: 5 }] }, []);
    const d = addGrant("post.approve", addDays(today(), 10), 1);
    const bk = JSON.parse(JSON.stringify(await makeBackup()));
    return { a: a.ok, b: b.error, c: c.error, inc: inc.grants.map((x) => x.action), lvl3: mayRun("payment.trigger", "auto").ok, d: d.ok, inBackup: bk.data.grants.length };
  });
  expect(r).toEqual({ a: false, b: expect.stringContaining("3 Monate"), c: expect.stringContaining("Zukunft"), inc: ["post.publish"], lvl3: false, d: true, inBackup: 1 });
  // Abgelaufen → wirkungslos
  await page.clock.setFixedTime(new Date(NOW.getTime() + 12 * 864e5));
  expect(await page.evaluate(() => mayRun("post.approve", "auto").ok)).toBe(false);
});

test("Zyklus läuft beim Start und ist unter „Mehr › Autonomie“ nachvollziehbar", async ({ page }) => {
  const s = brandOk(v2State());
  s.meetup = { date: "2026-03-12", place: "Testort", goal: "", note: "", updatedAt: 1 };
  await seed(page, { state: s });
  const last = await kv(page, "cycle-last");
  expect(last.reason).toBe("start");
  expect(last.steps.find((x) => x.k === "entwuerfe").n).toBe(1); // Meetup-Ankündigung
  await nav(page, "more");
  await page.click('button[data-a="auto"]');
  await expect(page.locator("#cycle")).toContainText("5. Entwürfe erstellen");
  await expect(page.locator("#cycle")).toContainText("Meetup-Ankündigung");
  await expect(page.locator("#sheet")).toContainText("Preise festlegen oder ändern");
  await expect(page.locator("#sheet")).toContainText("nie automatisch");
  // Zweiter Start: keine doppelten Entwürfe, kein Protokoll-Rauschen
  await page.reload();
  await page.waitForFunction(() => window.VL_READY === true); // Startablauf abgeschlossen
  expect((await state(page)).studio.posts).toHaveLength(1);
  expect(await page.evaluate(() => ACTIONS.filter((a) => a.name === "studio.autoDraft").length)).toBe(1);
});

test("Geplante Claude-Aufgabe: Auftrag (Instagram + Wochenanalyse) ohne Vertrauliches, Rückgabe nur als Entwürfe und Vorschläge, einmalig", async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((u) => (window.VL_SYNC_URL = u), BASE);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const s = brandOk(v2State());
  s.memory.push({ id: "m-int", cat: "Geschäftsmodell", title: "Interne Kalkulation Zebra", text: "vertraulich", status: "confirmed", active: true, private: false, date: "2026-01-01", updatedAt: 1 });
  s.memory.push({ id: "m-priv", cat: "Ziele", title: "Privates Detail Okapi", text: "x", status: "confirmed", active: true, private: true, date: "2026-01-01", updatedAt: 1 });
  s.memory.push({ id: "m-app", cat: "App", title: "Profil mit Interessen", text: "Man gibt Interessen an.", status: "confirmed", active: true, private: false, date: "2026-01-01", updatedAt: 1 });
  await seed(page, { state: s });
  await nav(page, "more");
  await page.click('button[data-a="auto"]');
  await page.click('button[data-a="auTaskSetup"]');
  const tk = await page.locator("#auTk").inputValue();
  expect(tk).toMatch(/^[0-9a-f]{64}$/);
  // Auftrag wird beim Einrichten sofort bereitgestellt; die geplante Aufgabe (Node, wie in der Claude-Umgebung) holt ihn
  await expect.poll(() => holen(BASE, tk).then((p) => p && p.version)).toBe(2);
  const pkg = await holen(BASE, tk);
  expect(pkg.studio.slots.length).toBeGreaterThan(3);
  expect(pkg.studio.prompt).toContain("Profil mit Interessen");
  expect(pkg.analyse.prompt).toContain("vivalink-actions");
  expect(pkg.analyse.report).toContain("Wochenbericht");
  const all = JSON.stringify(pkg);
  expect(all).not.toContain("Zebra"); // Geschäftsmodell-Interna
  expect(all).not.toContain("Okapi"); // vertraulich
  expect(all).not.toContain("kontakt@example.invalid");
  // Ohne oder mit falschem Token: kein Zugriff
  expect(await holen(BASE, "f".repeat(64))).toBeNull();
  expect((await fetch(BASE + "/v1/task/out")).status).toBe(401);
  // Ergebnis prüfen und abgeben
  const res = {
    posts: { format: "vivalink-studio-plan", version: 1, posts: pkg.studio.slots.slice(0, 2).map((x, i) => ({ ...x, title: "KI-Aufgabe " + i, hook: "Einstieg " + ["eins", "zwei"][i], slides: [{ template: "frage", title: "Frage " + i }], caption: "Text vivalink.me" })) },
    analysis: { text: "Kurzfazit: Die Woche war ruhig. Empfehlung: Meetup-Orte erweitern. Annahme: mehr Auswahl erhöht Anmeldungen.", actions: { format: "vivalink-actions", version: 1, tasks: [{ title: "Zwei neue Meetup-Orte anfragen", prio: "hoch", area: "Meetup", dueDays: 5, why: "Mehr Auswahl" }, { title: "Teilnahmepreis prüfen", prio: "mittel", area: "Finanzen", dueDays: 7, why: "Kosten" }] } },
  };
  expect(pruefen(res)).toEqual([]);
  expect(pruefen({ posts: { posts: [{}] } }).length).toBeGreaterThan(0);
  await abgeben(BASE, res, pkg.id, tk);
  await page.click('button[data-a="auTaskIn"]');
  await expectToast(page, "2 Entwürfe, Wochenanalyse, 2 Aufgabenvorschläge übernommen");
  let st = await state(page);
  expect(st.studio.posts.filter((p) => p.source === "ki-aufgabe").map((p) => p.status)).toEqual(["entwurf", "entwurf"]);
  expect(st.memory.find((m) => m.title.startsWith("KI-Wochenanalyse"))).toMatchObject({ status: "estimate" });
  expect(st.tasks.some((t) => t.title.includes("Meetup-Orte"))).toBe(false); // Vorschläge, noch keine Aufgaben
  // Postfach „in“ wurde geleert; erneutes Abholen bringt nichts doppelt
  await page.click('button[data-a="auTaskIn"]');
  await expectToast(page, "keine Ergebnisse");
  // Vorschläge erscheinen unter „Entscheidungen für dich“ und werden erst nach Auswahl angelegt
  await page.click('#sheet button[data-a="close"]');
  await nav(page, "home");
  await page.locator("#decide .todo", { hasText: "KI-Vorschläge prüfen: 2" }).click();
  await page.click('button[data-a="ansApply"]');
  await expectToast(page, "2 Aufgabe(n) angelegt");
  st = await state(page);
  expect(st.tasks.find((t) => t.title === "Zwei neue Meetup-Orte anfragen")).toBeTruthy();
  expect(st.tasks.find((t) => t.title === "Entscheidung: Teilnahmepreis prüfen")).toMatchObject({ decision: true });
  await nav(page, "home");
  await expect(page.locator("#decide")).not.toContainText("KI-Vorschläge prüfen");
  // Der Server sieht kein Token im Klartext
  const dump = JSON.stringify(await (await page.request.get(BASE + "/__store-dump")).json());
  expect(dump).not.toContain(tk);
  await ctx.close();
});

test("Zyklus holt Ergebnisse selbst ab und erneuert den Auftrag höchstens alle 20 Stunden", async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((u) => (window.VL_SYNC_URL = u), BASE);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await seed(page, { state: brandOk(v2State()) });
  const tk = await page.evaluate(async () => (await taskSetup()).token);
  await page.evaluate(() => runCycle("test"));
  const first = (await holen(BASE, tk)).id;
  await page.evaluate(() => runCycle("test"));
  expect((await holen(BASE, tk)).id).toBe(first); // nicht erneut innerhalb von 20 Stunden
  await abgeben(BASE, { analysis: { text: "Eine ausreichend lange künstliche Analyse für den automatischen Abruf im Zyklus." } }, first, tk);
  const rep = await page.evaluate(() => runCycle("test"));
  expect(rep.steps[0].note).toContain("Wochenanalyse");
  await page.clock.setFixedTime(new Date(NOW.getTime() + 21 * 3600e3));
  await page.evaluate(() => runCycle("test"));
  expect((await holen(BASE, tk)).id).not.toBe(first);
  await ctx.close();
});
