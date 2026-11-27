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
   nach 60 Sekunden ohne Eingabe oder mit „Beenden“. Riskante Aufträge werden nie per Sprache bestätigt.
   Robustheit (ab 2.11.1, nach einem Hänger auf dem iPad):
   - Jede Phase (zuhören, nachdenken, vorlesen) hat eine Zeitgrenze; danach ist die App wieder normal bedienbar.
   - Spracherkennung, die sofort wieder endet oder Fehler meldet, wird höchstens VO_T.fails-mal mit wachsender Pause neu
     gestartet – nie endlos. Danach einmal Wechsel zur Server-Erkennung (falls freigegeben), sonst Ende mit Hinweis.
   - Fehlgeschlagene oder leere Server-Erkennung wird begrenzt wiederholt (VO_T.sttFails / VO_T.sttEmpty).
   - Die Anzeige wird nur aktualisiert, nicht neu aufgebaut: „Beenden“ bleibt dasselbe Element und ist jederzeit tippbar.
   - Alle Abläufe tragen eine Sitzungsnummer; nach „Beenden“ wirkt kein alter Rückruf mehr.
   - In der installierten App unter iOS/iPadOS wird bei freigegebener KI die Server-Erkennung bevorzugt (Safaris
     Spracherkennung ist dort laut WebKit-Berichten nicht oder nur unzuverlässig verfügbar). */
const VO = { on: false, mode: "", state: "aus", gen: 0, rec: null, buf: "", interim: "", silenceT: null, idleT: null, retryT: null, fails: 0, sttFails: 0, sttEmpty: 0, busyTurns: 0, switched: false, chat: null, rec2: null, stream: null, actx: null, lastErr: "" };
const SRC = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
/* Zeitgrenzen und Wiederholungsgrenzen (Millisekunden bzw. Anzahl; in Tests verkürzbar) */
const VO_T = { silence: 1300, idle: 60000, think: 75000, recMax: 30000, stt: 30000, mic: 15000, ttsBase: 8000, ttsPerChar: 90, fails: 3, sttFails: 2, sttEmpty: 3, quickEnd: 1500, gap: 350 };
const vNow = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()); // unabhängig von Uhrumstellungen
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
async function voiceCfg() {
  return { voice: "", rate: 1, barge: false, ...((await kvGet("voice-config")) || {}) };
}
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
    el.innerHTML = `<div class="vb-t"><span class="vb-dot"></span><b>Sprachmodus aktiv</b> · <span class="vb-s" aria-live="polite"></span></div><div class="vb-i" hidden></div><div class="row"><button class="p" data-a="voiceInterrupt" hidden>Unterbrechen</button><button class="p" data-a="voiceDone" hidden>Fertig gesprochen</button><button data-a="voiceStop">Beenden</button></div>`;
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
  el.querySelector('[data-a="voiceInterrupt"]').hidden = VO.state !== "spricht";
  el.querySelector('[data-a="voiceDone"]').hidden = !(VO.state === "hoert" && (VO.mode === "server" || VO.interim));
}
function setState(s) {
  VO.state = s;
  voiceBar();
}
function clearVoTimers() {
  clearTimeout(VO.silenceT);
  clearTimeout(VO.idleT);
  clearTimeout(VO.retryT);
  VO.silenceT = VO.idleT = VO.retryT = null;
}

/* ---------- Start / Ende ---------- */
async function voiceStart() {
  if (VO.on) return;
  if (!("speechSynthesis" in window)) return toast("Sprachausgabe wird von diesem Gerät nicht unterstützt");
  // Im Rahmen des Tippens freischalten (iOS verlangt eine Bedienung): Sprachausgabe und – für die Server-Erkennung –
  // die Audioverarbeitung. Beides VOR dem ersten „await“, sonst gilt es nicht mehr als Bedienung.
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {}
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
  VO.state = "start";
  VO.fails = VO.sttFails = VO.sttEmpty = VO.busyTurns = 0;
  VO.switched = false;
  tab = "ai";
  kiTab = "chat";
  const g = VO.gen;
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
  render();
  if (VO.mode === "diktat") {
    setState("diktat");
    setTimeout(() => $("#chatIn") && $("#chatIn").focus(), 50);
    return;
  }
  listen({ fresh: true });
}
function voiceStop(reason = "beendet") {
  if (!VO.on) return;
  VO.on = false;
  VO.gen++; // alle laufenden Rückrufe dieser Sitzung wirkungslos
  clearVoTimers();
  stopRecognizer();
  try {
    speechSynthesis.cancel();
  } catch {}
  serverStop();
  VO.interim = VO.buf = "";
  VO.state = "aus";
  voiceBar();
  logAction("voice.stop", "gruender", true, reason);
  if (reason !== "beendet") toast("Sprachmodus beendet: " + reason);
}
function voiceInterrupt() {
  if (!VO.on) return;
  VO.gen++; // beendet das Vorlesen
  try {
    speechSynthesis.cancel();
  } catch {}
  listen({ fresh: true, delay: VO_T.gap });
}
/* „Fertig gesprochen“: Satz sofort senden (Gerät) bzw. Aufnahme sofort beenden und erkennen lassen (Server) */
function voiceDone() {
  if (!VO.on || VO.state !== "hoert") return;
  if (VO.mode === "server") return VO.rec2 && VO.rec2.finish(true);
  if (VO.interim) finalize(VO.gen);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && VO.on) voiceStop("App im Hintergrund");
});
window.addEventListener("pagehide", () => VO.on && voiceStop("App im Hintergrund"));

