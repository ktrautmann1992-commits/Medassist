import { describe, expect, it } from "vitest";
import {
  bearbeitbareSchritte,
  erlaubterSchritt,
  fortschritt,
  naechsterSchritt,
  schrittId,
  vorherigerSchritt,
  type AblaufStand,
} from "./ablauf";
import type { AntwortWert } from "./antwort";
import { bedingungErfuellt, type FrageKontext } from "./bedingung";
import { standardFragenkataloge } from "./standard";

const k = standardFragenkataloge();

function stand(teil: Partial<AblaufStand> = {}): AblaufStand {
  return {
    bereich: "KOERPERLICH",
    kriseErledigt: false,
    krise: false,
    schnellcheckErledigt: false,
    notfallAktiv: false,
    notfallBestaetigt: false,
    region: null,
    antworten: {},
    kinderprofil: false,
    alterMonate: 400,
    ...teil,
  };
}

const naechsteId = (s: AblaufStand) => schrittId(naechsterSchritt(k, s));
const einfach = (option: string): AntwortWert => ({ typ: "einfach", option });
const KEINE: AntwortWert = { typ: "keine_angabe" };

describe("REQ-305 Reihenfolge körperlich", () => {
  it("Schnellcheck → Region → Fragen → Zusammenfassung", () => {
    expect(naechsteId(stand())).toBe("schnellcheck");
    expect(naechsteId(stand({ schnellcheckErledigt: true }))).toBe("region");
    expect(naechsteId(stand({ schnellcheckErledigt: true, region: "brust" }))).toBe("k_art");
    // unbekannte Region (z. B. aus älterer Katalogversion) ⇒ Region erneut wählen
    expect(naechsteId(stand({ schnellcheckErledigt: true, region: "mond" }))).toBe("region");
  });

  it("Bedingungen: Schmerzart nur bei Schmerzen, Seite nur bei passenden Regionen, Haut bei Hautveränderung", () => {
    const basis = { schnellcheckErledigt: true, region: "brust" };
    expect(naechsteId(stand({ ...basis, antworten: { k_art: einfach("schmerz") } }))).toBe("k_schmerzart");
    expect(naechsteId(stand({ ...basis, antworten: { k_art: einfach("schwellung") } }))).toBe("k_seite");
    expect(naechsteId(stand({ ...basis, region: "fuss_links", antworten: { k_art: einfach("schwellung") } }))).toBe("k_beginn");
    expect(naechsteId(stand({ ...basis, region: "fuss_links", antworten: { k_art: einfach("haut") } }))).toBe("k_haut");
    expect(naechsteId(stand({ ...basis, region: "haut_mehrere", antworten: { k_art: KEINE } }))).toBe("k_haut");
  });

  it("alle Fragen beantwortet ⇒ Zusammenfassung", () => {
    const antworten: Record<string, AntwortWert> = {};
    for (const f of k.kataloge.KOERPERLICH.fragen) antworten[f.id] = KEINE;
    expect(naechsteId(stand({ schnellcheckErledigt: true, region: "allgemein", antworten }))).toBe("zusammenfassung");
  });
});

describe("REQ-311 Reihenfolge seelisch: Krisen-Screening zuerst", () => {
  const s = (teil: Partial<AblaufStand>) => stand({ bereich: "PSYCHISCH", ...teil });
  it("Krise → Schnellcheck → Fragen (keine Körperregion)", () => {
    expect(naechsteId(s({}))).toBe("krise");
    // Auch ein (manipuliert) erledigter Schnellcheck überspringt das Krisen-Screening nicht.
    expect(naechsteId(s({ schnellcheckErledigt: true }))).toBe("krise");
    expect(naechsteId(s({ kriseErledigt: true }))).toBe("schnellcheck");
    expect(naechsteId(s({ kriseErledigt: true, schnellcheckErledigt: true }))).toBe("s_stimmung");
  });

  it("KRISE beendet den Ablauf – kein weiterer Schritt, nichts bearbeitbar", () => {
    const beendet = s({ kriseErledigt: true, krise: true, schnellcheckErledigt: true, antworten: { s_stimmung: KEINE } });
    expect(naechsterSchritt(k, beendet).art).toBe("beendet");
    expect(bearbeitbareSchritte(k, beendet)).toEqual([]);
    for (const id of ["krise", "schnellcheck", "s_stimmung", "s_antrieb", "zusammenfassung"]) expect(erlaubterSchritt(k, beendet, id), id).toBeNull();
  });
});

