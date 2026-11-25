var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// vault-core.mjs
var MAX_BLOB = 4 * 1024 * 1024;
var PAIR_TTL = 10 * 60;
var RL_MAX = 30;
var RL_WINDOW = 10 * 60;
var TASK_TTL = 21 * 24 * 3600;
var MAX_TASK = 512 * 1024;
var ID_RE = /^[0-9a-f]{32}$/;
var PUB_RE = /^[A-Za-z0-9+/=]{40,200}$/;
async function sha256hex(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(sha256hex, "sha256hex");
var json = /* @__PURE__ */ __name((status, body, extra = {}) => ({ status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra }, body: JSON.stringify(body) }), "json");
var parse = /* @__PURE__ */ __name((body) => {
  try {
    return typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return null;
  }
}, "parse");
async function limited(store, client, now) {
  if (!client) return false;
  const k = "rl:" + (await sha256hex("rl:" + client)).slice(0, 24);
  const r = await store.get(k);
  return !!(r && r.until > now && r.n >= RL_MAX);
}
__name(limited, "limited");
async function fail(store, client, now) {
  if (!client) return;
  const k = "rl:" + (await sha256hex("rl:" + client)).slice(0, 24);
  const r = await store.get(k);
  const cur = r && r.until > now ? r : { n: 0, until: now + RL_WINDOW * 1e3 };
  cur.n++;
  await store.put(k, cur, RL_WINDOW);
}
__name(fail, "fail");
async function handleVault({ method, path, auth, body, client, taskToken, now = Date.now() }, store) {
  if (await limited(store, client, now)) return json(429, { error: "too many attempts" });
  let m = path.match(/^\/v1\/task\/(out|in)$/);
  if (m) return task(m[1], method, taskToken, body, now, store);
  m = path.match(/^\/v1\/vault\/([^/]+)$/);
  if (m) return vault(m[1], method, auth, body, client, now, store);
  m = path.match(/^\/v1\/pair\/([^/]+?)(\/join|\/bundle)?$/);
  if (m) return pair(m[1], m[2] || "", method, body, client, now, store);
  return json(404, { error: "not found" });
}
__name(handleVault, "handleVault");
async function vault(id, method, auth, body, client, now, store) {
  if (!ID_RE.test(id)) return json(400, { error: "bad id" });
  const tok = (auth || "").replace(/^Bearer\s+/i, "");
  if (!/^[0-9a-f]{64}$/.test(tok)) return json(401, { error: "unauthorized" });
  const th = await sha256hex(tok);
  const key = "v:" + id;
  const cur = await store.get(key);
  if (cur && cur.th !== th) {
    await fail(store, client, now);
    return json(401, { error: "unauthorized" });
  }
  if (cur && cur.revoked) return json(410, { error: "revoked" });
  if (method === "GET") {
    if (!cur) return json(404, { error: "empty" });
    return json(200, { version: cur.version, blob: cur.blob, updatedAt: cur.updatedAt });
  }
  if (method === "PUT") {
    const b = parse(body);
    if (!b || typeof b.blob !== "string" || !Number.isInteger(b.expected)) return json(400, { error: "bad body" });
    if (b.blob.length > MAX_BLOB) return json(413, { error: "too large" });
    const version = cur ? cur.version : 0;
    if (b.expected !== version) return json(409, { version });
    const next = { th, version: version + 1, blob: b.blob, updatedAt: now };
    if (store.cas) {
      if (!await store.cas(key, next, version)) {
        const fresh = await store.get(key);
        return json(409, { version: fresh ? fresh.version : 0 });
      }
    } else await store.put(key, next);
    return json(200, { version: next.version });
  }
  if (method === "DELETE") {
    if (!cur) return json(404, { error: "empty" });
    await store.put(key, { th, revoked: true, version: cur.version, updatedAt: now });
    return json(200, { revoked: true });
  }
  return json(405, { error: "method" });
}
__name(vault, "vault");
async function pair(slot, sub, method, body, client, now, store) {
  if (!ID_RE.test(slot)) return json(400, { error: "bad slot" });
  const key = "p:" + slot;
  let cur = await store.get(key);
  if (cur && cur.exp <= now) {
    await store.del(key);
    cur = null;
  }
  const b = parse(body);
  if (b === null) return json(400, { error: "bad json" });
  if (!sub && method === "PUT") {
    if (cur) return json(409, { error: "exists" });
    if (!PUB_RE.test(b.pubA || "") || !/^[0-9a-f]{64}$/.test(b.ownHash || "")) return json(400, { error: "bad body" });
    await store.put(key, { pubA: b.pubA, ownHash: b.ownHash, pubB: null, bundle: null, exp: now + PAIR_TTL * 1e3 }, PAIR_TTL);
    return json(201, { exp: now + PAIR_TTL * 1e3 });
  }
  if (!cur) {
    await fail(store, client, now);
    return json(404, { error: "not found" });
  }
  const ttl = Math.max(60, Math.ceil((cur.exp - now) / 1e3));
  if (!sub && method === "GET") {
    const out = { pubA: cur.pubA, pubB: cur.pubB, bundle: cur.bundle, exp: cur.exp };
    if (cur.bundle) await store.del(key);
    return json(200, out);
  }
  if (sub === "/join" && method === "POST") {
    if (cur.pubB) return json(409, { error: "taken" });
    if (!PUB_RE.test(b.pubB || "")) return json(400, { error: "bad body" });
    await store.put(key, { ...cur, pubB: b.pubB }, ttl);
    return json(200, { ok: true });
  }
  const owner = typeof b.own === "string" && await sha256hex(b.own) === cur.ownHash;
  if (sub === "/bundle" && method === "POST") {
    if (!owner) {
      await fail(store, client, now);
      return json(403, { error: "forbidden" });
    }
    if (!cur.pubB || cur.bundle) return json(409, { error: "state" });
    if (typeof b.bundle !== "string" || b.bundle.length > 4e3) return json(400, { error: "bad body" });
    await store.put(key, { ...cur, bundle: b.bundle }, ttl);
    return json(200, { ok: true });
  }
  if (!sub && method === "DELETE") {
    if (!owner) return json(403, { error: "forbidden" });
    await store.del(key);
    return json(200, { ok: true });
  }
  return json(405, { error: "method" });
}
__name(pair, "pair");
async function task(box, method, token, body, now, store) {
  if (!/^[0-9a-f]{64}$/.test(token || "")) return json(401, { error: "unauthorized" });
  const key = "t:" + (await sha256hex("vivalink-task:" + token)).slice(0, 40) + ":" + box;
  const cur = await store.get(key);
  if (method === "GET") return cur ? json(200, { version: cur.version, body: cur.body, updatedAt: cur.updatedAt }) : json(404, { error: "empty" });
  if (method === "DELETE") {
    await store.del(key);
    return json(200, { ok: true });
  }
  if (method === "PUT") {
    const b = parse(body);
    if (!b || typeof b.body !== "string" || !Number.isInteger(b.expected)) return json(400, { error: "bad body" });
    if (b.body.length > MAX_TASK) return json(413, { error: "too large" });
    const version = cur ? cur.version : 0;
    if (b.expected !== version) return json(409, { version });
    const next = { version: version + 1, body: b.body, updatedAt: now };
    if (store.cas) {
      if (!await store.cas(key, next, version, TASK_TTL)) return json(409, { version: (await store.get(key) || {}).version || 0 });
    } else await store.put(key, next, TASK_TTL);
    return json(200, { version: next.version });
  }
  return json(405, { error: "method" });
}
__name(task, "task");