/* ---------- Zuhören (Gerät) ---------- */
function armIdle() {
  clearTimeout(VO.idleT);
  VO.idleT = setTimeout(() => VO.on && VO.state === "hoert" && voiceStop("keine Eingabe"), VO_T.idle);
}
function stopRecognizer() {
  const r = VO.rec;
  VO.rec = null;
  if (r) {
    r.onresult = r.onerror = r.onend = null;
    try {
      r.abort();
    } catch {}
  }
}
/* listen({fresh}) – fresh: neue Zuhörphase (Stille-Zeitgrenze beginnt neu). Ohne fresh: automatischer Neustart der
   Erkennung innerhalb derselben Phase; die Stille-Zeitgrenze läuft weiter (sonst würde sie nie ablaufen). */
function listen(o = {}) {
  if (!VO.on) return;
  clearTimeout(VO.retryT);
  if (o.delay) {
    const g = VO.gen;
    VO.retryT = setTimeout(() => g === VO.gen && listen({ ...o, delay: 0 }), o.delay);
    return;
  }
  if (VO.mode === "server") return serverListen(o);
  const g = ++VO.gen;
  stopRecognizer();
  VO.buf = VO.interim = "";
  VO.lastErr = "";
  setState("hoert");
  if (o.fresh || !VO.idleT) armIdle();
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
    if (VO.interim) (got = true), (VO.fails = 0);
    armIdle();
    voiceBar();
    clearTimeout(VO.silenceT);
    VO.silenceT = setTimeout(() => finalize(g), VO_T.silence); // Sprechpause = fertig gesprochen
  };
  rec.onerror = (e) => {
    if (g !== VO.gen) return;
    if (e.error === "not-allowed") return voiceStop("Mikrofon nicht erlaubt");
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
  if (!VO.switched && VO.mode === "geraet" && (await serverPossible().catch(() => false))) {
    if (g !== VO.gen || !VO.on) return;
    VO.switched = true;
    VO.mode = "server";
    VO.fails = 0;
    toast(why + " – wechsle zur Erkennung über den Server");
    logAction("voice.mode", "app", true, "server");
    return listen({ fresh: true });
  }
  if (g === VO.gen) voiceStop(why + " – bitte das Diktat der Tastatur verwenden");
}
function finalize(g) {
  if (g !== VO.gen || VO.state !== "hoert") return;
  clearTimeout(VO.silenceT);
  const text = (VO.interim || VO.buf).trim();
  if (!text) return;
  stopRecognizer();
  voiceTurn(text);
}
/* Eine Runde: gesprochenen Text in den Chat → Antwort → vorlesen → wieder zuhören. Jeder Schritt mit Zeitgrenze. */
async function voiceTurn(text) {
  const g = ++VO.gen;
  clearVoTimers();
  VO.interim = "";
  setState("denkt");
  let m = null;
  try {
    m = await withTimeout(chatSend(text, "voice", VO.chat), VO_T.think, "Zeitüberschreitung bei der Antwort");
  } catch (e) {
    if (g === VO.gen && VO.on) voiceStop(e && e.timeout ? "Antwort dauert zu lange – sie erscheint im Chat, sobald sie da ist" : "Fehler bei der Antwort");
    return;
  }
  if (g !== VO.gen || !VO.on) return;
  if (!m) {
    // eine andere Antwort läuft noch (z. B. geschriebene Nachricht) – kurz warten, begrenzt
    if (++VO.busyTurns >= 3) return voiceStop("Assistent ist beschäftigt");
    toast("Einen Moment – die vorige Antwort läuft noch");
    return listen({ fresh: true, delay: 1500 });
  }
  VO.busyTurns = 0;
  await speak(speechText((m.blocks || [{ k: "ki", t: m.text }]).concat(actionBlocks(m.actions))), g);
  if (g === VO.gen && VO.on) listen({ fresh: true, delay: VO_T.gap }); // kurze Pause: iOS schaltet zwischen Wiedergabe und Aufnahme um
}
/* Vorlesen in Sätzen (stabiler auf iOS). Jeder Satz mit Zeitgrenze (iOS meldet das Ende nicht immer); reagiert die
   Sprachausgabe zweimal nicht, wird das Vorlesen abgebrochen – die Antwort steht im Chat. */
