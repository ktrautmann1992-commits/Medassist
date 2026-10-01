# Projekt: Klinische Entscheidungsunterstützung (Arbeitstitel „MedAssist“)

## 1. Status und Rahmen

- **Phase:** Prototyp / Demo. Ziel später: marktreifes Medizinprodukt (EU-MDR, voraussichtlich Klasse IIa–IIb; EU AI Act Hochrisiko).
- **Keine echten Patientendaten** im Prototyp, nur Testdaten. Jede Ansicht zeigt den Hinweis: „Demo – nicht für den klinischen Einsatz“.
- Die Entwicklung soll von Anfang an IEC-62304-tauglich dokumentiert werden:
  - Anforderungen in `/docs/requirements.md` mit IDs (REQ-001 …)
  - Risiken in `/docs/risks.md` (ISO-14971-Logik: Gefährdung → Ursache → Maßnahme)
  - Jede Funktion wird auf eine REQ-ID zurückverfolgt und mit Tests abgedeckt.
- Die Software unterstützt Entscheidungen, sie trifft sie nicht. Alle Ergebnisse sind Vorschläge mit Begründung und Quellenangabe.

## 2. Registrierung und Rollen

Bei der Registrierung wählt der Nutzer seine Rolle: **Patient** oder **Arzt**.

| | Patient | Arzt |
|---|---|---|
| Profile | 1 eigenes Profil + Profile für eigene Kinder | beliebig viele Patienten |
| Verifizierung | E-Mail | E-Mail + Nachweis Approbation (im Prototyp simuliert, später manuelle/automatisierte Prüfung) |
| Diagnose-Ergebnis | mögliche Ursachen als „Verdacht – ärztlich abzuklären“ + Dringlichkeit | Differentialdiagnosen, Arbeitsdiagnose mit ICD-10-GM |
| Behandlungsplan | allgemeine Verhaltenshinweise, Empfehlung welcher Facharzt | vollständiger Therapieplan |
| Medikation | keine Medikamentenempfehlung | Medikamentenplan inkl. Rx mit Sicherheitsprüfungen |
| PDF | „Patientenbericht für den Arztbesuch“ | „Ärztlicher Diagnose- und Behandlungsbericht“ |

- Die Rollenfilter werden **serverseitig** umgesetzt, nicht nur in der Oberfläche.
- **Fall teilen:** Ein Patient kann einen Fall (inkl. Symptome, Fotos, Wearable-Daten) für einen registrierten Arzt freigeben. Der Arzt sieht ihn als neuen Patienten/Fall in seiner Liste. Freigabe ist jederzeit widerrufbar.

## 3. Patientenprofil (Stammdaten)

- Name, Geburtsdatum (Alter wird berechnet, ab Neugeborenen), Geschlecht
- Körpergröße, Gewicht (BMI berechnet; Gewicht wichtig für Kinderdosierung)
- Schwangerschaft/Stillzeit
- Vorerkrankungen (Auswahl ICD-10-GM + Freitext), Operationen
- Allergien und Unverträglichkeiten
- Dauermedikation (Wirkstoff, Dosis)
- Nieren-/Leberfunktion (Arzt-Rolle; optional Laborwerte)
- Familienanamnese, Lebensstil (Rauchen, Alkohol, Sport)
- Impfstatus (optional)

## 3a. Kinderprofile

- Ein Patient kann zusätzlich Profile für **eigene Kinder** anlegen (ab Geburt).
- Bei Anlage Bestätigung, sorgeberechtigt zu sein (im Prototyp Checkbox; später rechtlich klären, ggf. Nachweis).
- Optional: zweiter Sorgeberechtigter erhält per Einladung Zugriff auf das Kinderprofil.
- Übergang ins Jugendalter (eigener Zugang, Einwilligungsfähigkeit, Übergabe mit 18) wird später rechtlich festgelegt; im Datenmodell schon vorsehen (`kontoinhaber`, `sorgeberechtigte[]`).
- Zusätzliche Stammdaten für Kinder:
  - Schwangerschaftswoche bei Geburt (bei Frühgeburt **korrigiertes Alter** für Entwicklungsfragen), Geburtsgewicht
  - Vorsorgeuntersuchungen U1–U9, J1 (erledigt/auffällig)
  - Impfstatus
  - Größe/Gewicht im Verlauf mit **Perzentilen**
  - Kita/Schule, Klassenstufe
  - **Ein- oder Mehrsprachigkeit** (wichtig für Sprachentwicklung)
