// Minimaler statischer Server nur für die automatischen Tests (liefert die App-Dateien aus dem Projektordner).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { handleVault } from "../server/vault-core.mjs";

const repo = resolve(new URL("..", import.meta.url).pathname);
const root = process.env.ROOT ? resolve(repo, process.env.ROOT) : repo; // ROOT=dist-test für die Testversion
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2" };
const allowed = /^\/(index\.html|sw\.js|manifest\.webmanifest|icon-\d+\.png|js\/[a-z-]+\.js|brand\/[a-z0-9-]+\.(png|woff2))?$/;

// Nur für Tests: Tresor-Server (gleiche Logik wie der spätere Cloudflare Worker) und eine simulierte Verwaltung.
const vault = new Map();
const vstore = { get: async (id) => vault.get(id) || null, put: async (id, o) => void vault.set(id, o) };
const readBody = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); });
const KPI_TOKEN = "t".repeat(40);
const kpiBody = (variant) => {
  const base = { format: "vivalink-kpis", version: 1, generatedAt: "2026-03-10T06:00:00Z", meta: { excludesTestAccounts: true, excludesDemoMeetups: true }, values: [{ key: "reg_total", date: "2026-03-09", value: 321, source: "supabase" }, { key: "active_users", date: "2026-03-09", value: 88 }, { key: "invite_rate", date: "2026-03-09", value: 41.5 }, { key: "zukunft", date: "2026-03-09", value: 1 }] };
  if (variant === "pii") base.values.push({ key: "signups", date: "2026-03-09", value: 3, email: "person@example.invalid" });
  if (variant === "extra") base.users = [{ id: 1 }];
  return base;
};

http
  .createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.startsWith("/v1/vault/")) {
      const r = await handleVault({ method: req.method, path, auth: req.headers.authorization, body: req.method === "PUT" ? await readBody(req) : null }, vstore);
      res.writeHead(r.status, r.headers).end(r.body);
      return;
    }
    if (path === "/__vault-dump") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify([...vault.values()]));
    if (path.startsWith("/kpi/")) {
      if (path.endsWith("/pair") && req.method === "POST") {
        const b = JSON.parse((await readBody(req)) || "{}");
        return b.code === "123456" ? res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ token: KPI_TOKEN })) : res.writeHead(401).end();
      }
      if (path.startsWith("/kpi/") && path.endsWith("/kpis")) {
        if (req.headers.authorization !== "Bearer " + KPI_TOKEN) return res.writeHead(401).end();
        return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(kpiBody(path.split("/")[2])));
      }
    }
    if (!allowed.test(path)) {
      res.writeHead(404).end("not found");
      return;
    }
    const file = normalize(join(root, path === "/" ? "index.html" : path));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
      // Testvorlagen (z. B. Version 1) liegen als .txt im Repository, damit GitHub Pages sie nicht als App ausliefert.
      const body = await readFile(file).catch(() => readFile(file + ".txt"));
      res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(port, "127.0.0.1", () => console.log("Testserver auf http://127.0.0.1:" + port));
