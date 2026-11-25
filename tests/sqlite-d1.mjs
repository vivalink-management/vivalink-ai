// Nachbildung der Cloudflare-D1-Schnittstelle (prepare/bind/first/run) über SQLite aus Node.js – nur für Tests.
import { DatabaseSync } from "node:sqlite";

export function sqliteD1(file = ":memory:") {
  const db = new DatabaseSync(file);
  return {
    raw: db,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) {
          args = a;
          return st;
        },
        async first() {
          return db.prepare(sql).get(...args) || null;
        },
        async run() {
          const r = db.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
        async all() {
          return { results: db.prepare(sql).all(...args) };
        },
      };
      return st;
    },
  };
}
