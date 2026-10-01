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
| `docs/` | `requirements.md` (REQ-IDs), `risks.md` (ISO 14971), `design-vorschau.html` |

## Lokal starten

Voraussetzungen: Node.js ≥ 22.12, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example apps/web/.env      # Werte eintragen, TOTP_ENCRYPTION_KEY: openssl rand -base64 32
pnpm db:migrate                    # Migrationen auf die lokale Datenbank anwenden
pnpm dev                           # http://localhost:3000
```

Registrierung → Bestätigungslink wird im Prototyp angezeigt (kein E-Mail-Versand) → Anmeldung → Pflicht-Einrichtung der Zwei-Faktor-Anmeldung mit einer Authenticator-App.

## Prüfungen

```bash
pnpm lint
pnpm typecheck
pnpm test                                   # Vitest (core, ui, web)
pnpm --filter @medassist/web test:e2e       # Playwright, benötigt Datenbank und Build
```

Dieselben Prüfungen laufen in GitHub Actions bei jedem Pull Request (`.github/workflows/ci.yml`).

## Deployment (Vercel)

- Root Directory: `apps/web`, Build über Turborepo (siehe `apps/web/vercel.json`), Region `fra1`.
- Environment Variables gemäß `.env.example`, getrennt nach Production / Preview / Development.
- Deployment Protection für Preview und Production aktivieren, solange es eine Demo ist.
- Produktionsmigrationen nur über die Pipeline (`pnpm --filter @medassist/web db:deploy`).
