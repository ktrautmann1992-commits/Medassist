import { defineConfig } from "prisma/config";

// DATABASE_URL wird nur für Migrationen benötigt; `prisma generate` und
// `prisma validate` laufen in CI ohne Datenbank (REQ-005: keine Secrets im Repo).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/medassist",
  },
});
