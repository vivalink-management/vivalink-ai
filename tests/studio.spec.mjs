// Instagram-Studio (Stufe 1): Planung, KI-Antwort übernehmen, Faktenprüfung, Grafiken, Freigabe, Export, Auswertung,
// automatische Anlässe, Synchronisierungs-Tauglichkeit und automatische Sicherungspunkte. Nur künstliche Testdaten.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { guard, seed, open, nav, state, kv, stubClipboard, clip, expectToast } from "./helpers.mjs";
import { v2State, T0 } from "./fixtures.mjs";

const NOW = new Date("2026-03-02T09:00:00"); // Montag
const tabTo = (page, k) => page.click(`#sheet [data-a="stTab"][data-id="${k}"]`);
const d = (n) => new Date(NOW.getTime() + n * 864e5).toLocaleDateString("sv-SE");
function brandOk(s) {
  s.studio = { brand: { region: "Testregion", signup: "Registrierung über die Test-Website", colorsConfirmed: true, website: "vivalink.me" }, settings: {}, posts: [], learned: {} };
  return s;
}
/* Künstliche KI-Antwort im Austauschformat für die übergebenen Termine */
function answer(slots, extra = []) {
  const posts = slots.map((s, i) => ({
    date: s.date,
    time: s.time,
    pillar: s.pillar,
    type: s.type,
    title: ["Ankommen leicht gemacht", "Gesprächsstarter am Tisch", "Neue Stadt, neue Leute", "Mut zum ersten Schritt", "Gemeinsam statt allein", "Kleine Runde, große Wirkung", "Freundschaften pflegen", "Offen auf andere zugehen", "Zuhören als Superkraft", "Hobbys verbinden Menschen", "Wochenende mit Kontakten", "Kennenlernen ohne Druck", "Erinnerung ans Treffen", "Danke fürs Mitmachen"][i] || "Weiterer Beitrag " + i,
    hook: `Einzigartiger Einstieg Nummer ${["eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf", "dreizehn", "vierzehn"][i] || "x" + i}`,
    slides:
      s.type === "karussell"
        ? [
            { template: "cover", title: "Testtitel Karussell", text: "Untertitel" },
            { template: "tipp", title: "Erster Testtipp", text: "Erklärung zum Tipp" },
            { template: "tipp", title: "Zweiter Testtipp", text: "Noch eine Erklärung" },
            { template: "abschluss", title: "Lust auf neue Kontakte?", text: "Mehr auf der Website" },
          ]
        : [{ template: s.pillar === "meetup" ? "ankuendigung" : "frage", title: "Was verbindet dich mit Testregion?", text: "Schreib es in die Kommentare", details: s.pillar === "meetup" ? "Testort" : "" }],
    caption: `Testcaption für ${s.pillar}. Freundlich und natürlich.\n\nMehr auf vivalink.me`,
    hashtags: ["#Vivalink", "Test Tag", "#NeueLeute"],
    facts: ["F1"],
  }));
  return "Hier ist dein Plan:\n```json\n" + JSON.stringify({ format: "vivalink-studio-plan", version: 1, posts: [...posts, ...extra] }) + "\n```";
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("Markenprofil: Hinweis bei fehlenden Angaben, Speichern, Farben aus dem Logo vorbelegt", async ({ page }) => {
  const g = await guard(page);
  await open(page);
  await nav(page, "studio");
  await expect(page.locator("#app")).toContainText("Markenprofil vervollständigen: Region.");
  const s0 = await state(page);
  expect(s0.studio.brand.colors).toMatchObject({ pink: "#FA0372", violet: "#6203DD", orange: "#FE6603" });
  expect(s0.studio.brand).toMatchObject({ website: "vivalink.me", signup: "Registrierung über vivalink.me", colorsConfirmed: true });
  await page.click('button[data-a="stBrand"] >> nth=0');
  await page.fill("#bp-region", "Testregion");
  await expect(page.locator("#bp-signup")).toHaveValue("Registrierung über vivalink.me");
  await expect(page.locator("#bp-ok")).toBeChecked();
  await page.uncheck('[data-day="5"]');
  await page.check('[data-day="6"]');
  await page.click('button[data-a="stBrandSave"]');
  await expectToast(page, "Markenprofil gespeichert");
  await expect(page.locator("#app")).not.toContainText("Markenprofil vervollständigen");
  const s = await state(page);
  expect(s.studio.brand).toMatchObject({ region: "Testregion", signup: "Registrierung über vivalink.me", colorsConfirmed: true });
  expect(s.studio.settings.days.sort()).toEqual([1, 3, 6]);
  expect(g.errors).toEqual([]);
});

test("Monatsplan: Auftrag nur mit erlaubten Fakten, Übernahme der KI-Antwort, Grafiken, Wochenansicht", async ({ page }) => {
  const g = await guard(page);
  await stubClipboard(page);
  const s = brandOk(v2State());
  s.meetup = { date: d(12), place: "Testort", goal: "12", note: "", updatedAt: T0 };
  s.memory.push({ id: "pub1", cat: "App", title: "Registrierung in der App", text: "Kostenlose Registrierung mit E-Mail", status: "confirmed", date: "2026-01-02", reason: "", result: "", private: false, active: true, createdAt: 1, updatedAt: 1 });
  await seed(page, { state: s });
  await nav(page, "studio");
  await page.click('button[data-a="stPrompt"]');
  const pr = await page.inputValue("#stPv");
  expect(pr).toContain("Erfinde KEINE Veranstaltungen");
  expect(pr).toContain("Website: vivalink.me");
  expect(pr).toContain("Regionaler Schwerpunkt: Testregion");
  expect(pr).toContain("Nächstes Meetup:");
  expect(pr).toContain("Registrierung in der App"); // bestätigte App-Fakten
  expect(pr).not.toContain("kontakt@example.invalid"); // vertraulich
  expect(pr).not.toContain("Testentscheidung Gamma"); // interne Entscheidung
  expect(pr).not.toContain("Registrierungen pro Woche"); // Kennzahlen nie
  const slots = await page.evaluate(() => planSlots(sm()));
  expect(slots.length).toBe(13); // März 2026 ab 2.3., Mo/Mi/Fr
  // Ankündigung hat die Automatik schon erstellt → im Plan nur noch die Erinnerung (letzter Termin 1–3 Tage vorher)
  expect(slots.filter((x) => x.pillar === "meetup").map((x) => x.date)).toEqual([d(11)]);
  expect(new Set(slots.map((x) => x.pillar)).size).toBeGreaterThanOrEqual(4);
  await page.click('button[data-a="stCpPrompt"]');
  await expect.poll(() => clip(page)).toContain("ANTWORTE NUR MIT DIESEM JSON");
  // KI-Antwort einfügen (mit absichtlich problematischem Zusatzbeitrag)
  const bad = { date: d(4), pillar: "community", type: "einzelbild", title: "Problematisch", hook: "Schon 250 Mitglieder", slides: [{ template: "frage", title: "Über 250 Mitglieder", text: "„Hier habe ich meine besten Freunde gefunden“ – Anna" }], caption: "Nur 5 € pro Treffen! Mehr unter https://example.com", hashtags: [] };
  await page.fill("#stAns", answer(slots, [bad]));
  await page.click('button[data-a="stImport"]');
  await expectToast(page, "14 Beiträge als Entwurf übernommen · 1 mit Prüfhinweis");
  const st = await state(page);
  expect(st.studio.posts.filter((p) => p.source === "regel")).toHaveLength(1); // Meetup in 12 Tagen: automatisch erkannte Ankündigung
  const P = st.studio.posts.filter((p) => p.source === "ki");
  expect(P).toHaveLength(14);
  expect(P.every((p) => p.status === "entwurf" && p.source === "ki")).toBe(true);
  expect(P[0].hashtags).toEqual(["#Vivalink", "#TestTag", "#NeueLeute"]);
  const w = P.find((p) => p.title === "Problematisch").warnings.join(" | ");
  expect(w).toContain("Zahlen oder Daten");
  expect(w).toContain("Preis");
  expect(w).toContain("Erfahrungsbericht");
  expect(w).toContain("Link");
  expect(P.filter((p) => p.title !== "Problematisch").every((p) => !p.warnings.length)).toBe(true);
  // Karussells haben Titel-, Inhalts- und Abschlussfolie
  const k = P.find((p) => p.type === "karussell");
  expect(k.slides.map((x) => x.template)).toEqual(["cover", "tipp", "tipp", "abschluss"]);
  // Wochenansicht mit gezeichneten Vorschaubildern
  await expect(page.locator("h2", { hasText: "KW 10" })).toBeVisible();
  await expect(page.locator("[data-thumb] canvas")).toHaveCount(15);
  const filled = await page.evaluate(() => {
    const c = document.querySelector("[data-thumb] canvas");
    const px = c.getContext("2d").getImageData(c.width / 2, 4, 1, 1).data;
    return px[3] > 0 && !(px[0] === 0 && px[1] === 0 && px[2] === 0);
  });
  expect(filled).toBe(true);
  expect(g.errors).toEqual([]);
  expect(g.external).toEqual([]);
});

test("Wochenfreigabe gibt nur geprüfte Beiträge frei; Beitrag mit Hinweis braucht Einzelfreigabe", async ({ page }) => {
  await seed(page, { state: brandOk(v2State()) });
  await nav(page, "studio");
  const slots = await page.evaluate(() => planSlots(sm()).slice(0, 3));
  const bad = { date: slots[0].date, pillar: "community", type: "einzelbild", title: "Mit Hinweis", hook: "x", slides: [{ template: "frage", title: "Schon 999 Leute dabei" }], caption: "" };
  await page.evaluate((t) => {
    importPlan(t);
    return save();
  }, answer(slots, [bad]));
  await nav(page, "studio");
  await page.locator('button[data-a="stApproveWeek"]').first().click();
  await expectToast(page, "3 Beiträge freigegeben");
  let P = (await state(page)).studio.posts;
  expect(P.find((p) => p.title === "Mit Hinweis").status).toBe("entwurf");
  await page.locator('[data-a="stOpen"]', { hasText: "Mit Hinweis" }).click();
  await expect(page.locator("#sheet")).toContainText("Prüfhinweise");
  await page.click('#sheet .abar button[data-a="stSet"][data-id="freigegeben"]');
  await expectToast(page, "Nochmal tippen");
  await page.click('#sheet .abar button[data-a="stSet"][data-id="freigegeben"]');
  P = (await state(page)).studio.posts;
  expect(P.find((p) => p.title === "Mit Hinweis").status).toBe("freigegeben");
});

test("Bearbeiten, Folie hinzufügen, Löschen; Faktenprüfung läuft bei jeder Änderung", async ({ page }) => {
  await seed(page, { state: brandOk(v2State()) });
  await page.evaluate(() => {
    S.studio.posts.push(makePost({ date: "2026-03-04", pillar: "community", type: "einzelbild", title: "Bearbeitungstest", slides: [{ template: "frage", title: "Alte Frage" }], caption: "Alt" }, "manuell"));
    return save();
  });
  await nav(page, "studio");
  await page.locator('[data-a="stOpen"]', { hasText: "Bearbeitungstest" }).click();
  await expect(page.locator("#stPrev canvas")).toHaveCount(1);
  await tabTo(page, "text");
  await page.fill("#pe-caption", "Neue Caption mit 777 erfundenen Gästen");
  await page.fill('[data-slide="0"][data-f="title"]', "Neue Frage");
  await page.click('button[data-a="stEdit"]');
  await expectToast(page, "Gespeichert · 1 Prüfhinweis(e)");
  let p = (await state(page)).studio.posts.find((x) => x.title === "Bearbeitungstest");
  expect(p.caption).toContain("Neue Caption");
  expect(p.slides[0].title).toBe("Neue Frage");
  expect(p.revs.length).toBeGreaterThan(0);
  await page.click('button[data-a="stAddSlide"]');
  p = (await state(page)).studio.posts.find((x) => x.title === "Bearbeitungstest");
  expect(p.type).toBe("karussell");
  expect(p.slides).toHaveLength(2);
  await expect(page.locator("#stPrev canvas")).toHaveCount(2);
  await tabTo(page, "termin");
  await page.click('button[data-a="stDel"]');
  await page.click('button[data-a="stDel"]');
  await expectToast(page, "Beitrag gelöscht");
  p = (await state(page)).studio.posts.find((x) => x.title === "Bearbeitungstest");
  expect(p.deleted).toBe(true); // bleibt als Löschvermerk für die spätere Synchronisierung
  await expect(page.locator('[data-a="stOpen"]', { hasText: "Bearbeitungstest" })).toHaveCount(0);
});

test("Export: Bilder in Instagram-Formaten (Feed 1080×1350, Story 1080×1920), Teilen mit Caption", async ({ page }) => {
  await stubClipboard(page);
  await page.addInitScript(() => {
    window.__shared = null;
    navigator.canShare = () => true;
    navigator.share = async (d) => {
      window.__shared = d.files.map((f) => [f.name, f.type, f.size]);
    };
  });
  await seed(page, { state: brandOk(v2State()) });
  await page.evaluate(() => {
    S.studio.posts.push(makePost({ date: "2026-03-04", pillar: "tipps", type: "karussell", title: "Exporttest", slides: [{ template: "cover", title: "A" }, { template: "tipp", title: "B" }, { template: "abschluss", title: "C" }], caption: "Exportcaption", hashtags: ["#Vivalink"] }, "manuell"));
    return save();
  });
  await nav(page, "studio");
  await page.locator('[data-a="stOpen"]', { hasText: "Exporttest" }).click();
  await expect(page.locator("#stPrev canvas")).toHaveCount(3);
  // Teilen: Dateien bereits vorbereitet, Caption + Hashtags in der Zwischenablage
  await expect.poll(() => page.evaluate(() => Object.keys(SFILES).length)).toBe(1);
  await page.click('button[data-a="stShare"]');
  await expect.poll(() => page.evaluate(() => window.__shared)).toHaveLength(3);
  expect((await page.evaluate(() => window.__shared))[0][1]).toBe("image/png");
  await expect.poll(() => clip(page)).toBe("Exportcaption\n\n#Vivalink");
  // Speichern als Dateien (Download-Weg) im Feed- und Story-Format
  const size = async (dl) => {
    const b = await readFile(await dl.path());
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };
  await page.evaluate(() => (navigator.canShare = undefined));
  const dls = [];
  page.on("download", (x) => dls.push(x));
  await page.click('button[data-a="stSave"]');
  await expect.poll(() => dls.length).toBe(3);
  expect(dls[0].suggestedFilename()).toMatch(/^vivalink-2026-03-04-exporttest-1\.png$/);
  expect(await size(dls[0])).toEqual([1080, 1350]);
  await page.click('button[data-a="stView"][data-id="story"]');
  await expect(page.locator("#stPrev canvas")).toHaveCount(3);
  await page.click('button[data-a="stSave"]');
  await expect.poll(() => dls.length).toBe(6);
  expect(await size(dls[5])).toEqual([1080, 1920]);
});

test("Veröffentlicht markieren, Ergebnisse eintragen, Planung lernt daraus", async ({ page }) => {
  await seed(page, { state: brandOk(v2State()) });
  await page.evaluate(() => {
    for (const [i, pil, reach, likes] of [[1, "tipps", 1000, 120], [2, "tipps", 800, 90], [3, "community", 1000, 20], [4, "community", 900, 15]]) {
      const p = makePost({ date: "2026-02-0" + i, pillar: pil, type: "einzelbild", title: "Lerntest " + i, slides: [{ template: "frage", title: "Frage " + i }] }, "manuell");
      p.status = "veroeffentlicht";
      p.metrics = { reach, likes, comments: 0, saves: 0, shares: 0, follows: 0, at: 1 };
      S.studio.posts.push(p);
    }
    const q = makePost({ date: "2026-03-02", pillar: "community", type: "einzelbild", title: "Zu veröffentlichen", slides: [{ template: "frage", title: "Frage" }] }, "manuell");
    q.status = "freigegeben";
    S.studio.posts.push(q);
    return save();
  });
  await nav(page, "studio");
  await page.locator('[data-a="stOpen"]', { hasText: "Zu veröffentlichen" }).click();
  await tabTo(page, "termin");
  await page.click('#sheet button[data-a="stSet"][data-id="veroeffentlicht"]');
  await page.fill("#pm-reach", "500");
  await page.fill("#pm-likes", "40");
  await page.fill("#pm-saves", "10");
  await page.click('button[data-a="stMetrics"]');
  await expectToast(page, "Ergebnisse gespeichert");
  await expect(page.locator("#sheet")).toContainText("Interaktionsrate: 10,0 %");
  const L = (await state(page)).studio.learned;
  expect(L.n).toBe(5);
  expect(L.order[0]).toBe("tipps");
  expect(await page.evaluate(() => planSlots(sm())[0].pillar)).toBe("tipps");
  expect(await page.evaluate(() => studioPrompt(sm()))).toContain("BISHERIGE ERGEBNISSE");
});

test("Automatisch erkannte Anlässe: Meetup ohne Ankündigung → fertiger Entwurf nur aus Fakten (einmalig)", async ({ page }) => {
  const s = brandOk(v2State());
  s.meetup = { date: d(10), place: "Testort am Markt", goal: "", note: "", updatedAt: T0 };
  await seed(page, { state: s });
  let P = (await state(page)).studio.posts;
  expect(P).toHaveLength(1);
  expect(P[0]).toMatchObject({ source: "regel", pillar: "meetup", auto: "ankuendigung", status: "entwurf", meetupDate: d(10) });
  expect(P[0].caption).toContain("Testort am Markt");
  expect(P[0].caption).toContain("Registrierung über die Test-Website");
  expect(P[0].warnings).toEqual([]);
  await page.reload();
  await nav(page, "studio");
  expect((await state(page)).studio.posts).toHaveLength(1);
  // Erinnerung kurz vor dem Meetup
  await page.clock.setFixedTime(new Date(NOW.getTime() + 8 * 864e5));
  await page.reload();
  await nav(page, "studio");
  P = (await state(page)).studio.posts;
  expect(P.map((p) => p.auto).sort()).toEqual(["ankuendigung", "erinnerung"]);
  expect(P.find((p) => p.auto === "erinnerung").type).toBe("story");
});

test("Regelmotor erkennt Marketing-Aufgaben: Freigabe nötig, fällige Veröffentlichung, fehlender Plan", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-03-21T09:00:00"));
  const s = brandOk(v2State());
  await seed(page, { state: s });
  let ids = await page.evaluate(() => findings().map((f) => f.id));
  expect(ids).toContain("ig-none");
  expect(ids).toContain("ig-plan");
  await page.evaluate(() => {
    const a = makePost({ date: "2026-03-23", pillar: "tipps", type: "einzelbild", title: "Wartet", slides: [{ template: "frage", title: "x" }] }, "ki");
    const b = makePost({ date: "2026-03-21", pillar: "tipps", type: "einzelbild", title: "Fällig", slides: [{ template: "frage", title: "y" }] }, "ki");
    b.status = "freigegeben";
    S.studio.posts.push(a, b);
    return save();
  });
  ids = await page.evaluate(() => findings().map((f) => f.id));
  expect(ids).toEqual(expect.arrayContaining(["ig-wait", "ig-due", "ig-plan"]));
  expect(ids).not.toContain("ig-none");
  await nav(page, "home");
  await expect(page.locator("#app")).toContainText("Instagram");
});

