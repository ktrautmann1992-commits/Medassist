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
cp .env.example apps/web/.env      # Werte eintragen, TOTP_ENCRYPTION_KEY: openssl rand -base64 32
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
- Environment Variables gemäß `.env.example`, getrennt nach Production / Preview / Development. `DATABASE_URL` und `TOTP_ENCRYPTION_KEY` sind in **jeder** Umgebung Pflicht (auch bei abgeschalteter 2FA) – sonst startet der Server nicht.
- Deployment Protection für Preview und Production aktivieren, solange es eine Demo ist.
- Produktionsmigrationen nur über die Pipeline (`pnpm --filter @medassist/web db:deploy`).
