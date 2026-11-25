#!/usr/bin/env node
// Brücke für geplante Claude-Aufgaben: Auftrag der Vivalink Management AI abholen, Ergebnis zurückgeben.
// Läuft in der Claude-Umgebung „Vivalink“. Das Postfach-Token setzt der Netzwerk-Proxy als geschützten
// Netzwerkschlüssel ein (Header x-vl-task-token) – es steht nie im Klartext in der Sitzung oder im Repository.
//   VL_SYNC_URL      Adresse des Workers (Standard: die in js/config.js eingetragene Adresse)
//   VL_TASK_TOKEN    nur für Tests; sonst setzt der Proxy das Token ein
// Aufruf:
//   node scripts/ki-aufgabe.mjs holen [datei]       Auftrag lesen (Ausgabe JSON) – Exit 3, wenn keiner vorliegt
//   node scripts/ki-aufgabe.mjs pruefen <ergebnis>  Ergebnis vor dem Abgeben prüfen
//   node scripts/ki-aufgabe.mjs abgeben <ergebnis>  Ergebnis zurückgeben (die App übernimmt nur Entwürfe/Vorschläge)
// Ergebnisformat: {"posts": <Antwort im Format vivalink-studio-plan>, "analysis": {"text": "…", "actions": <vivalink-actions>}}
import { readFile, writeFile } from "node:fs/promises";

const PLACEHOLDER = "0".repeat(64); // wird vom Proxy durch das geschützte Token ersetzt
export function api(base, token = process.env.VL_TASK_TOKEN || PLACEHOLDER) {
  const u = (box) => base.replace(/\/$/, "") + "/v1/task/" + box;
  const h = (x) => ({ "x-vl-task-token": token, ...(x || {}) });
  return {
    async get(box) {
      const r = await fetch(u(box), { headers: h() });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("Server " + r.status + (r.status === 401 ? " (Token fehlt – geschützter Netzwerkschlüssel eingerichtet?)" : ""));
      return r.json();
    },
    async put(box, body, expected) {
      const r = await fetch(u(box), { method: "PUT", headers: h({ "content-type": "application/json" }), body: JSON.stringify({ body, expected }) });
      if (r.status === 409) return { conflict: true };
      if (!r.ok) throw new Error("Server " + r.status);
      return r.json();
    },
  };
}
export async function holen(base, token) {
  const r = await api(base, token).get("out");
  if (!r) return null;
  const pkg = JSON.parse(r.body);
  if (!pkg || pkg.format !== "vivalink-task") throw new Error("Unbekanntes Auftragsformat");
  return pkg;
}
/* Prüft Form und Grenzen des Ergebnisses (die App prüft Inhalte zusätzlich auf erfundene Angaben) */
export function pruefen(res) {
  const E = [];
  if (!res || typeof res !== "object") return ["Ergebnis ist kein JSON-Objekt"];
  const posts = typeof res.posts === "string" ? safe(res.posts) : res.posts;
  if (res.posts != null) {
    if (!posts || !Array.isArray(posts.posts)) E.push("posts: erwartet {\"format\":\"vivalink-studio-plan\",\"posts\":[…]}");
    else
      posts.posts.forEach((p, i) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || "")) E.push(`posts[${i}]: Datum fehlt oder falsch`);
        if (!p.caption) E.push(`posts[${i}]: Caption fehlt`);
        if (!Array.isArray(p.slides) || !p.slides.length) E.push(`posts[${i}]: Folien fehlen`);
        if (/\[BITTE ERGÄNZEN/i.test(JSON.stringify(p))) E.push(`posts[${i}]: enthält Platzhalter – nur in Ordnung, wenn eine Angabe wirklich fehlt`);
      });
  }
  const an = res.analysis;
  if (an != null) {
    if (typeof an.text !== "string" || an.text.length < 50) E.push("analysis.text: fehlt oder zu kurz");
    const ac = typeof an.actions === "string" ? safe(an.actions) : an.actions;
    if (an.actions != null && (!ac || ac.format !== "vivalink-actions" || !Array.isArray(ac.tasks))) E.push("analysis.actions: erwartet {\"format\":\"vivalink-actions\",\"tasks\":[…]}");
    else if (ac && ac.tasks.length > 5) E.push("analysis.actions: höchstens 5 Aufgaben");
  }
  if (res.posts == null && res.analysis == null) E.push("Weder posts noch analysis vorhanden");
  return E;
}
const safe = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};
export async function abgeben(base, res, packageId = "", token) {
  const A = api(base, token);
  const id = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const body = JSON.stringify({ format: "vivalink-task-result", version: 2, id, packageId, at: new Date().toISOString(), ...res });
  for (let i = 0; i < 3; i++) {
    const cur = await A.get("in");
    const r = await A.put("in", body, cur ? cur.version : 0);
    if (!r.conflict) return { ok: true, id };
  }
  throw new Error("Postfach belegt");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, file] = process.argv.slice(2);
  let base = process.env.VL_SYNC_URL;
  if (!base) {
    const cfg = await readFile(new URL("../js/config.js", import.meta.url), "utf8");
    base = (cfg.match(/VL_SYNC_URL\s*=\s*"([^"]+)"/) || [])[1];
  }
  if (!base && cmd !== "pruefen") {
    console.error("Keine Worker-Adresse (VL_SYNC_URL oder js/config.js).");
    process.exit(2);
  }
  try {
    if (cmd === "holen") {
      const p = await holen(base);
      if (!p) {
        console.error("Kein Auftrag vorhanden.");
        process.exit(3);
      }
      const t = JSON.stringify(p, null, 2);
      if (file) await writeFile(file, t);
      else console.log(t);
    } else if (cmd === "pruefen" && file) {
      const E = pruefen(JSON.parse(await readFile(file, "utf8")));
      console.log(E.length ? "Probleme:\n- " + E.join("\n- ") : "Ergebnis in Ordnung.");
      process.exit(E.some((e) => !e.includes("Platzhalter")) ? 1 : 0);
    } else if (cmd === "abgeben" && file) {
      const res = JSON.parse(await readFile(file, "utf8"));
      const E = pruefen(res).filter((e) => !e.includes("Platzhalter"));
      if (E.length) throw new Error("Ergebnis fehlerhaft:\n- " + E.join("\n- "));
      const pkg = await holen(base).catch(() => null);
      console.log(JSON.stringify(await abgeben(base, res, pkg ? pkg.id : "")));
    } else {
      console.error("Aufruf: node scripts/ki-aufgabe.mjs holen [datei] | pruefen <ergebnis.json> | abgeben <ergebnis.json>");
      process.exit(2);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
