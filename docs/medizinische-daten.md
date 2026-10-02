# Medizinische Wissensdaten – Konzept

> Demo – nicht für den klinischen Einsatz. Dieses Dokument beschreibt die geplante
> Architektur. **Es werden noch keine Daten importiert**, und `schema.prisma` bleibt
> unverändert. Anforderungen: REQ-040 – REQ-044 in [`requirements.md`](./requirements.md),
> Risiko: RISK-013 in [`risks.md`](./risks.md). Rahmen: CLAUDE.md §7 und §9.

## 1. Grundsätze

1. **Eine Datenbank:** Wissensdaten liegen in eigenen Tabellen derselben PostgreSQL-Instanz
   (EU-Region Frankfurt) wie die Anwendungsdaten – kein zusätzlicher Dienst, keine
   zusätzliche Drittlandübermittlung. Wissenstabellen enthalten **keine Patientendaten**
   und werden logisch getrennt (eigenes Präfix bzw. eigenes PostgreSQL-Schema `wissen`).
2. **Herkunft je Datensatz (REQ-041):** Jeder Datensatz verweist auf eine Quellversion mit
   Quelle, Herausgeber, Version/Stand, Lizenz, Lizenzstatus und Importzeitpunkt.
3. **Versioniert, nicht überschrieben (REQ-041):** Ein neuer Import legt eine neue
   Quellversion an. Alte Stände bleiben lesbar, damit Diagnosen, Regeln und Berichte auf
   den damals gültigen Stand verweisen können (z. B. ICD-10-GM 2026 vs. 2027).
4. **Prüfstatus (REQ-042):** Jeder Datensatz hat `validiert` (ja/nein), `geprueftVon` und
   `geprueftAm`. Ungeprüfte Inhalte werden in Oberfläche und PDF als „ungeprüft“
   gekennzeichnet – analog zu den Fachbereichs-Modulen (CLAUDE.md §7).
5. **Zugriff nur über `packages/core` (REQ-043):** Anwendungscode (Regel-Engine, KI-Schicht,
   Oberfläche) nutzt ausschließlich Schnittstellen aus `packages/core`. Die
   Prisma-Implementierung liegt in `apps/web`; `packages/core` bleibt anbieterneutral
   (keine Abhängigkeit zu Prisma, Vercel oder einem Datenbankanbieter).
6. **Nichts erfinden (CLAUDE.md §12):** Inhalte ohne belegte Quelle werden nicht importiert
   oder ausdrücklich als `ungeprüft` markiert. Lizenzen werden vor Marktreife geklärt
   (REQ-044); solange eine Lizenz nicht geklärt ist, steht in der Tabelle „Lizenz prüfen“.

## 2. Datenquellen

Lizenzstatus (in der Datenbank als Feld `lizenzStatus`, siehe Abschnitt 3):
**geklärt** (`GEKLAERT`) · **Lizenz prüfen** (`PRUEFEN`, Nutzungsbedingungen noch nicht
juristisch bewertet) · **Lizenz nötig** (`LIZENZ_NOETIG`, kommerziell, Vertrag erforderlich)
· **Demo** (`DEMO`, selbst erstellter Demo-Datensatz ohne externe Quelle, immer
`validiert: nein` und in der Oberfläche als „ungeprüft“ gekennzeichnet). Keine der Angaben
ersetzt eine rechtliche Prüfung.

