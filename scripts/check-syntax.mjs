// Prüft alle App-Skripte auf Syntaxfehler und auf doppelte Namen über Dateigrenzen hinweg
// (alle Skripte teilen sich im Browser einen gemeinsamen Gültigkeitsbereich).
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("index.html", "utf8");
const files = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
if (!files.length) throw new Error("Keine Skripte in index.html gefunden");
let all = "";
for (const f of files) {
  const code = readFileSync(f, "utf8");
  new vm.Script(code, { filename: f });
  all += "\n" + code;
}
new vm.Script(all, { filename: "alle-skripte.js" });
const sw = readFileSync("sw.js", "utf8");
new vm.Script(sw, { filename: "sw.js" });
for (const f of files) if (!sw.includes(`"${f}"`)) throw new Error(`sw.js speichert ${f} nicht für die Offline-Nutzung`);
console.log(`Syntax OK: ${files.length} Skripte, keine doppelten Namen, alle im Offline-Speicher.`);
