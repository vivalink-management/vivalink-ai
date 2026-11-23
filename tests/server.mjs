// Minimaler statischer Server nur für die automatischen Tests (liefert die App-Dateien aus dem Projektordner).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const repo = resolve(new URL("..", import.meta.url).pathname);
const root = process.env.ROOT ? resolve(repo, process.env.ROOT) : repo; // ROOT=dist-test für die Testversion
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const allowed = /^\/(index\.html|sw\.js|manifest\.webmanifest|icon-\d+\.png|js\/[a-z]+\.js)?$/;

http
  .createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!allowed.test(path)) {
      res.writeHead(404).end("not found");
      return;
    }
    const file = normalize(join(root, path === "/" ? "index.html" : path));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(port, "127.0.0.1", () => console.log("Testserver auf http://127.0.0.1:" + port));
