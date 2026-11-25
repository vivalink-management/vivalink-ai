// Verhindert, dass vertrauliche Inhalte ins öffentliche Repository gelangen:
// Zugangsdaten, Schlüssel, echte Kontaktdaten und bekannte Unternehmenswerte.
// Erlaubt sind nur künstliche Testadressen (example.com / example.invalid).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execSync("git ls-files -co --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !/\.(png|jpg|jpeg|gif|ico|webp)$/i.test(f) && f !== "package-lock.json");

const w = (...p) => p.join(""); // Wörter zerlegt, damit diese Datei sich nicht selbst meldet
const rules = [
  ["Bekannter Standort/Unternehmenswert", new RegExp(w("Pforz", "heim"), "i")],
  ["Registrierungswert mit Ortsangabe", /\d+\s+Registrierungen\s+in\s+[A-ZÄÖÜ]/],
  ["JWT / Supabase-Schlüssel", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/],
  ["Supabase Service-Role", new RegExp(w("service", "_role"), "i")],
  ["API-Schlüssel (sk-)", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["GitHub-Token", /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ["AWS-Schlüssel", /\bAKIA[0-9A-Z]{16}\b/],
  ["Privater Schlüssel", new RegExp(w("-----BEGIN [A-Z ]*PRIVATE", " KEY-----"))],
  ["Zugangsdaten-Zuweisung", /\b(password|passwort|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i],
  ["Telefonnummer", /(\+49|0049)[\d \/-]{7,}\d/],
];
const emailRe = /[\w.+-]+@([\w-]+\.)+[\w-]+/g;
const okDomain = /@(example\.(com|invalid|org)|users\.noreply\.github\.com)$/i;

/* Einzige Ausnahme: serverseitige Supabase-Funktionsvorlagen dürfen den Schlüssel aus ihrer Umgebungsvariable LESEN
   (nie einen Wert enthalten). In der App (js/, index.html) und überall sonst bleibt jede Erwähnung verboten. */
const allowed = (f, line, name) => name === "Supabase Service-Role" && f.startsWith("server/supabase/functions/") && new RegExp(w('Deno\\.env\\.get\\("SUPABASE_SERVICE', '_ROLE_KEY"\\)')).test(line) && !/eyJ/.test(line);
let bad = 0;
for (const f of files) {
  let t;
  try {
    t = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  t.split("\n").forEach((line, i) => {
    for (const [name, re] of rules) if (re.test(line) && !allowed(f, line, name)) (bad++, console.error(`${f}:${i + 1}: ${name}`));
    for (const m of line.match(emailRe) || []) if (!okDomain.test(m) && !/^[\w.+-]+@\d/.test(m)) (bad++, console.error(`${f}:${i + 1}: E-Mail-Adresse`));
  });
}
if (bad) {
  console.error(`\n${bad} mögliche vertrauliche Inhalte gefunden. Bitte entfernen (Werte gehören in die App-Daten, nicht in den Code).`);
  process.exit(1);
}
console.log(`Keine vertraulichen Inhalte gefunden (${files.length} Dateien geprüft).`);
