// Unternehmensprofil und Vivalink-Playbook (ab 2.13): Entwurf auf dem Gerät aus vorhandenen Angaben, Nutzung durch die
// KI NUR nach Freigabe durch Tippen, vertrauliche Einträge nie, Änderung → wieder Entwurf, Rücknahme jederzeit,
// Synchronisierung über das Gedächtnis. Nur künstliche Daten; KI-Gegenstelle mit Attrappe.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { state } from "./helpers.mjs";
import { setupVoice, msgCount } from "./voice-fakes.mjs";
import { playbookMarkdown } from "../scripts/playbook-doc.mjs";

const ask = async (page, q) => {
  const n = await msgCount(page);
  await page.fill("#chatIn", q);
  await page.click('button[data-a="chatSend"]');
  await expect.poll(() => msgCount(page)).toBe(n + 2);
};
const sysOf = (input) => input.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
const openProfile = async (page) => {
  await page.click('nav button[data-id="ai"]');
  if (await page.locator('button[data-a="chatBack"]').count()) await page.click('button[data-a="chatBack"]');
  await page.click('button[data-a="kiSettings"]');
  await page.click('button[data-a="kiProfil"]');
  await expect(page.locator("#sheet")).toContainText("So versteht dich die KI");
};

test("Profil: Entwurf aus Marke und bestätigten Einträgen (ohne Vertrauliches), erst nach Freigabe an die KI; Änderung → wieder Entwurf; Rücknahme", async ({ page }) => {
  const { calls, errors } = await setupVoice(page, { chat: () => ({ response: "[Empfehlung] Eine Antwort." }) });
  await page.evaluate(async () => {
    S.memory.push(
      { id: uid(), cat: "Geschäftsmodell", title: "Testangebot Kleingruppen-Treffen", text: "künstlicher Eintrag", status: "confirmed", active: true, private: false, date: "2026-02-01", createdAt: 1 },
      { id: uid(), cat: "Entscheidung", title: "Testentscheidung Donnerstag als fester Tag", text: "", status: "confirmed", active: true, private: false, date: "2026-02-10", createdAt: 2 },
      { id: uid(), cat: "Ziele", title: "Geheimes Testziel", text: "vertraulich", status: "confirmed", active: true, private: true, date: "2026-02-11", createdAt: 3 },
      { id: uid(), cat: "Marketing", title: "Unbestätigte Testidee", text: "", status: "estimate", active: true, private: false, date: "2026-02-12", createdAt: 4 },
    );
    await save();
  });
  const mem0 = (await state(page)).memory.length;
  // vor dem Entwurf: nichts gespeichert, nichts an die KI
  await page.click('button[data-a="chatNew"]');
  await ask(page, "Was sollten wir als Nächstes tun?");
  expect(sysOf(calls.inputs[0])).not.toContain("UNTERNEHMENSPROFIL");
  await openProfile(page);
  await expect(page.locator("#pfStatus")).toContainText("Noch kein Profil");
  await page.click('#sheet button[data-a="kiPfDraft"]');
  const draft = await page.inputValue("#pf-text");
  expect(draft).toContain("Testangebot Kleingruppen-Treffen");
  expect(draft).toContain("Testentscheidung Donnerstag als fester Tag (10.2.2026)");
  expect(draft).toContain("Erwachsene, die neue Menschen kennenlernen möchten"); // Zielgruppe aus den Marken-Angaben
  expect(draft).toContain("Noch offen (bitte ergänzen):");
  expect(draft).not.toContain("Geheimes Testziel"); // vertraulich
  expect(draft).not.toContain("Unbestätigte Testidee"); // nur bestätigte Einträge
  expect(draft.length).toBeLessThanOrEqual(1500);
  expect((await state(page)).memory.length).toBe(mem0); // Entwurf eingesetzt, aber noch nicht gespeichert
  // als Entwurf speichern → KI nutzt es NICHT
  await page.fill("#pf-text", draft + "\nTestzusatz: Fokus auf Erstbesuch.");
  await page.click('#sheet button[data-a="kiPfSave"]');
  await expect(page.locator("#pfStatus")).toContainText("Entwurf");
  await page.click('#sheet button[data-a="close"]');
  await page.click('[data-a="chatOpen"]');
  await ask(page, "Und was noch?");
  expect(sysOf(calls.inputs.at(-1))).not.toContain("UNTERNEHMENSPROFIL");
  // freigeben → bei jeder Frage dabei
  await openProfile(page);
  await page.click('#sheet button[data-a="kiPfOk"]');
  await expect(page.locator("#pfStatus")).toContainText("Freigegeben");
  await page.click('#sheet button[data-a="close"]');
  await page.click('[data-a="chatOpen"]');
  await ask(page, "Welche Option empfiehlst du?");
  const sys = sysOf(calls.inputs.at(-1));
  expect(sys).toContain("UNTERNEHMENSPROFIL");
  expect(sys).toContain("Testzusatz: Fokus auf Erstbesuch.");
  expect(sys).not.toContain("Geheimes Testziel");
  // Änderung → wieder Entwurf (nicht mehr an die KI), dann Rücknahme
  await openProfile(page);
  await page.fill("#pf-text", "Geänderter Testtext");
  await page.click('#sheet button[data-a="kiPfSave"]');
  await expect(page.locator("#pfStatus")).toContainText("Entwurf");
  expect(await page.evaluate(() => profileForKi())).toBe("");
  await page.click('#sheet button[data-a="kiPfOk"]');
  expect(await page.evaluate(() => profileForKi())).toBe("Geänderter Testtext");
  await page.click('#sheet button[data-a="kiPfOff"]');
  expect(await page.evaluate(() => profileForKi())).toBe("");
  // Protokoll: alles durch den Gründer; Profil gilt nicht als Wissenslücke, nie als öffentliche Fakten
  const log = await page.evaluate(() => ACTIONS.filter((a) => a.name === "ki.profile").map((a) => a.by + ":" + a.detail));
  expect(log).toEqual(["gruender:Entwurf gespeichert", "gruender:freigegeben", "gruender:Entwurf gespeichert", "gruender:freigegeben", "gruender:Freigabe zurückgenommen"]);
  const p = (await state(page)).memory.find((m) => m.kind === "profil");
  expect(p).toMatchObject({ cat: "KI", private: false, text: "Geänderter Testtext", status: "unknown" });
  expect(await page.evaluate(() => PUBLIC_CATS.includes("KI"))).toBe(false);
  expect(errors).toEqual([]);
});

