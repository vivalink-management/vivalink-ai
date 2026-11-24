// Aktuelle App- und Datenversion direkt aus dem Quellcode (damit Tests bei neuen Versionen nicht angepasst werden müssen).
import { readFileSync } from "node:fs";
const core = readFileSync(new URL("../js/core.js", import.meta.url), "utf8");
export const APP = core.match(/const APP_VERSION = "([^"]+)"/)[1];
export const SCHEMA = Number(core.match(/const SCHEMA = (\d+);/)[1]);
export const CACHE = "vivalink-" + APP;
const metrics = readFileSync(new URL("../js/metrics.js", import.meta.url), "utf8");
export const METRICS = (metrics.match(/\{ k: "/g) || []).length; // Anzahl vordefinierter Kennzahlen
