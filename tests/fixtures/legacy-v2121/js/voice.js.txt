/* Sprachmodus – Teil desselben Assistenten und Chats (Nachrichten landen mit „gesprochen“ im geöffneten Chat).
   Ehrliche Einordnung (wird in der App angezeigt):
   - „Gerät“: Spracherkennung und Stimme von Safari/iOS (kostenlos). Gesprächsschleife ohne Tastendruck je Satz,
     Ende-Erkennung über Sprechpause, Unterbrechen per Taste (per Stimme nur experimentell). KEIN Echtzeit-Sprachmodell:
     zuhören → Text → Antwort → vorlesen, nacheinander. Laut Berichten fehlt die Spracherkennung von Safari in
     installierten Home-Bildschirm-Apps – dann:
   - „Server“: Aufnahme auf dem Gerät, Umwandlung in Text über die eigene KI-Gegenstelle (Whisper, Workers AI) – nur wenn
     bereitgestellt und freigegeben.
   - „Diktat“: keine Spracherkennung verfügbar → Tastatur-Diktat von iOS, Antworten werden vorgelesen. Ausdrücklich
     KEIN Sprachmodus.
   Mikrofon nur nach Tippen auf „Sprachmodus starten“; Anzeige oben, solange aktiv; endet bei Verlassen der App,
   nach längerer Stille (mit Vorwarnung) oder mit „Beenden“. Riskante Aufträge werden nie per Sprache bestätigt.
   Robustheit (ab 2.11.1, nach einem Hänger auf dem iPad):
   - Jede Phase (zuhören, nachdenken, vorlesen) hat eine Zeitgrenze; danach ist die App wieder normal bedienbar.
   - Spracherkennung, die sofort wieder endet oder Fehler meldet, wird höchstens VO_T.fails-mal mit wachsender Pause neu
     gestartet – nie endlos. Danach einmal Wechsel zur Server-Erkennung (falls freigegeben), sonst Ende mit Hinweis.
   - Fehlgeschlagene oder leere Server-Erkennung wird begrenzt wiederholt (VO_T.sttFails / VO_T.sttEmpty).
   - Die Anzeige wird nur aktualisiert, nicht neu aufgebaut: „Beenden“ bleibt dasselbe Element und ist jederzeit tippbar.
   - Alle Abläufe tragen eine Sitzungsnummer; nach „Beenden“ wirkt kein alter Rückruf mehr.
   - In der installierten App unter iOS/iPadOS wird bei freigegebener KI die Server-Erkennung bevorzugt (Safaris
     Spracherkennung ist dort laut WebKit-Berichten nicht oder nur unzuverlässig verfügbar). Gesprächsfluss (ab 2.12, nach dem Praxistest auf dem iPad):
   - Während des Sprachmodus bleibt der Bildschirm an (Screen Wake Lock); sonst sperrt das iPad und beendet die App.
   - Vor dem Vorlesen wird das Mikrofon freigegeben bzw. die Erkennung beendet und kurz gewartet – iOS gibt Sprache
     sonst leise oder gar nicht aus, solange eine Aufnahme läuft. Danach wird wieder zugehört.
   - Vorlesen: Sätze werden gehalten (sonst gehen iOS-Ereignisse verloren), Start wird überwacht und einmal wiederholt;
     gelingt es nicht, steht die Antwort im Chat (🔊 zum Vorlesen per Tippen) und das Gespräch geht weiter.
   - Stille beendet erst nach VO_T.idle (mit Vorwarnung und „Weiter zuhören“). Geräusche und typische
     Fehlerkennungen von Whisper („Vielen Dank.“) gehen nicht in den Chat und beenden nichts.
   - Dauert eine Antwort zu lange, bleibt der Sprachmodus an; die Antwort erscheint später im Chat.
   - Jedes Ende außer „Beenden“ wird dauerhaft im Chat angezeigt (Grund + „Erneut starten“).
   - Protokoll ohne Inhalte (nur Ereignisse und Zeiten) für Gerätetests: KI-Einstellungen › Sprachmodus-Protokoll. */
const VO = { on: false, mode: "", state: "aus", gen: 0, rec: null, buf: "", interim: "", silenceT: null, retryT: null, watchT: null, fails: 0, sttFails: 0, sttEmpty: 0, switched: false, chat: null, rec2: null, stream: null, actx: null, lastErr: "", lastInput: 0, srStopAt: -1e9, cancelAt: -1e9, utts: [], ttsBroken: false, hint: "", wake: null, endInfo: null, late: false, needTap: false, tapText: "", unlockP: null, vcfg: { voice: "", rate: 1, barge: false } };
const SRC = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
/* Zeitgrenzen und Wiederholungsgrenzen (Millisekunden bzw. Anzahl; in Tests verkürzbar) */
const VO_T = { silence: 1300, idle: 120000, idleWarn: 20000, think: 75000, recMax: 30000, stt: 30000, mic: 15000, ttsStart: 2000, ttsBase: 4000, ttsPerChar: 80, fails: 3, sttFails: 3, sttEmpty: 8, quickEnd: 1500, gap: 400, speakMax: 520 };
const vNow = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()); // unabhängig von Uhrumstellungen
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(p, ms, what = "Zeitüberschreitung") {
  let t;
  return Promise.race([p, new Promise((_, no) => (t = setTimeout(() => no(Object.assign(new Error(what), { timeout: true })), ms)))]).finally(() => clearTimeout(t));
}
function iosStandalone() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const sa = navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  return ios && sa;
}
async function serverPossible() {
  return !!(typeof kiReady === "function" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && (await kiReady()));
}
/* Protokoll ohne Inhalte (keine erkannten Texte, keine Antworten): nur Ereignis, Zustand, Dauer – nur auf diesem Gerät */
let VO_LOG = [];
let voLogT = null;
kvGet("voice-log")
  .then((l) => Array.isArray(l) && (VO_LOG = l.concat(VO_LOG).slice(-200)))
  .catch(() => {});