describe("REQ-308 NOTFALL: Bestätigung vor jeder weiteren Frage", () => {
  it("Notfall aktiv ⇒ Bestätigungsschritt; nach Bestätigung weiter; auch mitten im Ablauf", () => {
    expect(naechsteId(stand({ schnellcheckErledigt: true, notfallAktiv: true }))).toBe("notfall_weiter");
    expect(naechsteId(stand({ schnellcheckErledigt: true, notfallAktiv: true, notfallBestaetigt: true }))).toBe("region");
    const mitten = stand({ schnellcheckErledigt: true, region: "brust", antworten: { k_art: KEINE }, notfallAktiv: true });
    expect(naechsteId(mitten)).toBe("notfall_weiter");
    // Kein „Zurück“, solange die Bestätigung offen ist.
    expect(erlaubterSchritt(k, mitten, "k_art")).toBeNull();
    expect(erlaubterSchritt(k, mitten, "notfall_weiter")?.art).toBe("notfall_weiter");
  });
});

describe("REQ-305 erlaubte Schritte (kein Überspringen, kein Bearbeiten der Pflichtschritte)", () => {
  const mitte = stand({ schnellcheckErledigt: true, region: "brust", antworten: { k_art: einfach("schmerz"), k_schmerzart: einfach("stechend") } });

  it("nächster offener Schritt und beantwortete Fragen sind erlaubt, spätere nicht", () => {
    expect(naechsteId(mitte)).toBe("k_seite");
    expect(erlaubterSchritt(k, mitte, "k_seite")?.art).toBe("frage");
    expect(erlaubterSchritt(k, mitte, "k_art")?.art).toBe("frage");
    expect(erlaubterSchritt(k, mitte, "region")?.art).toBe("region");
    expect(erlaubterSchritt(k, mitte, "k_dauer")).toBeNull();
    expect(erlaubterSchritt(k, mitte, "k_ergaenzung")).toBeNull();
    expect(erlaubterSchritt(k, mitte, "schnellcheck")).toBeNull();
    expect(erlaubterSchritt(k, mitte, "krise")).toBeNull();
    expect(erlaubterSchritt(k, mitte, "zusammenfassung")).toBeNull();
    expect(erlaubterSchritt(k, mitte, "gibt_es_nicht")).toBeNull();
  });

  it("Krisen-Screening im seelischen Ablauf ist nicht erneut bearbeitbar", () => {
    const s = stand({ bereich: "PSYCHISCH", kriseErledigt: true, schnellcheckErledigt: true, antworten: { s_stimmung: KEINE } });
    expect(bearbeitbareSchritte(k, s)).toEqual(["s_stimmung"]);
    expect(erlaubterSchritt(k, s, "krise")).toBeNull();
  });

  it("Zurück und Fortschritt", () => {
    expect(vorherigerSchritt(k, mitte, "k_seite")).toBe("k_schmerzart");
    expect(vorherigerSchritt(k, mitte, "k_art")).toBe("region");
    expect(vorherigerSchritt(k, mitte, "region")).toBeNull();
    expect(fortschritt(k, mitte, "k_seite")).toEqual({ nummer: 5, gesamt: 13 });
    expect(fortschritt(k, mitte, "notfall_weiter")).toBeNull();
  });
});

describe("REQ-302 Bedingungen auswerten", () => {
  const kontext = (teil: Partial<FrageKontext> = {}): FrageKontext => ({
    region: "brust",
    organsysteme: ["atmung"],
    kinderprofil: false,
    alterMonate: 24,
    antworten: { a: einfach("x"), m: { typ: "mehrfach", optionen: ["p"], keine: false, symptome: [] }, n: KEINE },
    ...teil,
  });
  it.each([
    [{ antwort: "a", ist: "x" }, true],
    [{ antwort: "a", ist: "y" }, false],
    [{ antwort: "m", enthaelt: "p" }, true],
    [{ antwort: "a", enthaelt: "x" }, false],
    [{ beantwortet: "a" }, true],
    [{ beantwortet: "n" }, false],
    [{ beantwortet: "fehlt" }, false],
    [{ region: ["bauch", "brust"] }, true],
    [{ organsystem: "haut" }, false],
    [{ kinderprofil: false }, true],
    [{ alter_monate: { "<": 12 } }, false],
    [{ nicht: { alter_monate: { "<": 12 } } }, true],
    [{ alle: [{ region: ["brust"] }, { antwort: "a", ist: "x" }] }, true],
    [{ eines: [{ region: ["kopf"] }, { organsystem: "atmung" }] }, true],
  ] as const)("%j ⇒ %s", (b, erwartet) => {
    expect(bedingungErfuellt(b as never, kontext())).toBe(erwartet);
  });

  it("unbekanntes Alter ⇒ altersabhängige Frage wird gestellt; Prototyp-Schlüssel zählen nicht", () => {
    expect(bedingungErfuellt({ alter_monate: { "<": 12 } }, kontext({ alterMonate: null }))).toBe(true);
    expect(bedingungErfuellt({ beantwortet: "constructor" }, kontext())).toBe(false);
    expect(bedingungErfuellt({ region: ["kopf"] }, kontext({ region: null }))).toBe(false);
  });
});
