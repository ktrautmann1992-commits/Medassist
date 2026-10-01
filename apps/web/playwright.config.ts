import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// REQ-021: Lokale `apps/web/.env` laden, damit Testmodus (`ZWEI_FA_AKTIV`) und Server
// dieselbe Konfiguration sehen. `loadEnvFile` überschreibt keine bereits gesetzten
// Variablen – die Shell-Umgebung (z. B. in CI) hat Vorrang.
const envDatei = path.join(import.meta.dirname, ".env");
if (existsSync(envDatei)) process.loadEnvFile(envDatei);

/**
 * Web-Abläufe (CLAUDE.md §8). Benötigt eine migrierte Datenbank (DATABASE_URL)
 * und TOTP_ENCRYPTION_KEY; die App wird mit `next start` gestartet.
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
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
