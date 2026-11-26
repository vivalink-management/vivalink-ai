// Datenbankzugriff der Verwaltungs-Gegenstelle (PostgreSQL / Supabase), laufzeitunabhängig:
// dieselbe Datei läuft in der Edge Function (Deno) und in den automatischen Tests (Node), jeweils mit postgres.js.
//
// Sicherheit (mehrere Ebenen):
// - Jede Abfrage läuft in einer Transaktion mit SET LOCAL ROLE management_ai: Diese Rolle darf nur die eigenen
//   Zugangstabellen (Schema management_ai) und die in mapping.json freigegebenen Auswertungen LESEN – keine
//   Basistabellen mit Personendaten (Grants erzeugt scripts/verwaltung.mjs aus mapping.json).
// - Alles Lesen läuft in READ-ONLY-Transaktionen mit Zeitlimit; geschrieben wird nur über drei festgelegte Funktionen.
// - Es werden ausschließlich die zwei zugeordneten Spalten (Datum, Wert) abgefragt; Bezeichner werden geprüft
//   und maskiert. buildKpis verwirft danach alles, was keine Zahl mit Tagesdatum ist.
// - Fehler einzelner Auswertungen überspringen nur diesen Schlüssel; Einzelheiten gehen nicht nach außen.

export const ROLE = "management_ai";
// Spalten der Testdaten-Auswertung → Felder in meta.testData (nur Anzahlen und Summen, keine Einzelangaben)
export const TEST_COLS = { konten: "accounts", buchungen: "bookings", einladungen: "invitations", zahlungen_eur: "payments", erstattungen_eur: "refunds" };
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
  // Getrennt ausgewiesene Testdaten (optional): Auswertung mit genau den Spalten TEST_COLS, eine Zeile, nur Summen
  let testSource = null;
  if (meta.testdaten != null && meta.testdaten !== "") {
    const t = String(meta.testdaten);
    if (!SOURCE.test(t) || t.endsWith("()")) errors.push("_meta.testdaten: ungültige Quelle");
    else testSource = t;
  }
  return { entries, meta: { excludesTestAccounts: meta.excludesTestAccounts === true, excludesDemoMeetups: meta.excludesDemoMeetups === true, testSource }, errors };
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
  // Zwei getrennte Anweisungen: 1) Rollenwechsel (nur für diese Transaktion), 2) Kontrolle von current_user (bei
  // Lesetransaktionen auch: Transaktion wirklich READ ONLY). Scheitert 1), bricht die Transaktion ab; stimmt 2) nicht,
  // wird eine Ausnahme ausgelöst – in beiden Fällen folgt keine weitere Anweisung, die Transaktion wird zurückgerollt.
  const asRole = async (t, readOnly) => {
    await t`select set_config('role', ${ROLE}, true), set_config('statement_timeout', '5000', true)`;
    const [r] = await t`select current_user as u, current_setting('transaction_read_only') as ro`;
    if (!r || r.u !== ROLE || (readOnly && r.ro !== "on")) throw new Error("Rollenwechsel fehlgeschlagen");
  };
  // Lesen: immer READ ONLY – PostgreSQL weist dann JEDEN Schreibvorgang ab, auch auf Tabellen, die über PUBLIC
  // beschreibbar wären (lässt sich für eine einzelne Rolle nicht entziehen), und damit auch Netzwerkaufrufe über Warteschlangen.
  const read = (fn) =>
    sql.begin("read only", async (t) => {
      await asRole(t, true);
      return fn(t);
    });
  // Schreiben: genau EIN Aufruf einer festgelegten Funktion in management_ai (einloesen/beruehren/protokollieren).
  // Die Rolle hat selbst keine Schreibrechte; der Schreibschutz der Datenbank bricht die Transaktion ab, sobald sie
  // irgendetwas außerhalb von management_ai schreibt.
  const call = (fn) =>
    sql.begin(async (t) => {
      await asRole(t, false);
      return fn(t);
    });
  return {
    pairCode: (h) => read(async (t) => {
      const [r] = await t`select expires_at, used_at from management_ai.pair_codes where code_hash = ${h}`;
      return r ? { expiresAt: new Date(r.expires_at).getTime(), usedAt: r.used_at } : null;
    }),
    // Einlösen + Gerät speichern in EINER Transaktion (in der Funktion): scheitert das Speichern, bleibt der Code unverbraucht
    redeem: (h, { name, tokenHash, now }) => call(async (t) => (await t`select management_ai.einloesen(${h}, ${name}, ${tokenHash}, ${iso(now)}) as ok`)[0].ok === true),
    device: (h) => read(async (t) => {
      const [r] = await t`select revoked_at from management_ai.devices where token_hash = ${h}`;
      return r ? { revokedAt: r.revoked_at } : null;
    }),
    touch: (h, now) => call((t) => t`select management_ai.beruehren(${h}, ${iso(now)})`).then(() => undefined),
    calls: (h, since) => read(async (t) => Number((await t`select count(*)::int as n from management_ai.calls where token_hash = ${h} and at > ${iso(since)}`)[0].n)),
    logCall: (h, now) => call((t) => t`select management_ai.protokollieren(${h}, ${iso(now)})`).then(() => undefined),
    // Angaben zur Datenbasis: gekennzeichnete Testkonten (Anzahl > 0) gelten als ausgeschlossen; ihre Daten werden
    // getrennt als Summen gemeldet. Fehler → keine Testdaten-Angabe und kein „ausgeschlossen“ (sicherer Zustand).
    meta: async () => {
      const out = { excludesTestAccounts: M.meta.excludesTestAccounts, excludesDemoMeetups: M.meta.excludesDemoMeetups };
      if (!M.meta.testSource) return out;
      try {
        const [r] = await read((t) => t`select ${t(Object.keys(TEST_COLS))} from ${t(M.meta.testSource)} as q limit 1`);
        if (r) {
          out.testData = Object.fromEntries(Object.entries(TEST_COLS).map(([c, k]) => [k, r[c] === null ? 0 : Number(r[c])]));
          if (out.testData.accounts > 0) out.excludesTestAccounts = true;
        }
      } catch (err) {
        onError("testdaten", err);
      }
      return out;
    },
    // Kennzahlen aus den VORHANDENEN Auswertungen: nur lesend, nur Datum und Wert, letzte 31 Tage
    aggregates: async (now = Date.now()) => {
      const rows = [];
      for (const e of M.entries) {
        try {
          const got = await sql.begin("read only", async (t) => {
            await asRole(t, true);
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
