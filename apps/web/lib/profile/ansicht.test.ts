import { describe, expect, it } from "vitest";
import { zuProfilAnsicht, type ProfilDatensatz } from "./ansicht";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const datensatz: ProfilDatensatz = {
  id: "x1",
  kontoinhaberId: null,
  istKinderprofil: true,
  vorname: "Lena",
  nachname: "Muster",
  geburtsdatum: d("2026-01-01"),
  geschlecht: "WEIBLICH",
  groesseCm: { toString: () => "61.5" },
  gewichtKg: null,
  schwangerschaft: "UNBEKANNT",
  nierenfunktion: "SCHWER_EINGESCHRAENKT",
  leberfunktion: "NORMAL",
  familienanamnese: null,
  rauchen: "UNBEKANNT",
  packungsjahre: null,
  alkohol: "UNBEKANNT",
  sport: "UNBEKANNT",
  impfstatusNotiz: null,
  sswBeiGeburtWochen: 28,
  sswBeiGeburtTage: 0,
  geburtsgewichtG: 1100,
  einrichtung: null,
  einrichtungName: null,
  klassenstufe: null,
  sprachsituation: "MEHRSPRACHIG",
  sprachen: ["Deutsch", "Türkisch"],
  sorgerechtBestaetigtAm: new Date("2026-09-01T08:00:00Z"),
  vorerkrankungen: [],
  operationen: [],
  allergien: [],
  dauermedikation: [],
  impfungen: [],
  vorsorge: [{ typ: "U1", durchgefuehrtAm: d("2026-01-01"), ergebnis: "UNAUFFAELLIG" }],
  wachstum: [
    { gemessenAm: d("2026-05-01"), groesseCm: 58, gewichtKg: null, kopfumfangCm: null },
    { gemessenAm: d("2026-03-01"), groesseCm: 50, gewichtKg: null, kopfumfangCm: null },
  ],
  laborwerte: [{ parameter: "Kreatinin", wert: { toString: () => "0.3" }, einheit: "mg/dl", gemessenAm: d("2026-09-01") }],
};

describe("REQ-114 Ansichtsdaten", () => {
  it("Patient erhält keine Arzt-Felder – auch wenn sie geladen wurden", () => {
    const a = zuProfilAnsicht(datensatz, { id: "p1", rolle: "PATIENT" });
    expect(a.arzt).toBeNull();
    expect(JSON.stringify(a)).not.toContain("SCHWER_EINGESCHRAENKT");
    expect(JSON.stringify(a)).not.toContain("Kreatinin");
  });

  it("Arzt erhält Nieren-/Leberfunktion und Laborwerte", () => {
    const a = zuProfilAnsicht(datensatz, { id: "a1", rolle: "ARZT" });
    expect(a.arzt).toEqual({
      nierenfunktion: "SCHWER_EINGESCHRAENKT",
      leberfunktion: "NORMAL",
      laborwerte: [{ parameter: "Kreatinin", wert: "0.3", einheit: "mg/dl", gemessenAm: "2026-09-01" }],
    });
  });
});

describe("REQ-109 Ansicht Kinderprofil", () => {
  it("Wachstum nach Datum sortiert, Zahlen und Datum serialisiert", () => {
    const a = zuProfilAnsicht(datensatz, { id: "p1", rolle: "PATIENT" });
    expect(a.groesseCm).toBe("61.5");
    expect(a.geburtsdatum).toBe("2026-01-01");
    expect(a.kind?.wachstum.map((w) => w.gemessenAm)).toEqual(["2026-03-01", "2026-05-01"]);
    expect(a.kind?.vorsorge).toEqual([{ typ: "U1", datum: "2026-01-01", ergebnis: "UNAUFFAELLIG" }]);
    expect(a.istEigenesProfil).toBe(false);
  });

  it("Erwachsenenprofil ohne Kinderdaten; eigenes Profil erkannt", () => {
    const a = zuProfilAnsicht({ ...datensatz, istKinderprofil: false, kontoinhaberId: "p1" }, { id: "p1", rolle: "PATIENT" });
    expect(a.kind).toBeNull();
    expect(a.istEigenesProfil).toBe(true);
  });
});
