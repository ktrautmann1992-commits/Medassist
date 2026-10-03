import { describe, expect, it } from "vitest";
import { befundlageFuerProfil } from "./befundlage";
import { pruefeVorrangig } from "./engine";
import { ergebnisAusPruefung, type Bewertungsergebnis } from "./ergebnis";
import { filtereNachRolle, PATIENT_WHITELIST, VERDACHT_KENNZEICHNUNG } from "./rollenfilter";
import { standardRegelwerk } from "./standard";

const w = standardRegelwerk();

/** Vollständiges Ergebnis mit ärztlichen Inhalten (Demo-Werte, kein medizinischer Inhalt). */
function vollesErgebnis(): Bewertungsergebnis {
  const pruefung = pruefeVorrangig(
    w,
    befundlageFuerProfil(
      { geburtsdatum: new Date("1990-01-01T00:00:00Z"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "NEIN" },
      { symptome: ["atemnot", "blaue_lippen"], messwerte: {}, antworten: { krise_plaene: "ja" }, psychisch: true },
      new Date("2026-10-03T00:00:00Z"),
    ),
  );
  return {
    ...ergebnisAusPruefung(pruefung),
    moeglicheUrsachen: [{ bezeichnung: "Testursache", fachbegriff: "Testbegriff", begruendung: "Testbegründung" }],
    arbeitsdiagnose: {
      bezeichnung: "Testdiagnose",
      icd10Code: "X00.0",
      sicherheit: "V",
      einschaetzung: 0.5,
      begruendung: "Test",
      ausschlussGrund: null,
      quellen: [],
    },
    differentialdiagnosen: [
      { bezeichnung: "DD Test", icd10Code: "X01", sicherheit: "A", einschaetzung: null, begruendung: null, ausschlussGrund: "Test", quellen: [] },
    ],
    diagnostischeGrundlage: ["Testgrundlage"],
    facharztEmpfehlungen: [{ fachrichtung: "Allgemeinmedizin", begruendung: "Test" }],
    verhaltenshinweise: ["Testhinweis"],
    therapieplan: [{ massnahme: "Testmaßnahme", details: null }],
    medikation: [{ wirkstoff: "Testwirkstoff", staerke: "1 mg", darreichungsform: null, dosierung: "1-0-0-0", dauer: null, hinweise: null }],
    laborwerte: [{ parameter: "Testwert", wert: "1", einheit: "mg/dl" }],
  };
}

describe("REQ-213 Rollenfilter", () => {
  it("PATIENT: keine Medikation, kein Therapieplan, keine ICD-/Differentialdiagnose, keine Laborwerte", () => {
    const p = filtereNachRolle(vollesErgebnis(), "PATIENT");
    expect(p.rolle).toBe("PATIENT");
    for (const feld of ["medikation", "therapieplan", "arbeitsdiagnose", "differentialdiagnosen", "laborwerte", "diagnostischeGrundlage"]) {
      expect(p, feld).not.toHaveProperty(feld);
    }
    const json = JSON.stringify(p);
    for (const verboten of ["Testwirkstoff", "X00.0", "X01", "Testwert", "Testmaßnahme", "Testgrundlage"]) expect(json).not.toContain(verboten);
  });

  it("PATIENT: mögliche Ursachen nur als „Verdacht – ärztlich abzuklären“", () => {
    const p = filtereNachRolle(vollesErgebnis(), "PATIENT");
    if (p.rolle !== "PATIENT") throw new Error();
    expect(p.moeglicheUrsachen).toEqual([
      { kennzeichnung: VERDACHT_KENNZEICHNUNG, bezeichnung: "Testursache", fachbegriff: "Testbegriff", begruendung: "Testbegründung" },
    ]);
    expect(p.facharztEmpfehlungen).toEqual([{ fachrichtung: "Allgemeinmedizin", begruendung: "Test" }]);
    expect(p.verhaltenshinweise).toEqual(["Testhinweis"]);
  });

  it("PATIENT: ausgelöste Regeln ohne Arzt-Hinweistext, Status ungeprüft bleibt sichtbar", () => {
    const p = filtereNachRolle(vollesErgebnis(), "PATIENT");
    expect(p.ausgeloesteRegeln.length).toBeGreaterThan(0);
    for (const r of p.ausgeloesteRegeln) {
      expect(r).not.toHaveProperty("hinweisArzt");
      expect(r.status).toBe("ungeprüft");
      expect(r.hinweisPatient.length).toBeGreaterThan(0);
    }
  });

  it("Krisen- und Notfallhinweise gehen immer an beide Rollen", () => {
    for (const rolle of ["PATIENT", "ARZT"] as const) {
      const g = filtereNachRolle(vollesErgebnis(), rolle);
      expect(g.status, rolle).toBe("KRISE");
      expect(g.ablaufBeenden, rolle).toBe(true);
      expect(g.krisenhinweis, rolle).toEqual({ grund: "positiv" });
      expect(g.notfallhinweis, rolle).toEqual({ dringlichkeit: "NOTFALL", zeitrahmen: "SOFORT" });
      expect(g.dringlichkeit, rolle).toBe("NOTFALL");
    }
  });

  it("ARZT: erhält alles, auch Medikation und ICD-Code", () => {
    const a = filtereNachRolle(vollesErgebnis(), "ARZT");
    if (a.rolle !== "ARZT") throw new Error();
    expect(a.medikation[0]!.wirkstoff).toBe("Testwirkstoff");
    expect(a.arbeitsdiagnose?.icd10Code).toBe("X00.0");
    expect(a.laborwerte).toHaveLength(1);
    expect(a.ausgeloesteRegeln[0]).toHaveProperty("hinweisArzt");
  });

  it("neues, unbekanntes Feld wird für PATIENT entfernt (Whitelist) – auch verschachtelt", () => {
    const e = vollesErgebnis() as Bewertungsergebnis & Record<string, unknown>;
    e.neuesKiFeld = { dosis: "geheim" };
    (e.ausgeloesteRegeln[0] as Record<string, unknown>).internerKommentar = "geheim";
    (e.moeglicheUrsachen[0] as Record<string, unknown>).icd10Code = "X99";
    (e.krisenhinweis as Record<string, unknown>).intern = "geheim";
    const p = filtereNachRolle(e, "PATIENT");
    expect(p).not.toHaveProperty("neuesKiFeld");
    expect(JSON.stringify(p)).not.toContain("geheim");
    expect(JSON.stringify(p)).not.toContain("X99");
    // Arzt erhält alles
    expect(filtereNachRolle(e, "ARZT")).toHaveProperty("neuesKiFeld");
  });

  it("Whitelist übernimmt keine Objekte an Stellen, die nur Primitive erlauben", () => {
    const e = vollesErgebnis();
    (e as unknown as Record<string, unknown>).status = { boese: true };
    expect(() => filtereNachRolle(e, "PATIENT")).toThrow();
  });

  it("Whitelist enthält keine ärztlichen Felder", () => {
    for (const f of ["medikation", "therapieplan", "arbeitsdiagnose", "differentialdiagnosen", "laborwerte", "diagnostischeGrundlage"]) {
      expect(Object.keys(PATIENT_WHITELIST)).not.toContain(f);
    }
  });

  it("unbekannte Rolle → keine Ausgabe", () => {
    expect(() => filtereNachRolle(vollesErgebnis(), "GAST" as never)).toThrow("Unbekannte Rolle");
  });

  it("Ergebnis ohne Red Flags und Krise: keine Hinweise", () => {
    const e = ergebnisAusPruefung(
      pruefeVorrangig(
        w,
        befundlageFuerProfil(
          { geburtsdatum: new Date("1990-01-01T00:00:00Z"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "NEIN" },
          { symptome: [], messwerte: {}, antworten: {}, psychisch: false },
          new Date("2026-10-03T00:00:00Z"),
        ),
      ),
    );
    const p = filtereNachRolle(e, "PATIENT");
    expect(p).toMatchObject({ status: "KEINE_WARNZEICHEN", krisenhinweis: null, notfallhinweis: null, ausgeloesteRegeln: [] });
  });
});
