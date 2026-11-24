// Freigabelogik, Aktionsprotokoll und Schutz vor unberechtigten oder doppelten Veröffentlichungen.
import { test, expect } from "@playwright/test";
import { guard, seed, nav, state, expectToast } from "./helpers.mjs";
import { v2State } from "./fixtures.mjs";

const base = () => {
  const s = v2State();
  s.studio = { brand: { region: "Testregion", colorsConfirmed: true }, settings: {}, posts: [], learned: {} };
  return s;
};

test("Stufen: Geschäftsentscheidungen nie automatisch, Freigabe-Handlungen nur durch den Gründer; alles protokolliert", async ({ page }) => {
  await seed(page, { state: base() });
  const r = await page.evaluate(async () => {
    const out = {};
    for (const n of ["price.change", "payment.trigger", "ads.paid", "prod.write", "service.paid", "post.publishUnapproved"]) out[n] = [mayRun(n, "gruender").ok, mayRun(n, "auto").ok];
    out["post.publish"] = [mayRun("post.publish", "gruender").ok, mayRun("post.publish", "auto").ok];
    out["snapshot.auto"] = [mayRun("snapshot.auto", "auto").ok];
    out.unknown = mayRun("irgendwas", "gruender").ok;
    let ran = false;
    const res = await act("payment.trigger", "gruender", () => (ran = true));
    out.refused = [res.refused, ran];
    return out;
  });
  for (const n of ["price.change", "payment.trigger", "ads.paid", "prod.write", "service.paid", "post.publishUnapproved"]) expect(r[n], n).toEqual([false, false]);
  expect(r["post.publish"]).toEqual([true, false]);
  expect(r["snapshot.auto"]).toEqual([true]);
  expect(r.unknown).toBe(false);
  expect(r.refused).toEqual([true, false]);
  await nav(page, "more");
  await page.click('button[data-a="diag"]');
  await expect(page.locator('#sheet [data-action="payment.trigger"]')).toContainText("nicht ausgeführt");
  await expect(page.locator('#sheet [data-action="snapshot.auto"]')).toContainText("automatisch");
});

test("Veröffentlichung nur nach Freigabe, nie doppelt, nach Änderung erneut freigeben", async ({ page }) => {
  const g = await guard(page);
  await seed(page, { state: base() });
  await page.evaluate(() => {
    const p = makePost({ date: today(), pillar: "tipps", type: "einzelbild", title: "Schutztest", slides: [{ template: "frage", title: "Frage?" }], caption: "Text mit vivalink.me" }, "ki");
    p.id = "pp1";
    S.studio.posts.push(p);
    return save();
  });
  // Ohne Freigabe: Veröffentlichung abgelehnt
  expect(await page.evaluate(() => markPublishedManually(S.studio.posts[0]))).toMatchObject({ ok: false });
  await nav(page, "studio");
  await page.locator('[data-a="stOpen"]', { hasText: "Schutztest" }).click();
  await page.click('#sheet button[data-a="stSet"][data-id="freigegeben"]');
  await expectToast(page, "Fällig");
  // Änderung nach Freigabe → wieder Entwurf
  await page.fill("#pe-caption", "Geänderter Text mit vivalink.me");
  await page.click('button[data-a="stEdit"]');
  await expectToast(page, "bitte erneut freigeben");
  expect((await state(page)).studio.posts[0].status).toBe("entwurf");
  await page.click('#sheet button[data-a="stSet"][data-id="freigegeben"]');
  await page.click('#sheet button[data-a="stSet"][data-id="veroeffentlicht"]');
  await expectToast(page, "Veröffentlicht");
  const p = (await state(page)).studio.posts[0];
  expect(p.publish).toMatchObject({ state: "erledigt", channel: "manuell", key: "pp1" });
  // Zweite Veröffentlichung verhindert
  expect(await page.evaluate(() => markPublishedManually(S.studio.posts[0]))).toMatchObject({ ok: false, why: expect.stringContaining("doppelte") });
  // Unbemerkte Änderung des Inhalts nach Freigabe wird erkannt
  const r = await page.evaluate(() => {
    const q = makePost({ date: "2026-12-02", pillar: "tipps", type: "einzelbild", title: "Hash", slides: [{ template: "frage", title: "x" }], caption: "a" }, "ki");
    approvePost(q);
    q.caption = "heimlich geändert";
    return canPublish(q);
  });
  expect(r).toMatchObject({ ok: false, why: expect.stringContaining("erneut freigeben") });
  expect(g.errors).toEqual([]);
});

test("Automatische Veröffentlichung (später): Fehlschlag erlaubt neuen Versuch, laufende Veröffentlichung blockiert Duplikat", async ({ page }) => {
  await seed(page, { state: base() });
  const r = await page.evaluate(() => {
    const p = makePost({ date: "2026-12-01", pillar: "tipps", type: "einzelbild", title: "Auto", slides: [{ template: "frage", title: "x" }], caption: "a" }, "ki");
    approvePost(p);
    const a = claimPublish(p, "instagram-api").ok;
    const dup = claimPublish(p, "instagram-api").ok;
    finishPublish(p, false, { error: "Netzwerkfehler" });
    const retry = claimPublish(p, "instagram-api").ok;
    finishPublish(p, true, { mediaId: "123" });
    return [a, dup, retry, p.status, p.publish.state, claimPublish(p, "instagram-api").ok];
  });
  expect(r).toEqual([true, false, true, "veroeffentlicht", "erledigt", false]);
});

test("Export im JPEG-Format für die Instagram-Schnittstelle", async ({ page }) => {
  await seed(page, { state: base() });
  const r = await page.evaluate(async () => {
    const p = makePost({ date: "2026-12-01", pillar: "tipps", type: "einzelbild", title: "Jpeg", slides: [{ template: "frage", title: "x" }] }, "ki");
    const f = (await postFiles(p, false, "image/jpeg"))[0];
    const b = new Uint8Array(await f.arrayBuffer());
    return [f.type, f.name.endsWith(".jpg"), b[0], b[1]];
  });
  expect(r).toEqual(["image/jpeg", true, 0xff, 0xd8]);
});
