# Risikoakte – MedAssist (Prototyp)

> Demo – nicht für den klinischen Einsatz. Struktur angelehnt an ISO 14971:
> **Gefährdung → Ursache → Gefährdungssituation/Schaden → Maßnahme → Verifikation**.
> Die Bewertung ist vorläufig (Prototyp) und wird vor Marktreife durch eine formale
> Risikoanalyse ersetzt.

## Bewertungsschema (vorläufig)

- **Schwere (S):** 1 vernachlässigbar · 2 gering · 3 ernst · 4 kritisch · 5 katastrophal
- **Wahrscheinlichkeit (W):** 1 unwahrscheinlich · 2 selten · 3 gelegentlich · 4 wahrscheinlich · 5 häufig
- **Risiko = S × W** · ≤ 4 akzeptabel · 5–9 ALARP, Maßnahme nötig · ≥ 10 nicht akzeptabel

Werte „vorher“ ohne Maßnahme, „nachher“ mit umgesetzter Maßnahme.

---

## Meilenstein 1

| ID | Gefährdung | Ursache | Möglicher Schaden | S×W vorher | Maßnahme | Anforderung | S×W nachher | Verifikation |
|---|---|---|---|---|---|---|---|---|
| RISK-001 | Prototyp wird für echte klinische Entscheidungen genutzt | Nutzer hält Demo für fertiges Medizinprodukt | Fehlbehandlung durch ungeprüfte Vorschläge | 5×3 = 15 | Demo-Hinweis in jeder Ansicht; Zugriffsschutz der Deployments (Vercel Deployment Protection) | REQ-001, REQ-006 | 5×1 = 5 | Komponententest Demo-Banner, Review |
| RISK-002 | Echte Gesundheitsdaten im Prototyp | Nutzer gibt reale Daten ein | Datenschutzverletzung (DSGVO Art. 9) | 4×3 = 12 | Pflicht-Bestätigung „nur Testdaten“ bei Registrierung; Demo-Hinweis | REQ-002 | 4×2 = 8 | Schema-Test |
| RISK-003 | Nutzer erhält Inhalte einer falschen Rolle (z. B. Patient sieht Medikamentenplan) | Rollenprüfung nur im Frontend; Rolle nachträglich änderbar; Arzt-Rolle ohne Nachweis; Formular-Reset nach Validierungsfehler setzt Rollenwahl im DOM zurück, während die Oberfläche noch die andere Rolle zeigt (im Prototyp gefunden und behoben) | Selbstmedikation, Fehlinterpretation | 4×3 = 12 | Rolle bei Registrierung fix; serverseitige Guards; Approbationsnachweis (im Prototyp simuliert, klar gekennzeichnet); Formulare ohne automatischen Reset (`useFormular`) | REQ-010, REQ-014, REQ-018 | 4×2 = 8 | Unit-Tests Berechtigungen; E2E-Test Rollenwahl nach Validierungsfehler; offen: echte Approbationsprüfung vor Marktreife |
| RISK-004 | Unbefugter Zugriff auf Konto/Gesundheitsdaten | Schwache Passwörter, gestohlene Passwörter, Session-Diebstahl, Brute-Force, Konto-Enumeration | Offenlegung sensibler Daten, Manipulation von Profilen | 4×4 = 16 | Argon2id; Pflicht-2FA (TOTP); serverseitige Sitzungen mit gehashtem Token, httpOnly/Secure-Cookie, Ablauf; Sperre nach Fehlversuchen; generische Fehlermeldungen; E-Mail-Verifizierung | REQ-011 – REQ-017, REQ-019, REQ-020 | 4×1 = 4 | Unit-Tests Passwort, TOTP, Token, Lockout |
| RISK-005 | Falsche Stammdaten führen zu falschen altersabhängigen Regeln/Dosierungen | Alter gespeichert statt berechnet (veraltet); BMI-/Gewichtsfehler; fehlendes korrigiertes Alter bei Frühgeborenen | Falsche Dringlichkeit oder Dosis (später) | 5×3 = 15 | Alter/BMI immer berechnet; Plausibilitätsgrenzen; korrigiertes Alter bei SSW < 37 | REQ-031 – REQ-033, REQ-035, REQ-036 | 5×1 = 5 | Unit-Tests `age.ts`, `bmi.ts` |
| RISK-006 | Zugriff auf Kinderprofil durch Nicht-Sorgeberechtigte | Fehlende Modellierung von Sorgeberechtigung | Datenschutzverletzung, Kindeswohlgefährdung | 4×2 = 8 | `kontoinhaber`/`sorgeberechtigte[]` im Datenmodell; Bestätigung mit Zeitstempel; Einladung explizit | REQ-034 | 4×1 = 4 | Review Datenmodell; rechtliche Klärung offen |
| RISK-007 | Daten werden ohne gültige Einwilligung geteilt | Freigabe nicht widerrufbar; Einwilligung nicht nachweisbar | Datenschutzverletzung | 4×3 = 12 | Freigabe mit Widerruf; Einwilligung je Zweck mit Version/Zeitpunkt | REQ-037, REQ-038 | 4×1 = 4 | Review; Tests mit Meilenstein 10 |
| RISK-008 | Secrets (API-Keys, DB-URL) gelangen ins Repository | Commit von `.env` | Kompromittierung von DB/KI-Konto | 4×3 = 12 | `.env*` in `.gitignore`; `.env.example` ohne Werte; Secrets nur als Vercel Environment Variables | REQ-005 | 4×1 = 4 | Review, Secret-Scanning |
| RISK-009 | Datenverarbeitung außerhalb der EU | Standard-Region der Functions (USA) | DSGVO-Verstoß | 3×4 = 12 | Region `fra1` in `vercel.json`; DB/Speicher in Frankfurt | REQ-006 | 3×2 = 6 | Review; vor echten Daten AVV/Drittlandtransfer prüfen |
| RISK-010 | Anbieterbindung verhindert späteren Wechsel auf EU-Hosting | Vercel-spezifische APIs in Kernlogik | Verzögerter/unsicherer Umzug | 2×3 = 6 | `packages/core` ohne Vercel-Abhängigkeit | REQ-003 | 2×1 = 2 | Review der Abhängigkeiten |
| RISK-011 | Regressionen in sicherheitsrelevanter Logik | Änderungen ohne Tests | Fehlerhafte Regeln/Rechte in Produktion | 4×3 = 12 | CI mit Lint, Typecheck, Tests bei jedem PR; Merge nur bei grünen Checks | REQ-007 | 4×1 = 4 | GitHub Actions |

## Offene Punkte

- Echte Approbationsprüfung (manuell/automatisiert) vor Marktreife (RISK-003).
- Rechtliche Klärung Sorgerecht, Jugendliche, Übergabe mit 18 (RISK-006).
- Auftragsverarbeitung/Drittlandübermittlung Vercel vor echten Daten (RISK-009).
- E-Mail-Versand: im Prototyp nur angezeigter Link; produktiv EU-Mailanbieter (RISK-004).
- Schrift Atkinson Hyperlegible wird per `@import` von Google Fonts geladen (IP-Übermittlung an Google). Vor echten Nutzern selbst hosten (z. B. `next/font` oder lokale Dateien) – betrifft `styles/style.css` (RISK-009).
- Recovery-Codes für 2FA (Verlust des Authenticators) – folgt in Meilenstein 2.