- Alle Regeln (Red Flags, Normwerte, Dosierungen) sind **altersabhängig**. Beispiele für Kinder-Red-Flags: Fieber bei Säuglingen unter 3 Monaten, Trinkschwäche, Teilnahmslosigkeit, **Verlust bereits erworbener Fähigkeiten**.
- Medikamente bei Kindern: Dosierung nach Gewicht/Alter, Prüfung der Zulassung für das Alter, Off-Label-Hinweis (nur Arzt-Rolle).

## 4. Wearable-Anbindung (Smartwatch)

- **Apple:** HealthKit – nur über eine **native iOS-App** zugänglich (nicht im Browser).
- **Samsung / Android:** über Health Connect (Android) bzw. Samsung Health Data SDK – ebenfalls nur über eine **native Android-App**.
- Daten (nur nach ausdrücklicher Einwilligung je Datentyp): Herzfrequenz, Ruhepuls, HRV, SpO2, EKG-Aufzeichnungen, Schlaf, Schritte/Aktivität, Blutdruck (falls vorhanden), Temperatur, Zyklusdaten.
- Darstellung als Verlauf; die Diagnose-Logik kann Auffälligkeiten als **Hinweis** einbeziehen (z. B. erhöhter Ruhepuls seit 5 Tagen), nicht als alleinige Grundlage.
- Wearable-Daten werden im Bericht als Datenquelle ausgewiesen.

## 5. Diagnose starten – zwei Wege

### Weg 1: Freie Beschreibung
- Kurzbeschreibung als **Text** oder **Sprachaufnahme** (Speech-to-Text; Transkript wird angezeigt und kann vor dem Absenden korrigiert werden).
- Optional **Foto-Upload** der betroffenen Stelle (z. B. Hautausschlag). Hinweise zur Aufnahme (Licht, Abstand, Referenz-Lineal/Münze). Mehrere Fotos und Verlaufsfotos möglich.
- Die KI strukturiert die Eingabe in Symptome und stellt danach gezielte Rückfragen (übergeht in die Eingrenzung).

### Weg 2: Geführte Eingrenzung
1. Auswahl **körperlich** oder **seelisch/psychisch**
2. Körperlich: **interaktive Körperkarte** (vorne/hinten, Kopf bis Fuß, Organsysteme) → Region wählen
3. Die Software stellt Schritt für Schritt Fragen (Art des Schmerzes, Dauer, Auslöser, Begleitsymptome …)
4. Seelisch: strukturierte Fragen zu Stimmung, Antrieb, Schlaf, Angst, Belastung; validierte Fragebögen nur mit geklärter Lizenz

### Weg 3: Entwicklungs-Check (nur Kinderprofile)
Bereiche, jeweils mit altersgerechten Fragen zu typischen Entwicklungsschritten:
- **Sprache und Sprechen** (Wortschatz, Satzbau, Aussprache, Stottern, Verständnis, Hören) → Logopädie, HNO/Pädaudiologie
- **Grob- und Feinmotorik** (Laufen, Gleichgewicht, Stifthaltung, Schneiden) → Ergotherapie, Physiotherapie
- **Wahrnehmung und Verarbeitung** (Sehen, Hören, Reizempfindlichkeit) → Augen-/HNO-Arzt, Ergotherapie
- **Sozial-emotionale Entwicklung und Verhalten** (Kontakt, Spiel, Wutanfälle, Ängste, Aufmerksamkeit/Unruhe) → Kinder- und Jugendpsychotherapie, Kinder- und Jugendpsychiatrie, Sozialpädiatrisches Zentrum (SPZ)
- **Lernen** (Lesen/Rechtschreibung, Rechnen, Konzentration)
- **Schlaf, Essen, Sauberkeit**

