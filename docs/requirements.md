# Anforderungen – MedAssist (Prototyp)

> Demo – nicht für den klinischen Einsatz. Dieses Dokument ist IEC-62304-orientiert aufgebaut:
> Jede Anforderung hat eine stabile ID. Code und Tests verweisen auf diese IDs
> (Kommentar `// REQ-xxx` bzw. Testname mit `REQ-xxx`). Zugehörige Risiken stehen in
> [`risks.md`](./risks.md).

## Konventionen

| Feld | Bedeutung |
|---|---|
| **ID** | `REQ-<Nummer>`, wird nie wiederverwendet |
| **Priorität** | M = muss, S = soll, K = kann |
| **Status** | offen · umgesetzt · verifiziert (Test vorhanden und grün) |
| **Verifikation** | Test (T), Review/Inspektion (R), Demo (D) |
| **Risiko** | Verweis auf `RISK-xxx` in `risks.md` |

Sicherheitsrelevante Logik (Red Flags, Krisenpfad, Dosierung, Rollen) wird nie ausschließlich in der KI umgesetzt (CLAUDE.md §12).

---

## Meilenstein 1 – Grundgerüst, Datenmodell, Auth

### Allgemein / Plattform

| ID | Anforderung | Prio | Verifikation | Status | Risiko | Umsetzung |
|---|---|---|---|---|---|---|
| REQ-001 | Jede Ansicht der Web-App zeigt sichtbar den Hinweis „Demo – nicht für den klinischen Einsatz“. | M | T, D | umgesetzt | RISK-001 | `packages/ui/src/demo-banner.tsx`, `apps/web/app/layout.tsx` |
| REQ-002 | Der Prototyp verarbeitet ausschließlich Testdaten; die Registrierung verlangt die Bestätigung, keine echten Gesundheitsdaten einzugeben. | M | T, R | umgesetzt | RISK-002 | `packages/core/src/auth/schemas.ts` |
| REQ-003 | Das Projekt ist ein Monorepo (Turborepo, pnpm-Workspaces) mit `apps/web`, `apps/mobile`, `packages/core`, `packages/ui`. `packages/core` hat keine Abhängigkeit zu Vercel-spezifischen Diensten. | M | R | umgesetzt | RISK-010 | Repo-Struktur |
| REQ-004 | Alle Web-Komponenten verwenden die Design-Variablen aus `/styles/style.css`; die Datei ist die einzige Quelle und wird global in `apps/web` eingebunden. | M | R | umgesetzt | – | `apps/web/app/layout.tsx` |
| REQ-005 | Secrets werden nie im Repository gespeichert. `.env.example` listet alle Variablen ohne Werte. | M | R, T (CI) | umgesetzt | RISK-008 | `.env.example`, `.gitignore` |
| REQ-006 | Serverfunktionen laufen in der Vercel-Region `fra1` (Frankfurt), festgelegt über `regions` in `vercel.json` (das frühere `preferredRegion` ist ab Next.js 16 veraltet). `maxDuration` wird pro Segment/Route explizit gesetzt. | M | R | umgesetzt | RISK-009 | `apps/web/vercel.json`, `export const maxDuration` |
| REQ-007 | Bei jedem Pull Request laufen automatisiert Lint, Typecheck und Tests (Unit-Tests und Playwright-Web-Abläufe); Merge nur bei grünen Checks. | M | R | umgesetzt | RISK-011 | `.github/workflows/ci.yml`, `apps/web/e2e/` |

### Registrierung, Rollen, Authentifizierung

