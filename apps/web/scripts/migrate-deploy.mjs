/**
 * REQ-022: Wendet ausstehende Prisma-Migrationen an (`prisma migrate deploy`).
 * Läuft im Vercel-Build (Production und Preview) vor `next build`, siehe
 * `vercel.json`, und in der CI vor den E2E-Tests.
 *
 * Fehlt die Datenbank-URL, bricht das Skript mit Exit-Code 1 ab – ein Deployment
 * darf nicht still ohne Migration (oder gegen die Platzhalter-URL aus
 * `prisma.config.ts`) weiterlaufen. Ausgegeben werden nur Variablennamen, nie Werte.
 *
 * Verbindung: `DATABASE_URL_UNPOOLED` (direkte Verbindung, von der Neon-Integration
 * gesetzt) hat Vorrang, sonst `DATABASE_URL`. Die Auswahl selbst trifft
 * `prisma.config.ts`; hier wird nur geprüft, dass eine davon gesetzt ist.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const variable = ["DATABASE_URL_UNPOOLED", "DATABASE_URL"].find((name) => process.env[name]?.trim());

if (!variable) {
  console.error(
    [
      "FEHLER: Keine Datenbank-URL gesetzt – Migrationen können nicht angewendet werden, Build wird abgebrochen.",
      "Erwartet: DATABASE_URL (und optional DATABASE_URL_UNPOOLED für Migrationen).",
      "Vercel: Projekt → Storage → Neon-Datenbank mit dem Projekt verbinden (Variablen-Präfix nicht ändern) und",
      "die Umgebungen Production und Preview auswählen; danach erneut deployen.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`Prisma-Migrationen anwenden (Verbindung aus ${variable}) …`);

const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
const ergebnis = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], { stdio: "inherit" });

if (ergebnis.error) {
  console.error(`FEHLER: Prisma CLI konnte nicht gestartet werden: ${ergebnis.error.message}`);
  process.exit(1);
}
if (ergebnis.status !== 0) {
  console.error("FEHLER: `prisma migrate deploy` ist fehlgeschlagen – Build wird abgebrochen.");
  process.exit(ergebnis.status ?? 1);
}