Ergebnis je Rolle:
- **Patient (Eltern):** altersgerecht / beobachten / Abklärung empfohlen, mit passender Anlaufstelle (immer zuerst Kinderarzt, da Heilmittel wie Logopädie und Ergotherapie eine ärztliche Verordnung brauchen). Dazu allgemeine, alltagstaugliche Förderideen – ausdrücklich kein Therapieersatz.
- **Arzt:** strukturierte Entwicklungsübersicht, Vorschlag weiterer Diagnostik und ggf. Heilmittelverordnung (Diagnosegruppe nach Heilmittelkatalog), Überweisungsempfehlung.

Hinweise:
- Entwicklungs-Screenings und Elternfragebögen nur mit geklärter Lizenz und Quellenangabe.
- Normale Bandbreite der Entwicklung betonen; die Software stellt keine Entwicklungsstörung fest, sondern zeigt, ob eine Abklärung sinnvoll ist.

### Gemeinsamer weiterer Ablauf
1. **Red-Flag-Prüfung zuerst (regelbasiert):** Bei Warnzeichen erscheint sofort ein Notfallhinweis (112 / 116117) vor allen weiteren Schritten.
2. **Psychische Beschwerden:** Suizidalitäts-Screening ist Pflicht. Bei Hinweisen sofort Krisenhinweis (112, Telefonseelsorge 0800 111 0 111 / 0800 111 0 222) und Empfehlung zur ärztlichen Akutvorstellung; kein weiterer Diagnose-Ablauf.
3. **Eingrenzungs-Schleife:** Rückfragen und (Arzt-Rolle) Prüfschritte wie Untersuchung, Labor, Bildgebung → Ergebnisse eintragen → Neubewertung, bis Arbeitsdiagnose oder Überweisung.
4. **Ergebnis** gemäß Rolle (siehe Abschnitt 2).

## 6. PDF-Bericht

### Ärztlicher Diagnose- und Behandlungsbericht (Arzt-Rolle)
1. Kopf: Patient (Name, Geburtsdatum, Geschlecht), Datum, erstellender Arzt, Fall-ID, Software-/Regelversion
2. Anamnese und aktuelle Beschwerden (Fachterminologie)
3. Befunde: erhobene Prüfschritte, Laborwerte, Fotos (Miniatur), Wearable-Auffälligkeiten
4. **Diagnose:** Arbeitsdiagnose mit ICD-10-GM, Diagnosesicherheit (V = Verdacht, G = gesichert, A = Ausschluss, Z = Zustand nach), Differentialdiagnosen
5. **Diagnostische Grundlage:** welche Symptome/Befunde zur Diagnose führten, welche Differentialdiagnosen warum ausgeschlossen wurden, Quellen (Leitlinie, Version)
6. **Behandlungsplan:** Maßnahmen, Kontrollen, Überweisungen, Verlaufskontrolle
7. **Medikationsplan:** Wirkstoff, Handelsname (optional), Stärke, Darreichungsform, Dosierung (morgens/mittags/abends/nachts), Dauer, Hinweise; durchgeführte Prüfungen (Wechselwirkungen, Allergien, Kontraindikationen)
8. Hinweis: „Entscheidungsunterstützung – Verantwortung liegt beim behandelnden Arzt“

### Patientenbericht für den Arztbesuch (Patient-Rolle)
1. Stammdaten, Datum
2. Beschwerden in Patientensprache **und** Fachbegriffen
3. Mögliche Ursachen als „Verdacht – ärztlich abzuklären“ mit Begründung
4. Dringlichkeitseinschätzung und empfohlene Fachrichtung
5. Fotos, Wearable-Auffälligkeiten
6. Fragen, die der Patient dem Arzt stellen kann
7. Hinweis: „Keine ärztliche Diagnose“

## 7. Architektur (hybrid)

- **Regel-Engine** (versionierte JSON/YAML-Regeln): Red Flags, Kontraindikationen, Wechselwirkungen, Rollenfilter, Dosisgrenzen. **Regeln haben immer Vorrang vor der KI.**
- **KI-Schicht** (Claude API):
  - strukturiert Freitext/Transkripte in Symptome,
  - beschreibt Fotos (Morphologie, Lokalisation, Ausdehnung) als zusätzlichen Hinweis,
  - erzeugt Diagnose-Hypothesen, Begründungen und Rückfragen.
  - Ausgabe ausschließlich als JSON nach festem Schema, das validiert wird. Ungültige Ausgaben werden verworfen.
  - Jede KI-Ausgabe wird anschließend durch die Regel-Engine geprüft.
  - Prompt- und Modellversion werden bei jeder Anfrage geloggt.
