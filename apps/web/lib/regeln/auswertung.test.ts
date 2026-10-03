import { ergebnisAusPruefung, pruefeVorrangig, standardRegelwerk, type RegelEingabeRoh } from "@medassist/core";
import { describe, expect, it } from "vitest";
import { werteWarnzeichenAus } from "./auswertung";
import { regelEingabeAusFormData } from "./form";

const w = standardRegelwerk();
const STICHTAG = new Date("2026-10-03T00:00:00Z");
const erwachsen = { geburtsdatum: new Date("1990-01-01T00:00:00Z"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT" as const };
const saeugling = { ...erwachsen, geburtsdatum: new Date("2026-08-22T00:00:00Z") };
const leer: RegelEingabeRoh = { symptome: [], messwerte: [], antworten: [], psychisch: false };

function fd(paare: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of paare) f.append(k, v);
  return regelEingabeAusFormData(f);
}

describe("REQ-219 Teilauswertung in der Web-Auswertung (B1)", () => {
  it("„ja“ + Temperatur „38x“ ⇒ Krisenhinweis und Fehlermeldung", () => {
    const s = werteWarnzeichenAus(w, erwachsen, fd([["psychisch", "on"], ["antwort.krise_gedanken_nicht_leben", "ja"], ["messwert.temperatur_c", "38x"]]), "PATIENT", STICHTAG);
    expect(s.ergebnis?.krisenhinweis).toEqual({ grund: "positiv" });
    expect(s.fehler).toContain("nicht berücksichtigt");
    expect(s.feldFehler?.["messwert.temperatur_c"]).toBeDefined();
  });

  it("Bewusstlosigkeit + Temperatur „29“ ⇒ Notfall", () => {
    const s = werteWarnzeichenAus(w, erwachsen, fd([["symptom", "bewusstlosigkeit"], ["messwert.temperatur_c", "29"]]), "PATIENT", STICHTAG);
    expect(s.ergebnis?.notfallhinweis).toEqual({ dringlichkeit: "NOTFALL", zeitrahmen: "SOFORT" });
  });

  it("B2: doppelte Antwort „ja“ dann „nein“ ⇒ Krise", () => {
    const s = werteWarnzeichenAus(
      w,
      erwachsen,
      fd([["antwort.krise_gedanken_nicht_leben", "ja"], ["antwort.krise_gedanken_selbstverletzung", "nein"], ["antwort.krise_plaene", "nein"], ["antwort.krise_gedanken_nicht_leben", "nein"]]),
      "PATIENT",
      STICHTAG,
    );
    expect(s.ergebnis?.status).toBe("KRISE");
    expect(s.ergebnis?.krisenhinweis).toEqual({ grund: "positiv" });
  });

  it("B2: Temperatur 39 und leerer zweiter Wert beim Säugling ⇒ Red Flag bleibt", () => {
    const s = werteWarnzeichenAus(w, saeugling, fd([["messwert.temperatur_c", "39"], ["messwert.temperatur_c", ""]]), "PATIENT", STICHTAG);
    expect(s.ergebnis?.notfallhinweis).toEqual({ dringlichkeit: "DRINGEND", zeitrahmen: "SOFORT" });
  });

  it("S4: psychisch=„true“ ohne Antworten ⇒ Krise (konservativ)", () => {
    const s = werteWarnzeichenAus(w, erwachsen, fd([["psychisch", "true"]]), "PATIENT", STICHTAG);
    expect(s.ergebnis?.status).toBe("KRISE");
  });

  it("S-1: „38,5 ºC“ beim Säugling (60 Tage) ⇒ 38,5 gelesen ⇒ Red Flag, vollständig", () => {
    const s = werteWarnzeichenAus(w, { ...saeugling, geburtsdatum: new Date("2026-08-04T00:00:00Z") }, fd([["messwert.temperatur_c", "38,5 ºC"]]), "PATIENT", STICHTAG);
    expect(s.ergebnis?.ausgeloesteRegeln.map((r) => r.id)).toEqual(["RF-KIND-001"]);
    expect(s.unvollstaendig).toBeUndefined();
  });

  it.each([["37, 39"], ["36, 39"], ["30, 38"], ["37 . 39"], ["39 ,5"], ["37\u200B,\u200B39"]])("N-1: „%s“ ⇒ abgelehnt, unvollständig", (text) => {
    const s = werteWarnzeichenAus(w, saeugling, fd([["messwert.temperatur_c", text]]), "PATIENT", STICHTAG);
    expect(s.unvollstaendig).toBe(true);
    expect(s.feldFehler?.["messwert.temperatur_c"]?.[0]).toContain("Bitte nur einen Wert angeben");
  });

  it("S-1: wirklich ungültiger Wert ⇒ als unvollständig gekennzeichnet", () => {
    const s = werteWarnzeichenAus(w, saeugling, fd([["messwert.temperatur_c", "achtunddreißig"]]), "PATIENT", STICHTAG);
    expect(s.ergebnis?.status).toBe("KEINE_WARNZEICHEN");
    expect(s.unvollstaendig).toBe(true);
  });

  it("unbekanntes Profil ⇒ Auswertung ohne Alter, Hinweis nicht unterdrückt", () => {
    const s = werteWarnzeichenAus(w, null, fd([["symptom", "fieber"], ["symptom", "brustschmerz_akut"]]), "PATIENT", STICHTAG);
    expect(s.fehler).toContain("Profil nicht gefunden.");
    expect(s.profilUnbekannt).toBe(true);
    expect(s.ergebnis?.ausgeloesteRegeln.map((r) => r.id).sort()).toEqual(["RF-ERW-001", "RF-KIND-001"]);
  });
});

describe("REQ-220 Fallback bei internen Fehlern (S5)", () => {
  const kaputt = () => {
    throw new Error("intern");
  };

  it("Fehler im Rollenfilter nach festgestellter Krise und Notfall ⇒ statische Hinweise", () => {
    const s = werteWarnzeichenAus(
      w,
      erwachsen,
      { ...leer, symptome: ["bewusstlosigkeit"], antworten: [["krise_plaene", "ja"]] },
      "PATIENT",
      STICHTAG,
      { filter: kaputt, ergebnisAus: ergebnisAusPruefung, pruefe: pruefeVorrangig },
    );
    expect(s.ergebnis).toBeUndefined();
    expect(s.fallback).toEqual({ krise: true, notfall: { dringlichkeit: "NOTFALL", zeitrahmen: "SOFORT" } });
    expect(s.fehler).toContain("fehlgeschlagen");
  });

  it("Fehler in der Regelprüfung selbst ⇒ konservativer Notfall- und (bei Krisenangaben) Krisenhinweis", () => {
    const s = werteWarnzeichenAus(w, erwachsen, { ...leer, psychisch: true }, "PATIENT", STICHTAG, {
      filter: kaputt,
      ergebnisAus: kaputt,
      pruefe: kaputt,
    });
    expect(s.fallback?.krise).toBe(true);
    expect(s.fallback?.notfall?.dringlichkeit).toBe("NOTFALL");
    const ohneKrise = werteWarnzeichenAus(w, erwachsen, leer, "PATIENT", STICHTAG, { filter: kaputt, ergebnisAus: kaputt, pruefe: kaputt });
    expect(ohneKrise.fallback?.krise).toBe(false);
  });
});