test("Synchronisierungs-tauglich: Beiträge sind im Backup, werden zusammengeführt, Konflikte erkannt", async ({ page }) => {
  const g = await guard(page);
  await stubClipboard(page);
  await seed(page, { state: brandOk(v2State()) });
  await page.evaluate(() => {
    const p = makePost({ date: "2026-03-04", pillar: "tipps", type: "einzelbild", title: "Synctest", slides: [{ template: "frage", title: "x" }], caption: "Original" }, "manuell");
    p.id = "post1";
    S.studio.posts.push(p);
    return save();
  });
  const backup = JSON.parse(await page.evaluate(async () => JSON.stringify(await makeBackup())));
  expect(backup.data.studio.posts).toHaveLength(1);
  // Gerät B ändert denselben Beitrag, Gerät A auch → Konflikt
  const other = JSON.parse(JSON.stringify(backup.data));
  const op = other.studio.posts[0];
  op.caption = "Auf Gerät B geändert";
  op.revs = [];
  op.updatedAt = Date.now() + 60000;
  await page.evaluate(() => {
    const p = S.studio.posts[0];
    p.caption = "Auf Gerät A geändert";
    touch(p);
    return save();
  });
  await nav(page, "more");
  await page.fill("#imp", JSON.stringify(other));
  await page.click('button[data-a="imp"]');
  await page.click('button[data-a="impGo"]');
  await expectToast(page, "1 Konflikt(e)");
  await expect(page.locator("[data-conflict]")).toContainText("Instagram-Beitrag");
  await page.locator('[data-conflict] button[data-v="other"]').click();
  await expect(page.locator("#app")).toContainText("Keine offenen Konflikte"); // Seite neu aufgebaut
  expect((await state(page)).studio.posts[0].caption).toBe("Auf Gerät A geändert");
  // Neuer Beitrag von Gerät B wird ergänzt, nichts wird gelöscht
  const more = JSON.parse(JSON.stringify(other));
  more.studio.posts.push({ ...more.studio.posts[0], id: "post2", title: "Von Gerät B", caption: "B", revs: [] });
  await page.fill("#imp", JSON.stringify(more));
  await page.click('button[data-a="imp"]');
  await page.click('button[data-a="impGo"]');
  await expect.poll(async () => (await state(page)).studio.posts.map((p) => p.id).sort()).toEqual(["post1", "post2"]);
  expect(g.errors).toEqual([]);
});

