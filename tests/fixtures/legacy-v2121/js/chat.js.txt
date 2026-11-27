/* KI-Chat: gemeinsamer Gesprächsverlauf für Schreiben und Sprechen (js/voice.js nutzt dieselben Funktionen).
   Daten im bestehenden Zustand S (keine neue Datenbank):
     S.chats    [{id, title, createdAt, updatedAt, deleted?, summary?, summaryAt?, topic?}]
     S.chatMsgs [{id, chat, role: "user"|"assistant", text, at, via: "text"|"voice", engine?, blocks?, actions?, updatedAt}]
   Nachrichten sind einzelne Einträge → Zusammenführen beim Synchronisieren ohne Konflikte (nur Hinzufügen).
   Synchronisiert werden je Chat höchstens die neuesten CHAT_SYNC_PER_CHAT Nachrichten und insgesamt höchstens
   CHAT_SYNC_BYTES Text; Älteres bleibt auf dem Gerät (nichts wird gelöscht), die Zusammenfassung wird synchronisiert.
   Nichts aus dem Chat wird automatisch zur dauerhaften Erinnerung – nur nach Bestätigung durch Tippen. */
const CHAT_SYNC_PER_CHAT = 80,
  CHAT_SYNC_BYTES = 1500000,
  CHAT_TEXT_MAX = 20000,
  CHAT_SUM_AFTER = 40;
let KI_STAT = null; // Ergebnis von „Verbindung prüfen“ (nur auf Tippen – keine automatische Anfrage)
let KI_ON = false; // Anzeige: KI-Modell eingeschaltet (aus ki-config, beim Start und nach dem Speichern geladen)
kvGet("ki-config").then((c) => (KI_ON = !!(c && c.on && kiUrl()))).catch(() => {});
let chatOpen = null,
  kiTab = "chat",
  chatBusy = false,
  chatDraft = "",
  chatLastSend = null;
const CHAT_ACT_AT = {}; // Zeitpunkt der Ausführung je Auftrag (nur im Speicher, gegen Doppeltippen)

const chatList = (T = S) => (T.chats || []).filter((c) => !c.deleted).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
const chatById = (id, T = S) => (T.chats || []).find((c) => c.id === id && !c.deleted) || null;
const chatMsgs = (id, T = S) => (T.chatMsgs || []).filter((m) => m.chat === id && !m.deleted).sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)));

function newChat(title = "") {
  const c = { id: uid(), title: str(title, 80) || "Neuer Chat", createdAt: Date.now(), auto: !title };
  touch(c);
  S.chats.push(c);
  return c;
}
function chatTitleFrom(text) {
  const t = text.replace(/\s+/g, " ").trim();
  return (t.length > 42 ? t.slice(0, 40).replace(/\s\S*$/, "") + " …" : t) || "Neuer Chat";
}
function addMsg(chat, o) {
  // streng steigende Zeit je Chat: Frage und sofortige Antwort im selben Millisekunden-Takt bleiben in der richtigen Reihenfolge
  const lastAt = (S.chatMsgs || []).reduce((mx, x) => (x.chat === chat.id && x.at > mx ? x.at : mx), 0);
  const m = { id: uid(), chat: chat.id, role: o.role, text: str(o.text, CHAT_TEXT_MAX), at: Math.max(Date.now(), lastAt + 1), via: o.via === "voice" ? "voice" : "text" };
  if (o.engine) m.engine = o.engine;
  if (o.blocks) m.blocks = o.blocks.slice(0, 60).map((b) => ({ k: b.k, t: str(b.t, 4000) }));
  if (o.actions && o.actions.length) m.actions = o.actions;
  touch(m);
  S.chatMsgs.push(m);
  chat.updatedAt = Date.now();
  return m;
}

/* Kurzfassung langer Unterhaltungen (ohne KI-Modell: aus den eigenen Fragen und den ersten Antwortzeilen;
   mit KI später vom Modell). Wird als Kontext genutzt; Nachrichten bleiben vollständig erhalten. */
