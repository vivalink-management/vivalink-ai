/* Ausgabekanal: "prod" = deine Vivalink AI, "test" = getrennte Testversion.
   Der Test-Build (scripts/build-test.mjs) ersetzt diese Datei. */
window.VL_CHANNEL = "prod";
/* Synchronisierungs-Server (eigener Cloudflare Worker, kostenlos; getrennt von der Webseite vivalink.me).
   Aktiv erst, wenn auf dem Gerät eine Synchronisierung eingerichtet wird. Tests können die Adresse vorher setzen. */
window.VL_SYNC_URL = window.VL_SYNC_URL ?? "https://vivalink-sync.hidden-art-0326.workers.dev";