| ID | Anforderung | Prio | Verifikation | Status | Risiko | Umsetzung |
|---|---|---|---|---|---|---|
| REQ-010 | Bei der Registrierung wählt der Nutzer genau eine Rolle: **Patient** oder **Arzt**. Die Rolle ist danach nicht durch den Nutzer änderbar. | M | T | umgesetzt | RISK-003 | `packages/core/src/auth/schemas.ts`, `apps/web/app/(auth)/registrieren` |
| REQ-011 | Registrierung erfordert E-Mail, Passwort (min. 12 Zeichen, nicht nur eine Zeichenklasse) und Zustimmung zu Nutzungsbedingungen/Datenschutz (Einwilligung gemäß DSGVO Art. 9 wird als Datensatz `Einwilligung` gespeichert). | M | T | umgesetzt | RISK-004 | `packages/core/src/auth/schemas.ts` |
| REQ-012 | Passwörter werden ausschließlich als Argon2id-Hash gespeichert. | M | T | umgesetzt | RISK-004 | `apps/web/lib/auth/password.ts` |
| REQ-013 | Die E-Mail-Adresse muss vor dem ersten Login bestätigt werden (Einmal-Token, 24 h gültig, nur Hash gespeichert). Im Prototyp wird der Bestätigungslink angezeigt statt versendet. | M | T | umgesetzt | RISK-004 | `apps/web/lib/auth/tokens.ts`, `apps/web/app/(auth)/verifizieren` |
| REQ-014 | Nutzer mit Rolle Arzt hinterlegen bei der Registrierung einen Approbationsnachweis (Approbationsbehörde, Datum). Im Prototyp wird die Prüfung **simuliert** und als `SIMULIERT` gekennzeichnet; die Oberfläche weist darauf hin. | M | T, D | umgesetzt | RISK-003 | `packages/core/src/auth/schemas.ts`, Modell `Approbationsnachweis` |
| REQ-015 | Zwei-Faktor-Authentifizierung (TOTP, RFC 6238). Ist sie aktiv (`ZWEI_FA_AKTIV=true`), erhält ein Konto ohne eingerichtete und bestätigte 2FA keinen Zugriff auf geschützte Bereiche. Der Schalter wird ausschließlich serverseitig ausgewertet (`pruefeZugang` mit `zweiFaktorPflicht`). In der Testphase ist die 2FA per Standard **aus** (Nutzerentscheidung); dann genügen Passwort und bestätigte E-Mail (REQ-013), und die Oberfläche zeigt den Hinweis „Testphase: Zwei-Faktor-Anmeldung deaktiviert“. Vor Verarbeitung echter Daten ist sie Pflicht (REQ-021). | M | T | umgesetzt | RISK-004 | `packages/core/src/auth/permissions.ts`, `apps/web/lib/env.ts`, `apps/web/lib/auth/guards.ts`, `apps/web/lib/auth/totp.ts` |
| REQ-016 | Bei aktiver 2FA erfolgt der Login zweistufig: Passwort (Teilsitzung, 10 min), danach TOTP-Code. Erst nach beiden Schritten wird die Sitzung als vollständig authentifiziert markiert. Bei abgeschalteter 2FA erzeugt die erfolgreiche Passwortanmeldung direkt eine volle Sitzung (12 h, `zweiterFaktorAm` leer); die 2FA-Seiten leiten dann auf `/start` bzw. `/anmelden` um. Wird die 2FA wieder eingeschaltet, verlangen solche Sitzungen sofort den zweiten Faktor. | M | T | umgesetzt | RISK-004 | `apps/web/app/(auth)/anmelden`, `apps/web/app/(auth)/2fa`, `apps/web/lib/auth/session.ts` |
| REQ-017 | Sitzungen sind serverseitig gespeichert; das Cookie enthält nur ein zufälliges Token (httpOnly, Secure, SameSite=Lax), in der Datenbank liegt nur dessen SHA-256-Hash. Sitzungen laufen nach 12 h ab; Abmelden löscht die Sitzung. | M | T | umgesetzt | RISK-004 | `apps/web/lib/auth/session.ts` |
| REQ-018 | Rollen- und Berechtigungsprüfungen erfolgen **serverseitig** (`requireUser`, `requireRole`), nicht nur in der Oberfläche. | M | T | umgesetzt | RISK-003 | `apps/web/lib/auth/guards.ts`, `packages/core/src/auth/permissions.ts` |
| REQ-019 | Fehlgeschlagene Logins geben keine Auskunft darüber, ob eine E-Mail registriert ist. | S | T | umgesetzt | RISK-004 | `apps/web/app/(auth)/anmelden/actions.ts` |
| REQ-020 | Nach 5 aufeinanderfolgenden Fehlversuchen (Passwort oder TOTP) wird das Konto für 15 min gesperrt. Der Zähler wird nach vollständiger Anmeldung zurückgesetzt (mit 2FA nach bestätigtem Code, ohne 2FA nach korrektem Passwort). | S | T | umgesetzt | RISK-004 | `packages/core/src/auth/lockout.ts`, `apps/web/app/(auth)/anmelden/actions.ts` |
| REQ-021 | Vor Verarbeitung echter (Patienten-)Daten muss `ZWEI_FA_AKTIV=true` in allen Umgebungen gesetzt sein, die solche Daten verarbeiten (Production, ggf. Preview). Ungültige Werte des Schalters (alles außer `true`, `false` oder leer) lassen den Serverstart scheitern: `instrumentation.ts` prüft die Konfiguration beim Start der Server-Instanz und beendet den Prozess mit Exit-Code 1 (beim `next build` wird nicht geprüft). **Betriebsschritt beim Einschalten der 2FA:** bestehende Sitzungen beenden (z. B. alle Einträge der Tabelle `Sitzung` löschen); zusätzlich verlangt `pruefeZugang` für Sitzungen ohne zweiten Faktor sofort den Code, und `requireTeilsitzung` akzeptiert nur Sitzungen, die jünger als 10 min sind. Beide Modi werden in CI getestet (Playwright-Matrix). | M | T, R | umgesetzt (Schalter, Tests); Freigabeprüfung vor echten Daten offen | RISK-004 | `apps/web/lib/env.ts`, `apps/web/instrumentation.ts`, `apps/web/lib/auth/guards.ts`, `.github/workflows/ci.yml`, `apps/web/e2e/auth.spec.ts` |

