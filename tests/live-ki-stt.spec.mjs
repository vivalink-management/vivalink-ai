// LIVE (nur manuell, LIVE_STT=1): Spracherkennung über den bereitgestellten Worker „vivalink-ki“ (Whisper) mit
// KÜNSTLICH erzeugter Sprache (espeak-ng, ein fester Testsatz) in den Formaten, die iPhone/iPad aufnehmen (MP4/AAC,
// auch fragmentiert) sowie WebM/Opus. Vorübergehender Test-Zugang, danach gesperrt. Verbrauch: wenige Neurons.
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KI = "https://vivalink-ki.hidden-art-0326.workers.dev";
const SYNC = "https://vivalink-sync.hidden-art-0326.workers.dev";
const ORIGIN = "https://vivalink-management.github.io";
test.skip(!process.env.LIVE_STT, "nur mit LIVE_STT=1");
test.setTimeout(180_000);

test("Live: Whisper erkennt künstliche deutsche Sprache in den Aufnahmeformaten von iPhone/iPad", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stt-"));
  const wav = join(dir, "satz.wav");
  execFileSync("espeak-ng", ["-v", "de", "-s", "140", "-w", wav, "Welche Aufgaben sind diese Woche offen?"]);
  const formats = {
    "mp4-aac (iOS)": ["-c:a", "aac", "-b:a", "64k", "-ar", "48000", "-ac", "1", join(dir, "a.m4a")],
    "mp4-aac fragmentiert": ["-c:a", "aac", "-b:a", "64k", "-ar", "48000", "-ac", "1", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", join(dir, "b.mp4")],
    "webm-opus": ["-c:a", "libopus", "-b:a", "32k", join(dir, "c.webm")],
  };
  const vid = randomBytes(16).toString("hex"),
    tok = randomBytes(32).toString("hex");
  const h = { origin: ORIGIN, "content-type": "application/json", authorization: "Bearer " + tok };
  expect((await fetch(SYNC + "/v1/vault/" + vid, { method: "PUT", headers: h, body: JSON.stringify({ blob: randomBytes(48).toString("base64"), expected: 0 }) })).status).toBe(200);
  const out = {};
  try {
    for (const [name, args] of Object.entries(formats)) {
      const file = args.at(-1);
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", wav, ...args]);
      const audio = readFileSync(file).toString("base64");
      const t0 = Date.now();
      const r = await fetch(KI + "/v1/ki/stt", { method: "POST", headers: h, body: JSON.stringify({ vault: vid, audio, type: name.startsWith("webm") ? "audio/webm" : "audio/mp4" }) });
      const j = await r.json().catch(() => ({}));
      console.log("STT", name, "→", r.status, Date.now() - t0 + " ms", JSON.stringify(j));
      out[name] = { status: r.status, text: j.text || "" };
    }
  } finally {
    console.log("Test-Zugang gesperrt:", (await fetch(SYNC + "/v1/vault/" + vid, { method: "DELETE", headers: h })).status);
  }
  console.log("ERGEBNIS STT", JSON.stringify(out));
  expect(out["mp4-aac (iOS)"].status).toBe(200);
  expect(out["mp4-aac (iOS)"].text.toLowerCase()).toContain("aufgabe");
});
