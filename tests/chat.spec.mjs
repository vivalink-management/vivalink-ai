// KI-Chat: ein Assistent und ein Verlauf für Schreiben und Sprechen. Nur künstliche Daten; nichts wird gesendet.
import { test, expect } from "@playwright/test";
import { seed, state, guard, stubClipboard, clip } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const NOW = new Date("2026-03-10T09:00:00"); // Dienstag
async function setup(page, mutate) {
  await page.clock.setFixedTime(NOW);
  await seed(page, { state: v2State() });
  if (mutate) await page.evaluate(mutate);
}
const openChat = async (page) => {
  await page.click('nav button[data-id="ai"]');
  await page.click('button[data-a="chatNew"]');
};
// wartet, bis Frage UND Antwort gespeichert sind
const send = async (page, t) => {
  const n = await page.evaluate(() => S.chatMsgs.length);
  await page.fill("#chatIn", t);
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => page.evaluate(() => S.chatMsgs.length)).toBeGreaterThanOrEqual(n + 2);
  await expect.poll(() => page.evaluate(() => chatBusy)).toBe(false);
  await expect(page.locator("#chatTyping")).toHaveCount(0);
};
const lastAi = (page) => page.locator(".msg.ai .bub").last();

test("Chats: neu, automatisch benannt, umbenennen, früheren Chat fortsetzen, löschen; Verlauf bleibt nach Neustart", async ({ page }) => {
  const g = await guard(page);
  await setup(page);
  await openChat(page);
  await send(page, "Welche Aufgaben sind diese Woche offen?");
  await expect(lastAi(page)).toContainText("Offene Aufgaben");
  await expect(page.locator(".ctitle")).toHaveText("Welche Aufgaben sind diese Woche offen?");
  // umbenennen
  await page.click(".ctitle");
  await page.fill("#chatTitle", "Wochenplanung");
  await page.click('button[data-a="chatRenameSave"]');
  await expect(page.locator(".ctitle")).toHaveText("Wochenplanung");
  // zweiter Chat, dann zurück zum ersten und fortsetzen
  await page.click('button[data-a="chatBack"]');
  await page.clock.setFixedTime(new Date(NOW.getTime() + 60e3)); // Zeit vergeht
  await page.click('button[data-a="chatNew"]');
  await send(page, "Gibt es technische Probleme?");
  await page.click('button[data-a="chatBack"]');
  await expect(page.locator('[data-a="chatOpen"]')).toHaveCount(2);
  await expect(page.locator('[data-a="chatOpen"]').first()).toContainText("Gibt es technische Probleme?"); // zuletzt benutzt oben
  await page.clock.setFixedTime(new Date(NOW.getTime() + 120e3));
  await page.locator('[data-a="chatOpen"]', { hasText: "Wochenplanung" }).click();
  await send(page, "Wie läuft Vivalink?");
  expect(await page.locator(".msg").count()).toBe(4);
  // nach Neustart noch da
  await page.reload();
  await page.click('nav button[data-id="ai"]');
  await expect(page.locator('[data-a="chatOpen"]')).toHaveCount(2);
  // löschen nur mit zweitem Tippen
  await page.locator('[data-a="chatOpen"]', { hasText: "Wochenplanung" }).click();
  await page.click('button[data-a="chatMenu"]');
  await page.click('#sheet button[data-a="chatDel"]');
  await expect(page.locator('[data-a="chatOpen"]')).toHaveCount(0); // noch im Chat (Sheet offen)
  await page.click('#sheet button[data-a="chatDel"]');
  await expect(page.locator('[data-a="chatOpen"]')).toHaveCount(1);
  const s = await state(page);
  expect(s.chats.filter((c) => c.deleted).length).toBe(1); // Löschvermerk für die Synchronisierung
  expect(s.chatMsgs.every((m) => s.chats.find((c) => c.id === m.chat && !c.deleted))).toBe(true); // Nachrichten entfernt
  expect(g.errors).toEqual([]);
  expect(g.external).toEqual([]); // der lokale Assistent sendet nichts
});