test("Manipulierte KI-Antwort: Inhalte werden nur als Text gezeigt, ungültige Werte bereinigt", async ({ page }) => {
  const g = await guard(page);
  await seed(page, { state: brandOk(v2State()) });
  const evil = { format: "vivalink-studio-plan", version: 1, posts: [{ date: "<b>", time: "x", pillar: "<img src=x onerror=window.__pwned=1>", type: "virus", title: '<img src=x onerror="window.__pwned=1">', slides: [{ template: "<script>", title: "<script>window.__pwned=1</script>" }], caption: "<img src=x onerror=window.__pwned=1>", hashtags: ["<b>", "#ok"] }] };
  await nav(page, "studio");
  await page.click('button[data-a="stPrompt"]');
  await page.fill("#stAns", JSON.stringify(evil));
  await page.click('button[data-a="stImport"]');
  await expectToast(page, "1 Beiträge als Entwurf übernommen");
  const p = (await state(page)).studio.posts[0];
  expect(p).toMatchObject({ date: "", time: "18:00", pillar: "community", type: "einzelbild", hashtags: ["#Vivalink", "#b", "#ok"] }); // #Vivalink: automatische Feinarbeit
  expect(p.slides[0].template).toBe("cover");
  await page.locator('[data-a="stOpen"]').first().click();
  await expect(page.locator("#sheet h1")).toContainText("<img src=x");
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await page.click('#sheet .abar button[data-a="stClose"]');
  for (const bad of ["kein json", '{"posts": "x"}', '{"format":"x","posts":[']) {
    if (await page.evaluate(() => $("#sheet").hidden)) await page.click('button[data-a="stPrompt"]');
    await page.fill("#stAns", bad);
    await page.click('button[data-a="stImport"]');
    await expectToast(page, "Antwort");
  }
  expect(g.errors).toEqual([]);
});

