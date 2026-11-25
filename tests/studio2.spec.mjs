// Instagram-Studio (Ausbaustufe): Grafiken mit Logo-Verlauf und Story-Schutzzonen, eigene Fotos mit Einwilligung,
// Text- und Faktenprüfung, abwechslungsreiche Planung, automatische Rückblicke, Schutz vor Demodaten,
// Bearbeitungsfenster mit Bereichen und ungespeicherten Änderungen, Monatsübersicht. Nur künstliche Testdaten.
import { test, expect } from "@playwright/test";
import { seed, open, nav, state, kv, expectToast } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const NOW = new Date("2026-03-02T09:00:00"); // Montag
const d = (n) => new Date(NOW.getTime() + n * 864e5).toLocaleDateString("sv-SE");
const tabTo = (page, k) => page.click(`#sheet [data-a="stTab"][data-id="${k}"]`);
function brandOk(s) {
  s.studio = { brand: { region: "Testregion", signup: "Registrierung über die Test-Website", colorsConfirmed: true, website: "vivalink.me" }, settings: {}, posts: [], learned: {} };
  return s;
}
const fixClock = (page) => page.clock.setFixedTime(NOW);

test("Grafiken: 9 Vorlagen × 4 Gestaltungen in Feed und Story, Story-Schutzzonen bleiben frei", async ({ page }) => {
  await fixClock(page);
  await open(page);
  const r = await page.evaluate(async () => {
    const A = await brandAssets();
    const out = { sizes: new Set(), leaks: [] };
    const base = { type: "karussell", date: "2026-03-04", meetupDate: "2026-03-06" };
    for (const tpl of TEMPLATES)
      for (let v = 0; v < DESIGNS.length; v++)
        for (const story of [false, true]) {
          const sl = { template: tpl, title: "Ein ziemlich langer Titel für die Prüfung der Umbrüche", text: "Erste Zeile\nZweite Zeile mit etwas mehr Text\nDritte", details: "Freitag, 6. März\nTestort" };
          const cv = renderSlide({ ...base, variant: v, slides: [sl, sl] }, 0, A, story);
          out.sizes.add(cv.width + "x" + cv.height);
        }
    // Helle Inhaltsfolie: oberer und unterer Story-Bereich bleiben einfarbig (keine Schrift unter Instagram-Bedienelementen)
    for (const tpl of ["tipp", "info", "ankuendigung", "erinnerung"]) {
      const cv = renderSlide({ ...base, variant: 0, slides: [{ template: tpl, title: "Titel " + "lang ".repeat(12), text: "Text ".repeat(40), details: "Freitag, 6. März\nTestort" }] }, 0, A, true);
      const ctx = cv.getContext("2d");
      const zone = (y0, y1) => {
        const px = ctx.getImageData(60, y0, 960, y1 - y0).data;
        for (let i = 0; i < px.length; i += 4) if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) return true;
        return false;
      };
      if (zone(40, ZONES.story.top - 10)) out.leaks.push(tpl + " oben");
      if (zone(1920 - ZONES.story.bottom + 10, 1910)) out.leaks.push(tpl + " unten");
    }
    out.sizes = [...out.sizes].sort();
    return out;
  });
  expect(r.sizes).toEqual(["1080x1350", "1080x1920"]);
  expect(r.leaks).toEqual([]);
  // Verlauf stammt aus dem Logo (11 Farbstufen), nicht aus drei vereinfachten Farben
  expect(await page.evaluate(() => LOGO_STOPS.length)).toBe(11);
});

test("Eigenes Foto: nur mit Einwilligung verwendet, bleibt auf dem Gerät und nicht im Backup", async ({ page }) => {
  await fixClock(page);
  await seed(page, { state: brandOk(v2State()) });
  const r = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 2400;
    c.height = 1600;
    const x = c.getContext("2d");
    x.fillStyle = "#00ff00";
    x.fillRect(0, 0, 2400, 1600);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
    const s = await savePhoto(new File([blob], "test.png", { type: "image/png" }));
    const A = await brandAssets();
    const mk = (consent) => makePost({ date: "2026-03-04", pillar: "orte", type: "einzelbild", title: "Fototest " + consent, slides: [{ template: "foto", title: "Draußen" }], caption: "x vivalink.me" }, "manuell");
    const center = async (p) => {
      const [cv] = await renderPost(p);
      const px = cv.getContext("2d").getImageData(540, 400, 1, 1).data;
      return px[1] > 200 && px[0] < 80;
    };
    const without = mk(false);
    without.photo = { id: s.id, consent: false, note: "" };
    const withC = mk(true);
    withC.photo = { id: s.id, consent: true, note: "eigenes Foto" };
    checkPost(without);
    S.studio.posts.push(without, withC);
    await save();
    const backup = JSON.stringify(await makeBackup());
    return { ok: s.ok, w: s.w, green: [await center(without), await center(withC)], hint: without.hints.some((h) => h.includes("Einwilligung")), inBackup: backup.includes("data:image"), refKept: backup.includes(s.id) };
  });
  expect(r.ok).toBe(true);
  expect(r.w).toBe(1600); // verkleinert
  expect(r.green).toEqual([false, true]);
  expect(r.hint).toBe(true);
  expect(r.inBackup).toBe(false);
  expect(r.refKept).toBe(true);
});