test("Gesprächskontext: Folgefragen beziehen sich auf den Verlauf; Antworten trennen Fakten, Testdaten, Annahmen, Empfehlungen", async ({ page }) => {
  await setup(page, async () => {
    // echte (verifizierte) und ungeprüfte Werte aus der Verwaltung, Testdaten getrennt
    const m = (k) => S.metrics.find((x) => x.key === k);
    addVal(m("reg_total").id, { date: "2026-03-09", value: 120, status: "confirmed", src: "verwaltung", real: true });
    addVal(m("active_users").id, { date: "2026-03-09", value: 99, status: "confirmed", src: "verwaltung", real: false });
    await kvPut("kpi-config", { token: "ab".repeat(32), since: 1, last: Date.now(), fails: 0, meta: { excludesTestAccounts: true, excludesDemoMeetups: true, testData: { accounts: 4, bookings: 3, invitations: 2, payments: 27, refunds: 0 } } });
    await loadKpiState();
    await save();
  });
  await openChat(page);
  await send(page, "Analysiere die aktuellen Kennzahlen von Vivalink.");
  const a = lastAi(page);
  await expect(a.locator(".cb-fakt")).toContainText(["Gesamtzahl der Registrierungen: 120"]);
  await expect(a.locator(".cb-test")).toContainText("4 Testkonten");
  await expect(a).toContainText("Nicht verwendet (möglicherweise mit Testkonten): Aktive Nutzer");
  await expect(a).not.toContainText("99");
  // Folgefrage ohne Thema → bezieht sich auf das letzte Thema (Kennzahlen)
  await send(page, "Warum?");
  await expect(lastAi(page)).toContainText("Kennzahlen");
  // Maßnahmen als Empfehlung gekennzeichnet; Entscheidung bleibt beim Gründer
  await send(page, "Welche Maßnahmen würdest du jetzt empfehlen?");
  await expect(lastAi(page)).toContainText("Empfohlene Maßnahmen");
  await expect(lastAi(page)).toContainText("Geschäftliche Entscheidungen triffst du");
  // Morgenfrage mit mehreren Teilen
  await send(page, "Guten Morgen. Wie läuft Vivalink aktuell? Was hat sich verändert, welche Probleme gibt es und was sollten wir als Nächstes machen?");
  for (const h of ["Lage von Vivalink", "Probleme", "Als Nächstes"]) await expect(lastAi(page).locator(".cb-h", { hasText: h })).toHaveCount(1);
  // Unbekanntes Anliegen: ehrlich, keine erfundene Antwort
  await send(page, "Schreib mir ein Gedicht über Katzen");
  await expect(lastAi(page)).toContainText("im lokalen Modus nicht beantworten");
});

test("Arbeitsaufträge: Ungefährliches selbstständig mit Rückgängig, Gedächtnis nur nach Bestätigung, Riskantes abgelehnt", async ({ page }) => {
  await setup(page);
  await openChat(page);
  // Aufgabe anlegen (Stufe 1, selbstständig) und rückgängig machen
  await send(page, "Lege eine Aufgabe an: Fotos vom Meetup sortieren bis morgen");
  await expect(lastAi(page).locator(".ca")).toContainText("Aufgabe anlegen: „Fotos vom Meetup sortieren“ bis 11.3.2026✅ erledigt");
  let s = await state(page);
  const t = s.tasks.find((x) => x.title === "Fotos vom Meetup sortieren");
  expect(t).toMatchObject({ due: "2026-03-11", done: false, src: "chat" });
  await lastAi(page).locator('button[data-a="chatUndo"]').click();
  s = await state(page);
  expect(s.tasks.find((x) => x.id === t.id).deleted).toBe(true);
  await expect(lastAi(page)).toContainText("rückgängig gemacht");
  // Aufgabe abhaken
  await send(page, "Testaufgabe Eins ist erledigt");
  s = await state(page);
  expect(s.tasks.find((x) => x.id === "t1").done).toBe(true);
  // Merken: wird NICHT automatisch gespeichert, erst nach Tippen auf Bestätigen
  const memBefore = s.memory.length;
  await send(page, "Merke dir, dass das nächste Meetup im Testcafé stattfindet");
  await expect(lastAi(page)).toContainText("wartet auf deine Bestätigung");
  expect((await state(page)).memory.length).toBe(memBefore);
  await lastAi(page).locator('button[data-a="chatAct"]').click();
  s = await state(page);
  expect(s.memory.length).toBe(memBefore + 1);
  expect(s.memory.at(-1)).toMatchObject({ title: "Das nächste Meetup im Testcafé stattfindet", status: "confirmed" });
  // Riskantes wird nie ausgeführt
  const before = JSON.stringify((await state(page)).studio.posts);
  for (const q of ["Veröffentliche den Beitrag jetzt auf Instagram", "Erstatte die Zahlung von gestern", "Ändere die Preise in der Datenbank", "Lösche Daten in Supabase"]) {
    await send(page, q);
    await expect(lastAi(page)).toContainText("Ich habe nichts ausgeführt");
  }
  expect(JSON.stringify((await state(page)).studio.posts)).toBe(before);
  const log = await page.evaluate(() => ACTIONS.map((a) => a.name + ":" + a.ok));
  expect(log).toEqual(expect.arrayContaining(["chat.task.add:true", "chat.task.done:true", "chat.memory:true", "post.publish:false", "payment.trigger:false"]));
});