test("Automatische Sicherungspunkte: täglich, höchstens 7, Wiederherstellung mit Rückgängig-Punkt", async ({ page }) => {
  await seed(page, { state: brandOk(v2State()) });
  await expect.poll(() => kv(page, "snaps")).toEqual([d(0)]);
  // ältere Sicherungspunkte simulieren
  await page.evaluate(async () => {
    const idx = [];
    for (let i = 1; i <= 8; i++) {
      const day = new Date(Date.now() - i * 864e5).toLocaleDateString("sv-SE");
      await kvPut("snap-" + day, { at: Date.now() - i * 864e5, data: { ...JSON.parse(JSON.stringify(S)), tasks: [] }, aitest: [] });
      idx.push(day);
    }
    await kvPut("snaps", [today(), ...idx]);
    await kvPut("snap-" + today(), null);
    await autoSnapshot(true);
  });
  const idx = await kv(page, "snaps");
  expect(idx).toHaveLength(7);
  expect(idx[0]).toBe(d(0));
  expect(await kv(page, "snap-" + d(-8))).toBeNull();
  await nav(page, "more");
  await page.click('button[data-a="snaps"]');
  await expect(page.locator('#sheet button[data-a="snapRestore"]')).toHaveCount(7);
  await page.click(`#sheet button[data-a="snapRestore"][data-id="${d(-1)}"]`);
  await page.click(`#sheet button[data-a="snapRestore"][data-id="${d(-1)}"]`);
  await expect.poll(async () => (await state(page)).tasks.length).toBe(0);
  expect((await kv(page, "pre-import")).data.tasks.length).toBe(2);
});