test("Faktenprüfung: App-Store-/Download-Behauptungen, Platzhalter und Mitgliederzahlen; Stil: Floskeln, laute Emojis, Wiederholungen", async ({ page }) => {
  await fixClock(page);
  await seed(page, { state: brandOk(v2State()) });
  const r = await page.evaluate(() => {
    let n = 0;
    const mk = (caption, extra = {}) => makePost({ date: "2026-03-04", pillar: "tipps", type: "einzelbild", title: ["Anfang", "Rueckblick", "Mitglieder", "Floskeln", "Ruhiger", "Wiederholung", "Sauber"][n++], slides: [{ template: "frage", title: "Frage" }], caption, ...extra }, "ki");
    const a = mk("Lade dir jetzt die App im App Store herunter! vivalink.me");
    const b = mk("Das Meetup war toll: [BITTE ERGÄNZEN: Eindrücke] vivalink.me");
    const c = mk("Schon hunderte Mitglieder sind dabei. vivalink.me");
    const e = mk("Worauf wartest du noch? 🔥🚀 Freundschaften fürs Leben warten. vivalink.me");
    S.studio.posts.push(mk("Ein ruhiger Abend in kleiner Runde ist oft der beste Anfang für gute Gespräche. vivalink.me"));
    const f = mk("Neu hier. Ein ruhiger Abend in kleiner Runde ist oft der beste Anfang für gute Gespräche. vivalink.me");
    const g = mk("Gute Gespräche brauchen Zeit und Ruhe. Mehr dazu auf vivalink.me");
    return {
      app: a.warnings.some((w) => w.includes("App-Download")),
      ph: b.warnings.some((w) => w.includes("Platzhalter")),
      members: c.warnings.some((w) => w.includes("Mitgliedern")),
      stock: e.hints.some((h) => h.includes("Floskel")),
      loud: e.hints.some((h) => h.includes("Laute Emojis")),
      repeat: f.hints.some((h) => h.includes("wörtlich")),
      clean: [g.warnings, g.hints.filter((h) => /Floskel|Emojis|wörtlich/.test(h))],
    };
  });
  expect(r).toEqual({ app: true, ph: true, members: true, stock: true, loud: true, repeat: true, clean: [[], []] });
});

test("Planung: kein Bereich zweimal hintereinander, Blickwinkel und Beitragsart je Termin, KI-Auftrag mit Wahrheitsregeln", async ({ page }) => {
  await fixClock(page);
  const s = brandOk(v2State());
  s.memory.push({ id: "m-app1", cat: "App", title: "Profil mit Interessen", text: "Man gibt Interessen an.", status: "confirmed", active: true, private: false, date: "2026-01-01", updatedAt: 1 });
  await seed(page, { state: s });
  const r = await page.evaluate(() => {
    const A = planSlots(sm()),
      B = planSlots(nextMonth(sm()));
    const adjOf = (M) => M.filter((x, i) => i && x.pillar === M[i - 1].pillar && x.pillar !== "meetup").length;
    const L = A.concat(B);
    const adj = adjOf(A) + adjOf(B);
    const pr = studioPrompt(sm());
    return { n: L.length, adj, angles: L.every((x) => x.angle), kinds: L.every((x) => x.kind), distinctAngles: new Set(L.map((x) => x.angle)).size, pr: ["Blickwinkel:", "[BITTE ERGÄNZEN", "App-Store", "„worauf wartest du noch“", "Persönliche Begegnungen"].map((k) => pr.includes(k)) };
  });
  expect(r.n).toBeGreaterThan(10);
  expect(r.adj).toBe(0);
  expect(r.angles && r.kinds).toBe(true);
  expect(r.distinctAngles).toBeGreaterThan(5);
  expect(r.pr).toEqual([true, true, true, true, true]);
});