function voLog(ev, d = "") {
  VO_LOG.push({ at: Date.now(), ev, d: String(d).slice(0, 80), st: VO.state, m: VO.mode });
  if (VO_LOG.length > 200) VO_LOG = VO_LOG.slice(-200);
  clearTimeout(voLogT);
  voLogT = setTimeout(() => kvPut("voice-log", VO_LOG).catch(() => {}), 800);
}
function voLogText() {
  return VO_LOG.map((e) => new Date(e.at).toLocaleTimeString("de-DE") + " " + e.ev + (e.d ? " (" + e.d + ")" : "") + " [" + e.m + "/" + e.st + "]").join("\n");
}
async function voiceCfg() {
  return { voice: "", rate: 1, barge: false, ...((await kvGet("voice-config")) || {}) };
}
voiceCfg()
  .then((c) => (VO.vcfg = c))
  .catch(() => {});
async function voiceMode() {
  const server = await serverPossible();
  if (SRC() && !(server && iosStandalone())) return "geraet";
  if (server) return "server";
  return "diktat";
}
function voiceInfo() {
  const sr = !!SRC();
  return sr
    ? "Spracherkennung und Stimme dieses Geräts (kostenlos). Du sprichst, die App erkennt die Pause, antwortet und hört danach wieder zu – ohne Tastendruck je Satz. Unterschied zu einem Echtzeit-Sprachmodus: Zuhören und Antworten wechseln sich ab; Unterbrechen per Taste, per Stimme nur experimentell."
    : "Auf diesem Gerät/in dieser Ansicht ist keine Spracherkennung verfügbar (typisch für installierte Home-Bildschirm-Apps unter iOS). Dann gibt es nur den Diktiermodus: Diktat über das Mikrofon der Tastatur, Antworten werden vorgelesen – das ist KEIN Sprachmodus. Mit der vorbereiteten KI-Gegenstelle wird Spracherkennung über den Server möglich.";
}
function deVoices() {
  return "speechSynthesis" in window ? speechSynthesis.getVoices().filter((v) => /^de(-|_|$)/i.test(v.lang)) : [];
}
function voiceOptions(sel = "") {
  const V = deVoices();
  return `<option value="">Automatisch (beste deutsche Stimme)</option>` + V.map((v) => `<option value="${esc(v.name)}" ${v.name === sel ? "selected" : ""}>${esc(v.name)}${/premium|enhanced|erweitert|natural/i.test(v.name) ? " ★" : ""}</option>`).join("");
}
function pickVoice(name) {
  const V = deVoices();
  return V.find((v) => v.name === name) || V.find((v) => /premium|enhanced|erweitert|natural/i.test(v.name)) || V.find((v) => /de-DE/i.test(v.lang)) || V[0] || null;
}

/* ---------- Anzeige (außerhalb von #app, bleibt beim Neuzeichnen erhalten) ----------
   Einmal aufgebaut, danach nur Texte/Sichtbarkeit geändert – Knöpfe werden nie ersetzt (sonst gehen Fingertipps auf
   iPhone/iPad verloren, wenn sich die Anzeige während des Tippens ändert). */
const VO_TXT = { hoert: "Mikrofon an – ich höre zu", denkt: "Mikrofon aus – denke nach", spricht: "Mikrofon aus – ich spreche", diktat: "Diktiermodus – Tastatur-Diktat, Antworten werden vorgelesen (kein Sprachmodus)", start: "Starte …" };
function voiceBar() {
  let el = document.getElementById("voicebar");
  document.body.classList.toggle("vb-on", VO.on && VO.mode !== "diktat");
  if (!VO.on) return el && el.remove();
  if (!el) {
    el = document.createElement("div");
    el.id = "voicebar";
    el.setAttribute("role", "status");
    el.innerHTML = `<div class="vb-t"><span class="vb-dot"></span><b>Sprachmodus aktiv</b> · <span class="vb-s" aria-live="polite"></span></div><div class="vb-i" hidden></div><div class="vb-h" hidden></div><div class="row"><button class="p" data-a="voiceInterrupt" hidden>Unterbrechen</button><button class="p" data-a="voiceDone" hidden>Fertig gesprochen</button><button class="p" data-a="voiceKeep" hidden>Weiter zuhören</button><button class="p" data-a="voiceSayTap" hidden>🔊 Antwort vorlesen</button><button data-a="voiceStop">Beenden</button></div>`;
    document.body.appendChild(el);
  }
  const cls = "voicebar vb-" + VO.state;
  if (el.className !== cls) el.className = cls;
  const st = (VO_TXT[VO.state] || VO.state) + (VO.mode === "server" ? " (Server-Erkennung)" : "");
  const sEl = el.querySelector(".vb-s");
  if (sEl.textContent !== st) sEl.textContent = st;
  const iEl = el.querySelector(".vb-i"),
    it = VO.interim ? "„" + VO.interim.slice(-140) + "“" : "";
  if (iEl.textContent !== it) iEl.textContent = it;
  iEl.hidden = !it;
  const left = VO.state === "hoert" ? VO_T.idle - (vNow() - VO.lastInput) : Infinity;
  const warn = left <= VO_T.idleWarn;
  const hint = (warn ? "Keine Eingabe – der Sprachmodus endet in " + Math.max(1, Math.ceil(left / 1000)) + " s. " : "") + VO.hint;
  const hEl = el.querySelector(".vb-h");
  if (hEl.textContent !== hint) hEl.textContent = hint;
  hEl.hidden = !hint;
  el.querySelector('[data-a="voiceInterrupt"]').hidden = VO.state !== "spricht";
  el.querySelector('[data-a="voiceDone"]').hidden = !(VO.state === "hoert" && (VO.mode === "server" || VO.interim));
  el.querySelector('[data-a="voiceKeep"]').hidden = !warn;
  el.querySelector('[data-a="voiceSayTap"]').hidden = !(VO.tapText && VO.state === "hoert");
}
function setState(s) {
  if (VO.state !== s) voLog("zustand", s);
  VO.state = s;
  voiceBar();
}
function clearVoTimers() {
  clearTimeout(VO.silenceT);
  clearTimeout(VO.retryT);
  VO.silenceT = VO.retryT = null;
}
const touchInput = () => (VO.lastInput = vNow());