test("Keine Erinnerung an manuelle Backups; Ausfall der automatischen Sicherung wird gemeldet", async ({ page }) => {
  const s = brandOk(v2State());
  s.lastBackup = "";
  await seed(page, { state: s });
  let ids = await page.evaluate(() => findings().map((f) => f.id));
  expect(ids).not.toContain("bk");
  expect(ids).not.toContain("sys-snap");
  await nav(page, "more");
  await expect(page.locator("#app")).not.toContainText("Letztes Backup");
  // automatische Sicherung seit Tagen ausgefallen → technischer Hinweis
  ids = await page.evaluate(() => {
    LASTSNAP = new Date(Date.now() - 5 * 864e5).toLocaleDateString("sv-SE");
    return findings().map((f) => f.id);
  });
  expect(ids).toContain("sys-snap");
});


test("Keine doppelten Meetup-Ankündigungen: Automatik und Monatsplan kennen sich gegenseitig", async ({ page }) => {
  const s = brandOk(v2State());
  s.meetup = { date: d(12), place: "Testort", goal: "", note: "", updatedAt: T0 };
  await seed(page, { state: s });
  // Automatik hat die Ankündigung erstellt → der Monatsplan plant nur noch die Erinnerung
  expect((await state(page)).studio.posts.filter((p) => p.auto === "ankuendigung")).toHaveLength(1);
  let slots = await page.evaluate(() => planSlots(sm()));
  expect(slots.filter((x) => x.pillar === "meetup").map((x) => x.date)).toEqual([d(11)]);
  // Umgekehrt: Plan enthält bereits Ankündigung und Erinnerung → Automatik erstellt nichts
  await page.evaluate(() => {
    S.studio.posts = [];
    importPlan(JSON.stringify({ posts: planSlots(sm()).filter((x) => x.pillar === "meetup").map((x, i) => ({ ...x, title: "Meetup-Beitrag " + ["Ankündigung", "Erinnerung"][i], slides: [{ template: "ankuendigung", title: "Nächstes Meetup" }] })) }));
    return save();
  });
  expect(await page.evaluate(() => [runAutomations().length, meetupCoverage()])).toEqual([0, { announce: true, remind: true, recap: false }]);
  slots = await page.evaluate(() => planSlots(sm()));
  expect(slots.filter((x) => x.pillar === "meetup")).toEqual([]);
});

