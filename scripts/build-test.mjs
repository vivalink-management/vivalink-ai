// Erzeugt die getrennte Testversion in dist-test/ (wird nicht ins Haupt-Repository eingecheckt).
// Unterschiede zur echten App: eigener Datenspeicher (vivalink-test), eigener Offline-Speicher
// (vivalink-test-…), eigener Name und eigenes Symbol, Hinweis „TESTVERSION“, Demodaten-Funktionen.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const out = process.argv[2] || "dist-test";
rmSync(out, { recursive: true, force: true });
mkdirSync(out + "/js", { recursive: true });
for (const f of readdirSync("js")) cpSync("js/" + f, `${out}/js/${f}`);
cpSync("test-build/icon-180.png", `${out}/icon-180.png`);
cpSync("test-build/icon-512.png", `${out}/icon-512.png`);

const must = (s, a, b) => {
  if (!s.includes(a)) throw new Error("Build: Stelle nicht gefunden: " + a);
  return s.split(a).join(b);
};
writeFileSync(`${out}/js/config.js`, '/* Testversion: getrennter Speicher, nur künstliche Testdaten. */\nwindow.VL_CHANNEL = "test";\nwindow.VL_DB = "vivalink-test";\n');

let html = readFileSync("index.html", "utf8");
html = must(html, "<title>Vivalink Management AI</title>", "<title>Vivalink TEST</title>");
html = must(html, '<meta name="apple-mobile-web-app-title" content="Vivalink">', '<meta name="apple-mobile-web-app-title" content="VL Test">');
html = must(html, '<meta name="theme-color" content="#0f766e">', '<meta name="theme-color" content="#b45309">');
writeFileSync(`${out}/index.html`, html);

const sw = must(readFileSync("sw.js", "utf8"), 'const CH = "vivalink-";', 'const CH = "vivalink-test-";');
writeFileSync(`${out}/sw.js`, sw);

const man = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
Object.assign(man, { name: "Vivalink AI TEST", short_name: "VL Test", theme_color: "#b45309", id: "./?vivalink-test" });
writeFileSync(`${out}/manifest.webmanifest`, JSON.stringify(man));

let rev = "unbekannt";
try {
  rev = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch {}
writeFileSync(`${out}/.nojekyll`, "");
writeFileSync(
  `${out}/README.md`,
  `# Vivalink AI – Testversion\n\nAutomatisch erzeugt aus vivalink-management/vivalink-ai (Stand ${rev}) mit \`node scripts/build-test.mjs\`.\nNur künstliche Testdaten verwenden. Eigener Speicher, berührt die echte App nicht.\n`,
);
console.log(`Testversion erzeugt in ${out}/ (Stand ${rev})`);
