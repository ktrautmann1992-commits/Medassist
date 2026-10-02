import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 lädt `.env` nicht selbst. Lokal (z. B. `pnpm db:migrate`) wird daher
// `apps/web/.env` geladen; bereits gesetzte Variablen (CI, Vercel) haben Vorrang.
const envDatei = path.join(import.meta.dirname, ".env");
if (existsSync(envDatei)) process.loadEnvFile(envDatei);

// Die URL wird nur für Migrationen benötigt; `prisma generate` und
// `prisma validate` laufen in CI ohne Datenbank (REQ-005: keine Secrets im Repo).
// REQ-022: Für Migrationen wird – falls vorhanden – die direkte Verbindung
// `DATABASE_URL_UNPOOLED` genutzt (Neon: Migrationen nicht über den Pooler);
// der Laufzeit-Client (`lib/db.ts`) verwendet weiter `DATABASE_URL` (gepoolt).
// `trim() ||` statt `??`, damit leere Werte (z. B. aus `.env.example`) nicht zählen.
// Ohne URL greift der Platzhalter; `scripts/migrate-deploy.mjs` bricht dann vorher ab.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL_UNPOOLED?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      "postgresql://localhost:5432/medassist",
  },
});