### Datenmodell (Abschnitte 3, 3a; Meilenstein 1)

| ID | Anforderung | Prio | Verifikation | Status | Risiko | Umsetzung |
|---|---|---|---|---|---|---|
| REQ-030 | Das Datenmodell umfasst: Nutzer, Rolle, Patientenprofil, Fall, Eingabe, Foto, Befund, Diagnose, Plan, Freigabe, Einwilligung. | M | R, T (`prisma validate`) | umgesetzt | – | `apps/web/prisma/schema.prisma` |
| REQ-031 | Patientenprofil-Stammdaten gemäß CLAUDE.md §3: Name, Geburtsdatum, Geschlecht, Größe, Gewicht, Schwangerschaft/Stillzeit, Vorerkrankungen (ICD-10-GM + Freitext), Operationen, Allergien/Unverträglichkeiten, Dauermedikation, Nieren-/Leberfunktion, Familienanamnese, Lebensstil, Impfstatus. | M | R | umgesetzt | RISK-005 | `schema.prisma` |
| REQ-032 | Alter wird aus dem Geburtsdatum berechnet (nicht gespeichert), auch für Neugeborene (Tage/Wochen/Monate/Jahre). | M | T | umgesetzt | RISK-005 | `packages/core/src/profile/age.ts` |
| REQ-033 | BMI wird aus Größe und Gewicht berechnet (nicht gespeichert); unplausible Eingaben werden abgewiesen. | M | T | umgesetzt | RISK-005 | `packages/core/src/profile/bmi.ts` |
| REQ-034 | Kinderprofile: Datenmodell sieht `kontoinhaber` und `sorgeberechtigte[]` vor; Bestätigung des Sorgerechts wird mit Zeitpunkt gespeichert; Einladung eines zweiten Sorgeberechtigten ist modelliert. | M | R | umgesetzt | RISK-006 | `schema.prisma` (`Patientenprofil`, `Sorgeberechtigung`, `SorgeEinladung`) |
| REQ-035 | Zusätzliche Kinderdaten: Schwangerschaftswoche bei Geburt, Geburtsgewicht, Vorsorgeuntersuchungen U1–U9/J1 (erledigt/auffällig), Größe/Gewicht im Verlauf, Kita/Schule und Klassenstufe, Ein-/Mehrsprachigkeit. | M | R | umgesetzt | RISK-005 | `schema.prisma` |
| REQ-036 | Bei Frühgeburt (< 37+0 SSW) wird für Entwicklungsfragen ein **korrigiertes Alter** berechnet. | M | T | umgesetzt | RISK-005 | `packages/core/src/profile/age.ts` |
| REQ-037 | Fallfreigaben (Patient → Arzt) sind modelliert und jederzeit widerrufbar (`widerrufenAm`). | M | R | umgesetzt | RISK-007 | `schema.prisma` (`Freigabe`) |
| REQ-038 | Einwilligungen (DSGVO Art. 9) werden je Zweck mit Version, Zeitpunkt und Widerruf gespeichert. | M | R | umgesetzt | RISK-007 | `schema.prisma` (`Einwilligung`) |
| REQ-039 | Diagnosen speichern ICD-10-GM-Code und Diagnosesicherheit (V/G/A/Z) sowie Quelle (Regel/KI/Arzt) mit Regel- bzw. Prompt-/Modellversion. | M | R | umgesetzt | – | `schema.prisma` (`Diagnose`) |

