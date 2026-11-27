/* KI-Assistent der Management AI – EIN Assistent für Chat und Sprachmodus.
   Werkzeuge greifen ausschließlich auf vorhandene Funktionen und Daten zu (Kennzahlen über valid()/cur()/cmp() = nur
   verifizierte Werte, Befunde findings(), Maßnahmen enrich(), Aufgaben, Gedächtnis, Meetup, Studio, Prüfungen).
   Jede Aussage trägt eine Herkunft: fakt (Fakt), test (Testdaten, getrennt), annahme (Annahme/Richtwert),
   empfehlung (Empfehlung), hinweis.
   Antwort-Motoren:
   - "lokal": regelbasiert auf dem Gerät, OHNE KI-Modell (kostenlos, offline). Versteht feste Anliegen, keine freie Unterhaltung.
   - "ki": Sprachmodell über die eigene Gegenstelle (Cloudflare Workers AI) – nur wenn bereitgestellt (window.VL_KI_URL) und vom
     Gründer freigegeben; Daten gehen nur in freigegebenen Bereichen an das Modell.
   Aufträge laufen über die bestehende Freigabelogik (POLICY/mayRun/act): Stufe 0/1 selbstständig (mit Rückgängig),
   Stufe 2 nur durch Tippen des Gründers (nie per Sprache), Stufe 3 nie. */

const AS_LABEL = { fakt: "Fakt", test: "Testdaten", annahme: "Annahme", empfehlung: "Empfehlung", hinweis: "Hinweis", ki: "KI-Antwort" };
const AS_ENG = { lokal: "Lokaler Assistent (ohne KI-Modell)", ki: "KI-Modell (Workers AI)" };
const weekBounds = (offset = 0) => {
  const d = new Date(today() + "T12:00");
  const mon = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 864e5 + offset * 7 * 864e5);
  const a = mon.toLocaleDateString("sv-SE");
  return [a, addDays(a, 6)];
};
const nf = (v, u) => num(Math.round(Number(v) * 100) / 100) + (u ? " " + u : "");
const kpiReal = () => typeof KPI_STATE !== "undefined" && KPI_STATE && KPI_STATE.meta && KPI_STATE.meta.excludesTestAccounts === true;

