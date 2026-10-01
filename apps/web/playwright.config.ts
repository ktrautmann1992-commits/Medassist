import { defineConfig, devices } from "@playwright/test";

/**
 * Web-Abläufe (CLAUDE.md §8). Benötigt eine migrierte Datenbank (DATABASE_URL)
 * und TOTP_ENCRYPTION_KEY; die App wird mit `next start` gestartet.
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