/* ---------- Bildschirm an lassen (Screen Wake Lock; iOS ab 16.4, in installierten Apps ab 18.4) ---------- */
async function wakeOn() {
  if (!VO.on || VO.wake || !("wakeLock" in navigator) || document.hidden) return;
  try {
    VO.wake = await navigator.wakeLock.request("screen");
    voLog("bildschirm", "bleibt an");
    VO.wake.addEventListener && VO.wake.addEventListener("release", () => ((VO.wake = null), voLog("bildschirm", "freigegeben vom System")));
    if (!VO.on) wakeOff();
  } catch (e) {
    VO.wake = null;
    voLog("bildschirm", "nicht möglich: " + ((e && e.name) || "Fehler"));
  }
}
function wakeOff() {
  const w = VO.wake;
  VO.wake = null;
  if (w) w.release().catch(() => {});
}

/* ---------- Start / Ende ---------- */
async function voiceStart() {
  if (VO.on) return;
  if (!("speechSynthesis" in window)) return toast("Sprachausgabe wird von diesem Gerät nicht unterstützt");
  // Im Rahmen des Tippens freischalten (iOS verlangt eine Bedienung): Sprachausgabe und – für die Server-Erkennung –
  // die Audioverarbeitung. Beides VOR dem ersten „await“, sonst gilt es nicht mehr als Bedienung.
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && (!SRC() || iosStandalone()))
    try {
      VO.actx = new AC();
      VO.actx.resume && VO.actx.resume().catch(() => {});
    } catch {
      VO.actx = null;
    }
  VO.on = true; // sofort: doppeltes Tippen startet nichts doppelt
  VO.gen++;
  // Sprachausgabe mit einem ECHTEN kurzen Satz freischalten (ein leerer Satz mit Lautstärke 0 schaltet iOS nicht frei
  // und blieb hängen – danach landeten alle Antworten stumm in der Warteschlange). Bestätigt zugleich hörbar den Start.
  VO.needTap = false;
  VO.tapText = "";
  VO.unlockP = ttsRun(["Ich höre zu."], VO.gen, { clear: true, trustSpeaking: true, tag: "vorlesen-freigabe" });
  VO.state = "start";
  VO.fails = VO.sttFails = VO.sttEmpty = 0;
  VO.switched = VO.ttsBroken = VO.late = false;
  VO.hint = "";
  VO.endInfo = null;
  touchInput();
  tab = "ai";
  kiTab = "chat";
  const g = VO.gen;
  wakeOn();
  try {
    let c = chatOpen && chatById(chatOpen);
    if (!c) {
      c = newChat("Sprachgespräch " + new Date().toLocaleDateString("de-DE"));
      chatOpen = c.id;
      await save();
    }
    VO.chat = c.id;
    VO.mode = await voiceMode();
  } catch {
    VO.mode = "diktat";
  }
  if (g !== VO.gen || !VO.on) return; // inzwischen beendet
  if (VO.mode !== "server" && VO.actx) closeCtx();
  logAction("voice.start", "gruender", true, VO.mode);
  voLog("start", VO.mode + (iosStandalone() ? ", installierte App" : ""));
  render();
  clearInterval(VO.watchT);
  VO.watchT = setInterval(voiceWatch, 1000);
  voiceCfg()
    .then((c) => (VO.vcfg = c))
    .catch(() => {});
  // erst zuhören, wenn die Bestätigung gesprochen ist (sonst nimmt das Mikrofon sie auf); höchstens 3,5 s
  await Promise.race([VO.unlockP, sleep(3500)]);
  if (g !== VO.gen || !VO.on) return;
  if (VO.mode === "diktat") {
    setState("diktat");
    setTimeout(() => $("#chatIn") && $("#chatIn").focus(), 50);
    return;
  }
  listen({ fresh: true });
}
/* Wächter (jede Sekunde): Stille-Grenze mit Vorwarnung, Bildschirm an */
function voiceWatch() {
  if (!VO.on) return clearInterval(VO.watchT);
  if (VO.state === "hoert") {
    const quiet = vNow() - VO.lastInput;
    if (quiet > VO_T.idle) return voiceStop("keine Eingabe", "Zur Sicherheit nach " + Math.round(VO_T.idle / 1000) + " Sekunden ohne verständliche Eingabe.");
    voiceBar(); // Vorwarnung/Countdown
  }
  if (!VO.wake) wakeOn();
}
/* reason: kurzer Grund; detail: Erklärung. Jedes Ende außer „beendet“ (Tippen) bleibt im Chat sichtbar. */
function voiceStop(reason = "beendet", detail = "") {
  if (!VO.on) return;
  VO.on = false;
  VO.gen++; // alle laufenden Rückrufe dieser Sitzung wirkungslos
  clearVoTimers();
  clearInterval(VO.watchT);
  stopRecognizer();
  try {
    speechSynthesis.cancel();
  } catch {}
  VO.cancelAt = vNow();
  serverStop();
  wakeOff();
  VO.interim = VO.buf = "";
  VO.state = "aus";
  VO.hint = "";
  VO.tapText = "";
  voiceBar();
  logAction("voice.stop", "gruender", true, reason);
  voLog("ende", reason);
  if (reason !== "beendet") {
    VO.endInfo = { reason, detail, at: Date.now() };
    toast("Sprachmodus beendet: " + reason);
    if (tab === "ai") render();
  }
}
function voiceEndOk() {
  VO.endInfo = null;
  render();
}
function voiceKeep() {
  if (!VO.on) return;
  touchInput();
  voLog("weiter", "Stille-Grenze zurückgesetzt");
  voiceBar();
}
function voiceInterrupt() {
  if (!VO.on) return;
  VO.gen++; // beendet das Vorlesen
  try {
    speechSynthesis.cancel();
  } catch {}
  VO.cancelAt = vNow();
  voLog("unterbrochen");
  listen({ fresh: true, delay: VO_T.gap });
}
/* „Fertig gesprochen“: Satz sofort senden (Gerät) bzw. Aufnahme sofort beenden und erkennen lassen (Server) */
function voiceDone() {
  if (!VO.on || VO.state !== "hoert") return;
  if (VO.mode === "server") return VO.rec2 && VO.rec2.finish(true);
  if (VO.interim) finalize(VO.gen);
}
/* Vorlesen per Tippen – 🔊 an einer Nachricht oder „🔊 Antwort vorlesen“ in der Anzeige. Die Ausgabe wird OHNE
   Wartezeit im Rahmen des Tippens gestartet (iOS erlaubt sie dann immer); im Sprachmodus danach weiter zuhören. */
