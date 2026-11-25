// Erzeugt die getrennte Testversion in dist-test/ (wird nicht ins Haupt-Repository eingecheckt).
// Unterschiede zur echten App: eigener Datenspeicher (vivalink-test), eigener Offline-Speicher
// (vivalink-test-…), eigener Name und eigenes Symbol, Hinweis „TESTVERSION“, Demodaten-Funktionen.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const out = process.argv[2] || "dist-test";
rmSync(out, { recursive: true, force: true });
mkdirSync(out + "/js", { recursive: true });
for (const f of readdirSync("js")) cpSync("js/" + f, `${out}/js/${f}`);
cpSync("test-build/demo.js", `${out}/js/demo.js`); // Demodaten nur in der Testversion
cpSync("brand", `${out}/brand`, { recursive: true });
cpSync("test-build/icon-180.png", `${out}/icon-180.png`);
cpSync("test-build/icon-512.png", `${out}/icon-512.png`);

const must = (s, a, b) => {
  if (!s.includes(a)) throw new Error("Build: Stelle nicht gefunden: " + a);
  return s.split(a).join(b);
};
// Synchronisierungs-Server (Cloudflare Worker, kostenlos). Zuerst nur in der Testversion aktiv; die echte App folgt nach Freigabe.
const SYNC_URL = "https://vivalink-sync.hidden-art-0326.workers.dev";
writeFileSync(`${out}/js/config.js`, `/* Testversion: getrennter Speicher, nur künstliche Testdaten. */\nwindow.VL_CHANNEL = "test";\nwindow.VL_DB = "vivalink-test";\nwindow.VL_SYNC_URL = "${SYNC_URL}";\n`);

let html = readFileSync("index.html", "utf8");
html = must(html, "<title>Vivalink Management AI</title>", "<title>Vivalink TEST</title>");
html = must(html, '<meta name="apple-mobile-web-app-title" content="Vivalink">', '<meta name="apple-mobile-web-app-title" content="VL Test">');
html = must(html, '<meta name="theme-color" content="#0f766e">', '<meta name="theme-color" content="#b45309">');
html = must(html, '<script src="js/app.js', '<script src="js/demo.js?v=' + (html.match(/js\/app\.js\?v=([^"]+)"/) || [])[1] + '"></script>\n<script src="js/app.js');
html = must(html, "connect-src 'self'", "connect-src 'self' " + SYNC_URL); // nur dieser eine Server zusätzlich
writeFileSync(`${out}/index.html`, html);

let sw = must(readFileSync("sw.js", "utf8"), 'const CH = "vivalink-";', 'const CH = "vivalink-test-";');
sw = must(sw, '  "js/app.js",\n', '  "js/demo.js",\n  "js/app.js",\n');
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