| Bereich | Quelle / Herausgeber | Zugang | Lizenzstatus | Phase |
|---|---|---|---|---|
| Diagnosen | **ICD-10-GM**, BfArM | Kostenfreier Download nach Annahme der Downloadbedingungen des BfArM; jährlich neue Version | Lizenz prüfen (Nutzungsbedingungen beachten, u. a. Quellenangabe und Umgang mit Bearbeitungen) | Phase 1 (REQ-040) |
| Prozeduren | **OPS**, BfArM | Download beim BfArM; jährlich neue Version | Lizenz prüfen | später |
| Wirkstoffklassen | **ATC-Klassifikation mit DDD**, amtliche deutsche Fassung (BfArM, erstellt durch das WIdO) | Download beim BfArM | Lizenz prüfen | Phase 1/2 |
| Arzneimittel (Präparate, Wechselwirkungen, Kontraindikationen, Dosierungen) | Kommerzielle Datenbanken, z. B. **ABDA-Datenbank**, **ifap**, **MMI Pharmindex** | Nur mit Lizenzvertrag | Lizenz nötig (Demo-Datensatz: Demo) | Prototyp: eigener kleiner **Demo-Datensatz**, vollständig als `ungeprüft` markiert; Lizenzdatenbank vor Marktreife |
| Leitlinien | **AWMF** (Leitlinien der Fachgesellschaften) | Öffentlich einsehbar | Lizenz prüfen (Urheberrecht) – bis zur Klärung **nur Verweise/Quellenangaben** (Register-Nr., Titel, Version, Stand), keine Textübernahme | ab Meilenstein 3/8 |
| Kinder: Wachstum | **Kromeyer-Hauschild**-Perzentilen (deutsche Referenz); **WHO Child Growth Standards** | WHO-Daten frei abrufbar; Kromeyer-Hauschild aus der Originalpublikation | WHO: Nutzungsbedingungen prüfen · Kromeyer-Hauschild: Lizenz prüfen | Phase 2 (Meilenstein 2, Perzentilen) |
| Kinder: Impfungen | **STIKO-Impfkalender**, Robert Koch-Institut (Epidemiologisches Bulletin) | Öffentlich, jährliche Aktualisierung | Lizenz prüfen; strukturiert manuell übertragen, mit Quellenangabe und Stand | Phase 2 |
| Labor-Referenzbereiche | Eigene Zusammenstellung, **je Wert quellenbelegt** (alters-/geschlechtsabhängig) | – | Je Quelle prüfen; ohne Beleg nicht verwenden | mit Meilenstein 7/8 |

## 3. Geplante Tabellen (Skizze)

> Nur Skizze – **nicht** in `schema.prisma` umsetzen, bevor die zugehörigen
> Anforderungen umgesetzt werden. Feldnamen wie im bestehenden Schema auf Deutsch.

**Gemeinsame Felder** aller Wissensdatensätze:
`quellversionId`, `validiert` (Boolean, Standard `false`), `geprueftVon`, `geprueftAm`,
`bemerkung`.

| Tabelle | Zweck | Wichtige Felder |
|---|---|---|
| `WissensQuelle` | Stammsatz je Quelle | `kuerzel` (z. B. `ICD10GM`), `name`, `herausgeber`, `url`, `lizenz`, `lizenzStatus` (GEKLAERT · PRUEFEN · LIZENZ_NOETIG · DEMO) |
| `WissensQuellversion` | Ein Import-Stand einer Quelle | `quelleId`, `version` (z. B. `2026`), `stand`, `gueltigAb`, `gueltigBis`, `importiertAm`, `pruefsumme` (SHA-256 der Rohdatei), `importSkriptVersion`, `aktiv` |
| `Icd10GmKode` | ICD-10-GM-Systematik | `kode`, `titel`, `elternKode`, `ebene` (Kapitel/Gruppe/Kategorie), `endstellig`, `geschlechtsbezug`, `altersgrenzen`, Hinweise/Exklusiva; eindeutig je (`quellversionId`, `kode`) |
| `OpsKode` | OPS (später) | analog `Icd10GmKode` |
| `AtcKode` | ATC mit DDD | `kode`, `bezeichnung`, `ebene`, `ddd`, `dddEinheit`, `applikationsweg` |
| `Wirkstoff` | Demo-Arzneimitteldaten | `bezeichnung`, `atcKode`, Darreichungsformen |
| `Wechselwirkung` | Paarweise Interaktionen | `wirkstoffA`, `wirkstoffB`, `schweregrad`, `beschreibung`, `quelleBeleg` |
| `Kontraindikation` | Wirkstoff ↔ Zustand | `wirkstoffId`, `bezug` (ICD-Kode, Schwangerschaft, Alter, Nieren-/Leberfunktion), `art` (absolut/relativ) |
| `Dosisregel` | Dosisgrenzen, auch Kinder | `wirkstoffId`, `alterVon/Bis`, `gewichtVon/Bis`, `dosisProKg`, `maxEinzeldosis`, `maxTagesdosis`, `zulassungAbAlter` |
| `Perzentile` | Wachstumsreferenzen | `referenz` (z. B. KROMEYER_HAUSCHILD, WHO), `merkmal` (Größe, Gewicht, BMI, Kopfumfang), `geschlecht`, `alterMonate`, LMS-Parameter bzw. Perzentilwerte |
| `ImpfEmpfehlung` | STIKO-Kalender | `impfung`, `alterVon/Bis`, `dosisNr`, `art` (Grundimmunisierung/Auffrischung), `hinweis` |
| `LaborReferenzbereich` | Normwerte | `parameter`, `einheit`, `geschlecht`, `alterVon/Bis`, `untergrenze`, `obergrenze`, `quelleBeleg` |
| `Leitlinienverweis` | Nur Verweise (AWMF) | `registerNr`, `titel`, `version`, `stand`, `url`, `klasse` (S1–S3) |