async function speak(text, g = VO.gen) {
  if (!VO.on || g !== VO.gen) return;
  setState("spricht");
  const cfg = await voiceCfg().catch(() => ({ rate: 1 }));
  const v = pickVoice(cfg.voice);
  const parts = (text.match(/[^.!?\n]+[.!?]?/g) || [text]).map((s) => s.trim()).filter(Boolean);
  let barge = null,
    stuck = 0;
  if (cfg.barge && VO.mode === "geraet") barge = bargeListen(g);
  for (const p of parts) {
    if (!VO.on || g !== VO.gen) break;
    const ok = await new Promise((res) => {
      let done = false,
        t = null;
      const fin = (x) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        res(x);
      };
      try {
        const u = new SpeechSynthesisUtterance(p);
        u.lang = "de-DE";
        if (v) u.voice = v;
        u.rate = Number(cfg.rate) || 1;
        u.onend = () => fin(true);
        u.onerror = () => fin(true);
        speechSynthesis.speak(u);
      } catch {
        return fin(false);
      }
      t = setTimeout(() => fin(false), VO_T.ttsBase + p.length * VO_T.ttsPerChar);
    });
    if (!ok && ++stuck >= 2) {
      try {
        speechSynthesis.cancel();
      } catch {}
      if (g === VO.gen) toast("Vorlesen reagiert nicht – die Antwort steht im Chat");
      break;
    }
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
   Begrenzt: Aufnahme höchstens VO_T.recMax; ohne nutzbare Pegelmessung (iOS: Audio nicht freigegeben) beendet
   „Fertig gesprochen“ oder die Höchstdauer die Aufnahme. Erkennung mit Zeitgrenze, Fehler/leere Ergebnisse begrenzt. */
async function serverListen(o = {}) {
  const g = ++VO.gen;
  VO.buf = VO.interim = "";
  setState("hoert");
  if (o.fresh || !VO.idleT) armIdle();
  try {
    VO.stream = VO.stream || (await withTimeout(navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }), VO_T.mic, "Mikrofon antwortet nicht"));
  } catch (e) {
    if (g === VO.gen) voiceStop(e && e.timeout ? "Mikrofon antwortet nicht" : "Mikrofon nicht erlaubt");
    return;
  }
  if (g !== VO.gen || !VO.on) return;
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
      else listen({}); // nichts gesprochen: weiter zuhören (Stille-Zeitgrenze läuft weiter)
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
      else if (rms > Math.max(6, floor * 1.5 + 4)) (spoke = true), (lastVoice = vNow()), armIdle();
    }
    if (spoke && vNow() - lastVoice > VO_T.silence) return finish(true);
    if (el > VO_T.recMax) return finish(spoke || !an); // Höchstdauer; ohne Pegelmessung trotzdem erkennen lassen
  }, 100);
}
async function sendAudio(g, chunks, type) {
  const blob = new Blob(chunks, { type: type || "audio/mp4" });
  if (blob.size < 800) return sttMiss(g, "");
  if (blob.size > 1.8e6) return sttMiss(g, "Aufnahme zu lang – bitte kürzer sprechen");
  clearTimeout(VO.idleT);
  setState("denkt");
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
    const j = await kiCall("/v1/ki/stt", { audio: b64, type: blob.type }, VO_T.stt);
    if (g !== VO.gen || !VO.on) return;
    const t = String(j.text || "").trim();
    VO.sttFails = 0;
    if (!t) return sttMiss(g, "");
    VO.sttEmpty = 0;
    return voiceTurn(t);
  } catch (e) {
    if (g !== VO.gen || !VO.on) return;
    if (++VO.sttFails >= VO_T.sttFails) return voiceStop("Spracherkennung über den Server gestört (" + (e.message || "Fehler") + ")");
    toast((e.message || "Spracherkennung gestört") + " – bitte noch einmal sprechen");
    listen({ fresh: true, delay: 1000 });
  }
}
function sttMiss(g, msg) {
  if (g !== VO.gen || !VO.on) return;
  if (++VO.sttEmpty >= VO_T.sttEmpty) return voiceStop("nichts verstanden");
  if (msg) toast(msg);
  listen({ fresh: false, delay: 300 });
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
  if (VO.stream) for (const t of VO.stream.getTracks()) t.stop(); // Mikrofon wirklich freigeben
  VO.stream = null;
  closeCtx();
}
/* Diktiermodus: geschriebene (diktierte) Nachrichten werden beantwortet und vorgelesen */
async function voiceAfterText(m) {
  if (VO.on && VO.mode === "diktat" && m) {
    await speak(speechText((m.blocks || [{ k: "ki", t: m.text }]).concat(actionBlocks(m.actions))));
    if (VO.on) setState("diktat");
  }
}