test("Instagram-Entwürfe für nächste Woche nach dem vorhandenen Rhythmus; technische Prüfung mit Reparatur", async ({ page }) => {
  await setup(page, () => {
    S.studio.settings.days = [1, 3, 5];
    S.tasks.push({ id: "tx", title: "Verwaiste Abhängigkeit", prio: "mittel", area: "App", due: "", done: false, after: "gibt-es-nicht", updatedAt: 1 });
    return save();
  });
  await openChat(page);
  await send(page, "Bereite drei Instagram-Beiträge für nächste Woche vor.");
  const s = await state(page);
  const P = s.studio.posts.filter((p) => p.source === "chat" && !p.deleted);
  expect(P.length).toBe(3);
  expect(P.every((p) => p.status === "entwurf" && p.date >= "2026-03-16" && p.date <= "2026-03-22")).toBe(true);
  await expect(lastAi(page).locator(".ca")).toContainText("3 Instagram-Entwürfe für 16.3.2026–22.3.2026 vorbereiten✅ erledigt");
  // rückgängig entfernt genau diese Entwürfe
  await lastAi(page).locator('button[data-a="chatUndo"]').click();
  await expect(lastAi(page).locator(".ca")).toContainText("rückgängig gemacht"); // Ansicht neu aufgebaut, bevor weitergetippt wird
  expect((await state(page)).studio.posts.filter((p) => p.source === "chat" && !p.deleted).length).toBe(0);
  await send(page, "Überprüfe, ob es technische Probleme gibt.");
  await expect(lastAi(page)).toContainText("Technische Prüfung");
  await expect(lastAi(page).locator(".ca")).toContainText("Eindeutige Datenfehler reparieren (mit Rückgängig-Punkt)✅ erledigt");
  await expect(lastAi(page).locator(".cb-h", { hasText: "Größte Probleme" })).toHaveCount(0); // technische ≠ geschäftliche Probleme
  expect((await state(page)).tasks.find((x) => x.id === "tx").after).toBe("");
});

test("Gedächtnis: vertrauliche Einträge erscheinen nie; Übernahme aus einer Nachricht nur durch Tippen", async ({ page }) => {
  await setup(page);
  await openChat(page);
  await send(page, "Was weißt du über Testnotiz und Testentscheidung?");
  await expect(lastAi(page)).toContainText("Testentscheidung Gamma");
  await expect(lastAi(page)).not.toContainText("kontakt@example.invalid");
  await expect(lastAi(page)).toContainText("vertraulicher Eintrag passt ebenfalls – wird im Chat nicht angezeigt");
  const n = (await state(page)).memory.length;
  await page.locator(".msg.me").first().locator('button[data-a="chatMem"]').click();
  await page.click('#sheet button[data-a="close"]');
  expect((await state(page)).memory.length).toBe(n);
  await page.locator(".msg.me").first().locator('button[data-a="chatMem"]').click();
  await page.click('#sheet button[data-a="chatMemSave"]');
  expect((await state(page)).memory.length).toBe(n + 1);
});

test("Kopieren, lange Unterhaltung zusammenfassen (Nachrichten bleiben), HTML in Nachrichten wird nicht ausgeführt", async ({ page }) => {
  await stubClipboard(page);
  await setup(page);
  await openChat(page);
  await send(page, '<img src=x onerror="window.__pwned=1"> Welche Aufgaben sind offen?');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator(".msg.me .bub").first()).toContainText('<img src=x onerror="window.__pwned=1">');
  await lastAi(page).locator("xpath=..").locator('button[data-a="chatCopy"]').click();
  expect(await clip(page)).toContain("Offene Aufgaben");
  // viele Nachrichten → Zusammenfassung als Kontext, alle Nachrichten bleiben
  await page.evaluate(async () => {
    const c = chatById(chatOpen);
    for (let i = 0; i < 45; i++) addMsg(c, { role: i % 2 ? "assistant" : "user", text: "Testnachricht " + i, blocks: i % 2 ? [{ k: "fakt", t: "Antwort " + i }] : undefined });
    await save();
  });
  await send(page, "Welche Aufgaben sind offen?");
  const s = await state(page);
  const c = s.chats.find((x) => !x.deleted);
  expect(c.summary).toContain("Automatische Kurzfassung (ohne KI erstellt");
  expect(c.summary).toContain("Testnachricht 0");
  expect(s.chatMsgs.filter((m) => m.chat === c.id).length).toBe(49);
});

