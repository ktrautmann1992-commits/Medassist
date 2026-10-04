import { MAX_BESCHREIBUNG, naechsterSchritt, standardFragenkataloge, standardRegelwerk, type GespeicherteEingabeRoh } from "@medassist/core";
import { describe, expect, it } from "vitest";
import { schrittAnsicht } from "./ansicht";
import { bewerteFall, type FallKontext } from "./auswertung";
import { absichern, SPRACHE_NICHT_GEFUNDEN, transkriptHash, TRANSKRIPT_PRUEFEN, verarbeiteSchritt } from "./schritt";

const regelwerk = standardRegelwerk();
const kataloge = standardFragenkataloge();
const STICHTAG = new Date("2026-10-03T00:00:00Z");
const PROFIL = { geburtsdatum: new Date("1980-01-01T00:00:00Z"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT" as const, istKinderprofil: false };

function kontext(teil: Partial<FallKontext>): FallKontext {
  return { regelwerk, kataloge, bereich: "KOERPERLICH", profil: PROFIL, eingaben: [], rolle: "PATIENT", stichtag: STICHTAG, alterMonate: 560, weg: "FREITEXT", ...teil };
}
function e(schritt: string, wert: unknown): GespeicherteEingabeRoh {
  return { frageId: schritt, strukturiert: { v: 1, katalogVersion: "0.2.0", schritt, teilweise: false, wert } };
}
function fd(eintraege: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of eintraege) f.append(k, v);
  return f;
}
const NICHTS = e("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} });
const verarbeite = (f: FormData, sprache: { transkriptHash: string } | null = null) =>
  verarbeiteSchritt(kataloge, regelwerk, "KOERPERLICH", { art: "beschreibung" }, f, null, sprache);

describe("REQ-401 Weg 1 im Fall-Kontext", () => {
  it("FREITEXT: Schnellcheck zuerst, dann Beschreibung; GEFUEHRT ohne Beschreibung", () => {
    expect(naechsterSchritt(kataloge, bewerteFall(kontext({})).stand).art).toBe("schnellcheck");
    expect(naechsterSchritt(kataloge, bewerteFall(kontext({ eingaben: [NICHTS] })).stand).art).toBe("beschreibung");
    expect(naechsterSchritt(kataloge, bewerteFall(kontext({ weg: "GEFUEHRT", eingaben: [NICHTS] })).stand).art).toBe("region");
  });

  it("Warnzeichen im Schnellcheck ⇒ Hinweis vor der Beschreibung (NOTFALL ⇒ erst Bestätigung)", () => {
    const b = bewerteFall(kontext({ eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: ["bewusstlosigkeit"], keine: false, messwerte: {} })] }));
    expect(b.notfall).toBe("NOTFALL");
    expect(naechsterSchritt(kataloge, b.stand).art).toBe("notfall_weiter");
  });

  it("Ansicht des Schritts mit Höchstlänge und vorheriger Beschreibung", () => {
    const b = bewerteFall(kontext({ eingaben: [NICHTS, e("beschreibung", { typ: "beschreibung", quelle: "text", text: "Husten", korrigiert: false })] }));
    expect(schrittAnsicht(kataloge, regelwerk, "KOERPERLICH", { art: "beschreibung" }, b.gesammelt, "PATIENT", false)).toEqual({
      art: "beschreibung",
      maxLaenge: MAX_BESCHREIBUNG,
      vorher: { text: "Husten", quelle: "text" },
    });
  });
});

describe("REQ-402 Freitext speichern – nie still kürzen", () => {
  it("Text ⇒ Eingabe TEXT mit unverändertem Inhalt (CRLF vereinheitlicht)", () => {
    const v = verarbeite(fd([["text", "  Kopfschmerzen\r\nseit gestern "]]));
    expect(v.fehler).toBeUndefined();
    expect(v.eingaben).toHaveLength(1);
    expect(v.eingaben[0]).toMatchObject({
      frageId: "beschreibung",
      typ: "TEXT",
      inhalt: "Kopfschmerzen\nseit gestern",
      korrigiert: false,
      strukturiert: { schritt: "beschreibung", teilweise: false, wert: { typ: "beschreibung", quelle: "text", text: "Kopfschmerzen\nseit gestern", korrigiert: false } },
    });
    // absichern lässt die gültige Eingabe unverändert (2000 Zeichen ⇒ nicht gekürzt)
    const lang = verarbeite(fd([["text", "x".repeat(MAX_BESCHREIBUNG)]])).eingaben[0]!;
    expect(absichern(lang)).toEqual(lang);
  });

  it("zu lang ⇒ Ablehnung mit Feldmeldung, nichts gespeichert", () => {
    const v = verarbeite(fd([["text", "x".repeat(MAX_BESCHREIBUNG + 1)]]));
    expect(v.eingaben).toEqual([]);
    expect(v.feldFehler?.text?.[0]).toContain("zu lang");
  });

  it("leer ⇒ Pflichtmeldung", () => {
    expect(verarbeite(fd([["text", "   "]])).feldFehler?.text?.[0]).toContain("eigenen Worten");
  });

  it("Krisenantwort im Beschreibungs-Schritt wird trotzdem gespeichert (REQ-311)", () => {
    const v = verarbeiteSchritt(kataloge, regelwerk, "PSYCHISCH", { art: "beschreibung" }, fd([["text", "Mir geht es schlecht"], ["antwort.krise_plaene", "ja"]]));
    expect(v.eingaben.map((x) => x.frageId)).toEqual(["krise", "beschreibung"]);
  });
});

describe("REQ-407 Transkript: korrigierbar, Prüfbestätigung, `korrigiert` vom Server", () => {
  const ROH = "Seit drei Tagen Halsschmerzen.";
  const sprache = { transkriptHash: transkriptHash(ROH) };

  it("ohne serverseitig bekannte Aufnahme ⇒ abgewiesen", () => {
    expect(verarbeite(fd([["text", ROH], ["quelle", "sprache"], ["transkriptGeprueft", "on"]])).feldFehler?.text).toEqual([SPRACHE_NICHT_GEFUNDEN]);
  });

  it("ohne Prüfbestätigung ⇒ abgewiesen", () => {
    expect(verarbeite(fd([["text", ROH], ["quelle", "sprache"]]), sprache).feldFehler?.transkriptGeprueft).toEqual([TRANSKRIPT_PRUEFEN]);
  });

  it("unverändert ⇒ korrigiert=false; geändert ⇒ korrigiert=true; Typ SPRACH_TRANSKRIPT", () => {
    const gleich = verarbeite(fd([["text", `${ROH}\r\n`], ["quelle", "sprache"], ["transkriptGeprueft", "on"]]), sprache).eingaben[0]!;
    expect(gleich).toMatchObject({ typ: "SPRACH_TRANSKRIPT", korrigiert: false, strukturiert: { wert: { quelle: "sprache", korrigiert: false } } });
    const geaendert = verarbeite(fd([["text", "Seit drei Tagen keine Halsschmerzen."], ["quelle", "sprache"], ["transkriptGeprueft", "on"]]), sprache).eingaben[0]!;
    expect(geaendert).toMatchObject({ typ: "SPRACH_TRANSKRIPT", korrigiert: true, strukturiert: { wert: { korrigiert: true } } });
  });

  it("ein vom Client behauptetes `korrigiert` wird ignoriert", () => {
    const v = verarbeite(fd([["text", ROH], ["quelle", "sprache"], ["transkriptGeprueft", "on"], ["korrigiert", "true"]]), sprache).eingaben[0]!;
    expect(v.korrigiert).toBe(false);
  });
});
