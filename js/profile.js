/* Unternehmensprofil („So versteht dich die KI“) und Freigabe des Vivalink-Playbooks.
   - Das Profil ist ein kompakter Text (höchstens PROFILE_MAX Zeichen). Der ENTWURF entsteht auf dem Gerät aus den
     Marken-Angaben im Studio und aus bestätigten, NICHT vertraulichen Gedächtniseinträgen. Der Gründer prüft, bearbeitet
     und gibt frei. Erst dann geht es bei jeder Frage an das KI-Modell. Jede Änderung macht es wieder zum Entwurf.
   - Gespeichert als besondere Gedächtniseinträge (kind „profil“ bzw. „playbook-freigabe“, Bereich „KI“): Sie werden wie
     alle Einträge Ende-zu-Ende-verschlüsselt synchronisiert, ältere App-Versionen zeigen sie als normale Einträge an.
     Bereich „KI“ zählt nicht als Wissenslücke und nie als öffentliche Fakten (Studio).
   - Freigaben und Rücknahmen nur durch Tippen (Aktionsprotokoll). Vertrauliche Einträge kommen nie ins Profil. */
const PROFILE_MAX = 1500,
  KI_CAT = "KI";
const profileEntry = (T = S) => (T.memory || []).find((m) => m.kind === "profil" && !m.deleted) || null;
function profileForKi(T = S) {
  const p = profileEntry(T);
  return p && p.active !== false && p.status === "confirmed" && p.text.trim() ? p.text.slice(0, PROFILE_MAX) : "";
}
const playbookEntry = (T = S) => (T.memory || []).find((m) => m.kind === "playbook-freigabe" && !m.deleted && m.pbVersion === PLAYBOOK.version) || null;
function playbookApproved(T = S) {
  const e = playbookEntry(T);
  return !!(e && e.active !== false && e.status === "confirmed");
}
/* Entwurf aus vorhandenen Informationen (nichts erfunden; Unbekanntes als „noch offen“) */
function profileDraft(T = S) {
  const b = (T.studio && T.studio.brand) || BRAND_DEFAULT;
  const mem = (T.memory || []).filter((m) => m.active && !m.deleted && !m.private && m.status === "confirmed" && !m.kind);
  const of = (cat, n = 3) =>
    mem
      .filter((m) => m.cat === cat)
      .sort((a, c) => (c.date || "").localeCompare(a.date || "") || (c.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, n)
      .map((m) => (m.title + (m.text ? ": " + m.text.replace(/\s+/g, " ") : "")).slice(0, 180) + (cat === "Entscheidung" && m.date ? " (" + fmt(m.date) + ")" : ""));
  const L = [];
  const line = (label, parts) => {
    const x = parts.filter(Boolean);
    if (x.length) L.push(label + ": " + x.join("; "));
  };
  line("Angebot und Besonderheit", [b.concept, ...of("Geschäftsmodell")]);
  line("Zielgruppe", [b.audience ? b.audience + (b.region ? ", Schwerpunkt " + b.region : "") : ""]);
  line("Ziele", [(b.goals || []).join(", "), ...of("Ziele")]);
  line("Ton und Auftreten", [b.tone]);
  L.push("Rahmen: Der Gründer arbeitet allein, ohne Programmierkenntnisse, mit kleinem Budget (bitte prüfen).");
  line("Wichtige Entscheidungen", of("Entscheidung", 5));
  line("Meetups", of("Meetup"));
  line("Marketing und Instagram", [...of("Marketing", 2), ...of("Instagram", 2)]);
  line("Finanzen (nur, was die KI wissen darf)", of("Finanzen", 2));
  line("Nie empfehlen bzw. vermeiden", [b.avoid]);
  const gaps = GAPS.filter((c) => !mem.some((m) => m.cat === c));
  if (gaps.length) L.push("Noch offen (bitte ergänzen): " + gaps.join(", ") + ".");
  let txt = L.join("\n");
  if (txt.length > PROFILE_MAX) txt = txt.slice(0, PROFILE_MAX - 1).replace(/\s\S*$/, "") + "…";
  return txt;
}
/* Speichern/Freigeben/Zurücknehmen – nur durch Tippen des Gründers */
function profileSave(text, approve) {
  text = str(text, PROFILE_MAX).trim();
  let p = profileEntry();
  if (!p) {
    p = { id: uid(), kind: "profil", cat: KI_CAT, title: "Unternehmensprofil für die KI", text: "", status: "unknown", date: today(), reason: "", result: "", private: false, active: true, createdAt: Date.now() };
    S.memory.push(p);
  }
  const changed = p.text !== text;
  p.text = text;
  p.active = true;
  if (approve) Object.assign(p, { status: "confirmed", date: today(), reason: "vom Gründer geprüft und für die KI freigegeben" });
  else if (changed) Object.assign(p, { status: "unknown", reason: "Entwurf – noch nicht freigegeben" });
  touch(p);
  logAction("ki.profile", "gruender", true, approve ? "freigegeben" : "Entwurf gespeichert");
  return p;
}
function profileRevoke() {
  const p = profileEntry();
  if (!p) return;
  Object.assign(p, { status: "unknown", reason: "Freigabe zurückgenommen" });
  touch(p);
  logAction("ki.profile", "gruender", true, "Freigabe zurückgenommen");
}
function playbookSetApproved(on) {
  let e = playbookEntry();
  if (!e) {
    if (!on) return;
    e = { id: uid(), kind: "playbook-freigabe", pbVersion: PLAYBOOK.version, cat: KI_CAT, title: "Vivalink-Playbook (Version " + PLAYBOOK.version + ") für die KI", text: PLAYBOOK.note, status: "unknown", date: today(), reason: "", result: "", private: false, active: true, createdAt: Date.now() };
    S.memory.push(e);
  }
  Object.assign(e, on ? { status: "confirmed", date: today(), reason: "vom Gründer geprüft und freigegeben" } : { status: "unknown", reason: "Freigabe zurückgenommen" });
  touch(e);
  logAction("ki.playbook", "gruender", true, on ? "freigegeben" : "zurückgenommen");
}
/* Oberfläche (aus den KI-Einstellungen) */
function kiProfileSheet() {
  const p = profileEntry();
  const st = !p ? "Noch kein Profil" : p.status === "confirmed" ? "✅ Freigegeben – geht bei jeder Frage an die KI" : "📝 Entwurf – noch nicht freigegeben, die KI nutzt es nicht";
  const text = p ? p.text : "";
  const pbOk = playbookApproved();
  sheet(`<h1>So versteht dich die KI</h1>
<div class="card"><b>Unternehmensprofil</b><p class="mut" id="pfStatus">${esc(st)}</p><p class="mut">Kurz und konkret (höchstens ${PROFILE_MAX} Zeichen): Angebot, Zielgruppe, Ziele, Rahmen, wichtige Entscheidungen, was die KI nie empfehlen soll. Keine Namen oder Kontaktdaten. Vertrauliche Gedächtniseinträge werden nie übernommen.</p>
<textarea id="pf-text" maxlength="${PROFILE_MAX}" rows="10" placeholder="Noch leer – „Entwurf aus vorhandenen Daten“ tippen">${esc(text)}</textarea>
<div class="mut" id="pfLen">${text.length} / ${PROFILE_MAX} Zeichen</div>
<div class="row"><button data-a="kiPfDraft">Entwurf aus vorhandenen Daten</button><button data-a="kiPfSave">Als Entwurf speichern</button></div>
<div class="row"><button class="p" data-a="kiPfOk">Geprüft – freigeben</button>${p && p.status === "confirmed" ? '<button data-a="kiPfOff">Freigabe zurücknehmen</button>' : ""}</div></div>
<div class="card"><b>Vivalink-Playbook (Version ${PLAYBOOK.version})</b><p class="mut" id="pbStatus">${pbOk ? "✅ Freigegeben – die KI darf es bei Bedarf nachschlagen" : "📝 Entwurf – die KI nutzt es erst nach deiner Freigabe"}</p><p class="mut">${esc(PLAYBOOK.note)}</p>
<details id="pbText"><summary>Inhalt lesen</summary><div class="pb-txt">${PLAYBOOK.sections.map((s) => `<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>`).join("")}</div></details>
<div class="row">${pbOk ? '<button data-a="kiPbOff">Freigabe zurücknehmen</button>' : '<button class="p" data-a="kiPbOk">Geprüft – freigeben</button>'}</div></div>
<button data-a="close">Schließen</button>`);
}
async function kiProfileAction(a) {
  if (a === "kiProfil") return kiProfileSheet(), true;
  if (a === "kiPfDraft") {
    const t = profileDraft();
    $("#pf-text").value = t;
    $("#pfLen").textContent = t.length + " / " + PROFILE_MAX + " Zeichen";
    toast("Entwurf eingesetzt – bitte prüfen und ergänzen");
    return true;
  }
  if (a === "kiPfSave" || a === "kiPfOk") {
    const t = $("#pf-text").value;
    if (a === "kiPfOk" && !t.trim()) return toast("Das Profil ist leer"), true;
    profileSave(t, a === "kiPfOk");
    await save();
    toast(a === "kiPfOk" ? "Profil freigegeben" : "Entwurf gespeichert");
    return kiProfileSheet(), true;
  }
  if (a === "kiPfOff") return profileRevoke(), await save(), toast("Freigabe zurückgenommen"), kiProfileSheet(), true;
  if (a === "kiPbOk" || a === "kiPbOff") {
    playbookSetApproved(a === "kiPbOk");
    await save();
    toast(a === "kiPbOk" ? "Playbook freigegeben" : "Freigabe zurückgenommen");
    return kiProfileSheet(), true;
  }
  return false;
}
document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "pf-text" && $("#pfLen")) $("#pfLen").textContent = e.target.value.length + " / " + PROFILE_MAX + " Zeichen";
});
