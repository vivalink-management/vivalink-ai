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
   nach 60 Sekunden ohne Eingabe oder mit „Beenden“. Riskante Aufträge werden nie per Sprache bestätigt. */
const VO = { on: false, mode: "", state: "aus", rec: null, buf: "", interim: "", silenceT: null, idleT: null, errors: 0, chat: null, rec2: null, stream: null };
const SRC = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
const VO_SILENCE = 1300,
  VO_IDLE = 60000;
async function voiceCfg() {
  return { voice: "", rate: 1, barge: false, ...((await kvGet("voice-config")) || {}) };
}
async function voiceMode() {
  if (SRC()) return "geraet";
  if (typeof kiReady === "function" && (await kiReady()) && navigator.mediaDevices && window.MediaRecorder) return "server";
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

/* ---------- Anzeige (außerhalb von #app, bleibt beim Neuzeichnen erhalten) ---------- */
const VO_TXT = { hoert: "Mikrofon an – ich höre zu", denkt: "Mikrofon aus – denke nach", spricht: "Mikrofon aus – ich spreche", diktat: "Diktiermodus – Tastatur-Diktat, Antworten werden vorgelesen (kein Sprachmodus)", start: "Starte …" };
function voiceBar() {
  let el = document.getElementById("voicebar");
  document.body.classList.toggle("vb-on", VO.on && VO.mode !== "diktat");
  if (!VO.on) return el && el.remove();
  if (!el) {
    el = document.createElement("div");
    el.id = "voicebar";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.className = "voicebar vb-" + VO.state;
  el.innerHTML = `<div class="vb-t"><span class="vb-dot"></span><b>Sprachmodus aktiv</b> · ${esc(VO_TXT[VO.state] || VO.state)}${VO.mode === "server" ? " (Server-Erkennung)" : ""}</div>${VO.interim ? `<div class="vb-i">„${esc(VO.interim.slice(-140))}“</div>` : ""}<div class="row">${VO.state === "spricht" ? '<button class="p" data-a="voiceInterrupt">Unterbrechen</button>' : ""}<button data-a="voiceStop">Beenden</button></div>`;
}
function setState(s) {
  VO.state = s;
  voiceBar();
}

/* ---------- Start / Ende ---------- */
async function voiceStart() {
  if (VO.on) return;
  if (!("speechSynthesis" in window)) return toast("Sprachausgabe wird von diesem Gerät nicht unterstützt");
  // Sprachausgabe im Rahmen des Tippens freischalten (iOS verlangt eine Bedienung)
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {}
  tab = "ai";
  kiTab = "chat";
  let c = chatOpen && chatById(chatOpen);
  if (!c) {
    c = newChat("Sprachgespräch " + new Date().toLocaleDateString("de-DE"));
    chatOpen = c.id;
    await save();
  }
  VO.chat = c.id;
  VO.mode = await voiceMode();
  VO.on = true;
  VO.errors = 0;
  logAction("voice.start", "gruender", true, VO.mode);
  render();
  if (VO.mode === "diktat") {
    setState("diktat");
    setTimeout(() => $("#chatIn") && $("#chatIn").focus(), 50);
    return;
  }
  listen();
}
function voiceStop(reason = "beendet") {
  if (!VO.on) return;
  VO.on = false;
  clearTimeout(VO.silenceT);
  clearTimeout(VO.idleT);
  try {
    VO.rec && VO.rec.abort();
  } catch {}
  VO.rec = null;
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
  try {
    speechSynthesis.cancel();
  } catch {}
  listen();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && VO.on) voiceStop("App im Hintergrund");
});

