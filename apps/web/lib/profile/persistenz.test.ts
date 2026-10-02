import { pruefeProfil, type GeprueftesProfil } from "@medassist/core";
import { describe, expect, it } from "vitest";
import { profilFelder, profilListen } from "./persistenz";

const HEUTE = new Date("2026-10-01T10:00:00Z");
const roh = {
  vorname: "Erika",
  nachname: "Muster",
  geburtsdatum: "1970-02-03",
  geschlecht: "WEIBLICH",
  groesseCm: "168",
  vorerkrankungen: [{ bezeichnung: "Hypertonie", icd10Code: "I10" }],
  nierenfunktion: "SCHWER_EINGESCHRAENKT",
  leberfunktion: "NORMAL",
  laborwerte: [{ parameter: "Kreatinin", wert: "2,1", einheit: "mg/dl", gemessenAm: "2026-09-01" }],
};

function geprueft(rolle: "PATIENT" | "ARZT", kind = false, daten: object = roh): GeprueftesProfil {
  const r = pruefeProfil({ rolle, kind, neu: false, heute: HEUTE }, daten);
  if (!r.success) throw new Error(JSON.stringify(r.issues));
  return r.daten;
}

describe("REQ-114 Persistenz schreibt Arzt-Felder nur für ARZT", () => {
  it("Patient: eingeschleuste Nieren-/Leberfunktion und Laborwerte werden nicht geschrieben", () => {
    const d = geprueft("PATIENT");
    expect(profilFelder(d, "PATIENT")).not.toHaveProperty("nierenfunktion");
    expect(profilFelder(d, "PATIENT")).not.toHaveProperty("leberfunktion");
    expect(profilListen(d, "PATIENT")).not.toHaveProperty("laborwerte");
  });

  it("auch wenn Arzt-Daten vorliegen, entscheidet die Rolle der Sitzung", () => {
    const d = geprueft("ARZT");
    expect(profilFelder(d, "PATIENT")).not.toHaveProperty("nierenfunktion");
    expect(profilListen(d, "PATIENT")).not.toHaveProperty("laborwerte");
  });

  it("Arzt: Felder und Laborwerte werden geschrieben", () => {
    const d = geprueft("ARZT");
    expect(profilFelder(d, "ARZT")).toMatchObject({ nierenfunktion: "SCHWER_EINGESCHRAENKT", leberfunktion: "NORMAL" });
    expect(profilListen(d, "ARZT").laborwerte).toEqual([
      { parameter: "Kreatinin", wert: 2.1, einheit: "mg/dl", gemessenAm: new Date("2026-09-01T00:00:00Z") },
    ]);
  });
});

describe("REQ-100/REQ-101/REQ-107 Abbildung auf Prisma", () => {
  it("leere optionale Felder werden zu null (Löschen beim Bearbeiten)", () => {
    const f = profilFelder(geprueft("PATIENT"), "PATIENT");
    expect(f).toMatchObject({ groesseCm: 168, gewichtKg: null, familienanamnese: null, packungsjahre: null });
    expect(f).not.toHaveProperty("sswBeiGeburtWochen");
    expect(profilListen(geprueft("PATIENT"), "PATIENT").vorerkrankungen).toEqual([{ bezeichnung: "Hypertonie", icd10Code: "I10" }]);
  });

  it("Kinderprofil: SSW ohne Tage gilt +0, Vorsorge ohne Ergebnis „UNBEKANNT“", () => {
    const d = geprueft("PATIENT", true, {
      vorname: "Lena",
      nachname: "Muster",
      geburtsdatum: "2026-01-01",
      geschlecht: "WEIBLICH",
      sswWochen: "30",
      vorsorge: [{ typ: "U2", datum: "2026-01-05" }],
      wachstum: [{ gemessenAm: "2026-02-01", gewichtKg: "2,1" }],
    });
    expect(profilFelder(d, "PATIENT")).toMatchObject({ sswBeiGeburtWochen: 30, sswBeiGeburtTage: 0, sprachen: [] });
    const l = profilListen(d, "PATIENT");
    expect(l.vorsorge).toEqual([{ typ: "U2", durchgefuehrtAm: new Date("2026-01-05T00:00:00Z"), ergebnis: "UNBEKANNT" }]);
    expect(l.wachstum).toEqual([
      { gemessenAm: new Date("2026-02-01T00:00:00Z"), groesseCm: null, gewichtKg: 2.1, kopfumfangCm: null },
    ]);
  });
});