function summarize(chat) {
  const M = chatMsgs(chat.id);
  const old = M.slice(0, Math.max(0, M.length - 12));
  if (!old.length) return false;
  const lines = [];
  for (const m of old) {
    if (m.role === "user") lines.push("Frage/Auftrag (" + new Date(m.at).toLocaleDateString("de-DE") + "): " + m.text.slice(0, 140));
    else {
      const first = (m.blocks || []).find((b) => b.k !== "h") || { t: m.text };
      lines.push("Antwort: " + String(first.t).slice(0, 160));
      for (const x of m.actions || []) if (x.status === "erledigt") lines.push("Ausgeführt: " + x.title);
    }
  }
  const keep = lines.length > 44 ? [...lines.slice(0, 12), "… (" + (lines.length - 42) + " weitere Einträge) …", ...lines.slice(-30)] : lines;
  chat.summary = ("Automatische Kurzfassung (ohne KI erstellt, keine Bewertung):\n" + keep.join("\n")).slice(0, 6000);
  chat.summaryAt = Date.now();
  touch(chat);
  return true;
}

/* Aufträge als Text (Kopieren, Vorlesen); in der Anzeige stehen sie als Karten mit Knöpfen */
const actionBlocks = (actions) => (actions || []).map((x) => ({ k: "hinweis", t: (x.status === "erledigt" ? "Erledigt: " : x.status === "offen" ? "Wartet auf deine Bestätigung: " : x.status === "abgelehnt" ? "Abgelehnt: " : x.status === "rueckgaengig" ? "Rückgängig gemacht: " : "Nicht ausgeführt: ") + x.title + (x.note ? " (" + x.note + ")" : "") }));
const lvlOf = (x) => {
  const D = typeof ACT_DEF !== "undefined" ? ACT_DEF[x.type] : null;
  return D && POLICY[D.policy] ? POLICY[D.policy].lvl : 3;
};
/* Gemeinsamer Ablauf für Schreiben und Sprechen: Frage speichern → Antwort → ungefährliche Aufträge selbstständig
   ausführen (Stufe 0/1, mit Rückgängig), Stufe 2 nur als Vorschlag zum Tippen, Stufe 3 nie. */
async function chatSend(text, via = "text", chatId = chatOpen) {
  text = String(text || "").trim();
  if (!text || chatBusy) return null;
  // dieselbe Nachricht nicht doppelt verarbeiten (doppeltes Tippen, Eingabetaste + Senden, Sprache + Wiederholung):
  // während der Bearbeitung sperrt chatBusy, kurz danach (1,5 s) wird dieselbe Nachricht ignoriert
  if (chatLastSend && chatLastSend.text === text && chatLastSend.chat === chatId && performance.now() - chatLastSend.t < 1500) return null;
  chatBusy = true;
  let shown = false; // Ansicht zeigt bereits den Endstand
  try {
    let chat = chatById(chatId);
    if (!chat) (chat = newChat()), (chatOpen = chat.id);
    const history = chatMsgs(chat.id);
    addMsg(chat, { role: "user", text, via });
    if (chat.auto && history.length === 0) chat.title = chatTitleFrom(text);
    touch(chat);
    if (tab === "ai") render(), chatScroll(); // erst Ansicht, dann speichern: Zustand und Anzeige stimmen immer überein
    await save();
    const q = S.chatMsgs[S.chatMsgs.length - 1];
    const intent = userIntent(text);
    const r = await assistantAnswer(chat, text, history, { via, intent });
    const actions = [];
    // Vor JEDER schreibenden Aktion: Dubletten zusammenfassen, Absicht prüfen, Freigabestufe prüfen
    let autoTasks = 0;
    for (const a of dedupeActions(r.actions).slice(0, 6)) {
      if (!ACT_DEF[a.type]) continue;
      const x = { id: uid(), type: a.type, args: a.args, title: ACT_DEF[a.type].t(a.args), lvl: 0, status: "offen" };
      x.lvl = lvlOf(x);
      if (x.type === "task.add") x.key = q.id + ":" + normTitle(a.args.title); // gegen doppelte Ausführung
      const dup = existingDup(x);
      const explicit = intent.allow.has(x.type) && !(x.type === "task.add" && autoTasks >= intent.count);
      if (x.lvl >= 3) (x.status = "abgelehnt"), (x.note = "nie automatisch");
      else if (dup) (x.status = "doppelt"), (x.note = "Ähnlich schon vorhanden: „" + str(dup.title, 120) + "“ – nichts doppelt angelegt.");
      else if (x.lvl <= 1 && explicit) {
        const res = await runAction(x, "auto");
        x.status = res && res.ok ? "erledigt" : "fehler";
        if (!(res && res.ok)) x.note = (res && res.error) || "nicht möglich";
        if (x.type === "task.add" && x.status === "erledigt") autoTasks++;
      } else if (x.lvl <= 1) (x.status = "vorschlag"), (x.note = "Nicht ausgeführt – das war " + (intent.kind === "frage" ? "eine Frage" : "kein ausdrücklicher Auftrag") + ". Tippe auf „Ausführen“, wenn du das möchtest.");
      else x.note = via === "voice" ? "Bitte auf dem Bildschirm bestätigen (nicht per Sprache)." : "Braucht deine Bestätigung.";
      actions.push(x);
    }
    const blocks = r.blocks.slice();
    if (r.engine === "ki" && r.used && r.used.length) blocks.push({ k: "hinweis", t: "An die KI übermittelt: " + r.used.map((c) => KI_CATS[c] || c).join(", ") + "." });
    const m = addMsg(chat, { role: "assistant", text: blocksText(blocks.concat(actionBlocks(actions))), blocks, actions, engine: r.engine, via });
    if (r.topic) chat.topic = r.topic;
    if (chatMsgs(chat.id).length > CHAT_SUM_AFTER && (!chat.summaryAt || Date.now() - chat.summaryAt > 36e5)) summarize(chat);
    touch(chat);
    chatLastSend = { text, chat: chatId, t: performance.now() }; // Wiederholschutz gilt ab sofort, nicht erst nach dem Speichern
    chatBusy = false;
    shown = true;
    if (tab === "ai") render(), chatScroll(); // sofort, nicht erst nach dem Speichern (sonst geht ein schneller Fingertipp verloren)
    await save();
    return m;
  } finally {
    if (!shown) {
      chatLastSend = { text, chat: chatId, t: performance.now() };
      chatBusy = false;
      if (tab === "ai") render(), chatScroll();
    }
  }
}

