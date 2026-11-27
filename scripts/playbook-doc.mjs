// Erzeugt die Lesefassung des Vivalink-Playbooks (docs/VIVALINK-PLAYBOOK.md) aus js/playbook.js.
// Aufruf: node scripts/playbook-doc.mjs   (Test prüft, dass beide übereinstimmen)
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
export function playbookMarkdown() {
  const ctx = {};
  vm.runInNewContext(readFileSync(new URL("../js/playbook.js", import.meta.url), "utf8") + "\nthis.PB = PLAYBOOK;", ctx);
  const P = ctx.PB;
  return `# ${P.title}\n\n**ENTWURF Version ${P.version} – wird erst nach Freigabe des Gründers von der KI genutzt** (KI-Chat › KI-Einstellungen › „So versteht dich die KI“).\n\n> ${P.note}\n\n` + P.sections.map((s) => `## ${s.title}\n\n${s.text}\n`).join("\n");
}
if (import.meta.url === `file://${process.argv[1]}`) writeFileSync(new URL("../docs/VIVALINK-PLAYBOOK.md", import.meta.url), playbookMarkdown());
