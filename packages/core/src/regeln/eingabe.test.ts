import { describe, expect, it } from "vitest";
import { befundlageFuerProfil } from "./befundlage";
import { leseZahl, pruefeRegelEingabe, type RegelEingabeRoh } from "./eingabe";
import { pruefeVorrangig } from "./engine";
import { standardRegelwerk } from "./standard";

const w = standardRegelwerk();
const leer: RegelEingabeRoh = { symptome: [], messwerte: [], antworten: [], psychisch: false };
const erwachsen = { geburtsdatum: new Date("1990-01-01T00:00:00Z"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT" as const };
const saeugling = { ...erwachsen, geburtsdatum: new Date("2026-08-22T00:00:00Z") };
const STICHTAG = new Date("2026-10-03T00:00:00Z");

/** Eingabe prüfen und – wie die Web-App – trotz Feldfehlern auswerten (REQ-219). */
function auswerten(roh: Partial<RegelEingabeRoh>, profil = erwachsen) {
  const e = pruefeRegelEingabe(w, { ...leer, ...roh });
  return { ...e, pruefung: pruefeVorrangig(w, befundlageFuerProfil(profil, e.daten, STICHTAG)) };
}

describe("REQ-203/REQ-215 Eingabeprüfung", () => {
  it("gültige Eingabe mit Dezimalkomma", () => {
    const r = pruefeRegelEingabe(w, {
      symptome: ["fieber"],
      messwerte: [["temperatur_c", "38,5"]],
      antworten: [["krise_plaene", "nein"]],
      psychisch: "on",
    });
    expect(r).toEqual({
      feldFehler: {},
      daten: { symptome: ["fieber"], messwerte: { temperatur_c: [38.5] }, antworten: { krise_plaene: "nein" }, psychisch: true },
    });
  });

  it("leere Messwerte werden übersprungen", () => {
    expect(pruefeRegelEingabe(w, { ...leer, messwerte: [["temperatur_c", " "]] })).toEqual({
      feldFehler: {},
      daten: { symptome: [], messwerte: {}, antworten: {}, psychisch: false },
    });
  });

  it("unbekannte IDs und ungültige Werte werden gemeldet", () => {
    const r = pruefeRegelEingabe(w, {
      symptome: ["fiber", 3],
      messwerte: [["temperatur_c", "heiß"], ["puls", "80"]],
      antworten: [["krise_plaene", "vielleicht"], ["unbekannt", "ja"]],
      psychisch: false,
    });
    expect(Object.keys(r.feldFehler).sort()).toEqual(["antwort.krise_plaene", "antwort.unbekannt", "messwert.puls", "messwert.temperatur_c", "symptome"]);
    // ungültige Antwort wird konservativ als „keine_angabe“ gewertet
    expect(r.daten.antworten).toEqual({ krise_plaene: "keine_angabe" });
  });

  it("unplausible Temperatur wird verworfen (Tippfehlerschutz)", () => {
    const r = pruefeRegelEingabe(w, { ...leer, messwerte: [["temperatur_c", "385"]] });
    expect(r.feldFehler["messwert.temperatur_c"]![0]).toContain("zwischen 30 und 45");
    expect(r.daten.messwerte).toEqual({});
  });

  it.each([["37,39"], ["36,39"], ["37.39"], ["38,50"]])("zwei Nachkommastellen werden abgelehnt (R4-1): %j", (text) => {
    expect(leseZahl(text).ok).toBe(false);
  });

  it.each([["38°", 38], ["38 °C", 38], ["38,5°C", 38.5], ["３８", 38], [" 38 c", 38], ["38,5 ºC", 38.5], ["38,5º", 38.5], ["38˚C", 38], ["38,5℃", 38.5], ["38\u200B", 38]])("tolerantes Zahlenformat %j", (text, zahl) => {
    expect(pruefeRegelEingabe(w, { ...leer, messwerte: [["temperatur_c", text]] })).toEqual({
      feldFehler: {},
      daten: { symptome: [], messwerte: { temperatur_c: [zahl] }, antworten: {}, psychisch: false },
    });
  });

  it.each([["3.8e1"], ["NaN"], ["Infinity"], ["0x26"], ["38,5,5"], ["heiß"], ["38."], ["38,"], ["38°C."], ["+38"], ["38½"]])("ungültiges Zahlenformat %j wird gemeldet", (text) => {
    expect(pruefeRegelEingabe(w, { ...leer, messwerte: [["temperatur_c", text]] }).feldFehler["messwert.temperatur_c"]).toBeDefined();
  });

  it.each([[""], ["on"], ["true"], ["false"], ["0"], [true]])("S4: seelische Beschwerden bei jedem gesetzten Wert (%j)", (wert) => {
    const r = pruefeRegelEingabe(w, { ...leer, psychisch: wert });
    expect(r.daten.psychisch).toBe(wert !== "");
  });
});

describe("REQ-219 Teilauswertung – Eingabefehler unterdrücken keine Hinweise (B1)", () => {
  it("Krisenfrage „ja“ + Temperatur „38x“ ⇒ KRISE und Feldfehler", () => {
    const r = auswerten({ psychisch: "on", antworten: [["krise_gedanken_nicht_leben", "ja"]], messwerte: [["temperatur_c", "38x"]] });
    expect(r.pruefung.status).toBe("KRISE");
    expect(r.feldFehler["messwert.temperatur_c"]).toBeDefined();
  });

  it("Bewusstlosigkeit + Temperatur 29 ⇒ NOTFALL und Feldfehler", () => {
    const r = auswerten({ symptome: ["bewusstlosigkeit"], messwerte: [["temperatur_c", "29"]] });
    expect(r.pruefung.status).toBe("NOTFALL");
    expect(r.feldFehler["messwert.temperatur_c"]).toBeDefined();
  });

  it("unbekanntes Symptom + Krisenfrage „ja“ ⇒ KRISE", () => {
    const r = auswerten({ symptome: ["constructor"], antworten: [["krise_plaene", "ja"]] });
    expect(r.pruefung.status).toBe("KRISE");
    expect(r.feldFehler.symptome).toBeDefined();
  });

  it("unbekannte Frage (__proto__) + „ja“ ⇒ KRISE", () => {
    const r = auswerten({ antworten: [["__proto__", "ja"], ["krise_plaene", "ja"]] });
    expect(r.pruefung.status).toBe("KRISE");
    expect(r.feldFehler["antwort.__proto__"]).toBeDefined();
  });
});

describe("B2 doppelte Formularfelder – konservativ zusammengeführt", () => {
  it("Antwort „ja“ und danach „nein“ ⇒ „ja“ (KRISE)", () => {
    const r = auswerten({
      antworten: [
        ["krise_gedanken_nicht_leben", "ja"],
        ["krise_gedanken_selbstverletzung", "nein"],
        ["krise_plaene", "nein"],
        ["krise_gedanken_nicht_leben", "nein"],
      ],
    });
    expect(r.daten.antworten.krise_gedanken_nicht_leben).toBe("ja");
    expect(r.pruefung.kriseGrund).toBe("positiv");
  });

  it("„nein“ und „keine_angabe“ ⇒ „keine_angabe“; nur einheitlich „nein“ ist „nein“", () => {
    expect(pruefeRegelEingabe(w, { ...leer, antworten: [["krise_plaene", "nein"], ["krise_plaene", "keine_angabe"]] }).daten.antworten).toEqual({ krise_plaene: "keine_angabe" });
    expect(pruefeRegelEingabe(w, { ...leer, antworten: [["krise_plaene", "nein"], ["krise_plaene", "nein"]] }).daten.antworten).toEqual({ krise_plaene: "nein" });
  });

  it("Temperatur 39 und leerer zweiter Wert ⇒ 39 bleibt (Red Flag beim Säugling)", () => {
    const r = auswerten({ messwerte: [["temperatur_c", "39"], ["temperatur_c", ""]] }, saeugling);
    expect(r.pruefung.redFlags.map((x) => x.id)).toEqual(["RF-KIND-001"]);
  });

  it("zwei Temperaturen 37 und 38,5 ⇒ beide geprüft, Red Flag, Hinweis", () => {
    const r = auswerten({ messwerte: [["temperatur_c", "37"], ["temperatur_c", "38,5"]] }, saeugling);
    expect(r.daten.messwerte).toEqual({ temperatur_c: [37, 38.5] });
    expect(r.pruefung.redFlags.map((x) => x.id)).toEqual(["RF-KIND-001"]);
    expect(r.feldFehler["messwert.temperatur_c"]![0]).toContain("Mehrere Werte");
  });

  it("doppelte Symptome ⇒ Vereinigung", () => {
    expect(auswerten({ symptome: ["atemnot", "atemnot", "blaue_lippen"] }).daten.symptome).toEqual(["atemnot", "blaue_lippen"]);
  });
});

describe("S-1 Säugling 60 Tage, „38,5 ºC“ (Ordinalzeichen) ⇒ Red Flag", () => {
  it("wird als 38,5 gelesen", () => {
    const r = auswerten({ messwerte: [["temperatur_c", "38,5 ºC"]] }, { ...saeugling, geburtsdatum: new Date("2026-08-04T00:00:00Z") });
    expect(r.feldFehler).toEqual({});
    expect(r.pruefung.redFlags.map((x) => x.id)).toEqual(["RF-KIND-001"]);
  });
});

describe("N-1 im Zweifel ablehnen statt interpretieren", () => {
  const MEHRDEUTIG = ["37, 39", "36, 39", "30, 38", "37 . 39", "39 ,5", "38 ,5", "38 , 0", "37\u200B,\u200B39", "37,\u200B39", "38 5", "37 39", "38\u00A0,5"];
  it.each(MEHRDEUTIG.map((t) => [JSON.stringify(t), t]))("%s ⇒ abgelehnt, Säugling ⇒ nie stillschweigend unauffällig", (_n, text) => {
    const r = auswerten({ messwerte: [["temperatur_c", text]] }, saeugling);
    expect(r.daten.messwerte).toEqual({});
    expect(r.feldFehler["messwert.temperatur_c"]![0]).toMatch(/Bitte nur einen Wert angeben, z\. B\. 38,5|Bitte eine Zahl eingeben/);
    // Verworfene Angabe wird gemeldet ⇒ die Web-App zeigt „Prüfung unvollständig“ (REQ-219).
    expect(Object.keys(r.feldFehler).length).toBeGreaterThan(0);
  });

  it("„37, 39“ meldet ausdrücklich „nur einen Wert“", () => {
    expect(pruefeRegelEingabe(w, { ...leer, messwerte: [["temperatur_c", "37, 39"]] }).feldFehler["messwert.temperatur_c"]![0]).toContain(
      "Bitte nur einen Wert angeben, z. B. 38,5",
    );
  });

  it("Tabellen-/Eigenschaftstest: jede akzeptierte Eingabe enthält genau eine eindeutige Zahl", () => {
    const zeichen = ["3", "8", "7", ",", ".", " ", "\u200B", "°", "C", "-", "e", "º"];
    const eindeutig = /^-?\d{1,4}([.,]\d{1,2})?$/;
    let akzeptiert = 0;
    const erzeuge = (praefix: string, tiefe: number): void => {
      if (tiefe === 0) return;
      for (const z of zeichen) {
        const text = praefix + z;
        const l = leseZahl(text);
        if (l.ok) {
          akzeptiert++;
          // ohne Einheit und Rand-Leerraum muss genau eine Zahl übrig bleiben
          const kern = text.replace(/[º˚]/g, "°").normalize("NFKC").replace(/\u200B/g, " ").trim().replace(/\s*(°\s*[cC]?|[cC])$/, "").trim();
          expect(kern, JSON.stringify(text)).toMatch(eindeutig);
          expect(l.zahl).toBe(Number(kern.replace(",", ".")));
          expect((kern.match(/\d+/g) ?? []).length, JSON.stringify(text)).toBeLessThanOrEqual(2);
        }
        erzeuge(text, tiefe - 1);
      }
    };
    erzeuge("", 5);
    expect(akzeptiert).toBeGreaterThan(100);
  });
});

describe("M4a (QA R3-B1) mehrereAbgaben", () => {
  const roh = (mehrereAbgaben?: boolean): RegelEingabeRoh => ({
    symptome: [],
    messwerte: [
      ["temperatur_c", "37"],
      ["temperatur_c", "38.4"],
    ],
    antworten: [],
    psychisch: false,
    ...(mehrereAbgaben === undefined ? {} : { mehrereAbgaben }),
  });
  it("Standard (Formular): mehrere Werte ⇒ Feldfehler; mit mehrereAbgaben: kein Fehler, beide Werte geprüft", () => {
    expect(pruefeRegelEingabe(w, roh()).feldFehler["messwert.temperatur_c"]).toBeDefined();
    const e = pruefeRegelEingabe(w, roh(true));
    expect(e.feldFehler).toEqual({});
    expect(e.daten.messwerte).toEqual({ temperatur_c: [37, 38.4] });
  });
});