test("Gestaltung wechselt automatisch: aufeinanderfolgende Beiträge nie mit derselben Gestaltung", async ({ page }) => {
  await fixClock(page);
  await seed(page, { state: brandOk(v2State()) });
  const v = await page.evaluate(() => {
    const slots = planSlots(sm()).slice(0, 8);
    importPlan(JSON.stringify({ posts: slots.map((s, i) => ({ ...s, title: "Var " + i, hook: "Hook Nummer " + "abcdefgh"[i], slides: [{ template: "frage", title: "x" }], caption: "Text vivalink.me" })) }));
    return S.studio.posts.sort((a, b) => a.date.localeCompare(b.date)).map((p) => p.variant);
  });
  expect(v).toHaveLength(8);
  for (let i = 1; i < v.length; i++) expect(v[i]).not.toBe(v[i - 1]);
  expect(new Set(v).size).toBe(4);
});

test("Meetup: Ankündigung, Erinnerung und Rückblick automatisch – abwechslungsreich, Rückblick mit Platzhalter blockiert die Freigabe", async ({ page }) => {
  await fixClock(page);
  const s = brandOk(v2State());
  s.meetup = { date: d(2), place: "Testort am Markt", updatedAt: 1 };
  await seed(page, { state: s });
  const r = await page.evaluate(() => {
    runAutomations();
    const L = livePosts();
    return { autos: L.map((p) => p.auto).sort(), tpl: L.find((p) => p.auto === "erinnerung").slides[0].template, warn: L.map((p) => p.warnings.length) };
  });
  expect(r.autos).toEqual(["ankuendigung", "erinnerung"]);
  expect(r.tpl).toBe("erinnerung");
  expect(r.warn).toEqual([0, 0]);
  // Drei Tage nach dem Meetup
  await page.clock.setFixedTime(new Date(NOW.getTime() + 5 * 864e5));
  await page.reload();
  await page.waitForFunction(() => typeof S !== "undefined" && S && S.studio);
  const q = await page.evaluate(() => {
    const again = runAutomations().length;
    const p = livePosts().find((x) => x.auto === "rueckblick");
    return { has: !!p, again, ph: p && p.caption.includes("[BITTE ERGÄNZEN"), warn: p && p.warnings.some((w) => w.includes("Platzhalter")), week: p && (approveWeek(weekKey(p.date)), p.status) };
  });
  expect(q).toEqual({ has: true, again: 0, ph: true, warn: true, week: "entwurf" }); // Wochenfreigabe lässt den Rückblick aus
  // Zwei verschiedene Meetups → unterschiedliche Formulierung der Ankündigung
  const texts = await page.evaluate(() => {
    const t = [];
    for (const off of [10, 17]) {
      S.studio.posts = [];
      S.meetup = { date: addDays(today(), off), place: "Ort " + off, updatedAt: 1 };
      runAutomations();
      t.push(livePosts().find((p) => p.auto === "ankuendigung").autoText);
    }
    return t;
  });
  expect(texts[0]).not.toBe(texts[1]);
});

test("Schutz vor Demodaten: Backup der Testversion und Demo-Beiträge werden abgelehnt, nie veröffentlicht", async ({ page }) => {
  await fixClock(page);
  await seed(page, { state: brandOk(v2State()) });
  const r = await page.evaluate(async () => {
    const b = await makeBackup();
    const ch = b.channel;
    const test = JSON.stringify({ ...b, channel: "test" });
    const demoPost = { ...makePost({ date: "2026-03-04", pillar: "tipps", type: "einzelbild", title: "Demo", slides: [{ template: "frage", title: "x" }] }, "ki"), demo: true };
    const raw = JSON.parse(JSON.stringify(b));
    raw.data.studio.posts.push(demoPost);
    const inc = cleanIncoming(raw.data, []);
    demoPost.status = "freigegeben";
    return { ch, refused: parseBackup(test).ok, why: parseBackup(test).error, imported: inc.posts.some((p) => p.demo), pub: canPublish(demoPost).ok };
  });
  expect(r.ch).toBe("prod");
  expect(r.refused).toBe(false);
  expect(r.why).toContain("Testversion");
  expect(r.imported).toBe(false);
  expect(r.pub).toBe(false);
});