test("Qualitätsprüfung: Meetup-Ort, Caption-Limit, Stilhinweise (blockieren nicht), Hinweis auf Grenzen der Prüfung", async ({ page }) => {
  const s = brandOk(v2State());
  s.meetup = { date: d(20), place: "Testort am Markt", goal: "", note: "", updatedAt: T0 };
  await seed(page, { state: s });
  const r = await page.evaluate(() => {
    const ok = makePost({ date: "2026-03-09", pillar: "meetup", type: "einzelbild", title: "Ort richtig", slides: [{ template: "ankuendigung", title: "Nächstes Meetup", details: "Testort am Markt" }], caption: "Komm vorbei! Wir freuen uns auf neue Gesichter in entspannter Runde. Das Treffen ist ideal, um neue Kontakte zu knüpfen und gemeinsam eine gute Zeit zu haben. Bring einfach gute Laune mit. Mehr auf vivalink.me", hashtags: ["#a", "#b", "#c"] }, "ki");
    const wrong = makePost({ date: "2026-03-09", pillar: "meetup", type: "einzelbild", title: "Ort falsch", slides: [{ template: "ankuendigung", title: "Nächstes Meetup", details: "Anderer Ort" }], caption: "Mehr auf vivalink.me" }, "ki");
    const long = makePost({ date: "2026-03-10", pillar: "tipps", type: "einzelbild", title: "Zu lang", slides: [{ template: "frage", title: "eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf", text: "" }], caption: "WICHTIGES ANGEBOT 🎉🎉🎉🎉 " + "wort ".repeat(500) }, "ki");
    return { ok: [ok.warnings, ok.hints], wrong: wrong.warnings, long: [long.warnings, long.hints] };
  });
  expect(r.ok).toEqual([[], []]);
  expect(r.wrong.join(" ")).toContain("Ort des Meetups („Testort am Markt“) fehlt oder weicht ab");
  expect(r.long[0].join(" ")).toContain("länger als 2.200 Zeichen");
  const h = r.long[1].join(" | ");
  for (const x of ["Caption sehr lang", "Titel zu lang", "Emojis", "Großbuchstaben", "Keine Handlungsaufforderung", "Wenige Hashtags"]) expect(h).toContain(x);
  // Stilhinweise blockieren die Wochenfreigabe nicht, Prüfhinweise schon
  const n = await page.evaluate(() => {
    const a = makePost({ date: "2026-03-11", pillar: "community", type: "einzelbild", title: "Nur Stil", slides: [{ template: "frage", title: "Kurz?" }], caption: "Kurz." }, "ki");
    S.studio.posts.push(a);
    return [a.warnings.length, a.hints.length > 0, approveWeek(weekKey("2026-03-11"))];
  });
  expect(n).toEqual([0, true, 1]);
  await nav(page, "studio");
  await page.locator('[data-a="stOpen"]', { hasText: "Nur Stil" }).click();
  await expect(page.locator("#sheet")).toContainText("Stilhinweise (optional)");
  await expect(page.locator("#sheet")).toContainText("kann sie nicht auf Wahrheit prüfen");
});

