// Speicher-Adapter für Cloudflare D1 (kostenlos: 5 GB, 100.000 Schreibvorgänge/Tag).
// Eine Tabelle kv(k, v, exp, ver). Versionsgesicherte Schreibvorgänge sind atomar (compare-and-swap),
// d. h. zwei gleichzeitig schreibende Geräte können sich nie unbemerkt überschreiben.
// Dieselbe Klasse läuft in den Tests über SQLite (tests/sqlite-d1.mjs), damit die SQL-Befehle mitgeprüft werden.
export const SCHEMA_SQL = "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER, ver INTEGER)";

export function d1Store(db, now = () => Date.now()) {
  let ready = null;
  const init = () => (ready = ready || db.prepare(SCHEMA_SQL).run());
  const expAt = (ttl) => (ttl ? now() + ttl * 1000 : null);
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
      await db
        .prepare("INSERT INTO kv (k, v, exp, ver) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, exp = excluded.exp, ver = excluded.ver")
        .bind(k, JSON.stringify(o), expAt(ttl), Number.isInteger(o && o.version) ? o.version : null)
        .run();
    },
    async del(k) {
      await init();
      await db.prepare("DELETE FROM kv WHERE k = ?").bind(k).run();
    },
    /* Schreibt nur, wenn die gespeicherte Version noch „expected“ ist (0 = noch nicht vorhanden). true = geschrieben. */
    async cas(k, o, expected, ttl) {
      await init();
      const v = JSON.stringify(o),
        e = expAt(ttl);
      const r =
        expected === 0
          ? await db.prepare("INSERT INTO kv (k, v, exp, ver) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO NOTHING").bind(k, v, e, o.version).run()
          : await db.prepare("UPDATE kv SET v = ?, exp = ?, ver = ? WHERE k = ? AND ver = ?").bind(v, e, o.version, k, expected).run();
      return !!(r && r.meta && r.meta.changes === 1);
    },
    /* Abgelaufene Einträge entfernen (täglich per Zeitplan im Worker) */
    async sweep() {
      await init();
      const r = await db.prepare("DELETE FROM kv WHERE exp IS NOT NULL AND exp <= ?").bind(now()).run();
      return (r && r.meta && r.meta.changes) || 0;
    },
  };
}
