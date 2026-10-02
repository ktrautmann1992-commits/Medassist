# MedAssist (Arbeitstitel)

> **Demo – nicht für den klinischen Einsatz.** Nur Testdaten. Projektrahmen und Vorgaben: [`CLAUDE.md`](./CLAUDE.md).

Klinische Entscheidungsunterstützung für Patienten und Ärzte. Die Software unterstützt Entscheidungen, sie trifft sie nicht.

## Struktur

| Pfad | Inhalt |
|---|---|
| `apps/web` | Next.js (App Router), Server Actions, Prisma – läuft auf Vercel (`fra1`) |
| `apps/mobile` | Platzhalter für die Expo-App (Meilenstein 11) |
| `packages/core` | Schemas, Rollenrechte, Berechnungen (Alter, BMI), später Regel-Engine – ohne Anbieterbindung |
| `packages/ui` | React-Komponenten auf Basis von `styles/style.css` |
| `styles/style.css` | Design-Variablen und Basis-Styles (einzige Quelle) |
| `docs/` | `requirements.md` (REQ-IDs), `risks.md` (ISO 14971), `medizinische-daten.md` (Konzept Wissensdaten), `design-vorschau.html` |

## Lokal starten

Voraussetzungen: Node.js ≥ 22.12, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example apps/web/.env      # Werte eintragen; TOTP_ENCRYPTION_KEY nur für 2FA an: openssl rand -base64 32
pnpm db:migrate                    # Migrationen auf die lokale Datenbank anwenden
pnpm dev                           # http://localhost:3000
```

Registrierung → Bestätigungslink wird im Prototyp angezeigt (kein E-Mail-Versand) → Anmeldung.

**Zwei-Faktor-Anmeldung (`ZWEI_FA_AKTIV`):** In der Testphase standardmäßig **aus** – nach Passwort und bestätigter E-Mail geht es direkt zur Übersicht, die einen Hinweis „Testphase: Zwei-Faktor-Anmeldung deaktiviert“ zeigt. Mit `ZWEI_FA_AKTIV=true` folgt nach dem Passwort die Pflicht-Einrichtung bzw. Eingabe des Codes aus einer Authenticator-App. Vor Verarbeitung echter Daten muss der Schalter auf `true` stehen (REQ-021).

**KI-Schicht (ab Meilenstein 6):** Google Gemini über Vertex AI in `europe-west3` (Frankfurt); Variablen `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` (siehe `.env.example`).

## Prüfungen

```bash
pnpm lint
pnpm typecheck
pnpm test                                   # Vitest (core, ui, web)
pnpm --filter @medassist/web test:e2e       # Playwright, benötigt Datenbank und Build (2FA aus)
ZWEI_FA_AKTIV=true pnpm --filter @medassist/web test:e2e   # Pfad mit Pflicht-2FA (laufenden Server vorher beenden)
```

Dieselben Prüfungen laufen in GitHub Actions bei jedem Pull Request (`.github/workflows/ci.yml`); die E2E-Tests dort in beiden Modi (Matrix `ZWEI_FA_AKTIV` = `false`/`true`).

## Deployment (Vercel)

- Root Directory: `apps/web`, Build über Turborepo (siehe `apps/web/vercel.json`), Region `fra1`.
- Environment Variables gemäß `.env.example`, getrennt nach Production / Preview / Development. `DATABASE_URL` ist in **jeder** Umgebung Pflicht. `TOTP_ENCRYPTION_KEY` ist nur bei `ZWEI_FA_AKTIV=true` Pflicht (in der Testphase mit 2FA aus also nicht nötig); ist er gesetzt, muss er gültig sein (32 Byte, Base64). Fehlt ein Pflichtwert oder ist ein Wert ungültig, startet der Server nicht. `APP_URL` (Basis für Bestätigungslinks) nur für Production setzen; in Preview-Deployments wird automatisch die stabile Branch-URL (`VERCEL_BRANCH_URL`, sonst `VERCEL_URL`) verwendet – durch die Deployment Protection funktionieren die Links dort für angemeldete Vercel-Nutzer.
- **Datenbank:** Vercel → Storage → Neon (Region Frankfurt) anlegen und mit dem Projekt verbinden, Variablen-Präfix nicht ändern (es müssen `DATABASE_URL` und `DATABASE_URL_UNPOOLED` entstehen), Umgebungen Production und Preview auswählen. Die Integration setzt `DATABASE_URL` (gepoolt, für die App) und `DATABASE_URL_UNPOOLED` (direkt, wird für Migrationen bevorzugt).
- Deployment Protection für Preview und Production aktivieren, solange es eine Demo ist.
- **Migrationen (REQ-022):** laufen automatisch bei jedem Vercel-Build (Production und Preview) **vor** `next build` – `buildCommand` in `apps/web/vercel.json` ruft zuerst `pnpm --filter @medassist/web db:deploy` (`apps/web/scripts/migrate-deploy.mjs` → `prisma migrate deploy`) auf. Fehlt die Datenbank-URL oder schlägt eine Migration fehl, bricht der Build mit Fehlermeldung ab; es wird nichts ausgeliefert. Nie manuell gegen Produktion migrieren. Lokales `pnpm build` und der CI-Checks-Job migrieren nicht und brauchen keine Datenbank.
- **Bekannte Einschränkung (Testphase, RISK-014):** Mit nur einer Neon-Datenbank für Production und Preview wendet jedes Preview-Deployment die Migrationen seines Branches auf dieselbe Datenbank an, die auch Production nutzt. Daher im Prototyp nur additive (abwärtskompatible) Migrationen; später Neon-Branching pro Preview-Deployment einrichten.