test("Synchronisierung: begrenzter Anteil, Zusammenführen ohne Konflikte, gelöschte Chats; Offline funktioniert der lokale Assistent", async ({ page, context }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const c1 = newChat("A"),
      c2 = newChat("B");
    for (let i = 0; i < 120; i++) addMsg(c1, { role: i % 2 ? "assistant" : "user", text: "x".repeat(50) + i });
    addMsg(c2, { role: "user", text: "Hallo B" });
    const d = syncData();
    // Gerät 2: eigener neuer Chat und weitere Nachricht im Chat A; Chat B gelöscht
    const other = JSON.parse(JSON.stringify(d));
    const m = { id: "zz1", chat: c1.id, role: "user", text: "vom iPad", at: Date.now() + 5, via: "voice", updatedAt: Date.now() + 5 };
    other.chatMsgs.push(m);
    other.chats.push({ id: "c-ipad", title: "iPad-Chat", createdAt: 1, updatedAt: Date.now() + 9 });
    other.chatMsgs.push({ id: "zz2", chat: "c-ipad", role: "user", text: "Hallo vom iPad", at: Date.now() + 6, via: "text", updatedAt: Date.now() + 6 });
    const b = other.chats.find((x) => x.id === c2.id);
    b.deleted = true;
    b.revs = [...(b.revs || []), b.updatedAt]; // wie touch() auf dem anderen Gerät
    b.updatedAt = b.updatedAt + 10;
    const inc = cleanIncoming(other, []);
    const rep = mergeInto(S, inc);
    return { synced: d.chatMsgs.length, perA: d.chatMsgs.filter((x) => x.chat === c1.id).length, local: S.chatMsgs.filter((x) => x.chat === c1.id).length, conflicts: rep.conflicts, ipad: S.chatMsgs.some((x) => x.id === "zz2"), bGone: !S.chatMsgs.some((x) => x.chat === c2.id), voice: S.chatMsgs.find((x) => x.id === "zz1").via };
  });
  expect(r.perA).toBe(80); // nur die neuesten 80 je Chat werden übertragen
  expect(r.local).toBe(121); // auf dem Gerät bleibt alles (plus die neue vom iPad)
  expect(r).toMatchObject({ conflicts: 0, ipad: true, bGone: true, voice: "voice" });
  // offline: lokaler Assistent antwortet weiter
  await context.setOffline(true);
  await openChat(page);
  await send(page, "Welche Aufgaben sind offen?");
  await expect(lastAi(page)).toContainText("Offene Aufgaben");
  await context.setOffline(false);
});

test("KI-Einstellungen: lokal gekennzeichnet; KI-Gegenstelle nur auf Tippen geprüft; Einschalten erst wenn erreichbar", async ({ page }) => {
  const g = await guard(page);
  await setup(page);
  await page.click('nav button[data-id="ai"]');
  await expect(page.locator("#kiEngine")).toContainText("Lokaler Assistent (ohne KI-Modell)");
  await page.click('button[data-a="kiSettings"]');
  await expect(page.locator("#kiStat")).toContainText("noch nicht geprüft");
  expect(await page.locator(".ki-f").count()).toBe(6);
  expect(await page.locator(".ki-f:enabled").count()).toBe(0);
  expect(await page.locator("#ki-on").isDisabled()).toBe(true);
  expect(g.external).toEqual([]); // keine automatische Anfrage
  // „Verbindung prüfen“: genau eine Anfrage ohne Daten an die vorgesehene Adresse; Worker noch nicht bereitgestellt
  await page.click('button[data-a="kiCheck"]');
  await expect(page.locator("#kiStat")).toContainText("nicht erreichbar");
  expect(g.external).toEqual(["https://vivalink-ki.hidden-art-0326.workers.dev/v1/ki/status"]);
  expect(await page.locator("#ki-on").isDisabled()).toBe(true);
});