/* ---------- Werkzeuge (lesen nur; jedes liefert Blöcke {k, t} und eine Datenkategorie für Freigaben) ---------- */
const TOOLS = {
  kennzahlen: {
    cat: "kennzahlen",
    d: "Aktuelle Unternehmenskennzahlen mit Veränderung (nur verifizierte Werte) und getrennt ausgewiesene Testdaten",
    run() {
      const B = [];
      const used = S.metrics.filter((m) => cur(m));
      if (!used.length) B.push({ k: "hinweis", t: "Noch keine verwendbaren Kennzahlen. Werte aus der Verwaltung werden erst verwendet, wenn Testkonten gekennzeichnet sind; eigene Werte trägst du auf der Startseite ein." });
      for (const m of used) {
        const c = cur(m),
          w = cmp(m, 7),
          mo = cmp(m, 30);
        const src = c.src === "verwaltung" ? "Verwaltung, ohne Testkonten" : c.src === "manual" ? "eigene Eingabe" : c.src;
        const k = c.status === "confirmed" ? "fakt" : "annahme";
        B.push({ k, t: `${m.name}: ${nf(c.value, m.unit)} (Stand ${fmt(c.date)}, ${src}${c.status === "estimate" ? ", Einschätzung" : ""})${w ? " · 7 Tage: " + cs(w) : ""}${mo ? " · 30 Tage: " + cs(mo) : ""}${m.goal !== "" && m.goal != null ? " · Ziel " + nf(m.goal, m.unit) : ""}` });
      }
      const unv = S.metrics.filter((m) => !cur(m) && m.entries.some((e) => !e.deleted && !verified(e))).map((m) => m.name);
      if (unv.length) B.push({ k: "hinweis", t: "Nicht verwendet (möglicherweise mit Testkonten): " + unv.join(", ") + "." });
      const td = typeof KPI_STATE !== "undefined" && KPI_STATE && KPI_STATE.meta && KPI_STATE.meta.testData;
      if (td) B.push({ k: "test", t: `Getrennt, nicht in den Kennzahlen: ${num(td.accounts)} Testkonten, ${num(td.bookings)} Buchungen, ${num(td.invitations)} Einladungen, Zahlungen ${nf(td.payments, "€")}, Erstattungen ${nf(td.refunds, "€")}.` });
      return B;
    },
  },
  probleme: {
    cat: "kennzahlen",
    d: "Aktuelle Probleme und Risiken aus den Befunden der App (Fakten und Annahmen getrennt)",
    run() {
      const F = findings().slice(0, 6);
      if (!F.length) return [{ k: "fakt", t: "Die App erkennt derzeit keine offenen Probleme." }];
      return F.map((f) => ({ k: f.kind === "fakt" ? "fakt" : "annahme", t: f.title + (f.action ? " – " + f.action : "") }));
    },
  },
  massnahmen: {
    cat: "kennzahlen",
    d: "Empfohlene nächste Maßnahmen zu den wichtigsten Befunden (Empfehlungen, keine Entscheidungen)",
    run() {
      const F = findings().slice(0, 3);
      const B = [];
      for (const f of F) {
        const e = enrich(f);
        const m = e.measures.slice(0, 2).map((x) => x.t);
        if (m.length) B.push({ k: "empfehlung", t: `Zu „${f.title}“: ${m.join("; ")}` });
      }
      if (!B.length) B.push({ k: "hinweis", t: "Keine konkreten Maßnahmen ableitbar – es liegen keine offenen Befunde vor." });
      B.push({ k: "hinweis", t: "Geschäftliche Entscheidungen triffst du; ich bereite nur vor." });
      return B;
    },
  },
  aufgaben: {
    cat: "aufgaben",
    d: "Offene Aufgaben (überfällig, diese Woche, später)",
    run(a = {}) {
      const [mo, so] = weekBounds(a.woche === "naechste" ? 1 : 0),
        t = today();
      const open = orderTasks(S.tasks.filter((x) => !x.done && !x.deleted));
      if (!open.length) return [{ k: "fakt", t: "Keine offenen Aufgaben." }];
      const od = open.filter((x) => x.due && x.due < t),
        wk = open.filter((x) => x.due && x.due >= Math.max(t, mo) && x.due <= so),
        rest = open.length - od.length - wk.length;
      const L = (l, n = 6) => l.slice(0, n).map((x) => x.title + (x.due ? " (bis " + fmt(x.due) + ")" : "")).join("; ") + (l.length > n ? " … und " + (l.length - n) + " weitere" : "");
      const B = [{ k: "fakt", t: `${open.length} offene Aufgaben${od.length ? `, davon ${od.length} überfällig` : ""}.` }];
      // ohne Zeitraum: alle offenen Aufgaben (nach Wichtigkeit und Frist geordnet)
      if (a.woche !== "diese" && a.woche !== "naechste") return B.concat([{ k: "fakt", t: "Offen: " + L(open, 10) }]);
      if (od.length) B.push({ k: "fakt", t: "Überfällig: " + L(od) });
      if (wk.length) B.push({ k: "fakt", t: (a.woche === "naechste" ? "Nächste Woche fällig: " : "Diese Woche fällig: ") + L(wk) });
      if (rest > 0) B.push({ k: "fakt", t: rest + " weitere ohne Frist in diesem Zeitraum." });
      return B;
    },
  },
  meetup: {
    cat: "meetup",
    d: "Nächstes Meetup (Datum, Ort, Ziel) und Anmeldungen, soweit bekannt",
    run() {
      const u = S.meetup;
      if (!u || !u.date) return [{ k: "hinweis", t: "Kein kommendes Meetup eingetragen." }];
      const s = S.metrics.find((m) => m.key === "signups"),
        c = s && cur(s);
      return [{ k: "fakt", t: `Nächstes Meetup am ${fmt(u.date)}${u.place ? " in " + u.place : ""}${u.goal ? ", Ziel " + u.goal + " Teilnehmende" : ""}.` }].concat(c ? [{ k: c.status === "confirmed" ? "fakt" : "annahme", t: `Anmeldungen: ${nf(c.value)} (Stand ${fmt(c.date)}).` }] : []);
    },
  },
  instagram: {
    cat: "instagram",
    d: "Stand der Instagram-Planung (Entwürfe, freigegeben, geplant, offene Termine)",
    run() {
      const P = (S.studio ? S.studio.posts : []).filter((p) => !p.deleted);
      const by = (s) => P.filter((p) => p.status === s).length;
      const [mo, so] = weekBounds(1);
      const next = P.filter((p) => p.date >= mo && p.date <= so && p.status !== "abgelehnt");
      return [
        { k: "fakt", t: `Instagram: ${by("entwurf")} Entwürfe, ${by("freigegeben")} freigegeben, ${by("geplant") + by("veroeffentlicht")} geplant oder veröffentlicht.` },
        { k: "fakt", t: next.length ? `Nächste Woche: ${next.map((p) => fmt(p.date) + " „" + p.title + "“").join("; ")}.` : "Für nächste Woche ist noch nichts geplant." },
      ];
    },
  },
  technik: {
    cat: "technik",
    d: "Technischer Zustand: Fehlerprotokoll, Synchronisierung, Verwaltungsanbindung, reparierbare Datenfehler",
    async run() {
      const B = [];
      const errs = (typeof LOG !== "undefined" ? LOG : []).filter((e) => e.level === "error" && Date.now() - e.at < 7 * 864e5);
      B.push({ k: "fakt", t: errs.length ? `${errs.length} technische Fehler in den letzten 7 Tagen (zuletzt: ${errs[errs.length - 1].code}).` : "Keine technischen Fehler in den letzten 7 Tagen." });
      const kf = typeof kpiFinding === "function" ? kpiFinding() : null;
      B.push({ k: "fakt", t: kf ? kf.title : typeof KPI_STATE !== "undefined" && KPI_STATE ? "Verwaltungsanbindung: in Ordnung." : "Verwaltungsanbindung: nicht gekoppelt." });
      const sf = typeof syncFinding === "function" ? syncFinding() : null;
      B.push({ k: "fakt", t: sf ? sf.title : syncUrl() && (await kvGet("sync-config")) ? "Synchronisierung: in Ordnung." : "Synchronisierung: nicht eingerichtet." });
      const R = findRepairs(S);
      B.push({ k: "fakt", t: R.length ? `${R.length} eindeutige Datenfehler gefunden (reparierbar mit Rückgängig-Punkt).` : "Keine reparierbaren Datenfehler." });
      B.push({ k: "fakt", t: navigator.onLine === false ? "Gerät ist offline – Anbindungen pausieren." : "Gerät ist online." });
      return B;
    },
  },
  gedaechtnis: {
    cat: "gedaechtnis",
    d: "Gespeichertes Wissen und Entscheidungen zu einem Stichwort (nur bestätigte, aktive Einträge)",
    run(a = {}) {
      const q = String(a.stichwort || "").toLowerCase().split(/[^0-9a-zäöüß]+/).filter((w) => w.length > 3 && !["über", "dazu", "weißt", "eigentlich"].includes(w));
      // Vertrauliche Einträge erscheinen nie im Chat und gehen nie an ein KI-Modell
      const all = S.memory.filter((m) => m.active && !m.deleted);
      const match = (m) => !q.length || q.some((w) => (m.title + " " + m.text + " " + m.cat).toLowerCase().includes(w));
      const hit = all.filter((m) => !m.private && match(m)).slice(0, 5),
        priv = all.filter((m) => m.private && match(m)).length;
      const pv = priv ? [{ k: "hinweis", t: priv + " vertraulicher Eintrag passt ebenfalls – wird im Chat nicht angezeigt." }] : [];
      if (!hit.length) return [{ k: "hinweis", t: "Dazu ist im Gedächtnis nichts gespeichert." }, ...pv];
      return pv.length ? [...hit.map((m) => ({ k: m.status === "confirmed" ? "fakt" : "annahme", t: `${m.cat}: ${m.title}${m.text ? " – " + m.text.slice(0, 160) : ""}${m.status === "confirmed" ? "" : " (nicht bestätigt)"}` })), ...pv] : hit.map((m) => ({ k: m.status === "confirmed" ? "fakt" : "annahme", t: `${m.cat}: ${m.title}${m.text ? " – " + m.text.slice(0, 160) : ""}${m.status === "confirmed" ? "" : " (nicht bestätigt)"}` }));
    },
  },
};