### Medizinische Wissensdaten (CLAUDE.md §9, Konzept: [`medizinische-daten.md`](./medizinische-daten.md))

| ID | Anforderung | Prio | Verifikation | Status | Risiko | Umsetzung |
|---|---|---|---|---|---|---|
| REQ-040 | Die ICD-10-GM (BfArM) wird in einer Wissens-Tabelle der Anwendungsdatenbank bereitgestellt; der Import erfolgt per Skript aus der amtlichen Downloaddatei, je Jahresversion getrennt. | M | T | offen | RISK-013 | geplant: `tools/import`, `packages/core` |
| REQ-041 | Jeder Wissensdatensatz trägt Quelle, Version/Stand, Lizenz und Importzeitpunkt; Datensätze werden versioniert und nicht überschrieben, sodass jede Diagnose/Regel auf den damals gültigen Stand verweisen kann. | M | T, R | offen | RISK-013 | geplant |
| REQ-042 | Wissensdatensätze haben den Status `validiert` (ja/nein) und `geprüft von`; ungeprüfte Inhalte (z. B. der Demo-Arzneimitteldatensatz) werden in der Oberfläche und im PDF-Bericht als „ungeprüft“ gekennzeichnet. | M | T, D | offen | RISK-013 | geplant |
| REQ-043 | Anwendungscode greift auf Wissensdaten ausschließlich über Schnittstellen in `packages/core` zu (anbieterneutral, ohne direkte Kopplung an Datenbank- oder Hostinganbieter). | M | R | offen | RISK-010, RISK-013 | geplant |
| REQ-044 | Vor Marktreife sind die Lizenzen aller Datenquellen (ICD-10-GM, ATC/DDD, Arzneimitteldatenbank, Leitlinien, Perzentilen, STIKO) geklärt und dokumentiert; ohne geklärte Lizenz wird eine Quelle nicht produktiv genutzt. | M | R | offen | RISK-013 | `docs/medizinische-daten.md` |

---

## Spätere Meilensteine

Werden vor der jeweiligen Umsetzung ergänzt (CLAUDE.md §12). Reservierte Bereiche:

| Bereich | IDs |
|---|---|
| Patientenprofil-UI, Kinderprofile, Design | REQ-100 … |
| Regel-Engine, Red Flags, Krisenpfad, Rollenfilter | REQ-200 … |
| Geführte Eingrenzung, Entwicklungs-Check | REQ-300 … |
| Freitext, Sprache, Foto | REQ-400 … |
| KI-Schicht | REQ-500 … |
| Eingrenzungs-Schleife | REQ-600 … |
| Therapie/Medikation | REQ-700 … |
| PDF-Berichte | REQ-800 … |
| Fall teilen | REQ-900 … |
| Mobile, Wearables | REQ-1000 … |
