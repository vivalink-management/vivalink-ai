// Datenbankzugriff der Verwaltungs-Gegenstelle (PostgreSQL / Supabase), laufzeitunabhängig:
// dieselbe Datei läuft in der Edge Function (Deno) und in den automatischen Tests (Node), jeweils mit postgres.js.
//
// Sicherheit (mehrere Ebenen):
// - Jede Abfrage läuft in einer Transaktion mit SET LOCAL ROLE management_ai: Diese Rolle darf nur die eigenen
//   Zugangstabellen (Schema management_ai) und die in mapping.json freigegebenen Auswertungen LESEN – keine
//   Basistabellen mit Personendaten (Grants erzeugt scripts/verwaltung-sql.mjs aus mapping.json).
// - Kennzahlen werden in einer READ-ONLY-Transaktion mit Zeitlimit gelesen.
// - Es werden ausschließlich die zwei zugeordneten Spalten (Datum, Wert) abgefragt; Bezeichner werden geprüft
//   und maskiert. buildKpis verwirft danach alles, was keine Zahl mit Tagesdatum ist.
// - Fehler einzelner Auswertungen überspringen nur diesen Schlüssel; Einzelheiten gehen nicht nach außen.

export const ROLE = "management_ai";
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const SOURCE = /^([a-z_][a-z0-9_]{0,62}\.)?[a-z_][a-z0-9_]{0,62}(\(\))?$/;

/* Prüft mapping.json; liefert {entries:[{key, source, fn, date, value, snapshot}], meta, errors} */
export function parseMapping(mapping, keys) {
  const entries = [],
    errors = [];
  for (const [key, m] of Object.entries(mapping || {})) {
    if (key.startsWith("_")) continue;
    if (!keys.includes(key)) {
      errors.push(key + ": unbekannter Schlüssel");
      continue;
    }
    if (!m || !m.source) continue; // noch nicht zugeordnet → übersprungen
    const src = String(m.source);
    if (!SOURCE.test(src)) errors.push(key + ": ungültige Quelle");
    else if (!IDENT.test(String(m.value || ""))) errors.push(key + ": ungültige Wertspalte");
    else if (!m.snapshot && !IDENT.test(String(m.date || ""))) errors.push(key + ": ungültige Datumsspalte");
    else entries.push({ key, source: src.replace(/\(\)$/, ""), fn: src.endsWith("()"), date: m.snapshot ? null : m.date, value: m.value, snapshot: !!m.snapshot });
  }
  const meta = mapping && mapping._meta ? mapping._meta : {};
  return { entries, meta: { excludesTestAccounts: meta.excludesTestAccounts === true, excludesDemoMeetups: meta.excludesDemoMeetups === true }, errors };
}

/* Tagesdatum in Europe/Berlin (für Momentaufnahmen ohne eigenes Datum) */
export const berlinDay = (now) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(now));

export function pgRepo(sql, mapping, keys, { onError = () => {} } = {}) {
  const M = parseMapping(mapping, keys);
  if (M.errors.length) throw new Error("mapping.json fehlerhaft: " + M.errors.join("; "));
  const iso = (t) => new Date(t).toISOString();
  // Jede Datenbankoperation läuft in einer eigenen Transaktion, die ZUERST in die eingeschränkte Rolle wechselt und das
  // prüft (current_user). Schlägt der Wechsel fehl oder stimmt die Rolle nicht, wird nichts ausgeführt (Fehler → 503).
  // Es gibt keine Abfrage außerhalb dieser Transaktionen.
  const asRole = async (t) => {
    const [r] = await t`select set_config('role', ${ROLE}, true) as r, set_config('statement_timeout', '5000', true) as s, current_user as u`;
    if (r.u !== ROLE) throw new Error("Rollenwechsel fehlgeschlagen");
  };
  const tx = (fn) =>
    sql.begin(async (t) => {
      await asRole(t);
      return fn(t);
    });
  return {
    pairCode: (h) => tx(async (t) => {
      const [r] = await t`select expires_at, used_at from management_ai.pair_codes where code_hash = ${h}`;
      return r ? { expiresAt: new Date(r.expires_at).getTime(), usedAt: r.used_at } : null;
    }),
    // Einlösen + Gerät speichern in EINER Transaktion: scheitert das Speichern, bleibt der Code unverbraucht
    redeem: (h, { name, tokenHash, now }) =>
      tx(async (t) => {
        const ok = (await t`update management_ai.pair_codes set used_at = ${iso(now)} where code_hash = ${h} and used_at is null and expires_at > ${iso(now)} returning 1`).length === 1;
        if (!ok) return false;
        await t`insert into management_ai.devices (name, token_hash, created_at) values (${name}, ${tokenHash}, ${iso(now)})`;
        return true;
      }),
    // (einzeln, nur noch für Tests/Altfälle) nur die erste Nutzung setzt used_at
    useCode: (h, now) => tx(async (t) => (await t`update management_ai.pair_codes set used_at = ${iso(now)} where code_hash = ${h} and used_at is null and expires_at > ${iso(now)} returning 1`).length === 1),
    addDevice: ({ name, tokenHash, now }) => tx((t) => t`insert into management_ai.devices (name, token_hash, created_at) values (${name}, ${tokenHash}, ${iso(now)})`).then(() => undefined),
    device: (h) => tx(async (t) => {
      const [r] = await t`select revoked_at from management_ai.devices where token_hash = ${h}`;
      return r ? { revokedAt: r.revoked_at } : null;
    }),
    touch: (h, now) => tx((t) => t`update management_ai.devices set last_used_at = ${iso(now)} where token_hash = ${h}`).then(() => undefined),
    calls: (h, since) => tx(async (t) => Number((await t`select count(*)::int as n from management_ai.calls where token_hash = ${h} and at > ${iso(since)}`)[0].n)),
    logCall: (h, now) => tx((t) => t`insert into management_ai.calls (token_hash, at) values (${h}, ${iso(now)})`).then(() => undefined),
    meta: async () => M.meta,
    // Kennzahlen aus den VORHANDENEN Auswertungen: nur lesend, nur Datum und Wert, letzte 31 Tage
    aggregates: async (now = Date.now()) => {
      const rows = [];
      for (const e of M.entries) {
        try {
          const got = await sql.begin("read only", async (t) => {
            await asRole(t);
            const from = e.fn ? t`${t(e.source)}()` : t`${t(e.source)}`;
            if (e.snapshot) return (await t`select ${t(e.value)} as v from ${from} as q limit 1`).map((r) => ({ d: berlinDay(now), v: r.v }));
            return t`select to_char(${t(e.date)}::date, 'YYYY-MM-DD') as d, ${t(e.value)} as v from ${from} as q where ${t(e.date)}::date >= (${berlinDay(now)}::date - 31) order by 1 desc limit 32`;
          });
          for (const r of got) rows.push({ key: e.key, date: r.d, value: r.v === null ? NaN : Number(r.v) });
        } catch (err) {
          onError(e.key, err); // nur intern protokollieren
        }
      }
      return rows;
    },
  };
}