/* ---------- Aufträge (über die bestehende Freigabelogik) ---------- */
const ACT_DEF = {
  "task.add": { policy: "chat.task.add", t: (a) => `Aufgabe anlegen: „${a.title}“${a.due ? " bis " + fmt(a.due) : ""}` },
  "task.done": { policy: "chat.task.done", t: (a) => `Aufgabe erledigt: „${a.title}“` },
  drafts: { policy: "chat.drafts", t: (a) => `${a.n} Instagram-Entwürfe für ${a.label} vorbereiten` },
  repair: { policy: "repair.auto", t: () => "Eindeutige Datenfehler reparieren (mit Rückgängig-Punkt)" },
  "memory.add": { policy: "chat.memory", t: (a) => `Ins Gedächtnis übernehmen: „${a.title}“` },
  "task.delete": { policy: "chat.task.delete", t: (a) => `Aufgabe löschen: „${a.title}“` },
};
/* Führt einen Auftrag aus. by: "auto" (vom Assistenten) | "gruender" (Tippen auf dem Bildschirm). Nie per Sprache freigeben. */
async function runAction(x, by) {
  const D = ACT_DEF[x.type];
  if (!D) return { ok: false, error: "Unbekannter Auftrag" };
  return act(D.policy, by, async () => {
    const a = x.args;
    if (x.type === "task.add") {
      const t = { id: uid(), title: str(a.title, 300), prio: PR[a.prio] != null ? a.prio : "mittel", area: "Chat", due: a.due || "", done: false, src: "chat" };
      touch(t);
      S.tasks.push(t);
      x.undo = { task: t.id };
      return { ok: true, detail: "Aufgabe angelegt" };
    }
    if (x.type === "task.done" || x.type === "task.delete") {
      const t = S.tasks.find((y) => y.id === a.id && !y.deleted);
      if (!t) return { ok: false, error: "Aufgabe nicht gefunden" };
      x.undo = { task: t.id, done: t.done };
      t.done = true;
      if (x.type === "task.delete") t.deleted = true;
      else t.doneAt = Date.now();
      touch(t);
      return { ok: true, detail: x.type === "task.done" ? "Aufgabe erledigt" : "Aufgabe gelöscht" };
    }
    if (x.type === "drafts") {
      const made = [];
      for (const s of a.slots) {
        const p = makePost({ ...s, title: s.angle || "Beitrag" }, "chat");
        S.studio.posts.push(p);
        made.push(p.id);
      }
      x.undo = { posts: made };
      return { ok: true, detail: made.length + " Entwürfe" };
    }
    if (x.type === "repair") {
      const r = await autoRepair(S);
      return r.ok ? { ok: true, detail: r.n + " Datenfehler behoben" } : r;
    }
    if (x.type === "memory.add") {
      const n = { id: uid(), cat: CATS.includes(a.cat) ? a.cat : "Entscheidung", title: str(a.title, 200), text: str(a.text, 2000), status: "confirmed", date: today(), reason: "aus dem KI-Chat übernommen (bestätigt durch Tippen)", result: "", private: false, active: true, createdAt: Date.now() };
      touch(n);
      S.memory.push(n);
      x.undo = { memory: n.id };
      return { ok: true, detail: "Gedächtniseintrag" };
    }
    return { ok: false, error: "nicht unterstützt" };
  });
}
/* Rückgängig für Chat-Aufträge (gezielt, ohne andere Änderungen zurückzusetzen) */
function undoAction(x) {
  const u = x.undo || {};
  if (u.task) {
    const t = S.tasks.find((y) => y.id === u.task);
    if (t) x.type === "task.add" ? (t.deleted = true, t.done = true) : ((t.done = !!u.done), (t.deleted = false));
    if (t) touch(t);
  }
  for (const id of u.posts || []) {
    const p = S.studio.posts.find((y) => y.id === id);
    if (p) (p.deleted = true), touch(p);
  }
  if (u.memory) {
    const m = S.memory.find((y) => y.id === u.memory);
    if (m) (m.active = false), (m.deleted = true), touch(m);
  }
  return !!(u.task || (u.posts && u.posts.length) || u.memory);
}
/* Riskante Anliegen: nie ausführen, verständlich ablehnen (Stufe 3) oder auf den Bildschirm verweisen (Stufe 2) */
const RISKY = [
  [/veröffentlich|jetzt posten|poste .*(jetzt|sofort)|online stellen/i, "post.publish", "Veröffentlichen geht nur über die Freigabe im Studio (Stufe 2) – nicht über den Chat oder per Sprache."],
  [/zahlung|überweis|erstatt(e|ung (auslös|veranlass))|rückzahl|bezahl/i, "payment.trigger", "Zahlungen oder Erstattungen löst die App nie aus (Stufe 3)."],
  [/preis(e)? (änder|setz|erhöh|senk)/i, "price.change", "Preise legst du fest – die App ändert sie nie (Stufe 3)."],
  [/(supabase|datenbank|rork|webseite|website).*(änder|lösch|bearbeit)|(änder|lösch).*(supabase|datenbank|rork)/i, "prod.write", "Produktive Systeme (Verwaltung, Datenbank, Rork, Webseite) verändert die App nie (Stufe 3)."],
  [/werbung (starten|schalten)|anzeige(n)? schalten|ads/i, "ads.paid", "Bezahlte Werbung startet die App nie (Stufe 3)."],
];