/* ---------- Zuhören (Gerät) ---------- */
function armIdle() {
  clearTimeout(VO.idleT);
  VO.idleT = setTimeout(() => VO.on && VO.state === "hoert" && voiceStop("keine Eingabe"), VO_IDLE);
}
function listen() {
  if (!VO.on) return;
  if (VO.mode === "server") return serverListen();
  VO.buf = VO.interim = "";
  setState("hoert");
  armIdle();
  const R = SRC();
  let rec;
  try {
    rec = new R();
  } catch {
    return voiceStop("Spracherkennung nicht verfügbar");
  }
  VO.rec = rec;
  rec.lang = "de-DE";
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = (e) => {
    if (VO.rec !== rec) return;
    let fin = "",
      tmp = "";
    for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript + " ") : (tmp += e.results[i][0].transcript + " "));
    VO.buf = fin.trim();
    VO.interim = (fin + tmp).trim();
    armIdle();
    voiceBar();
    clearTimeout(VO.silenceT);
    VO.silenceT = setTimeout(() => finalize(rec), VO_SILENCE); // Sprechpause = fertig gesprochen
  };
  rec.onerror = (e) => {
    if (VO.rec !== rec) return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") return voiceStop("Mikrofon nicht erlaubt");
    if (e.error === "no-speech" || e.error === "aborted") return;
    if (++VO.errors >= 3) voiceStop("Spracherkennung gestört (" + e.error + ")");
  };
  rec.onend = () => {
    if (VO.rec !== rec || !VO.on || VO.state !== "hoert") return;
    if (VO.interim) return finalize(rec); // iOS beendet nach Pausen selbst
    setTimeout(() => VO.on && VO.state === "hoert" && VO.rec === rec && listen(), 250); // weiter zuhören
  };
  try {
    rec.start();
  } catch {
    voiceStop("Spracherkennung konnte nicht starten");
  }
}
async function finalize(rec) {
  if (VO.rec !== rec || VO.state !== "hoert") return;
  clearTimeout(VO.silenceT);
  const text = (VO.interim || VO.buf).trim();
  if (!text) return;
  VO.rec = null;
  try {
    rec.abort();
  } catch {}
  await voiceTurn(text);
}
/* Eine Runde: gesprochenen Text in den Chat → Antwort → vorlesen → wieder zuhören */
async function voiceTurn(text) {
  setState("denkt");
  VO.interim = "";
  const m = await chatSend(text, "voice", VO.chat);
  if (!VO.on) return;
  if (!m) return listen();
  await speak(speechText((m.blocks || [{ k: "ki", t: m.text }]).concat(actionBlocks(m.actions))));
  if (VO.on && VO.state === "spricht") listen();
}
/* Vorlesen in Sätzen (stabiler auf iOS); Unterbrechen bricht die Warteschlange ab */
async function speak(text) {
  if (!VO.on) return;
  setState("spricht");
  const cfg = await voiceCfg();
  const v = pickVoice(cfg.voice);
  const parts = (text.match(/[^.!?\n]+[.!?]?/g) || [text]).map((s) => s.trim()).filter(Boolean);
  let barge = null;
  if (cfg.barge && VO.mode === "geraet") barge = bargeListen();
  for (const p of parts) {
    if (!VO.on || VO.state !== "spricht") break;
    await new Promise((ok) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = "de-DE";
      if (v) u.voice = v;
      u.rate = Number(cfg.rate) || 1;
      u.onend = u.onerror = () => ok();
      speechSynthesis.speak(u);
      setTimeout(ok, 20000 + p.length * 120); // Schutz, falls iOS kein Ende meldet
    });
  }
  if (barge) barge();
}
/* Experimentell: während des Vorlesens zuhören; ab zwei erkannten Wörtern wird die Antwort abgebrochen.
   Risiko: Die eigene Stimme des Geräts kann erkannt werden (Echo) – deshalb standardmäßig aus. */
function bargeListen() {
  const R = SRC();
  let rec;
  try {
    rec = new R();
    rec.lang = "de-DE";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim();
      if (t.split(/\s+/).length >= 2 && VO.state === "spricht") {
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

/* ---------- Zuhören über die KI-Gegenstelle (nur wenn bereitgestellt): Aufnahme + Pausenerkennung + Whisper ---------- */
async function serverListen() {
  VO.buf = VO.interim = "";
  setState("hoert");
  armIdle();
  try {
    VO.stream = VO.stream || (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }));
  } catch {
    return voiceStop("Mikrofon nicht erlaubt");
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const an = ctx.createAnalyser();
  ctx.createMediaStreamSource(VO.stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  const recd = new MediaRecorder(VO.stream);
  const chunks = [];
  recd.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  let spoke = false,
    lastVoice = Date.now();
  VO.rec2 = { recd, ctx };
  recd.start(250);
  const tick = () => {
    if (!VO.on || VO.rec2 === null || VO.rec2.recd !== recd) return;
    an.getByteTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((s, x) => s + (x - 128) * (x - 128), 0) / buf.length);
    if (rms > 6) (spoke = true), (lastVoice = Date.now()), armIdle();
    if (spoke && Date.now() - lastVoice > VO_SILENCE) {
      recd.onstop = async () => {
        ctx.close();
        const blob = new Blob(chunks, { type: recd.mimeType || "audio/mp4" });
        if (blob.size > 1.8e6) return VO.on && listen();
        const b64 = await new Promise((ok) => {
          const r = new FileReader();
          r.onload = () => ok(String(r.result).split(",")[1] || "");
          r.readAsDataURL(blob);
        });
        setState("denkt");
        try {
          const j = await kiCall("/v1/ki/stt", { audio: b64, type: blob.type });
          const t = String(j.text || "").trim();
          if (t && VO.on) return voiceTurn(t);
        } catch (e) {
          toast(e.message);
        }
        if (VO.on) listen();
      };
      VO.rec2 = null;
      recd.stop();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function serverStop() {
  if (VO.rec2) {
    try {
      VO.rec2.recd.onstop = null;
      VO.rec2.recd.stop();
      VO.rec2.ctx.close();
    } catch {}
    VO.rec2 = null;
  }
  if (VO.stream) for (const t of VO.stream.getTracks()) t.stop(); // Mikrofon wirklich freigeben
  VO.stream = null;
}
/* Diktiermodus: geschriebene (diktierte) Nachrichten werden beantwortet und vorgelesen */
async function voiceAfterText(m) {
  if (VO.on && VO.mode === "diktat" && m) {
    await speak(speechText((m.blocks || [{ k: "ki", t: m.text }]).concat(actionBlocks(m.actions))));
    if (VO.on) setState("diktat");
  }
}