// d1-store.mjs
var SCHEMA_SQL = "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER, ver INTEGER)";
function d1Store(db, now = () => Date.now()) {
  let ready = null;
  const init = /* @__PURE__ */ __name(() => ready = ready || db.prepare(SCHEMA_SQL).run(), "init");
  const expAt = /* @__PURE__ */ __name((ttl) => ttl ? now() + ttl * 1e3 : null, "expAt");
  return {
    async get(k) {
      await init();
      const r = await db.prepare("SELECT v, exp FROM kv WHERE k = ?").bind(k).first();
      if (!r) return null;
      if (r.exp && r.exp <= now()) {
        await db.prepare("DELETE FROM kv WHERE k = ? AND exp <= ?").bind(k, now()).run();
        return null;
      }
      return JSON.parse(r.v);
    },
    async put(k, o, ttl) {
      await init();
      await db.prepare("INSERT INTO kv (k, v, exp, ver) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, exp = excluded.exp, ver = excluded.ver").bind(k, JSON.stringify(o), expAt(ttl), Number.isInteger(o && o.version) ? o.version : null).run();
    },
    async del(k) {
      await init();
      await db.prepare("DELETE FROM kv WHERE k = ?").bind(k).run();
    },
    /* Schreibt nur, wenn die gespeicherte Version noch „expected“ ist (0 = noch nicht vorhanden). true = geschrieben. */
    async cas(k, o, expected, ttl) {
      await init();
      const v = JSON.stringify(o), e = expAt(ttl);
      const r = expected === 0 ? await db.prepare("INSERT INTO kv (k, v, exp, ver) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO NOTHING").bind(k, v, e, o.version).run() : await db.prepare("UPDATE kv SET v = ?, exp = ?, ver = ? WHERE k = ? AND ver = ?").bind(v, e, o.version, k, expected).run();
      return !!(r && r.meta && r.meta.changes === 1);
    },
    /* Abgelaufene Einträge entfernen (täglich per Zeitplan im Worker) */
    async sweep() {
      await init();
      const r = await db.prepare("DELETE FROM kv WHERE exp IS NOT NULL AND exp <= ?").bind(now()).run();
      return r && r.meta && r.meta.changes || 0;
    }
  };
}
__name(d1Store, "d1Store");

// sync-worker.js
var sync_worker_default = {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "";
    const reqOrigin = request.headers.get("origin");
    const cors = { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS", "access-control-allow-headers": "authorization, content-type, x-vl-task-token", "access-control-max-age": "86400", vary: "origin" };
    if (reqOrigin && reqOrigin !== origin) return new Response("forbidden", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/v1/health") return new Response(JSON.stringify({ ok: true, service: "vivalink-sync" }), { headers: { "content-type": "application/json", ...cors } });
    const body = ["PUT", "POST", "DELETE"].includes(request.method) ? await request.text() : null;
    const r = await handleVault(
      { method: request.method, path: url.pathname, auth: request.headers.get("authorization"), taskToken: request.headers.get("x-vl-task-token"), body, client: request.headers.get("cf-connecting-ip") || "" },
      d1Store(env.DB)
    );
    return new Response(r.body, { status: r.status, headers: { ...r.headers, ...cors } });
  },
  // Täglich: abgelaufene Einträge löschen (Kopplungsplätze, Fehlversuchszähler, alte Postfächer)
  async scheduled(event, env) {
    await d1Store(env.DB).sweep();
  }
};

// ../../../../tmp/claude-0/-home-user/fdd11c54-1626-5b89-a2be-e7384e6d2fe7/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../tmp/claude-0/-home-user/fdd11c54-1626-5b89-a2be-e7384e6d2fe7/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-nwGgqI/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = sync_worker_default;

// ../../../../tmp/claude-0/-home-user/fdd11c54-1626-5b89-a2be-e7384e6d2fe7/scratchpad/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-nwGgqI/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=sync-worker.js.map