/* ---------- Lokaler Assistent (ohne KI-Modell) ---------- */
const INTENTS = [
  ["hilfe", /was kannst du|hilfe|wie funktionierst du|welche befehle/i],
  ["merken", /^(bitte )?(merk(e)? dir|speicher(e)? (dir|im gedächtnis)|notier(e)? dir)\b/i],
  ["aufgabeNeu", /(leg(e)?|erstell(e)?|notier(e)?|füg(e)?)( mir)? (eine |die )?(neue )?aufgabe|aufgabe (anlegen|erstellen)|erinnere mich (daran )?,? ?(dass|an)/i],
  ["aufgabeErledigt", /(ist|als) erledigt|hake? .* ab\b|erledigt markieren/i],
  ["instaNeu", /(instagram|beitr[äa]g|posts?\b|reels?|stor(y|ies)).*(vorbereit|\bvor\b|erstell|entw(irf|erf)|plan(e|en)|schreib)|(vorbereit|bereite?\b|erstell|entw(irf|erf)|plan(e|en)).*(instagram|beitr[äa]g|posts?\b)/i],
  ["technik", /techni|fehler|diagnos|kaputt|funktioniert (alles|die app)|prüf(e|ung) .*(app|system)|synchronisier/i],
  ["lage", /guten (morgen|tag|abend)|wie (läuft|geht es|entwickelt sich|steht)|überblick|lage|was hat sich (geändert|verändert)|zusammenfassung des tages|status von vivalink/i],
  ["kennzahlen", /kennzahl|zahlen|analys|registrier|nutzer|anmeldung|einladung|zahlungen|umsatz|einnahmen|entwicklung/i],
  ["probleme", /problem|risik|schwierig|baustelle|läuft (schlecht|nicht)|engp/i],
  ["plan", /plan.*(nutzer|wachs|gewinn|mehr)|mehr nutzer|wachstum|neue nutzer gewinnen|strategie/i],
  ["massnahmen", /maßnahm|massnahm|empfiehl|empfehl|was (sollten|sollen|würdest|könnten) (wir|du|ich)|nächste(n)? schritt|als nächstes/i],
  ["aufgaben", /aufgabe|to-?do|offen|erledigen|diese woche|nächste woche/i],
  ["meetup", /meetup|treffen|veranstaltung/i],
  ["instagram", /instagram|beitr[äa]g|posting|redaktionsplan/i],
  ["gedaechtnis", /was weißt du|erinnerst du|gedächtnis|was haben wir (entschieden|beschlossen)|entscheidung/i],
  ["mehr", /^(warum|wieso|mehr dazu|genauer|details|erklär(e)? (das|mir das)|und weiter|noch etwas)\b/i],
];
function detectIntents(text) {
  const out = [];
  for (const [k, re] of INTENTS) if (re.test(text) && !out.includes(k)) out.push(k);
  // Aufträge haben Vorrang: Wörter im Auftragstext (z. B. „Meetup“ im Aufgabentitel) lösen keine weiteren Themen aus
  for (const k of ["merken", "aufgabeNeu", "aufgabeErledigt", "instaNeu"]) if (out.includes(k)) return [k];
  if (out.includes("instaNeu")) return out.filter((k) => k !== "instagram");
  if (out.includes("lage")) return ["lage", ...out.filter((k) => ["probleme", "massnahmen"].includes(k))];
  if (out.includes("technik")) return out.filter((k) => k !== "probleme"); // „technische Probleme“ ≠ geschäftliche Probleme
  return out;
}
const dueFrom = (text) => {
  const t = today();
  if (/übermorgen/i.test(text)) return addDays(t, 2);
  if (/morgen/i.test(text)) return addDays(t, 1);
  if (/heute/i.test(text)) return t;
  if (/nächste woche/i.test(text)) return weekBounds(1)[0];
  if (/ende der woche|diese woche|bis freitag/i.test(text)) return addDays(weekBounds(0)[0], 4);
  const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : t.slice(0, 4);
    const d = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (DATE_RE.test(d)) return d;
  }
  return "";
};
const stripCmd = (text, re) => text.replace(re, "").replace(/^[\s:,–-]+|[\s.!?]+$/g, "").replace(/\b(bis|für) (heute|morgen|übermorgen|nächste woche|ende der woche|diese woche|freitag|\d{1,2}\.\d{1,2}\.(\d{2,4})?)\b/gi, "").trim();