/* ---------- Synchronisierung: begrenzter Anteil der Chats ---------- */
function chatSyncSlice(T) {
  const keep = [],
    by = {};
  for (const m of [...(T.chatMsgs || [])].sort((a, b) => b.at - a.at)) {
    const c = (T.chats || []).find((x) => x.id === m.chat);
    if (!c || c.deleted) continue;
    by[m.chat] = (by[m.chat] || 0) + 1;
    if (by[m.chat] > CHAT_SYNC_PER_CHAT) continue;
    keep.push(m);
  }
  let bytes = 0;
  const out = [];
  for (const m of keep) {
    bytes += (m.text || "").length * 2 + 200;
    if (bytes > CHAT_SYNC_BYTES) break;
    out.push(m);
  }
  return out;
}

/* ---------- Oberfläche ---------- */
// ganz nach unten: die neueste Nachricht samt Knöpfen steht über dem Eingabefeld (nicht dahinter)
const chatScroll = () =>
  requestAnimationFrame(() => {
    if (document.getElementById("chatEnd")) scrollTo(0, document.documentElement.scrollHeight);
  });
function mdLite(t) {
  return esc(t)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
}
function msgHtml(m) {
  const mine = m.role === "user";
  const body = mine
    ? mdLite(m.text)
    : (m.blocks || [{ k: "ki", t: m.text }])
        .map((b) => (b.k === "h" ? `<div class="cb-h">${esc(b.t)}</div>` : `<div class="cb cb-${esc(b.k)}">${b.k !== "ki" && AS_LABEL[b.k] ? `<span class="chip cb-l">${AS_LABEL[b.k]}</span> ` : ""}${mdLite(b.t)}</div>`))
        .join("");
  const acts = (m.actions || [])
    .map(
      (x) =>
        `<div class="card ca"><div>${esc(x.title)}</div><div class="mut">${x.status === "erledigt" ? "✅ erledigt" + (x.undo ? "" : "") : x.status === "offen" ? "⏳ wartet auf deine Bestätigung" + (x.note ? " – " + esc(x.note) : "") : x.status === "vorschlag" ? "💡 Vorschlag – " + esc(x.note || "nicht ausgeführt") : x.status === "doppelt" ? "↔︎ " + esc(x.note || "schon vorhanden") : x.status === "verworfen" ? "✕ verworfen" : x.status === "laeuft" ? "⏳ wird ausgeführt …" : x.status === "rueckgaengig" ? "↩︎ rückgängig gemacht" : x.status === "abgelehnt" ? "⛔ abgelehnt" + (x.note ? " – " + esc(x.note) : "") : "⚠️ " + esc(x.note || "nicht ausgeführt")}</div>${
          x.status === "offen" || x.status === "vorschlag" ? `<div class="row"><button class="p" data-a="chatAct" data-id="${esc(m.id)}" data-v="${esc(x.id)}">${x.status === "vorschlag" ? "Ausführen" : "Bestätigen"}</button><button data-a="chatActNo" data-id="${esc(m.id)}" data-v="${esc(x.id)}">${x.status === "vorschlag" ? "Verwerfen" : "Ablehnen"}</button></div>` : x.status === "erledigt" && x.undo ? `<div class="row"><button class="s" data-a="chatUndo" data-id="${esc(m.id)}" data-v="${esc(x.id)}">Rückgängig</button></div>` : ""
        }</div>`,
    )
    .join("");
  return `<div class="msg ${mine ? "me" : "ai"}" data-mid="${esc(m.id)}"><div class="bub">${body}${acts}</div><div class="mmeta">${new Date(m.at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${m.via === "voice" ? " · 🎙️ gesprochen" : ""}${!mine && m.engine ? " · " + (m.engine === "ki" ? "KI-Modell" : "lokal") : ""} <button class="s mbtn" data-a="chatCopy" data-id="${esc(m.id)}" aria-label="Nachricht kopieren">Kopieren</button>${!mine ? ` <button class="s mbtn" data-a="chatSpeak" data-id="${esc(m.id)}" aria-label="Nachricht vorlesen">🔊</button>` : ""}${mine ? ` <button class="s mbtn" data-a="chatMem" data-id="${esc(m.id)}">Merken …</button>` : ""}</div></div>`;
}
/* Dauerhafter Hinweis, warum der Sprachmodus beendet wurde (nicht nur kurz eingeblendet) */
function voEndCard() {
  const e = typeof VO !== "undefined" && !VO.on && VO.endInfo;
  if (!e) return "";
  return `<div class="card rec warn" id="voEnd" role="status"><b>Sprachmodus beendet: ${esc(e.reason)}</b>${e.detail ? `<div class="mut">${esc(e.detail)}</div>` : ""}<div class="row"><button class="p" data-a="voiceStart">🎙️ Erneut starten</button><button data-a="voiceEndOk">OK</button></div></div>`;
}
function engineLine() {
  return `<div class="mut" id="kiEngine">${KI_ON ? "KI-Modell eingeschaltet (Workers AI) – Datenfreigaben in den Einstellungen." : "Lokaler Assistent (ohne KI-Modell): versteht feste Anliegen zu deinen Vivalink-Daten, keine freie Unterhaltung."} <button class="s" data-a="kiSettings">KI-Einstellungen</button></div>`;
}
function vChat() {
  const c = chatOpen && chatById(chatOpen);
  if (!c) {
    chatOpen = null;
    const L = chatList();
    return `<div class="row sp"><h1>KI-Chat</h1><button class="p" data-a="chatNew">Neuer Chat</button></div>${engineLine()}${voEndCard()}<div class="row" style="margin:8px 0"><button class="p voicebtn" data-a="voiceStart">🎙️ Sprachmodus starten</button></div>${
      L.length
        ? L.map((x) => {
            const M = chatMsgs(x.id),
              last = M[M.length - 1];
            return `<div class="card" data-a="chatOpen" data-id="${esc(x.id)}"><div class="row sp"><b>${esc(x.title)}</b><span class="mut">${new Date(x.updatedAt).toLocaleDateString("de-DE")}</span></div><div class="mut">${last ? esc(last.text.replace(/\s+/g, " ").slice(0, 90)) : "noch leer"}</div></div>`;
          }).join("")
        : '<p class="mut">Noch keine Unterhaltungen. Starte einen neuen Chat oder den Sprachmodus.</p>'
    }`;
  }
  const M = chatMsgs(c.id);
  return `<div class="row sp chathead"><button class="s" data-a="chatBack">‹ Chats</button><b class="ctitle" data-a="chatRename" data-id="${esc(c.id)}">${esc(c.title)}</b><button class="s" data-a="chatMenu" data-id="${esc(c.id)}" aria-label="Chat-Menü">…</button></div>${c.summary ? `<details class="card mut"><summary>Zusammenfassung früherer Nachrichten</summary>${mdLite(c.summary)}</details>` : ""}<div id="chatLog">${M.length ? M.map(msgHtml).join("") : '<p class="mut">Schreib eine Nachricht oder starte den Sprachmodus.</p>'}${chatBusy ? '<div class="msg ai"><div class="bub mut" id="chatTyping">… denkt nach</div></div>' : ""}<div id="chatEnd"></div></div>${voEndCard()}<div class="composer"><textarea id="chatIn" rows="1" placeholder="Nachricht an deine Management AI" enterkeyhint="send">${esc(chatDraft)}</textarea><div class="row"><button class="p" data-a="chatSend" ${chatBusy ? "disabled" : ""}>Senden</button><button class="voicebtn" data-a="voiceStart" aria-label="Sprachmodus starten">🎙️ Sprechen</button></div></div>`;
}
function vKi() {
  return `<div class="seg"><button class="${kiTab === "chat" ? "on" : ""}" data-a="kiTab" data-id="chat">Chat</button><button class="${kiTab === "auftraege" ? "on" : ""}" data-a="kiTab" data-id="auftraege">Aufträge an ChatGPT/Claude</button></div>${kiTab === "auftraege" ? vAi() : vChat()}`;
}
async function kiSettingsSheet() {
  const c = await kiCfg(),
    sc = await kvGet("sync-config"),
    vc = await voiceCfg(),
    st = KI_STAT || { ok: false, why: "noch nicht geprüft" };
  sheet(`<h1>KI-Einstellungen</h1>
<div class="card"><b>Antworten</b><p class="mut">${c.on ? "KI-Modell eingeschaltet (Cloudflare Workers AI, kostenloses Tageskontingent)." : "Derzeit antwortet der <b>lokale Assistent ohne KI-Modell</b> (kostenlos, offline, nur auf dem Gerät)."}</p><p class="mut" id="kiStat">${st.ok ? "✅ KI-Gegenstelle erreichbar." : "KI-Gegenstelle: " + esc(st.why) + "."} ${kiUrl() ? '<button class="s" data-a="kiCheck">Verbindung prüfen</button>' : ""}</p>${
    kiUrl() ? `<label><input type="checkbox" id="ki-on" ${c.on ? "checked" : ""} ${sc && (st.ok || c.on) ? "" : "disabled"}> KI-Modell verwenden${sc ? (st.ok || c.on ? "" : " (erst wenn erreichbar)") : " (erst nach Einrichtung der Synchronisierung)"}</label>` : ""
  }</div>
<div class="card"><b>Welche Daten darf die KI erhalten?</b><p class="mut">Nur die angehakten Bereiche werden bei Bedarf an das KI-Modell übermittelt (ohne Namen oder Kontaktdaten; private Gedächtniseinträge nie). Der lokale Assistent sendet nichts.</p>${Object.entries(KI_CATS)
    .map(([k, n]) => `<label><input type="checkbox" class="ki-f" data-id="${k}" ${c.freigaben[k] ? "checked" : ""} ${kiUrl() && (st.ok || c.on) ? "" : "disabled"}> ${esc(n)}</label>`)
    .join("<br>")}</div>
<div class="card"><b>Sprachmodus</b><p class="mut">${voiceInfo()}</p><label>Stimme</label><select id="vo-voice">${voiceOptions(vc.voice)}</select><label>Sprechtempo</label><select id="vo-rate">${["0.9", "1", "1.1", "1.2"].map((r) => `<option ${String(vc.rate) === r ? "selected" : ""}>${r}</option>`).join("")}</select><label><input type="checkbox" id="vo-barge" ${vc.barge ? "checked" : ""}> Unterbrechen durch Sprechen (experimentell)</label><details id="vo-log"><summary>Sprachmodus-Protokoll (ohne Inhalte)</summary><p class="mut">Nur Ereignisse und Zeiten dieses Geräts (keine erkannten Texte, keine Antworten) – hilft bei Problemen auf dem iPad/iPhone.</p><pre class="vo-logp">${esc(voLogText().split("\n").slice(-60).join("\n") || "(noch leer)")}</pre><button class="s" data-a="voiceLogCopy">Protokoll kopieren</button></details></div>
<button class="p" data-a="kiSave">Speichern</button><button data-a="close">Schließen</button>`);
}
async function chatAction(a, id, b) {
  if (a === "kiTab") return (kiTab = id === "auftraege" ? "auftraege" : "chat"), render(), true;
  if (a === "chatNew") {
    const c = newChat();
    chatOpen = c.id;
    await save();
    return render(), setTimeout(() => $("#chatIn") && $("#chatIn").focus(), 50), true;
  }
  if (a === "chatOpen") return (chatOpen = id), render(), chatScroll(), true;
  if (a === "chatBack") return (chatOpen = null), render(), true;
  if (a === "chatSend") {
    const el = $("#chatIn");
    const t = el ? el.value : "";
    if (!t.trim()) return toast("Bitte eine Nachricht eingeben"), true;
    chatDraft = "";
    const m = await chatSend(t, "text");
    if (typeof voiceAfterText === "function") voiceAfterText(m);
    return true;
  }
  if (a === "chatMenu") {
    const c = chatById(id);
    sheet(`<h1>${esc(c.title)}</h1><button data-a="chatRename" data-id="${esc(id)}">Umbenennen</button><button data-a="chatSum" data-id="${esc(id)}">Lange Unterhaltung zusammenfassen</button><button data-a="chatDel" data-id="${esc(id)}">Chat löschen</button><button data-a="close">Schließen</button>`);
    return true;
  }
  if (a === "chatRename") {
    const c = chatById(id);
    sheet(`<h1>Chat umbenennen</h1><input id="chatTitle" value="${esc(c.title)}" maxlength="80"><button class="p" data-a="chatRenameSave" data-id="${esc(id)}">Speichern</button><button data-a="close">Abbrechen</button>`);
    return true;
  }
  if (a === "chatRenameSave") {
    const c = chatById(id),
      t = val("chatTitle").trim();
    if (!t) return toast("Bitte einen Namen eingeben"), true;
    c.title = str(t, 80);
    c.auto = false;
    touch(c);
    await save();
    close();
    return render(), true;
  }
  if (a === "chatSum") {
    const ok = summarize(chatById(id));
    await save();
    close();
    toast(ok ? "Zusammenfassung erstellt – die Nachrichten bleiben erhalten" : "Noch zu kurz für eine Zusammenfassung");
    return render(), true;
  }
  if (a === "chatDel") {
    if (window._cdel !== id) return (window._cdel = id), toast("Nochmal tippen: Chat endgültig löschen"), true;
    window._cdel = null;
    const c = chatById(id);
    c.deleted = true;
    touch(c);
    S.chatMsgs = S.chatMsgs.filter((m) => m.chat !== id);
    chatOpen = null;
    logAction("chat.delete", "gruender", true, "Chat gelöscht");
    await save();
    close();
    toast("Chat gelöscht");
    return render(), true;
  }
  if (a === "chatCopy") {
    const m = S.chatMsgs.find((x) => x.id === id);
    if (!m) return true;
    try {
      await navigator.clipboard.writeText(m.text);
      toast("Kopiert");
    } catch {
      toast("Kopieren nicht möglich");
    }
    return true;
  }
  if (a === "chatMem") {
    const m = S.chatMsgs.find((x) => x.id === id);
    sheet(`<h1>Ins Gedächtnis übernehmen?</h1><p class="mut">Nur wenn es eine bestätigte, dauerhaft wichtige Information ist. Wird gespeichert, sobald du auf „Übernehmen“ tippst.</p><label>Titel</label><input id="cm-t" value="${esc(m.text.slice(0, 120))}"><label>Bereich</label><select id="cm-c">${opts(CATS, "Entscheidung")}</select><label>Text</label><textarea id="cm-x">${esc(m.text.slice(0, 2000))}</textarea><button class="p" data-a="chatMemSave">Übernehmen</button><button data-a="close">Abbrechen</button>`);
    return true;
  }
  if (a === "chatMemSave") {
    const t = val("cm-t").trim();
    if (!t) return toast("Bitte einen Titel eingeben"), true;
    const x = { id: uid(), type: "memory.add", args: { title: t, text: val("cm-x"), cat: val("cm-c") } };
    const r = await runAction(x, "gruender");
    await save();
    close();
    toast(r && r.ok ? "Ins Gedächtnis übernommen" : "Nicht gespeichert");
    return render(), true;
  }
  if (a === "chatAct" || a === "chatActNo" || a === "chatUndo") {
    const m = S.chatMsgs.find((x) => x.id === id),
      x = m && (m.actions || []).find((y) => y.id === b.dataset.v);
    if (!x) return true;
    // nur offene Vorschläge/Bestätigungen; während der Ausführung gesperrt (doppeltes Tippen führt nichts doppelt aus)
    if ((a === "chatAct" || a === "chatActNo") && !["offen", "vorschlag"].includes(x.status)) return true;
    if (a === "chatUndo" && x.status !== "erledigt") return true;
    // Doppeltippen: der zweite Tipp landet sonst auf „Rückgängig“ an derselben Stelle
    if (a === "chatUndo" && performance.now() - (CHAT_ACT_AT[x.id] || -1e9) < 1000) return true;
    if (a === "chatActNo") x.status = x.status === "vorschlag" ? "verworfen" : "abgelehnt";
    else if (a === "chatUndo") {
      if (undoAction(x)) x.status = "rueckgaengig";
      logAction(ACT_DEF[x.type].policy, "gruender", true, "rückgängig");
    } else {
      // Bestätigung nur durch Tippen auf dem Bildschirm (by = "gruender"), nie aus dem Sprachmodus heraus
      const dup = existingDup(x);
      if (dup) {
        x.status = "doppelt";
        x.note = "Ähnlich schon vorhanden: „" + str(dup.title, 120) + "“ – nichts doppelt angelegt.";
        touch(m);
        render();
        await save();
        return true;
      }
      x.status = "laeuft";
      if (x.type === "task.add" && !x.key) x.key = m.id + ":" + normTitle(x.args.title);
      const r = await runAction(x, "gruender");
      CHAT_ACT_AT[x.id] = performance.now();
      x.status = r && r.ok ? "erledigt" : "fehler";
      if (!(r && r.ok)) x.note = (r && r.error) || "nicht möglich";
    }
    touch(m);
    render(); // Ansicht sofort passend zum Zustand (ein schneller nächster Fingertipp trifft die neue Ansicht)
    await save();
    return true;
  }
  if (a === "kiSettings") return kiSettingsSheet(), true;
  if (a === "kiCheck") return (KI_STAT = await kiStatus()), kiSettingsSheet(), true;
  if (a === "kiSave") {
    const c = await kiCfg();
    if ($("#ki-on")) c.on = $("#ki-on").checked;
    c.freigaben = {};
    document.querySelectorAll(".ki-f").forEach((el) => (c.freigaben[el.dataset.id] = el.checked));
    await kvPut("ki-config", c);
    KI_ON = !!(c.on && kiUrl());
    await kvPut("voice-config", { ...(await voiceCfg()), voice: val("vo-voice"), rate: Number(val("vo-rate")) || 1, barge: $("#vo-barge").checked });
    logAction("ki.settings", "gruender", true, "KI-Einstellungen gespeichert");
    close();
    toast("Gespeichert");
    return render(), true;
  }
  if (a === "voiceStart") return voiceStart(), true;
  if (a === "voiceStop") return voiceStop("beendet"), true;
  if (a === "voiceInterrupt") return voiceInterrupt(), true;
  if (a === "voiceDone") return voiceDone(), true;
  if (a === "voiceKeep") return voiceKeep(), true;
  if (a === "voiceSayTap") return voiceSayTap(), true; // ohne Wartezeit: gilt als Bedienung (iOS)
  if (a === "voiceEndOk") return voiceEndOk(), true;
  if (a === "voiceLogCopy") {
    try {
      await navigator.clipboard.writeText(voLogText() || "(leer)");
      toast("Protokoll kopiert (ohne Inhalte)");
    } catch {
      toast("Kopieren nicht möglich");
    }
    return true;
  }
  if (a === "chatSpeak") return voiceSpeakMsg(S.chatMsgs.find((x) => x.id === id)), true;
  return false;
}
/* Eingabe: Enter sendet (Umschalt+Enter = neue Zeile); Entwurf bleibt beim Neuzeichnen erhalten */
document.addEventListener("keydown", (e) => {
  if (e.target && e.target.id === "chatIn" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    chatAction("chatSend");
  }
});
document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "chatIn") chatDraft = e.target.value;
});