- **Speech-to-Text:** eigener Dienst (on-device auf iOS/Android oder EU-gehosteter STT-Dienst).
- **Pseudonymisierung:** An KI- und STT-Dienste werden keine Namen oder direkten Identifikatoren übertragen; Foto-Metadaten (EXIF, GPS) werden entfernt.
- **Fachbereiche** als Daten-Module (`/content/fachbereiche/<name>/`) mit Status `validiert: ja/nein` und `geprüft von:`; ungeprüfte Module werden in der Oberfläche gekennzeichnet.

## 8. Tech-Stack (Vorschlag)

- **Monorepo** mit Turborepo und pnpm-Workspaces: `apps/web` (Next.js), `apps/mobile` (Expo), `packages/core` (Regel-Engine, Typen, Schemas), `packages/ui`
- **Web:** Next.js (TypeScript), responsive
- **Mobile:** React Native / Expo (native App nötig für HealthKit und Health Connect, Kamera, Sprachaufnahme)
- **Backend:** Next.js Route Handlers / Server Actions in `apps/web` (läuft als Vercel Functions)
- **Datenbank:** PostgreSQL mit Prisma, Anbieter mit EU-Region Frankfurt (z. B. Neon über den Vercel Marketplace oder Supabase); Verschlüsselung at rest und in transit
- **Dateien (Fotos, Audio, PDFs):** privater Objektspeicher in der EU, Zugriff nur über kurzlebige signierte URLs
- **PDF:** serverseitige Erzeugung (z. B. React-PDF oder Puppeteer) mit Vorlagen
- **Auth:** E-Mail + Passwort mit Pflicht-2FA; rollenbasierte Rechte; Einwilligungsverwaltung (DSGVO Art. 9)
- **Hosting:** Vercel (Web + API), Functions-Region `fra1` (Frankfurt); Datenbank und Speicher in derselben Region
- **Tests:** Vitest/Jest für Logik, Playwright für Web-Abläufe, Detox/Maestro für Mobile; Regeltests mit klinischen Testfällen

## 8a. Repository und Deployment

- **GitHub:** privates Repository. Branch `main` = Produktion, Feature-Branches mit Pull Requests.
- **Vercel** ist mit GitHub verbunden: jeder Push auf `main` → Produktions-Deployment, jeder Pull Request → Preview-Deployment.
- Vercel-Projekt zeigt auf `apps/web` (Root Directory), Build über Turborepo.
- **Preview- und Produktions-Deployments mit Zugriffsschutz** (Vercel Deployment Protection bzw. Login), solange es eine Demo ist – keine öffentlich erreichbare Diagnose-Funktion.
- **Secrets** (Anthropic API Key, Datenbank-URL, Speicher-Keys) ausschließlich als Vercel Environment Variables, getrennt nach Production / Preview / Development. Niemals im Repository; `.env.example` ohne Werte pflegen.
- **GitHub Actions** bei jedem Pull Request: Lint, Typecheck, Tests (inkl. Regel-Engine-Testfälle). Merge nur bei grünen Checks.
- **Vercel-Grenzen beachten:**
  - Request-Body bei Functions ist begrenzt (ca. 4,5 MB) → Fotos und Sprachaufnahmen **direkt vom Client in den Objektspeicher** hochladen (signierte Upload-URL), die API bekommt nur die Referenz.
  - Laufzeit von Functions ist je nach Tarif begrenzt → KI-Antworten **streamen**; lange Aufgaben (z. B. PDF-Erzeugung mit vielen Bildern) bei Bedarf als Hintergrundjob.
  - `maxDuration` und `regions` pro Route explizit setzen.
- **Datenbank-Migrationen** mit Prisma Migrate; Produktion wird nur über die Pipeline migriert, nie manuell.
- **Mobile App** (Expo) wird **nicht** über Vercel ausgeliefert, sondern über Expo EAS Build in App Store / Google Play; sie nutzt die API unter der Vercel-Domain.
- **Datenschutz-Hinweis:** Vercel ist ein US-Anbieter. Für den Prototyp mit Testdaten unkritisch. Vor echten Gesundheitsdaten (DSGVO Art. 9) prüfen: Auftragsverarbeitungsvertrag, Datenübermittlung in Drittländer, Verschlüsselung, ggf. Wechsel auf rein europäisches Hosting. Die Architektur bleibt dafür anbieterneutral (keine harte Bindung an Vercel-spezifische Dienste in `packages/core`).