async function localAnswer(chat, text) {
  const blocks = [],
    actions = [];
  // „Merke dir …“ speichert nur eine Information (mit Bestätigung) und führt nichts aus → keine Ablehnung als Auftrag
  const isMemo = INTENTS.find((x) => x[0] === "merken")[1].test(text);
  for (const [re, pol, why] of isMemo ? [] : RISKY)
    if (re.test(text)) {
      logAction(pol, "chat", false, "abgelehnt im Chat");
      return { blocks: [{ k: "hinweis", t: why + " Ich habe nichts ausgeführt." }], actions, topic: chat.topic || null };
    }
  let I = detectIntents(text);
  if (!I.length) {
    return {
      blocks: [
        { k: "hinweis", t: "Das kann ich im lokalen Modus nicht beantworten. Ich bin hier kein Sprachmodell, sondern nutze feste Funktionen der App." },
        { k: "hinweis", t: "Frag mich z. B.: „Wie läuft Vivalink?“, „Was sind die größten Probleme?“, „Welche Aufgaben sind diese Woche offen?“, „Bereite drei Instagram-Beiträge für nächste Woche vor“, „Gibt es technische Probleme?“ – oder nutze unter „Aufträge“ ChatGPT/Claude." },
      ],
      actions,
      topic: chat.topic || null,
    };
  }
  if (I[0] === "mehr") I = chat.topic ? [chat.topic] : ["hilfe"];
  const head = (t) => blocks.push({ k: "h", t });
  for (const k of I.slice(0, 3)) {
    if (k === "hilfe") {
      head("Was ich kann");
      blocks.push({ k: "hinweis", t: "Lagebericht, Kennzahlen (nur echte, verifizierte Werte; Testdaten getrennt), Probleme, Maßnahmen, Wachstumsplan, offene Aufgaben, Aufgabe anlegen oder abhaken, nächstes Meetup, Instagram-Planung und Entwürfe, technische Prüfung mit Reparatur, Gedächtnis durchsuchen, Wichtiges ins Gedächtnis übernehmen (nur nach deiner Bestätigung)." });
      blocks.push({ k: "hinweis", t: "Freie Unterhaltungen wie mit ChatGPT sind im lokalen Modus nicht möglich – dafür braucht es ein KI-Modell (siehe KI-Einstellungen)." });
    } else if (k === "lage") {
      head("Lage von Vivalink");
      blocks.push(...TOOLS.kennzahlen.run().slice(0, 6));
      head("Probleme");
      blocks.push(...TOOLS.probleme.run().slice(0, 3));
      head("Als Nächstes");
      blocks.push(...TOOLS.massnahmen.run().slice(0, 3));
      const a = TOOLS.aufgaben.run();
      blocks.push(a[0]);
      blocks.push(...TOOLS.meetup.run().slice(0, 1));
      I = ["lage"];
      break;
    } else if (k === "kennzahlen") {
      head("Kennzahlen");
      blocks.push(...TOOLS.kennzahlen.run());
    } else if (k === "probleme") {
      head("Größte Probleme");
      blocks.push(...TOOLS.probleme.run());
    } else if (k === "massnahmen") {
      head("Empfohlene Maßnahmen");
      blocks.push(...TOOLS.massnahmen.run());
    } else if (k === "plan") {
      head("Plan: mehr Nutzer gewinnen (Entwurf)");
      blocks.push({ k: "annahme", t: "Grundlage: deine Kennzahlen und die Befunde der App. Schwellen und Wirkungen sind Annahmen." });
      blocks.push(...TOOLS.kennzahlen.run().filter((b) => /Registrier|Aktive|Einladung|Annahme/.test(b.t)).slice(0, 4));
      blocks.push(...TOOLS.massnahmen.run().filter((b) => b.k === "empfehlung"));
      blocks.push({ k: "empfehlung", t: "1) Einladungen und Annahmequote verbessern (Erinnerungen, klarer Nutzen im Einladungstext). 2) Instagram regelmäßig mit Meetup-Rückblicken und Ankündigungen bespielen. 3) Nach jedem Meetup Teilnehmende um Weiterempfehlung bitten. 4) Wirkung jeder Maßnahme nach 2–4 Wochen an den Kennzahlen prüfen." });
      blocks.push({ k: "hinweis", t: "Für einen ausführlichen Plan mit Begründungen: unter „Aufträge“ einen Auftrag für ChatGPT/Claude erzeugen." });
    } else if (k === "aufgaben") {
      head("Offene Aufgaben");
      blocks.push(...TOOLS.aufgaben.run({ woche: /nächste woche/i.test(text) ? "naechste" : /diese woche|bis (ende|freitag|sonntag)/i.test(text) ? "diese" : "alle" }));
    } else if (k === "meetup") {
      head("Meetup");
      blocks.push(...TOOLS.meetup.run());
    } else if (k === "instagram") {
      head("Instagram");
      blocks.push(...TOOLS.instagram.run());
    } else if (k === "gedaechtnis") {
      head("Aus dem Gedächtnis");
      blocks.push(...TOOLS.gedaechtnis.run({ stichwort: text.replace(/was weißt du (über|zu)?|erinnerst du dich (an)?|gedächtnis/gi, "") }));
    } else if (k === "technik") {
      head("Technische Prüfung");
      blocks.push(...(await TOOLS.technik.run()));
      if (findRepairs(S).length) actions.push({ type: "repair", args: {} });
    } else if (k === "aufgabeNeu") {
      const title = stripCmd(text, /^.*?(aufgabe( an(legen)?\b| erstellen)?|erinnere mich( daran)?,?( dass| an)?)\s*[:,]?\s*/i);
      if (title.length < 3) blocks.push({ k: "hinweis", t: "Wie soll die Aufgabe heißen? Zum Beispiel: „Lege eine Aufgabe an: Fotos vom Meetup sortieren bis Freitag“." });
      else actions.push({ type: "task.add", args: { title: title.charAt(0).toUpperCase() + title.slice(1), due: dueFrom(text) } });
    } else if (k === "aufgabeErledigt") {
      const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !/erledigt|aufgabe|markieren|bitte/.test(w));
      const open = S.tasks.filter((x) => !x.done && !x.deleted);
      const scored = open.map((x) => [x, words.filter((w) => x.title.toLowerCase().includes(w)).length]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
      if (scored.length === 1 || (scored.length > 1 && scored[0][1] > scored[1][1])) actions.push({ type: "task.done", args: { id: scored[0][0].id, title: scored[0][0].title } });
      else blocks.push({ k: "hinweis", t: scored.length ? "Mehrere Aufgaben passen – bitte genauer: " + scored.slice(0, 3).map((x) => "„" + x[0].title + "“").join(", ") : "Keine passende offene Aufgabe gefunden." });
    } else if (k === "instaNeu") {
      const n = Math.max(1, Math.min(7, Number((text.match(/\b(\d|ein|zwei|drei|vier|fünf|sechs|sieben)\b/i) || [])[1] ? wordNum((text.match(/\b(\d|ein|zwei|drei|vier|fünf|sechs|sieben)\b/i) || [])[1]) : 3)));
      const [mo, so] = weekBounds(/diese woche/i.test(text) ? 0 : 1);
      const ym = mo.slice(0, 7);
      const slots = planSlots(ym).concat(so.slice(0, 7) !== ym ? planSlots(so.slice(0, 7)) : []).filter((s) => s.date >= mo && s.date <= so && s.date >= today()).slice(0, n);
      if (!slots.length) blocks.push({ k: "hinweis", t: "Für diesen Zeitraum gibt es keine freien Termine im Instagram-Rhythmus (Studio › Einstellungen)." });
      else actions.push({ type: "drafts", args: { n: slots.length, slots, label: fmt(mo) + "–" + fmt(so) } });
      if (slots.length && slots.length < n) blocks.push({ k: "hinweis", t: `Nur ${slots.length} freie Termine im Rhythmus – ich lege nicht mehr an als geplant.` });
      if (slots.length) blocks.push({ k: "hinweis", t: "Texte schreibe ich im lokalen Modus nicht. Im Studio kannst du sie ergänzen oder unter „Aufträge“ von ChatGPT/Claude schreiben lassen; jeder Entwurf durchläuft die Faktenprüfung." });
    } else if (k === "merken") {
      const t = stripCmd(text, /^(bitte )?(merk(e)? dir|speicher(e)? (dir|im gedächtnis)|notier(e)? dir)\s*[:,]?\s*(dass\s*)?/i);
      if (t.length < 3) blocks.push({ k: "hinweis", t: "Was soll ich mir merken?" });
      else actions.push({ type: "memory.add", args: { title: t.charAt(0).toUpperCase() + t.slice(0, 199).slice(1), text: "", cat: "Entscheidung" } });
    }
  }
  const topic = I.find((k) => TOOLS[k] || ["lage", "plan"].includes(k)) || chat.topic || null;
  return { blocks, actions, topic };
}
const wordNum = (w) => ({ ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7 })[String(w).toLowerCase()] || Number(w) || 3;