test("Bearbeiten: Bereiche, Hinweis auf ungespeicherte Änderungen, Schließen mit Rückfrage, Zwischenspeicher nach Neustart", async ({ page }) => {
  await seed(page, { state: brandOk(v2State()) });
  await page.evaluate(() => {
    S.studio.posts.push(makePost({ date: today(), pillar: "community", type: "einzelbild", title: "Editortest", slides: [{ template: "frage", title: "Alte Frage" }], caption: "Alte Caption vivalink.me" }, "manuell"));
    return save();
  });
  await nav(page, "studio");
  await page.locator('[data-a="stOpen"]', { hasText: "Editortest" }).click();
  await tabTo(page, "text");
  await expect(page.locator("#pe-caption")).toBeVisible();
  await expect(page.locator('#sheet [data-panel="termin"]')).toBeHidden();
  await expect(page.locator("#edDirty")).toBeHidden();
  await page.fill("#pe-caption", "Ungespeicherte neue Caption vivalink.me");
  await expect(page.locator("#edDirty")).toBeVisible();
  await expect(page.locator("#pe-count")).toContainText("Wörter");
  // Aktionsleiste bleibt erreichbar (sichtbar im Fenster)
  await expect(page.locator("#sheet .abar button[data-a='stEdit']")).toBeInViewport();
  await expect.poll(() => kv(page, "edit-draft").then((x) => x && x.v["pe-caption"])).toBe("Ungespeicherte neue Caption vivalink.me");
  await page.click("#sheet .abar button[data-a='stClose']");
  await expectToast(page, "Ungespeicherte Änderungen");
  await expect(page.locator("#sheet")).toBeVisible();
  // App wird unerwartet beendet → Änderungen lassen sich wiederherstellen
  await page.reload();
  await nav(page, "studio");
  await page.locator('[data-a="stOpen"]', { hasText: "Editortest" }).click();
  await page.click('[data-a="stDraftUse"]');
  await tabTo(page, "text");
  await expect(page.locator("#pe-caption")).toHaveValue("Ungespeicherte neue Caption vivalink.me");
  // Freigeben mit ungespeicherten Änderungen: erst speichern, dann genau diesen Inhalt freigeben
  await page.click("#sheet .abar button[data-a='stSet'][data-id='freigegeben']");
  await expect.poll(async () => (await state(page)).studio.posts.find((p) => p.title === "Editortest").status).toBe("freigegeben");
  const ok = await page.evaluate(() => {
    const p = S.studio.posts.find((x) => x.title === "Editortest");
    return [p.caption, p.approvedHash === postHash(p)];
  });
  expect(ok).toEqual(["Ungespeicherte neue Caption vivalink.me", true]);
  expect(await kv(page, "edit-draft")).toBeNull();
  await page.click("#sheet .abar button[data-a='stClose']");
  await expect(page.locator("#sheet")).toBeHidden();
});

test("Monatsübersicht: fertig, zu bearbeiten, zu prüfen und die nächsten Veröffentlichungen", async ({ page }) => {
  await fixClock(page);
  await seed(page, { state: brandOk(v2State()) });
  await page.evaluate(() => {
    const mk = (date, title, status, caption = "Text vivalink.me") => {
      const p = makePost({ date, pillar: "community", type: "einzelbild", title, hook: title, slides: [{ template: "frage", title }], caption }, "ki");
      p.status = status;
      S.studio.posts.push(p);
    };
    mk("2026-03-03", "Fertig eins", "freigegeben");
    mk("2026-03-05", "Mit Problem", "entwurf", "Kostet nur 5 € vivalink.me");
    mk("2026-03-06", "Nur prüfen", "entwurf");
    mk("2026-03-20", "Später", "entwurf");
    return save();
  });
  await nav(page, "studio");
  const stat = (f) => page.locator(`button.stat[data-id="${f}"] b`);
  await expect(stat("geplant")).toHaveText("1");
  await expect(stat("bearbeiten")).toHaveText("1");
  await expect(stat("offen")).toHaveText("2");
  await expect(page.locator('[data-a="stOpenNext"]')).toHaveCount(3);
  await page.click('button.stat[data-id="bearbeiten"]');
  await expect(page.locator('[data-a="stOpen"]')).toHaveCount(1);
  await expect(page.locator('[data-a="stOpen"]')).toContainText("Mit Problem");
});