test("Playbook: Werkzeug „wissen“ und Hinweis erst nach Freigabe; Inhalt als Erfahrungswert gekennzeichnet; Lesefassung stimmt mit der App überein", async ({ page }) => {
  // Lesefassung für den Gründer muss genau dem Inhalt der App entsprechen
  expect(readFileSync(new URL("../docs/VIVALINK-PLAYBOOK.md", import.meta.url), "utf8")).toBe(playbookMarkdown());
  const { calls } = await setupVoice(page, {
    chat: () => (input) =>
      input.tools && input.tools.some((t) => t.function.name === "wissen") && !input.messages.at(-1).content.startsWith("Ergebnisse")
        ? { response: "", tool_calls: [{ name: "wissen", arguments: { thema: "anmeldung" } }] }
        : { response: "[Empfehlung] Erinnerungen vor dem Termin testen, weil Nichterscheinen sinkt. Option A … Option B … Erster Schritt: diese Woche. Erfolg messen: Nichterscheinen nach 4 Wochen." },
  });
  await page.click('button[data-a="chatNew"]');
  await ask(page, "Wie senken wir das Nichterscheinen?");
  expect(calls.inputs[0].tools.some((t) => t.function.name === "wissen")).toBe(false);
  expect(sysOf(calls.inputs[0])).not.toContain("Vivalink-Playbook");
  await openProfile(page);
  await expect(page.locator("#pbStatus")).toContainText("Entwurf");
  await page.click("#pbText summary");
  await expect(page.locator("#pbText")).toContainText("Anmeldungen und Nichterscheinen");
  await page.click('#sheet button[data-a="kiPbOk"]');
  await expect(page.locator("#pbStatus")).toContainText("Freigegeben");
  await page.click('#sheet button[data-a="close"]');
  await page.click('[data-a="chatOpen"]');
  const n0 = calls.inputs.length;
  await ask(page, "Und wie bekommen wir mehr Verbindlichkeit?");
  const mine = calls.inputs.slice(n0);
  expect(mine[0].tools.some((t) => t.function.name === "wissen")).toBe(true);
  expect(sysOf(mine[0])).toContain("Vivalink-Playbook");
  const res = mine[1].messages.at(-1).content;
  expect(res).toContain("### wissen");
  expect(res).toContain("[Erfahrungswert, kein Vivalink-Fakt]");
  expect(res).toContain("Erinnerungen kurz vor dem Termin");
  // Freigabe gilt je Version; Rücknahme entfernt das Werkzeug wieder
  expect((await state(page)).memory.find((m) => m.kind === "playbook-freigabe")).toMatchObject({ pbVersion: 1, status: "confirmed", cat: "KI" });
  await openProfile(page);
  await page.click('#sheet button[data-a="kiPbOff"]');
  expect(await page.evaluate(() => playbookApproved())).toBe(false);
});

test("Profil und Playbook-Freigabe überstehen die Synchronisierung (Zusammenführen) und Sicherungen unverändert", async ({ page }) => {
  await setupVoice(page, { ki: false });
  const out = await page.evaluate(async () => {
    profileSave("Testprofil für die Synchronisierung", true);
    playbookSetApproved(true);
    await save();
    const inc = cleanIncoming(JSON.parse(JSON.stringify({ memory: S.memory, tasks: S.tasks, metrics: S.metrics })));
    const T = clone(S);
    T.memory = T.memory.filter((m) => !m.kind);
    mergeInto(T, inc);
    const b = await makeBackup();
    return { merged: T.memory.filter((m) => m.kind).map((m) => [m.kind, m.status, m.text.slice(0, 40)]), backup: JSON.stringify(b).includes("Testprofil für die Synchronisierung") };
  });
  expect(out.merged).toEqual(expect.arrayContaining([["profil", "confirmed", "Testprofil für die Synchronisierung"], ["playbook-freigabe", "confirmed", expect.any(String)]]));
  expect(out.backup).toBe(true);
});