/* ---------- KI-Modell über die eigene Gegenstelle (nur wenn bereitgestellt und freigegeben) ---------- */
const kiUrl = () => window.VL_KI_URL || "";
const KI_CATS = { kennzahlen: "Kennzahlen und Befunde", aufgaben: "Aufgaben", meetup: "Meetup", instagram: "Instagram-Planung", gedaechtnis: "Gedächtnis (ohne private Einträge)", technik: "Technischer Zustand" };
async function kiCfg() {
  return { on: false, freigaben: {}, ...((await kvGet("ki-config")) || {}) };
}
async function kiReady() {
  const c = await kiCfg();
  const sc = await kvGet("sync-config");
  return !!(kiUrl() && c.on && sc && sc.vid && sc.token && navigator.onLine !== false);
}
const KI_SYSTEM = `Du bist der persönliche Management-Assistent von Vivalink (Meetups für Menschen, die neue Kontakte suchen). Antworte auf Deutsch, klar und knapp.
Regeln: Nutze für Unternehmensdaten ausschließlich die Werkzeuge. Erfinde keine Zahlen, Fakten oder Erinnerungen. Kennzeichne Aussagen als Fakt (aus Werkzeugen), Testdaten (getrennt, nie als echte Kennzahl), Annahme oder Empfehlung.
Geschäftliche Entscheidungen trifft der Gründer. Veröffentlichungen, Zahlungen, Preise, Löschungen und Änderungen an produktiven Systemen führst du nie aus; Aufträge schlägst du über die Auftrags-Werkzeuge vor – die App prüft sie und fragt bei Bedarf nach Freigabe.
Wenn ein Werkzeug „nicht freigegeben“ meldet, sage das und arbeite ohne diese Daten.`;
function kiToolSpecs() {
  const spec = Object.entries(TOOLS).map(([name, t]) => ({ type: "function", function: { name, description: t.d, parameters: { type: "object", properties: name === "aufgaben" ? { woche: { type: "string", enum: ["alle", "diese", "naechste"] } } : name === "gedaechtnis" ? { stichwort: { type: "string" } } : {} } } }));
  spec.push({ type: "function", function: { name: "aufgabe_anlegen", description: "Schlägt vor, eine Aufgabe anzulegen (die App führt es mit Rückgängig aus)", parameters: { type: "object", properties: { titel: { type: "string" }, frist: { type: "string", description: "JJJJ-MM-TT oder leer" } }, required: ["titel"] } } });
  spec.push({ type: "function", function: { name: "merken_vorschlagen", description: "Schlägt vor, eine wichtige Information ins Gedächtnis zu übernehmen (nur mit Bestätigung des Gründers)", parameters: { type: "object", properties: { titel: { type: "string" } }, required: ["titel"] } } });
  return spec;
}
/* Erreichbarkeit der Gegenstelle (ohne Zugang, ohne Daten, ohne KI-Aufruf) */
async function kiStatus() {
  if (!kiUrl() || navigator.onLine === false) return { ok: false, why: "offline oder nicht eingerichtet" };
  try {
    const r = await fetch(kiUrl().replace(/\/$/, "") + "/v1/ki/status", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.service === "vivalink-ki" ? { ok: true } : { ok: false, why: "nicht bereitgestellt (" + r.status + ")" };
  } catch {
    return { ok: false, why: "nicht erreichbar – der Worker ist noch nicht bereitgestellt" };
  }
}
/* Zeitgrenzen: jede Anfrage höchstens KI_T.call, eine ganze Antwort (bis zu drei Schritte) höchstens KI_T.total –
   danach antwortet der lokale Assistent, und die App bleibt bedienbar. */
const KI_T = { call: 45000, total: 60000 };
async function kiCall(path, body, ms = KI_T.call) {
  const sc = await kvGet("sync-config");
  const ac = typeof AbortController === "function" ? new AbortController() : null;
  let timedOut = false;
  const tm = setTimeout(() => ((timedOut = true), ac && ac.abort()), Math.max(1000, ms));
  try {
    const r = await fetchOrTimeout(kiUrl().replace(/\/$/, "") + path, { method: "POST", cache: "no-store", headers: { authorization: "Bearer " + sc.token, "content-type": "application/json" }, body: JSON.stringify({ vault: sc.vid, ...body }), signal: ac && ac.signal }, () => timedOut);
    const j = await r.json().catch(() => ({}));
    if (!r.ok)
      throw Object.assign(
        new Error(
          r.status === 429 && j.error === "limit"
            ? "Zu viele KI-Anfragen in dieser Stunde – bitte später erneut"
            : r.status === 429
              ? "Tageskontingent der kostenlosen KI erreicht – ab 1 Uhr wieder verfügbar"
              : r.status === 401
                ? "KI-Zugang nicht gültig (Synchronisierung neu einrichten)"
                : r.status === 503
                  ? "KI-Dienst meldet einen Fehler" + (j.code ? " (" + j.code + ")" : "")
                  : "KI nicht erreichbar (" + r.status + ")",
        ),
        { status: r.status },
      );
    return j;
  } catch (e) {
    if (timedOut || (e && e.name === "AbortError")) throw Object.assign(new Error("Zeitüberschreitung – KI hat nicht rechtzeitig geantwortet"), { timeout: true });
    throw e;
  } finally {
    clearTimeout(tm);
  }
}
/* fetch mit Zeitgrenze, auch wenn ein Browser das Abbrechen nicht unterstützt */
function fetchOrTimeout(url, opt, isTimedOut) {
  return new Promise((ok, no) => {
    const iv = setInterval(() => isTimedOut() && (clearInterval(iv), no(Object.assign(new Error("timeout"), { name: "AbortError" }))), 250);
    fetch(url, opt).then(
      (r) => (clearInterval(iv), ok(r)),
      (e) => (clearInterval(iv), no(e)),
    );
  });
}
async function kiAnswer(chat, text, history) {
  const cfg = await kiCfg();
  const msgs = [{ role: "system", content: KI_SYSTEM + "\nHeute ist " + fmt(today()) + "." }];
  // Datensparsam: Antworten des lokalen Assistenten enthalten App-Daten (Kennzahlen, Gedächtnis …) und gehen NICHT an das
  // Modell – nur deine Fragen und frühere KI-Antworten. Aus der Kurzfassung nur die Fragen und ausgeführten Aufträge.
  if (chat.summary) {
    const q = chat.summary.split("\n").filter((l) => /^(Frage\/Auftrag|Ausgeführt)/.test(l));
    if (q.length) msgs.push({ role: "system", content: "Frühere Fragen in diesem Chat: " + q.join("; ").slice(0, 3000) });
  }
  for (const m of history.slice(-16)) msgs.push({ role: m.role === "user" ? "user" : "assistant", content: m.role === "user" || m.engine === "ki" ? m.text.slice(0, 4000) : "(Antwort des lokalen Assistenten mit App-Daten – nicht übermittelt)" });
  msgs.push({ role: "user", content: text.slice(0, 4000) });
  const used = new Set(),
    actions = [];
  // Werkzeugergebnisse gehen als gewöhnliche Nachrichten an das Modell (Form, die jedes Modell von Workers AI annimmt);
  // der letzte Schritt läuft ohne Werkzeuge, damit das Modell sicher eine Antwort formuliert.
  const ROUNDS = 3,
    until = Date.now() + KI_T.total;
  for (let round = 0; round < ROUNDS; round++) {
    const last = round === ROUNDS - 1;
    const left = until - Date.now();
    if (left < 1500) throw Object.assign(new Error("Zeitüberschreitung – KI hat nicht rechtzeitig geantwortet"), { timeout: true });
    const j = await kiCall("/v1/ki/chat", { messages: msgs, ...(last ? {} : { tools: kiToolSpecs() }) }, Math.min(KI_T.call, left));
    const calls = last || !Array.isArray(j.tool_calls) ? [] : j.tool_calls.slice(0, 6);
    if (!calls.length) {
      const t = String(j.text || "").trim();
      return { blocks: [{ k: "ki", t: t.slice(0, 8000) || "(Die KI hat keine Antwort geliefert – bitte die Frage anders stellen.)" }], actions, topic: chat.topic || null, used: [...used] };
    }
    msgs.push({ role: "assistant", content: "(Ich rufe Werkzeuge auf: " + calls.map((c) => String(c.name || "")).join(", ") + ")" });
    const results = [];
    for (const c of calls) {
      const name = String(c.name || ""),
        args = c.arguments && typeof c.arguments === "object" ? c.arguments : {};
      let out;
      if (TOOLS[name]) {
        if (!cfg.freigaben[TOOLS[name].cat]) out = "nicht freigegeben: " + (KI_CATS[TOOLS[name].cat] || name);
        else {
          used.add(TOOLS[name].cat);
          const B = await TOOLS[name].run(args);
          out = B.map((b) => "[" + (AS_LABEL[b.k] || b.k) + "] " + b.t).join("\n");
        }
      } else if (name === "aufgabe_anlegen") {
        actions.push({ type: "task.add", args: { title: str(args.titel, 300), due: DATE_RE.test(args.frist || "") ? args.frist : "" } });
        out = "Vorgeschlagen – die App legt die Aufgabe mit Rückgängig an.";
      } else if (name === "merken_vorschlagen") {
        actions.push({ type: "memory.add", args: { title: str(args.titel, 200), text: "", cat: "Entscheidung" } });
        out = "Vorgeschlagen – wird erst nach Bestätigung durch den Gründer gespeichert.";
      } else out = "unbekanntes Werkzeug";
      results.push("### " + name + "\n" + out.slice(0, 4000));
    }
    msgs.push({ role: "user", content: "Ergebnisse der Werkzeuge (Daten der App, nicht von mir geschrieben):\n" + results.join("\n\n") + "\n\nBeantworte jetzt meine ursprüngliche Frage auf Deutsch. Kennzeichne Fakten, Testdaten, Annahmen und Empfehlungen. Erfinde nichts." });
  }
  return { blocks: [{ k: "hinweis", t: "Die KI hat zu viele Zwischenschritte gebraucht – bitte die Frage vereinfachen." }], actions, topic: chat.topic || null, used: [...used] };
}

/* ---------- Gemeinsamer Einstieg für Chat UND Sprachmodus ---------- */
async function assistantAnswer(chat, text, history) {
  // Riskante Anliegen werden für JEDEN Motor vorab abgelehnt (lokal und KI) – kein Modell entscheidet darüber
  const isMemo = INTENTS.find((x) => x[0] === "merken")[1].test(text);
  if (!isMemo && RISKY.some(([re]) => re.test(text))) return { ...(await localAnswer(chat, text)), engine: "lokal" };
  if (await kiReady()) {
    try {
      const r = await kiAnswer(chat, text, history);
      return { ...r, engine: "ki" };
    } catch (e) {
      logEvent("warn", "ki.answer", e.message);
      const r = await localAnswer(chat, text);
      r.blocks.unshift({ k: "hinweis", t: "KI nicht verfügbar (" + e.message + ") – Antwort vom lokalen Assistenten." });
      return { ...r, engine: "lokal" };
    }
  }
  return { ...(await localAnswer(chat, text)), engine: "lokal" };
}
/* Klartext (für Sprachausgabe und Kopieren) */
function blocksText(blocks) {
  return blocks.map((b) => (b.k === "h" ? b.t + ":" : b.k === "ki" ? b.t : (AS_LABEL[b.k] ? AS_LABEL[b.k] + ": " : "") + b.t)).join("\n");
}
function speechText(blocks) {
  return blocks
    .filter((b) => b.k !== "h")
    .map((b) => (b.k === "test" ? "Getrennt als Testdaten: " : b.k === "annahme" ? "Annahme: " : b.k === "empfehlung" ? "Empfehlung: " : "") + b.t)
    .join(" ")
    .replace(/[„“"*#_]/g, "")
    .replace(/€/g, " Euro")
    .replace(/\s·\s/g, ", ")
    .slice(0, 2500);
}
