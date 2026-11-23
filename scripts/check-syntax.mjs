// Prüft alle App-Skripte auf Syntaxfehler und auf doppelte Namen über Dateigrenzen hinweg
// (alle Skripte teilen sich im Browser einen gemeinsamen Gültigkeitsbereich),
// außerdem die Offline-Dateiliste, einheitliche Versionsnummern und dass die produktive App
// keine Demofunktionen enthält.
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const fail = (m) => {
  console.error("FEHLER: " + m);
  process.exit(1);
};
const html = readFileSync("index.html", "utf8");
const tags = [...html.matchAll(/<script src="([^"?]+)(?:\?v=([^"]+))?"><\/script>/g)];
const files = tags.map((m) => m[1]);
if (!files.length) fail("Keine Skripte in index.html gefunden");
if ((html.match(/<script/g) || []).length !== tags.length) fail("index.html enthält Skripte, die nicht als eigene Datei eingebunden sind");

const core = readFileSync("js/core.js", "utf8");
const appVersion = (core.match(/const APP_VERSION = "([^"]+)"/) || [])[1];
const sw = readFileSync("sw.js", "utf8");
const swVersion = (sw.match(/const VERSION = "([^"]+)"/) || [])[1];
const pkgVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
for (const [name, v] of [["sw.js", swVersion], ["package.json", pkgVersion], ...tags.map((t) => [t[1] + "?v=", t[2]])])
  if (v !== appVersion) fail(`Versionsnummer ${name} (${v}) passt nicht zu APP_VERSION (${appVersion})`);

let all = "";
for (const f of files) {
  if (!existsSync(f)) fail(`${f} fehlt`);
  const code = readFileSync(f, "utf8");
  new vm.Script(code, { filename: f });
  all += "\n" + code;
}
new vm.Script(all, { filename: "alle-skripte.js" });
// Testversion: zusätzlich mit Demofunktionen
new vm.Script(all + "\n" + readFileSync("test-build/demo.js", "utf8"), { filename: "testversion.js" });
new vm.Script(sw, { filename: "sw.js" });
for (const f of files) if (!sw.includes(`"${f}"`)) fail(`sw.js speichert ${f} nicht für die Offline-Nutzung`);

if (files.some((f) => /demo/.test(f)) || /demo\.js/.test(sw)) fail("Die produktive App darf keine Demofunktionen laden");
if (!/window\.VL_CHANNEL = "prod";/.test(readFileSync("js/config.js", "utf8"))) fail("js/config.js muss den Kanal \"prod\" setzen");
if (/VL_DB\s*=/.test(all)) fail("Die produktive App darf den Datenspeicher-Namen nicht ändern");
console.log(`Syntax OK: ${files.length} Skripte, keine doppelten Namen, alle im Offline-Speicher, Version ${appVersion} einheitlich, keine Demofunktionen in der produktiven App.`);
