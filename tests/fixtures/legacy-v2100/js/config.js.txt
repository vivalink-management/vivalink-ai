/* Ausgabekanal: "prod" = deine Vivalink AI, "test" = getrennte Testversion.
   Der Test-Build (scripts/build-test.mjs) ersetzt diese Datei. */
window.VL_CHANNEL = "prod";
/* Synchronisierungs-Server (eigener Cloudflare Worker, kostenlos; getrennt von der Webseite vivalink.me).
   Aktiv erst, wenn auf dem Gerät eine Synchronisierung eingerichtet wird. Tests können die Adresse vorher setzen. */
window.VL_SYNC_URL = window.VL_SYNC_URL ?? "https://vivalink-sync.hidden-art-0326.workers.dev";
/* Verwaltungsanbindung (Supabase Edge Function „management-kpis“, Free-Tarif): nur zusammengefasste Kennzahlen.
   Aktiv erst, wenn das Gerät mit einem Einmalcode aus der Verwaltung gekoppelt wurde; vorher wird nichts gesendet. */
window.VL_KPI_URL = window.VL_KPI_URL ?? "https://frzeeylzbhpyimqoggzj.supabase.co/functions/v1/management-kpis";
