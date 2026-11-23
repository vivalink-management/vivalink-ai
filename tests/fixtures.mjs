// Künstliche Testdaten. Enthalten keine echten Unternehmensinformationen.
export const T0 = Date.UTC(2026, 0, 10);

export function v1State() {
  return {
    v: 1,
    dev: "devTestA",
    memory: [
      { id: "m1", cat: "Ziele", title: "Testziel Alpha", text: "Mehr Testtreffen", status: "confirmed", date: "2026-01-05", reason: "Testgrund", result: "", private: false, active: false, supersededBy: "m2", createdAt: T0, updatedAt: T0 + 10, dev: "devTestA" },
      { id: "m2", cat: "Ziele", title: "Testziel Beta", text: "Noch mehr Testtreffen", status: "estimate", date: "2026-01-06", reason: "", result: "", private: false, active: true, supersedes: "m1", changeReason: "Präzisiert", createdAt: T0 + 10, updatedAt: T0 + 10, dev: "devTestA" },
      { id: "m3", cat: "Instagram", title: "Vertrauliche Testnotiz", text: "kontakt@example.invalid", status: "confirmed", date: "2026-01-07", reason: "", result: "", private: true, active: true, createdAt: T0 + 20, updatedAt: T0 + 20, dev: "devTestA" },
      { id: "m4", cat: "Entscheidung", title: "Testentscheidung Gamma", text: "Testinhalt", status: "confirmed", date: "2026-01-01", reason: "Weil Test", result: "", private: false, active: true, createdAt: T0 + 30, updatedAt: T0 + 30, dev: "devTestA" },
    ],
    tasks: [
      { id: "t1", title: "Testaufgabe Eins", prio: "hoch", area: "App", due: "2026-01-20", done: false, dev: "devTestA", updatedAt: T0 },
      { id: "t2", title: "Testaufgabe Zwei", prio: "niedrig", area: "Marketing", due: "", done: true, doneAt: T0 + 5, dev: "devTestA", updatedAt: T0 + 5 },
    ],
    accent: "#123456",
    lastBackup: "2026-01-08",
  };
}

export function v2State() {
  const s = v1State();
  s.v = 2;
  s.dev = "devTestB";
  s.metrics = [
    {
      id: "m_reg_week", key: "reg_week", name: "Neue Registrierungen pro Woche", unit: "", dir: "up", goal: "15", updatedAt: T0 + 1,
      entries: [
        { id: "e1", date: "2026-01-01", value: 7, status: "confirmed", src: "manual", note: "", updatedAt: T0 },
        { id: "e2", date: "2026-01-08", value: 9, status: "confirmed", src: "manual", note: "", updatedAt: T0 + 1 },
      ],
    },
    {
      id: "m_reg_total", key: "reg_total", name: "Gesamtzahl der Registrierungen", unit: "", dir: "up", goal: "", updatedAt: T0,
      entries: [{ id: "e_test_old", date: "", value: 42, status: "old", src: "manual", note: "Künstlicher früherer Stand", updatedAt: 1 }],
    },
  ];
  s.suggest = { "t-hn": { until: "2026-01-20", mode: "later", at: T0 } };
  s.meetup = { date: "2026-02-01", place: "Testort", goal: "12", note: "", updatedAt: T0 + 2 };
  return s;
}