## 9. Datenquellen (Lizenzen vor Marktreife klären)

- **ICD-10-GM:** BfArM
- **Leitlinien:** AWMF; Nutzung und Urheberrecht klären, Quellenangabe pro Empfehlung
- **Arzneimitteldaten:** kommerzielle Datenbanken (z. B. ABDA, ifap, MMI) – kostenpflichtig
- **Im Prototyp:** kleiner, selbst erstellter Demo-Datensatz, klar als solcher gekennzeichnet

## 10. Nicht im Prototyp

- Echte Patientendaten
- Anbindung an Praxisverwaltungssysteme / ePA / Telematikinfrastruktur
- E-Rezept, Abrechnung
- Zahlungs- und Lizenzverwaltung (kommt später)

## 11. Meilensteine für Claude Code

1. Monorepo-Gerüst, GitHub-Repository, Vercel-Projekt (Root `apps/web`, Region `fra1`), GitHub Actions; Datenmodell (Nutzer, Rolle, Patientenprofil, Fall, Eingabe, Foto, Befund, Diagnose, Plan, Freigabe, Einwilligung), Auth mit Rollenwahl
2. Patientenprofil (Patient: eigenes Profil + Kinderprofile; Arzt: mehrere Patienten) und Design-Grundlage aus `style.css`
3. Regel-Engine mit Red Flags, Krisenpfad und Rollenfilter, mit Tests
4. Weg 2: Körperkarte + geführte Fragen (körperlich/seelisch); danach Weg 3: Entwicklungs-Check für Kinder
5. Weg 1: Freitext, dann Sprachaufnahme, dann Foto-Upload
6. KI-Schicht mit JSON-Schema und Validierung
7. Eingrenzungs-Schleife und Neubewertung
8. Therapie- und Medikamentenplan inkl. Sicherheitsprüfungen (Arzt)
9. PDF-Berichte (Arzt und Patient)
10. Fall teilen Patient → Arzt
11. Mobile App (Expo) mit Wearable-Anbindung (HealthKit, Health Connect)
12. Doku-Stand: requirements.md, risks.md und Testabdeckung prüfen

## 12. Arbeitsweise

- Vor jeder Funktion zuerst die Anforderung in `requirements.md` ergänzen.
- Kleine Schritte, jeder mit Tests.
- Sicherheitsrelevante Logik (Red Flags, Krisenpfad, Dosierung, Rollen) niemals ausschließlich in der KI lösen.
- Medizinische Inhalte werden nicht „erfunden“: Jede Regel braucht eine Quelle oder wird als `ungeprüft` markiert.

## 13. Design

- Farben, Schrift und Komponenten sind in `/styles/style.css` definiert (CSS-Variablen). Alle Komponenten nutzen ausschließlich diese Variablen.
- **Stil:** klinisch-ruhig, viel Weißraum, kühle Neutraltöne; **Rosé** (`--rose-700` #A8325E) als Markenfarbe für Buttons, Links, Auswahl und Navigation.
- **Rosé ist nie Warnfarbe.** Dringlichkeit hat eigene Farben (Notfall Rot, dringend Orange, Routine Blau, Beobachten Grün) und wird immer zusätzlich mit Symbol und Text angezeigt, nie nur über Farbe.
- Messwerte/Wearable-Daten in Blau (`--data-700`), damit sie sich von Marke und Warnungen abheben.
- **Schrift:** Atkinson Hyperlegible, Grundgröße 17 px. Fachbegriffe kursiv neben der Alltagssprache.
- **Barrierefreiheit:** WCAG 2.1 AA (Kontraste, Tastaturbedienung, sichtbarer Fokus, Bedienelemente mind. 48 px hoch), `prefers-reduced-motion` beachten.
- Kinderprofile werden mit blauem Avatar gekennzeichnet, damit immer klar ist, für wen gerade untersucht wird.
- Referenz-Ansicht: `/docs/design-vorschau.html`.
