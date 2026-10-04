import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// REQ-021: Lokale `apps/web/.env` laden, damit Testmodus (`ZWEI_FA_AKTIV`) und Server
// dieselbe Konfiguration sehen. `loadEnvFile` überschreibt keine bereits gesetzten
// Variablen – die Shell-Umgebung (z. B. in CI) hat Vorrang.
const envDatei = path.join(import.meta.dirname, ".env");
if (existsSync(envDatei)) process.loadEnvFile(envDatei);
// QA N2: kurze Wartezeit auf die Zeilensperre, damit der Sperr-Test schnell abbricht (Standard der App: 5000 ms).
process.env.EINGRENZUNG_SPERRE_MS ??= "1500";

// Meilenstein 5 (REQ-406, REQ-408, REQ-412): Der Haupt-Server (Port 3000) läuft mit den
// Test-Adaptern – lokaler Speicher und Test-STT. `next start` läuft mit NODE_ENV=production,
// deshalb die ausdrückliche Freigabe TESTADAPTER_ERLAUBT (nie auf Vercel). Der feste
// HMAC-Schlüssel ist nur ein Testwert (der lokale Adapter läuft nie produktiv) – Tests nutzen
// ihn, um eine abgelaufene, korrekt signierte URL zu erzeugen.
process.env.STORAGE_ANBIETER ??= "lokal";
process.env.STT_ANBIETER ??= "test";
process.env.TESTADAPTER_ERLAUBT ??= "true";
process.env.STORAGE_LOKAL_SCHLUESSEL ??= Buffer.alloc(32, "medassist-e2e-nur-test").toString("base64");
process.env.STORAGE_LOKAL_PFAD ??= path.join(import.meta.dirname, ".lokaler-speicher", "e2e");

/** Zweiter Server im Standardmodus (Speicher und STT aus) für die Prüfung der Hinweise. */
const STANDARD_URL = "http://localhost:3001";

/**
 * Web-Abläufe (CLAUDE.md §8). Benötigt eine migrierte Datenbank (DATABASE_URL)
 * und – bei `ZWEI_FA_AKTIV=true` – TOTP_ENCRYPTION_KEY; die App wird mit `next start` gestartet.
 *
 * REQ-021: Der webServer erbt die Umgebung dieses Prozesses (Shell + `.env`), also
 * auch `ZWEI_FA_AKTIV` (Standard: aus). Für den 2FA-Pfad: `ZWEI_FA_AKTIV=true pnpm test:e2e`
 * oder den Wert in `apps/web/.env` setzen.
 * Lokal wird ein bereits laufender Server wiederverwendet – nach einem Moduswechsel
 * diesen vorher beenden, sonst passt der Server nicht zum Testmodus.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Vorinstallierter Browser (z. B. in Cloud-Umgebungen), sonst Playwright-Standard.
        launchOptions: {
          ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
          // REQ-407: Sprachaufnahme mit simuliertem Mikrofon (kein echtes Gerät, keine Abfrage).
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
  ],
  webServer: [
    {
      command: "pnpm start",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Standardmodus: STORAGE_ANBIETER/STT_ANBIETER „aus“ (REQ-406, REQ-408).
      command: "pnpm exec next start -p 3001",
      url: `${STANDARD_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { STORAGE_ANBIETER: "aus", STT_ANBIETER: "aus", TESTADAPTER_ERLAUBT: "false" },
    },
  ],
});