function voiceSayTap(text, full = false) {
  text = text || VO.tapText;
  if (!text) return;
  VO.tapText = "";
  if (!VO.on) {
    // wie der bewährte 🔊-Ablauf: kurz nach Beenden/Abbruch umschalten lassen (zählt für iOS noch als Tippen)
    const pause = Math.max(0, VO_T.gap - (vNow() - VO.srStopAt), 300 - (vNow() - VO.cancelAt));
    const g0 = VO.gen;
    (pause ? sleep(pause) : Promise.resolve()).then(() => ttsRun(splitSpeech(text, 4000), g0, { clear: true, trustSpeaking: true, ignoreOn: true, tag: "vorlesen-tippen" }));
    return;
  }
  const g = ++VO.gen;
  clearVoTimers();
  stopRecognizer();
  if (VO.rec2) {
    const r = VO.rec2;
    VO.rec2 = null;
    try {
      r.recd.onstop = null;
      r.recd.stop();
    } catch {}
  }
  releaseMic();
  setState("spricht");
  // nach beendeter Geräte-Erkennung kurz umschalten lassen (wie beim bewährten 🔊-Ablauf; zählt für iOS noch als Tippen)
  const pause = Math.max(0, VO_T.gap - (vNow() - VO.srStopAt));
  (pause ? sleep(pause) : Promise.resolve())
    .then(() => (g === VO.gen && VO.on ? ttsRun(splitSpeech(text, full ? 4000 : VO_T.speakMax), g, { clear: true, trustSpeaking: true, tag: "vorlesen-tippen" }) : "abbruch"))
    .then((r) => {
    // Erfolg per Tippen beweist nur, dass Tippen geht – automatisch bleibt bei einem kurzen Versuch (VO.needTap)
    if (r === "ok" || r === "kein-ende") VO.hint = VO.needTap ? "Automatisches Vorlesen ist auf diesem Gerät gerade nicht erlaubt – nach jeder Antwort „🔊 Antwort vorlesen“ tippen." : "";
    if (g === VO.gen && VO.on) listen({ fresh: true, delay: VO_T.gap });
  });
}
function voiceSpeakMsg(m) {
  if (!m) return;
  voiceSayTap(speechText((m.blocks || [{ k: "ki", t: m.text }]).concat(actionBlocks(m.actions || []))), true);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && VO.on) voiceStop("App im Hintergrund oder Bildschirm gesperrt", "iOS beendet Mikrofon und Sprachausgabe, sobald die App nicht mehr sichtbar ist.");
});
window.addEventListener("pagehide", () => VO.on && voiceStop("App im Hintergrund oder Bildschirm gesperrt", "iOS beendet Mikrofon und Sprachausgabe, sobald die App nicht mehr sichtbar ist."));

/* ---------- Zuhören (Gerät) ---------- */
function stopRecognizer() {
  const r = VO.rec;
  VO.rec = null;
  if (r) {
    r.onresult = r.onerror = r.onend = null;
    try {
      r.abort();
    } catch {}
    VO.srStopAt = vNow();
  }
}
/* listen({fresh}) – fresh: neue Zuhörphase (Stille-Grenze beginnt neu). Ohne fresh: automatischer Neustart der Erkennung
   innerhalb derselben Phase; die Stille-Grenze läuft weiter (sonst würde sie nie ablaufen). */