Anwendungsdaten (z. B. `Diagnose`) referenzieren künftig neben dem Code auch die
`quellversionId`, damit nachvollziehbar bleibt, welcher Katalogstand galt (REQ-039, REQ-041).

## 4. Schnittstelle in `packages/core` (REQ-043)

Geplant unter `packages/core/src/wissen/`:

- **Typen und zod-Schemas** der Wissensdatensätze (inkl. Herkunft und Prüfstatus).
- **Schnittstellen** (Ports), z. B. `Icd10Katalog` (`findeKode(kode, version?)`,
  `suche(text, version?)`), `ArzneimittelWissen`, `Wachstumsreferenz`, `Impfkalender`.
  Jede Antwort enthält Quelle, Version und `validiert`.
- **Parser** für die Rohformate (z. B. ICD-10-GM-Downloaddateien) als reine Funktionen
  mit Unit-Tests – ohne Datenbankzugriff.

Die Implementierung der Schnittstellen mit Prisma liegt in `apps/web/lib/wissen/`. Ein
späterer Wechsel des Datenbank- oder Hostinganbieters betrifft nur diese Schicht (RISK-010).

## 5. Importpfad

```
content/
  wissen/
    icd10gm/2026/manifest.yaml     # Quelle, Version, Lizenz, Prüfsumme, Herkunfts-URL
    arzneimittel-demo/manifest.yaml + daten.yaml   # selbst erstellt, validiert: nein
tools/
  import/                          # CLI-Skripte (Node/TypeScript), nutzen Parser aus packages/core
```

1. **Rohdaten** liegen unter `/content/wissen/<quelle>/<version>/`. Dateien, deren Lizenz
   eine Ablage im Repository nicht erlaubt oder ungeklärt lässt, werden **nicht**
   eingecheckt; im Repository steht dann nur das Manifest mit Prüfsumme und Bezugsquelle,
   die Datei kommt aus dem privaten EU-Objektspeicher.
2. **Import-Skript** (`tools/import`) liest Manifest und Rohdatei, prüft die Prüfsumme,
   parst mit `packages/core`, validiert mit zod und schreibt in einer Transaktion eine neue
   `WissensQuellversion` mit allen Datensätzen. Idempotent (gleiche Prüfsumme → kein
   erneuter Import), mit Trockenlauf (`--dry-run`) und Bericht (Anzahl, Abweichungen zur
   Vorversion).
3. **Aktivierung** einer neuen Version ist ein eigener, protokollierter Schritt
   (`aktiv = true`), nach fachlicher Prüfung.
4. **Produktion** wird – wie bei Migrationen – nur über die Pipeline befüllt, nie manuell.
5. **Tests:** Parser-Unit-Tests mit kleinen Ausschnitten; Import-Test gegen die
   Test-Datenbank in CI; Stichproben bekannter Kodes je Version.

## 6. Offene Punkte

- Juristische Prüfung der Nutzungsbedingungen je Quelle (REQ-044, RISK-013).
- Auswahl und Vertrag einer kommerziellen Arzneimitteldatenbank vor Meilenstein 8 im
  Produktivbetrieb; bis dahin nur Demo-Datensatz, als `ungeprüft` gekennzeichnet.
- Festlegung, welche Perzentilreferenz (Kromeyer-Hauschild, WHO) für welches Alter gilt –
  fachlich (Pädiatrie) zu entscheiden.
- Prozess für die fachliche Prüfung (`geprueftVon`) und die jährliche Aktualisierung.
