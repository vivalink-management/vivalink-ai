#!/usr/bin/env node
// Brücke für eine geplante Claude-Aufgabe (vorbereitet, nicht aktiv).
// Holt den verschlüsselten Auftrag der Vivalink Management AI ab und legt die Antwort (Entwürfe) verschlüsselt zurück.
// Nötig in der Umgebung der geplanten Aufgabe (geheim, nie ins Repository):
//   VL_SYNC_URL  Adresse des Tresor-Servers
//   VL_TASK_KEY  Aufgaben-Schlüssel aus „Mehr › Autonomie › Geplante KI-Aufgaben“ (öffnet nur die Auftrags-Postfächer)
// Ablauf in der Aufgabe:
//   node scripts/ki-aufgabe.mjs holen > auftrag.json      # Auftrag lesen (enthält Regeln, Fakten, Termine)
//   … Antwort im Format „vivalink-studio-plan“ nach antwort.json schreiben …
//   node scripts/ki-aufgabe.mjs abgeben antwort.json       # Entwürfe zurückgeben (die App übernimmt sie nur als Entwurf)
import { readFile } from "node:fs/promises";

const hex = (u8) => [...u8].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
const b64 = (u8) => Buffer.from(u8).toString("base64");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

/* Identisch zu js/autonomy.js (taskAccess) und js/sync.js (seal/unseal) */
export async function taskAccess(tk, box) {
  const id = (await sha("vivalink-task-id:" + box + ":" + tk)).slice(0, 32);
  const base = await crypto.subtle.importKey("raw", unb64(tk), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("vivalink-task|" + box), info: new TextEncoder().encode("vivalink-task-v1") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return { id, token: await sha("vivalink-task-token:" + box + ":" + tk), aad: "task|" + box + "|" + id, key };
}
async function seal(K, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(K.aad) }, K.key, new TextEncoder().encode(JSON.stringify(obj))));
  return JSON.stringify({ v: 2, iv: b64(iv), ct: b64(ct) });
}
async function unseal(K, blob) {
  const o = JSON.parse(blob);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv), additionalData: new TextEncoder().encode(K.aad) }, K.key, unb64(o.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function call(base, K, method, body) {
  const r = await fetch(base.replace(/\/$/, "") + "/v1/vault/" + K.id, { method, headers: { authorization: "Bearer " + K.token, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
/* Auftrag holen (oder null, wenn keiner bereitliegt) */
export async function holen(base, tk) {
  const K = await taskAccess(tk, "out");
  const r = await call(base, K, "GET");
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error("Server " + r.status);
  const pkg = await unseal(K, r.j.blob);
  if (!pkg || pkg.format !== "vivalink-task") throw new Error("Unbekanntes Auftragsformat");
  return pkg;
}
/* Antwort abgeben: answer = KI-Antwort im Format „vivalink-studio-plan“ (Objekt oder Text) */
export async function abgeben(base, tk, answer, packageId = "") {
  const K = await taskAccess(tk, "in");
  const id = "r" + Date.now().toString(36) + hex(crypto.getRandomValues(new Uint8Array(4)));
  for (let i = 0; i < 3; i++) {
    const cur = await call(base, K, "GET");
    const r = await call(base, K, "PUT", { blob: await seal(K, { format: "vivalink-task-result", id, packageId, at: new Date().toISOString(), answer }), expected: cur.status === 200 ? cur.j.version : 0 });
    if (r.status === 200) return { ok: true, id };
    if (r.status !== 409) throw new Error("Server " + r.status);
  }
  throw new Error("Postfach belegt");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, file] = process.argv.slice(2);
  const base = process.env.VL_SYNC_URL,
    tk = process.env.VL_TASK_KEY;
  if (!base || !tk) {
    console.error("VL_SYNC_URL und VL_TASK_KEY müssen gesetzt sein.");
    process.exit(2);
  }
  if (cmd === "holen") {
    const p = await holen(base, tk);
    if (!p) {
      console.error("Kein Auftrag vorhanden.");
      process.exit(1);
    }
    console.log(JSON.stringify(p, null, 2));
  } else if (cmd === "abgeben" && file) {
    const text = await readFile(file, "utf8");
    const pkg = await holen(base, tk).catch(() => null);
    console.log(JSON.stringify(await abgeben(base, tk, text, pkg ? pkg.id : "")));
  } else {
    console.error("Aufruf: node scripts/ki-aufgabe.mjs holen | abgeben <antwort.json>");
    process.exit(2);
  }
}