function listen(o = {}) {
  if (!VO.on) return;
  clearTimeout(VO.retryT);
  if (o.delay) {
    const g = VO.gen;
    VO.retryT = setTimeout(() => g === VO.gen && listen({ ...o, delay: 0 }), o.delay);
    return;
  }
  if (o.fresh) touchInput();
  if (VO.mode === "server") return serverListen(o);
  const g = ++VO.gen;
  stopRecognizer();
  VO.buf = VO.interim = "";
  VO.lastErr = "";
  setState("hoert");
  const R = SRC();
  let rec;
  try {
    rec = new R();
  } catch {
    return recognitionFailed("Spracherkennung nicht verfügbar");
  }
  VO.rec = rec;
  const t0 = vNow();
  let got = false;
  rec.lang = "de-DE";
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = (e) => {
    if (g !== VO.gen) return;
    let fin = "",
      tmp = "";
    for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript + " ") : (tmp += e.results[i][0].transcript + " "));
    VO.buf = fin.trim();
    VO.interim = (fin + tmp).trim();
    if (VO.interim) (got = true), (VO.fails = 0), touchInput();
    voiceBar();
    clearTimeout(VO.silenceT);
    VO.silenceT = setTimeout(() => finalize(g), VO_T.silence); // Sprechpause = fertig gesprochen
  };
  rec.onerror = (e) => {
    if (g !== VO.gen) return;
    voLog("erkennung-fehler", e.error);
    if (e.error === "not-allowed") return voiceStop("Mikrofon nicht erlaubt", "Bitte in den iOS-Einstellungen das Mikrofon für die App bzw. Safari erlauben.");
    if (e.error === "service-not-allowed") return recognitionFailed("Spracherkennung in dieser Ansicht nicht erlaubt");
    VO.lastErr = e.error || "unbekannt";
  };
  rec.onend = () => {
    if (g !== VO.gen || !VO.on || VO.state !== "hoert") return;
    if (VO.interim) return finalize(g); // iOS beendet nach Pausen selbst
    // ohne Ergebnis beendet: normal nach längerer Stille („no-speech“); sofortiges Ende oder Fehler = Störung
    if (!got && (vNow() - t0 < VO_T.quickEnd || (VO.lastErr && VO.lastErr !== "no-speech"))) VO.fails++;
    if (VO.fails >= VO_T.fails) return recognitionFailed("Spracherkennung reagiert nicht" + (VO.lastErr ? " (" + VO.lastErr + ")" : ""));
    listen({ delay: 250 * 2 ** VO.fails }); // wachsende Pause zwischen Neustarts
  };
  try {
    rec.start();
    voLog("erkennung-start");
  } catch {
    VO.fails++;
    if (VO.fails >= VO_T.fails) return recognitionFailed("Spracherkennung konnte nicht starten");
    listen({ delay: 250 * 2 ** VO.fails });
  }
}
/* Geräte-Spracherkennung gestört: einmal auf die Server-Erkennung wechseln (falls möglich), sonst beenden */
async function recognitionFailed(why) {
  const g = ++VO.gen;
  stopRecognizer();
  voLog("erkennung-gestoert", why);
  if (!VO.switched && VO.mode === "geraet" && (await serverPossible().catch(() => false))) {
    if (g !== VO.gen || !VO.on) return;
    VO.switched = true;
    VO.mode = "server";
    VO.fails = 0;
    toast(why + " – wechsle zur Erkennung über den Server");
    logAction("voice.mode", "app", true, "server");
    return listen({ fresh: true });
  }
  if (g === VO.gen) voiceStop(why, "Bitte das Diktat der Tastatur verwenden oder in den KI-Einstellungen die Server-Erkennung (KI-Modell) einschalten.");
}
function finalize(g) {
  if (g !== VO.gen || VO.state !== "hoert") return;
  clearTimeout(VO.silenceT);
  const text = (VO.interim || VO.buf).trim();
  if (!text) return;
  stopRecognizer();
  voiceTurn(text);
}
/* Eine Runde: gesprochenen Text in den Chat → Antwort → vorlesen → wieder zuhören. Jeder Schritt mit Zeitgrenze;
   keine dieser Grenzen beendet den Sprachmodus – nach einer Störung wird weiter zugehört. */