test("Status: Entwurf, Geplant, Fällig, Veröffentlicht; Filter und Gestaltungsvariante", async ({ page }) => {
  await seed(page, { state: brandOk(v2State()) });
  await page.evaluate(() => {
    const mk = (date, title, status) => {
      const p = makePost({ date, pillar: "community", type: "einzelbild", title, slides: [{ template: "frage", title }], caption: "x" }, "ki");
      p.status = status;
      S.studio.posts.push(p);
    };
    mk("2026-03-02", "Heute fällig", "freigegeben");
    mk("2026-03-06", "Später geplant", "freigegeben");
    mk("2026-03-04", "Noch Entwurf", "entwurf");
    mk("2026-03-03", "Schon online", "veroeffentlicht");
    return save();
  });
  await nav(page, "studio");
  const chip = (t) => page.locator('[data-a="stOpen"]', { hasText: t }).locator(".chip").first();
  await expect(chip("Heute fällig")).toHaveText("Fällig");
  await expect(chip("Später geplant")).toHaveText("Geplant");
  await expect(chip("Noch Entwurf")).toHaveText("Entwurf");
  await expect(chip("Schon online")).toHaveText("Veröffentlicht");
  await page.click('button[data-a="stFilter"][data-id="offen"]');
  await expect(page.locator('[data-a="stOpen"]')).toHaveCount(1);
  await page.click('button[data-a="stFilter"][data-id="geplant"]');
  await expect(page.locator('[data-a="stOpen"]')).toHaveCount(2);
  await page.click('button[data-a="stFilter"][data-id="alle"]');
  await page.locator('[data-a="stOpen"]', { hasText: "Noch Entwurf" }).click();
  await tabTo(page, "gestaltung");
  await page.selectOption("#pe-variant", "2");
  await page.click('button[data-a="stEdit"]');
  await expectToast(page, "Gespeichert"); // Speichern abgeschlossen (nicht mitten im Vorgang beenden)
  await expect.poll(async () => (await state(page)).studio.posts.find((p) => p.title === "Noch Entwurf").variant).toBe(2);
});

test("Monatsplan bleibt bearbeitbar: belegte Termine werden nicht doppelt geplant", async ({ page }) => {
  await seed(page, { state: brandOk(v2State()) });
  const r = await page.evaluate(() => {
    const before = planSlots(sm());
    importPlan(JSON.stringify({ posts: before.slice(0, 4).map((s, i) => ({ ...s, title: "Belegt " + i, slides: [{ template: "frage", title: "x" + i }], caption: "Text vivalink.me" })) }));
    const after = planSlots(sm());
    S.studio.posts[0].status = "abgelehnt";
    return [before.length, after.length, after.some((s) => before.slice(1, 4).some((b) => b.date === s.date)), planSlots(sm()).length];
  });
  expect(r).toEqual([13, 9, false, 10]);
  await nav(page, "studio");
  await expect(page.locator("#app")).toContainText("10 freie Termine (3 Beiträge geplant)"); // abgelehnter Termin wird wieder frei
  await expect(page.locator('button[data-a="stPrompt"]')).toHaveText("Freie Termine füllen");
});
