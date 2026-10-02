import { describe, expect, it } from "vitest";
import { initialen, korrigiertesAlterAnzeige, profilKurzname, sichererBmi, sicheresAlter, wochenUndTage } from "./anzeige";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("REQ-112 Anzeige in der Profil-Auswahl", () => {
  it("Initialen", () => {
    expect(initialen("Karsten", "Muster")).toBe("KM");
    expect(initialen(" lena ", "özdemir")).toBe("LÖ");
    expect(initialen("", "")).toBe("?");
  });

  it("Kurzname: Erwachsene „Vorname N.“, Kinder „Vorname, Alter“", () => {
    expect(profilKurzname({ vorname: "Karsten", nachname: "Muster", geburtsdatum: d("1990-01-01"), istKinderprofil: false })).toBe(
      "Karsten M.",
    );
    expect(
      profilKurzname({ vorname: "Lena", nachname: "Muster", geburtsdatum: d("2022-03-12"), istKinderprofil: true }, d("2026-10-01")),
    ).toBe("Lena, 4 Jahre");
  });
});

describe("REQ-105 Alter und BMI ohne Absturz bei fehlerhaften Daten", () => {
  it("Alter null bei Geburtsdatum in der Zukunft", () => {
    expect(sicheresAlter(d("2030-01-01"), d("2026-10-01"))).toBeNull();
    expect(sicheresAlter(d("1990-10-01"), d("2026-10-01"))?.jahre).toBe(36);
  });

  it("BMI nur bei vollständigen, plausiblen Werten", () => {
    expect(sichererBmi(180, 81)).toBe(25);
    expect(sichererBmi(null, 81)).toBeNull();
    expect(sichererBmi(180, 4000)).toBeNull();
  });
});

describe("REQ-108 korrigiertes Alter", () => {
  it("keine Anzeige ohne SSW oder bei Termingeburt", () => {
    expect(korrigiertesAlterAnzeige(d("2026-01-01"), null, null, d("2026-10-01")).art).toBe("keine");
    expect(korrigiertesAlterAnzeige(d("2026-01-01"), 39, 2, d("2026-10-01")).art).toBe("keine");
  });

  it("Frühgeburt 28+0: korrigiert 6 Monate", () => {
    const k = korrigiertesAlterAnzeige(d("2026-01-01"), 28, 0, d("2026-10-01"));
    expect(k).toMatchObject({ art: "korrigiert", alter: "6 Monate", korrektur: "12+0 Wochen", ueblich: true });
    if (k.art === "korrigiert") expect(k.text).toContain("Korrigiertes Alter: 6 Monate");
  });

  it("Tage fehlen → 0 Tage", () => {
    expect(korrigiertesAlterAnzeige(d("2026-01-01"), 28, null, d("2026-10-01")).art).toBe("korrigiert");
  });

  it("vor dem errechneten Termin", () => {
    expect(korrigiertesAlterAnzeige(d("2026-09-01"), 30, 0, d("2026-10-01")).art).toBe("vor-termin");
  });

  it("ab 24 Monaten Hinweis, dass üblicherweise nicht mehr korrigiert wird", () => {
    const k = korrigiertesAlterAnzeige(d("2023-01-01"), 30, 0, d("2026-10-01"));
    expect(k).toMatchObject({ art: "korrigiert", ueblich: false });
    if (k.art === "korrigiert") expect(k.text).toContain("ungeprüft");
  });

  it("ungültiges Gestationsalter → keine Anzeige statt Absturz", () => {
    expect(korrigiertesAlterAnzeige(d("2026-01-01"), 10, 0, d("2026-10-01")).art).toBe("keine");
  });
});

describe("REQ-108 Korrektur als Wochen+Tage", () => {
  it("wochenUndTage", () => {
    expect(wochenUndTage(67)).toBe("9+4 Wochen");
    expect(wochenUndTage(84)).toBe("12+0 Wochen");
    expect(wochenUndTage(1)).toBe("0+1 Wochen");
  });

  it("30+3 SSW → Korrektur 9+4 Wochen im Text", () => {
    const k = korrigiertesAlterAnzeige(d("2026-01-01"), 30, 3, d("2026-10-01"));
    expect(k).toMatchObject({ art: "korrigiert", korrektur: "9+4 Wochen" });
    if (k.art === "korrigiert") expect(k.text).toContain("(Korrektur 9+4 Wochen)");
    const v = korrigiertesAlterAnzeige(d("2026-09-01"), 30, 3, d("2026-10-01"));
    expect(v.art === "vor-termin" && v.text).toContain("Korrektur 9+4 Wochen");
  });
});