async function voiceTurn(text) {
  const g = ++VO.gen;
  clearVoTimers();
  VO.interim = "";
  touchInput();
  setState("denkt");
  voLog("frage", text.length + " Zeichen");
  const t0 = vNow();
  let m = null;
  try {
    m = await withTimeout(chatSend(text, "voice", VO.chat), VO_T.think, "Zeitüberschreitung bei der Antwort");
  } catch (e) {
    if (g !== VO.gen || !VO.on) return;
    voLog("antwort", e && e.timeout ? "dauert zu lange" : "Fehler");
    VO.hint = e && e.timeout ? "Die Antwort dauert länger – sie erscheint im Chat, sobald sie da ist." : "Fehler bei der Antwort – bitte noch einmal sprechen.";
    return listen({ fresh: true, delay: VO_T.gap });
  }
  if (g !== VO.gen || !VO.on) return;
  if (!m) {
    // die vorige Antwort läuft noch (z. B. nach einer Zeitüberschreitung) – weiter zuhören, nichts doppelt senden
    VO.hint = "Einen Moment – die vorige Antwort läuft noch. Bitte gleich noch einmal fragen.";
    return listen({ fresh: true, delay: 1000 });
  }
  voLog("antwort", Math.round(vNow() - t0) + " ms");
  VO.hint = "";
  releaseMic(); // Server-Erkennung: Mikrofon vor dem Vorlesen frei
  await speak(speechText((m.blocks || [{ k: "ki", t: m.text }]).concat(actionBlocks(m.actions))), g);
  if (g === VO.gen && VO.on) listen({ fresh: true, delay: VO_T.gap }); // kurze Pause: iOS schaltet zwischen Wiedergabe und Aufnahme um
}
/* In Sätze teilen; im Sprachmodus höchstens VO_T.speakMax Zeichen vorlesen, der Rest steht im Chat */
function splitSpeech(text, max) {
  const parts = (String(text).match(/[^.!?\n]+[.!?]?/g) || [text]).map((s) => s.trim()).filter(Boolean);
  const out = [];
  let n = 0;
  for (const p of parts) {
    if (out.length && n + p.length > max) {
      out.push("Mehr dazu steht im Chat.");
      break;
    }
    out.push(p);
    n += p.length;
  }
  return out;
}
/* Zustand der Sprachausgabe fürs Protokoll (ohne Inhalte) */
function ttsFlags() {
  let f = "";
  try {
    f = "spricht=" + +!!speechSynthesis.speaking + " wartet=" + +!!speechSynthesis.pending + " pausiert=" + +!!speechSynthesis.paused;
  } catch {}
  return f + " mikro=" + (VO.stream ? 1 : 0) + " audio=" + (VO.actx ? VO.actx.state : "-");
}
/* Sätze in die Warteschlange der Sprachausgabe geben – SOFORT (synchron), damit es beim Tippen als Bedienung gilt –
   und den tatsächlichen Verlauf überwachen:
   - Start nur bei echtem Start-Ereignis (speaking = true bedeutet auf iOS auch „hängt in der Warteschlange“);
     bei Ausgabe per Tippen genügt speaking (direkt nach cancel fehlen auf iOS die Ereignisse).
   - Ende bei Ende-Ereignis aller Sätze oder wenn iOS weder spricht noch etwas wartet; Zeitgrenze nach Textlänge.
   Ergebnis: "ok" | "kein-ende" | "startet-nicht" | "abbruch" | "fehler". */
function ttsRun(parts, g, o = {}) {
  const live = () => g === VO.gen && (o.ignoreOn || VO.on);
  const tag = o.tag || "vorlesen";
  const chars = parts.reduce((n, p) => n + p.length, 0);
  try {
    if (o.clear && (speechSynthesis.speaking || speechSynthesis.pending)) {
      voLog("warteschlange-geleert", ttsFlags());
      speechSynthesis.cancel();
      VO.cancelAt = vNow();
    }
    speechSynthesis.paused && speechSynthesis.resume && speechSynthesis.resume();
  } catch {}
  const v = pickVoice(VO.vcfg.voice);
  let started = false,
    ended = 0;
  const t0 = vNow();
  const us = parts.map((p) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = "de-DE";
    if (v) u.voice = v;
    u.rate = Number(VO.vcfg.rate) || 1;
    u.onstart = () => {
      if (!started) (started = true), voLog(tag + "-start", "nach " + Math.round(vNow() - t0) + " ms");
    };
    u.onend = () => ended++;
    u.onerror = (e) => (ended++, voLog(tag + "-fehler", (e && e.error) || "unbekannt"));
    return u;
  });
  VO.utts = VO.utts.concat(us).slice(-60); // halten, bis gesprochen (sonst gehen iOS-Ereignisse verloren)
  voLog(tag + "-satz", parts.length + " Sätze, " + chars + " Zeichen, " + ttsFlags());
  try {
    for (const u of us) speechSynthesis.speak(u);
  } catch {
    voLog(tag + "-fehler", "speak");
    return Promise.resolve("fehler");
  }
  return (async () => {
    const startMs = o.startMs || VO_T.ttsStart;
    while (!started) {
      if (!live()) return "abbruch";
      if (ended >= us.length) break; // sehr kurz: Ende ohne Start-Ereignis
      if (o.trustSpeaking && vNow() - t0 > 400 && speechSynthesis.speaking && !speechSynthesis.paused) {
        started = true;
        voLog(tag + "-start", "läuft (ohne Ereignis)");
        break;
      }
      if (vNow() - t0 > startMs) {
        voLog(tag + "-startet-nicht", ttsFlags());
        return "startet-nicht";
      }
      await sleep(100);
    }
    const maxDur = startMs + VO_T.ttsBase + chars * VO_T.ttsPerChar;
    let quiet = null;
    for (;;) {
      if (!live()) return "abbruch";
      if (ended >= us.length) {
        voLog(tag + "-ende", Math.round(vNow() - t0) + " ms");
        return "ok";
      }
      if (!speechSynthesis.speaking && !speechSynthesis.pending) {
        quiet = quiet || vNow();
        if (vNow() - quiet > 600) {
          voLog(tag + "-ende", "ohne Ereignis, " + Math.round(vNow() - t0) + " ms");
          return "ok";
        }
      } else quiet = null;
      if (vNow() - t0 > maxDur) {
        voLog(tag + "-ende", "Zeitgrenze – Ende nicht gemeldet, " + ttsFlags());
        return "kein-ende";
      }
      await sleep(150);
    }
  })();
}
/* Automatisch vorlesen (Sprachmodus). Vorher: Aufnahme/Erkennung aus, Umschaltpause, hängende Warteschlange leeren.
   Startet die Ausgabe nicht: ein zweiter Versuch; danach „🔊 Antwort vorlesen“ (Tippen) und weiter zuhören –
   keine wiederholten stummen Versuche, keine langen Wartezeiten. */
async function speak(text, g = VO.gen, o = {}) {
  if (!VO.on || g !== VO.gen) return;
  setState("spricht");
  const wait = Math.max(VO_T.gap - (vNow() - VO.srStopAt), 300 - (vNow() - VO.cancelAt), 0);
  if (wait > 0) await sleep(wait);
  if (!VO.on || g !== VO.gen) return;
  try {
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      voLog("warteschlange-blockiert", ttsFlags());
      speechSynthesis.cancel();
      VO.cancelAt = vNow();
      await sleep(350); // iOS: direkt nach cancel() gesprochene Sätze bekommen keine Ereignisse
      if (!VO.on || g !== VO.gen) return;
    }
  } catch {}
  const parts = splitSpeech(text, o.full ? 4000 : VO_T.speakMax);
  const barge = VO.vcfg.barge && VO.mode === "geraet" ? bargeListen(g) : null;
  let r = await ttsRun(parts, g, { startMs: VO.needTap ? 1500 : VO_T.ttsStart });
  if (r === "startet-nicht" && !VO.needTap && VO.on && g === VO.gen) {
    try {
      speechSynthesis.cancel();
    } catch {}
    VO.cancelAt = vNow();
    await sleep(350);
    if (VO.on && g === VO.gen) r = await ttsRun(parts, g, {});
  }
  if (r === "startet-nicht") {
    try {
      speechSynthesis.cancel(); // keine stummen Sätze in der Warteschlange lassen
    } catch {}
    VO.cancelAt = vNow();
    VO.needTap = VO.ttsBroken = true;
    VO.tapText = text;
    VO.hint = "Vorlesen reagiert gerade nicht automatisch – tippe auf „🔊 Antwort vorlesen“.";
    voLog("tippen nötig", "automatisches Vorlesen nicht erlaubt");
    if (g === VO.gen) voiceBar();
  } else if (r === "ok" || r === "kein-ende") {
    VO.needTap = VO.ttsBroken = false;
    VO.tapText = "";
    VO.hint = "";
  }
  if (barge) barge();
}
/* Experimentell: während des Vorlesens zuhören; ab zwei erkannten Wörtern wird die Antwort abgebrochen.
   Risiko: Die eigene Stimme des Geräts kann erkannt werden (Echo) – deshalb standardmäßig aus. */
function bargeListen(g) {
  const R = SRC();
  let rec;
  try {
    rec = new R();
    rec.lang = "de-DE";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim();
      if (t.split(/\s+/).length >= 2 && VO.state === "spricht" && g === VO.gen) {
        try {
          rec.abort();
        } catch {}
        voiceInterrupt();
      }
    };
    rec.start();
  } catch {
    return null;
  }
  return () => {
    try {
      rec.abort();
    } catch {}
  };
}

/* ---------- Zuhören über die KI-Gegenstelle: Aufnahme + Pausenerkennung + Whisper ----------
   Mikrofon wird je Frage geöffnet und vor dem Nachdenken/Vorlesen wieder freigegeben (iOS: Sprachausgabe sonst stumm).
   Aufnahme höchstens VO_T.recMax; ohne nutzbare Pegelmessung beendet „Fertig gesprochen“ oder die Höchstdauer die
   Aufnahme. Erkennung mit Zeitgrenze; Fehler begrenzt wiederholt; leere Ergebnisse/Fehlerkennungen werden verworfen. */
async function serverListen(o = {}) {
  const g = ++VO.gen;
  VO.buf = VO.interim = "";
  setState("hoert");
  try {
    if (!VO.stream || !VO.stream.getTracks().some((t) => t.readyState !== "ended")) {
      VO.stream = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }), VO_T.mic, "Mikrofon antwortet nicht");
      voLog("mikrofon", "an");
    }
  } catch (e) {
    voLog("mikrofon", (e && e.timeout) || "verweigert");
    if (g === VO.gen) voiceStop(e && e.timeout ? "Mikrofon antwortet nicht" : "Mikrofon nicht erlaubt", e && e.timeout ? "Das Mikrofon hat nicht rechtzeitig reagiert. Bitte die App einmal schließen und neu öffnen." : "Bitte in den iOS-Einstellungen das Mikrofon für die App erlauben.");
    return;
  }
  if (g !== VO.gen || !VO.on) return releaseMic();
  // Pegelmessung über einen gemeinsamen Audio-Kontext je Sitzung (nicht je Satz – iOS begrenzt die Anzahl)
  let an = null,
    src = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!VO.actx && AC) VO.actx = new AC();
    if (VO.actx && VO.actx.state === "suspended" && VO.actx.resume) await withTimeout(VO.actx.resume(), 1500).catch(() => {});
    if (VO.actx && VO.actx.state === "running") {
      an = VO.actx.createAnalyser();
      src = VO.actx.createMediaStreamSource(VO.stream);
      src.connect(an);
    }
  } catch {
    an = null;
  }
  if (g !== VO.gen || !VO.on) return;
  let recd;
  try {
    recd = new MediaRecorder(VO.stream);
  } catch {
    return voiceStop("Aufnahme wird von diesem Gerät nicht unterstützt");
  }
  const chunks = [];
  recd.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  const buf = an ? new Uint8Array(an.fftSize) : null;
  const t0 = vNow();
  let spoke = false,
    lastVoice = t0,
    floor = 0,
    iv = null,
    ended = false;
  const finish = (send) => {
    if (ended) return;
    ended = true;
    clearInterval(iv);
    try {
      src && src.disconnect();
    } catch {}
    if (VO.rec2 && VO.rec2.recd === recd) VO.rec2 = null;
    recd.onstop = () => {
      if (g !== VO.gen || !VO.on) return;
      if (send) sendAudio(g, chunks, recd.mimeType);
      else listen({}); // nichts gesprochen: weiter zuhören (Stille-Grenze läuft weiter)
    };
    try {
      recd.stop();
    } catch {
      recd.onstop();
    }
  };
  VO.rec2 = { recd, finish };
  try {
    recd.start(); // ohne Zeitscheiben: eine vollständige Datei beim Stoppen (Safari-Zeitscheiben waren unzuverlässig)
  } catch {
    VO.rec2 = null;
    return voiceStop("Aufnahme konnte nicht starten");
  }
  voiceBar(); // „Fertig gesprochen“ anzeigen
  iv = setInterval(() => {
    if (g !== VO.gen || !VO.on) return finish(false);
    const el = vNow() - t0;
    if (an) {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += (buf[i] - 128) * (buf[i] - 128);
      const rms = Math.sqrt(sum / buf.length);
      if (el < 400) floor = Math.max(floor, rms); // Grundrauschen der ersten Zehntelsekunden
      else if (rms > Math.max(6, floor * 1.5 + 4)) (spoke = true), (lastVoice = vNow());
    }
    if (spoke && vNow() - lastVoice > VO_T.silence) return finish(true);
    if (el > VO_T.recMax) return finish(spoke || !an); // Höchstdauer; ohne Pegelmessung trotzdem erkennen lassen
  }, 100);
}
/* typische Fehlerkennungen von Whisper bei Stille/Geräuschen (keine Frage des Gründers) */
const STT_JUNK = /^(vielen dank( für(s| das| ihre) (zuschauen|zusehen|aufmerksamkeit))?|danke( schön| sehr)?|tschüss|bis zum nächsten mal|(untertitel|copyright|amara\.org|swr|zdf|ard|wdr|ndr)\b.*|musik|\[.*\]|\(.*\)|\.+|…)[.!]?$/i;
async function sendAudio(g, chunks, type) {
  const blob = new Blob(chunks, { type: type || "audio/mp4" });
  if (blob.size < 800) return sttMiss(g, "");
  if (blob.size > 1.8e6) return sttMiss(g, "Aufnahme zu lang – bitte kürzer sprechen");
  setState("denkt");
  releaseMic(); // während der Erkennung nicht aufnehmen
  try {
    const b64 = await withTimeout(
      new Promise((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(",")[1] || "");
        r.onerror = () => no(new Error("Aufnahme nicht lesbar"));
        r.readAsDataURL(blob);
      }),
      10000,
    );
    if (g !== VO.gen || !VO.on) return;
    const t0 = vNow();
    const j = await kiCall("/v1/ki/stt", { audio: b64, type: blob.type }, VO_T.stt);
    if (g !== VO.gen || !VO.on) return;
    const t = String(j.text || "").trim();
    voLog("whisper", Math.round(vNow() - t0) + " ms, " + t.length + " Zeichen");
    VO.sttFails = 0;
    if (!t || STT_JUNK.test(t) || t.replace(/[^\p{L}]/gu, "").length < 2) return sttMiss(g, "");
    VO.sttEmpty = 0;
    return voiceTurn(t);
  } catch (e) {
    if (g !== VO.gen || !VO.on) return;
    voLog("whisper", "Fehler: " + ((e && e.message) || "").slice(0, 60));
    if (++VO.sttFails >= VO_T.sttFails) return voiceStop("Spracherkennung über den Server gestört", (e.message || "Fehler") + " – bitte später erneut starten. Die Unterhaltung bleibt im Chat erhalten.");
    VO.hint = (e.message || "Spracherkennung gestört") + " – bitte noch einmal sprechen.";
    listen({ fresh: true, delay: 1000 * VO.sttFails });
  }
}
function sttMiss(g, msg) {
  if (g !== VO.gen || !VO.on) return;
  // Geräusche ohne verständliche Sprache: verwerfen und weiter zuhören; die Stille-Grenze läuft weiter.
  // Sicherheitsgrenze gegen Dauergeräusche (Kosten der Server-Erkennung):
  if (++VO.sttEmpty >= VO_T.sttEmpty) return voiceStop("zu viele Geräusche ohne verständliche Sprache", "Zur Sicherheit beendet (jede Aufnahme nutzt das kostenlose KI-Kontingent). Bitte in ruhigerer Umgebung neu starten.");
  if (msg) VO.hint = msg;
  listen({ delay: 300 });
}
function releaseMic() {
  if (VO.stream) {
    for (const t of VO.stream.getTracks()) t.stop(); // Mikrofon wirklich freigeben
    voLog("mikrofon", "aus");
  }
  VO.stream = null;
}
function closeCtx() {
  try {
    VO.actx && VO.actx.close && VO.actx.close().catch(() => {});
  } catch {}
  VO.actx = null;
}
function serverStop() {
  if (VO.rec2) {
    const r = VO.rec2;
    VO.rec2 = null;
    try {
      r.recd.onstop = null;
      r.recd.stop();
    } catch {}
  }
  releaseMic();
  closeCtx();
}
/* Diktiermodus: geschriebene (diktierte) Nachrichten werden beantwortet und vorgelesen */
async function voiceAfterText(m) {
  if (VO.on && VO.mode === "diktat" && m) {
    await speak(speechText((m.blocks || [{ k: "ki", t: m.text }]).concat(actionBlocks(m.actions))));
    if (VO.on) setState("diktat");
  }
}
