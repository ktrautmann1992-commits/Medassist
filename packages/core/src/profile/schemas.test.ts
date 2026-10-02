import { describe, expect, it } from "vitest";
import { hatHoechstensNachkommastellen, heuteIso, istLeereZeile, pruefeProfil, type ProfilSchemaOptionen } from "./schemas";

const HEUTE = new Date("2026-10-01T10:00:00Z");
const PATIENT: ProfilSchemaOptionen = { rolle: "PATIENT", kind: false, neu: true, heute: HEUTE };
const KIND_NEU: ProfilSchemaOptionen = { rolle: "PATIENT", kind: true, neu: true, heute: HEUTE };
const KIND_BEARBEITEN: ProfilSchemaOptionen = { rolle: "PATIENT", kind: true, neu: false, heute: HEUTE };
const ARZT: ProfilSchemaOptionen = { rolle: "ARZT", kind: false, neu: true, heute: HEUTE };

const basis = { vorname: " Karsten ", nachname: "Muster", geburtsdatum: "1990-05-17", geschlecht: "MAENNLICH" };
const kindBasis = { vorname: "Lena", nachname: "Muster", geburtsdatum: "2026-01-01", geschlecht: "WEIBLICH" };

function fehler(opt: ProfilSchemaOptionen, roh: unknown): Record<string, string> {
  const r = pruefeProfil(opt, roh);
  if (r.success) return {};
  return Object.fromEntries(r.issues.map((i) => [i.path.join("."), i.message]));
}

function ok(opt: ProfilSchemaOptionen, roh: unknown) {
  const r = pruefeProfil(opt, roh);
  if (!r.success) throw new Error(JSON.stringify(r.issues));
  return r.daten;
}

describe("REQ-100/REQ-103 Stammdaten", () => {
  it("minimal gültig, trimmt und setzt Standardwerte", () => {
    const d = ok(PATIENT, basis);
    expect(d.basis.vorname).toBe("Karsten");
    expect(d.basis.geburtsdatum.toISOString()).toBe("1990-05-17T00:00:00.000Z");
    expect(d.basis.schwangerschaft).toBe("UNBEKANNT");
    expect(d.basis.rauchen).toBe("UNBEKANNT");
    expect(d.basis.vorerkrankungen).toEqual([]);
    expect(d.kind).toBeNull();
    expect(d.arzt).toBeNull();
  });

  it("Pflichtfelder mit deutschen Meldungen", () => {
    const f = fehler(PATIENT, {});
    expect(f.vorname).toBe("Bitte den Vornamen angeben.");
    expect(f.nachname).toBe("Bitte den Nachnamen angeben.");
    expect(f.geburtsdatum).toBe("Bitte ein gültiges Geburtsdatum angeben.");
    expect(f.geschlecht).toBe("Bitte das Geschlecht wählen.");
    expect(fehler(PATIENT, { ...basis, vorname: "   " }).vorname).toBe("Bitte den Vornamen angeben.");
  });

  it("Geburtsdatum: nicht in der Zukunft, höchstens 130 Jahre, gültiger Kalendertag", () => {
    expect(fehler(PATIENT, { ...basis, geburtsdatum: "2026-10-02" }).geburtsdatum).toContain("Zukunft");
    expect(fehler(PATIENT, { ...basis, geburtsdatum: "2026-10-01" })).toEqual({});
    expect(fehler(PATIENT, { ...basis, geburtsdatum: "1896-10-01" })).toEqual({});
    expect(fehler(PATIENT, { ...basis, geburtsdatum: "1896-09-30" }).geburtsdatum).toContain("130 Jahre");
    expect(fehler(PATIENT, { ...basis, geburtsdatum: "2026-02-30" }).geburtsdatum).toBe("Bitte ein gültiges Geburtsdatum angeben.");
    expect(fehler(PATIENT, { ...basis, geburtsdatum: "17.05.1990" }).geburtsdatum).toBeDefined();
  });

  it("„heute“ gilt in Europe/Berlin (kurz nach Mitternacht)", () => {
    // 2026-10-01 22:30 UTC = 2026-10-02 00:30 in Berlin
    const spaet = new Date("2026-10-01T22:30:00Z");
    expect(heuteIso(spaet)).toBe("2026-10-02");
    expect(fehler({ ...PATIENT, heute: spaet }, { ...basis, geburtsdatum: "2026-10-02" })).toEqual({});
  });

  it("Größe/Gewicht: Grenzen aus bmi.ts, Dezimalkomma", () => {
    const d = ok(PATIENT, { ...basis, groesseCm: "180,5", gewichtKg: "81,2" });
    expect(d.basis.groesseCm).toBe(180.5);
    expect(d.basis.gewichtKg).toBe(81.2);
    expect(fehler(PATIENT, { ...basis, groesseCm: "29.9" }).groesseCm).toContain("zwischen 30 und 250 cm");
    expect(fehler(PATIENT, { ...basis, groesseCm: "250" })).toEqual({});
    expect(fehler(PATIENT, { ...basis, gewichtKg: "0,29" }).gewichtKg).toContain("zwischen 0,3 und 400 kg");
    expect(fehler(PATIENT, { ...basis, gewichtKg: "400" })).toEqual({});
    expect(fehler(PATIENT, { ...basis, gewichtKg: "80kg" }).gewichtKg).toBe("Bitte das Gewicht als Zahl in kg angeben.");
    expect(ok(PATIENT, { ...basis, groesseCm: "" }).basis.groesseCm).toBeUndefined();
  });

  it("Packungsjahre: 0–200, nicht bei „nie geraucht“", () => {
    expect(fehler(PATIENT, { ...basis, rauchen: "AKTUELL", packungsjahre: "201" }).packungsjahre).toBeDefined();
    expect(fehler(PATIENT, { ...basis, rauchen: "NIE", packungsjahre: "5" }).packungsjahre).toContain("nie geraucht");
    expect(ok(PATIENT, { ...basis, rauchen: "EHEMALIG", packungsjahre: "12,5" }).basis.packungsjahre).toBe(12.5);
  });

  it("ungültige Enum-Werte werden abgewiesen", () => {
    expect(fehler(PATIENT, { ...basis, geschlecht: "X" }).geschlecht).toBeDefined();
    expect(fehler(PATIENT, { ...basis, alkohol: "VIEL" }).alkohol).toBeDefined();
  });

  it("Textlängen begrenzt", () => {
    expect(fehler(PATIENT, { ...basis, vorname: "x".repeat(101) }).vorname).toBe("Höchstens 100 Zeichen.");
    expect(fehler(PATIENT, { ...basis, familienanamnese: "x".repeat(2001) }).familienanamnese).toBeDefined();
  });
});

describe("REQ-104 Schwangerschaft/Stillzeit", () => {
  it("bei „männlich“ wird schwanger/stillend abgewiesen, nicht still korrigiert", () => {
    expect(fehler(PATIENT, { ...basis, schwangerschaft: "SCHWANGER" }).schwangerschaft).toContain("männlich");
    expect(fehler(PATIENT, { ...basis, schwangerschaft: "STILLEND" }).schwangerschaft).toContain("männlich");
    expect(ok(PATIENT, { ...basis, schwangerschaft: "NEIN" }).basis.schwangerschaft).toBe("NEIN");
  });

  it("bei weiblich/divers/unbekannt zulässig", () => {
    for (const geschlecht of ["WEIBLICH", "DIVERS", "UNBEKANNT"]) {
      expect(ok(PATIENT, { ...basis, geschlecht, schwangerschaft: "SCHWANGER" }).basis.schwangerschaft).toBe("SCHWANGER");
    }
  });
});

describe("REQ-101/REQ-102 Listen", () => {
  it("leere Zeilen werden ignoriert, Indizes der Fehler bleiben erhalten", () => {
    const f = fehler(PATIENT, {
      ...basis,
      vorerkrankungen: [{ bezeichnung: "", icd10Code: "" }, { bezeichnung: "", icd10Code: "J45.0" }],
    });
    expect(f["vorerkrankungen.1.bezeichnung"]).toBe("Bitte die Erkrankung benennen.");
    expect(f["vorerkrankungen.0.bezeichnung"]).toBeUndefined();

    const d = ok(PATIENT, { ...basis, vorerkrankungen: [{ bezeichnung: "" }, { bezeichnung: "Asthma", icd10Code: " j45.0" }] });
    expect(d.basis.vorerkrankungen).toEqual([{ bezeichnung: "Asthma", icd10Code: "J45.0" }]);
  });

  it("ICD-Code optional, aber im gültigen Format", () => {
    expect(ok(PATIENT, { ...basis, vorerkrankungen: [{ bezeichnung: "Asthma" }] }).basis.vorerkrankungen[0]?.icd10Code).toBeUndefined();
    expect(fehler(PATIENT, { ...basis, vorerkrankungen: [{ bezeichnung: "Asthma", icd10Code: "Asthma" }] })["vorerkrankungen.0.icd10Code"]).toContain(
      "ICD-10-GM-Format",
    );
  });

  it("Allergie: Typ allein macht die Zeile nicht „nicht leer“", () => {
    expect(ok(PATIENT, { ...basis, allergien: [{ typ: "ALLERGIE", ausloeser: "" }] }).basis.allergien).toEqual([]);
    expect(fehler(PATIENT, { ...basis, allergien: [{ typ: "ALLERGIE", reaktion: "Ausschlag" }] })["allergien.0.ausloeser"]).toBeDefined();
    expect(ok(PATIENT, { ...basis, allergien: [{ typ: "UNVERTRAEGLICHKEIT", ausloeser: "Laktose" }] }).basis.allergien).toEqual([
      { typ: "UNVERTRAEGLICHKEIT", ausloeser: "Laktose" },
    ]);
  });

  it("Datum in Listen nicht vor der Geburt und nicht in der Zukunft", () => {
    const f = fehler(PATIENT, {
      ...basis,
      operationen: [{ bezeichnung: "Appendektomie", datum: "1980-01-01" }],
      impfungen: [{ gegen: "Tetanus", datum: "2027-01-01" }],
    });
    expect(f["operationen.0.datum"]).toBe("Das Datum liegt vor dem Geburtsdatum.");
    expect(f["impfungen.0.datum"]).toContain("Zukunft");
  });

  it("Dauermedikation und Impfung", () => {
    const d = ok(PATIENT, {
      ...basis,
      dauermedikation: [{ wirkstoff: "Demo-Wirkstoff", staerke: "5 mg", dosierung: "1-0-0-0" }],
      impfungen: [{ gegen: "Masern", dosisNr: "2", datum: "1991-06-01" }],
    });
    expect(d.basis.dauermedikation[0]).toEqual({ wirkstoff: "Demo-Wirkstoff", staerke: "5 mg", dosierung: "1-0-0-0" });
    expect(d.basis.impfungen[0]?.dosisNr).toBe(2);
    expect(fehler(PATIENT, { ...basis, impfungen: [{ gegen: "Masern", dosisNr: "1,5" }] })["impfungen.0.dosisNr"]).toBe(
      "Bitte eine ganze Zahl angeben.",
    );
  });

  it("höchstens 50 Einträge", () => {
    const viele = Array.from({ length: 51 }, () => ({ wirkstoff: "X" }));
    expect(fehler(PATIENT, { ...basis, dauermedikation: viele }).dauermedikation).toContain("Höchstens 50");
  });
});

describe("REQ-106 Kinderprofil: Sorgerecht", () => {
  it("Neuanlage durch Patient verlangt die Bestätigung", () => {
    expect(fehler(KIND_NEU, kindBasis).sorgerechtBestaetigt).toBe("Bitte bestätigen Sie, dass Sie sorgeberechtigt sind.");
    expect(fehler(KIND_NEU, { ...kindBasis, sorgerechtBestaetigt: false }).sorgerechtBestaetigt).toBeDefined();
    expect(ok(KIND_NEU, { ...kindBasis, sorgerechtBestaetigt: true }).sorgerechtBestaetigt).toBe(true);
  });

  it("beim Bearbeiten und für Ärzte nicht erforderlich", () => {
    expect(ok(KIND_BEARBEITEN, kindBasis).sorgerechtBestaetigt).toBe(false);
    expect(ok({ ...ARZT, kind: true }, kindBasis).sorgerechtBestaetigt).toBe(false);
  });
});

describe("REQ-107 Kinder-Zusatzdaten", () => {
  const k = { ...kindBasis, sorgerechtBestaetigt: true };

  it("SSW 22–44, Tage 0–6", () => {
    expect(ok(KIND_NEU, { ...k, sswWochen: "28", sswTage: "3" }).kind).toMatchObject({ sswWochen: 28, sswTage: 3 });
    expect(fehler(KIND_NEU, { ...k, sswWochen: "21" }).sswWochen).toContain("zwischen 22 und 44");
    expect(fehler(KIND_NEU, { ...k, sswWochen: "45" }).sswWochen).toBeDefined();
    expect(fehler(KIND_NEU, { ...k, sswWochen: "44", sswTage: "6" })).toEqual({});
    expect(fehler(KIND_NEU, { ...k, sswWochen: "30", sswTage: "7" }).sswTage).toBeDefined();
    expect(fehler(KIND_NEU, { ...k, sswTage: "3" }).sswWochen).toContain("Schwangerschaftswoche");
  });

  it("Geburtsgewicht 300–7000 g (ungeprüft), ganze Gramm", () => {
    expect(fehler(KIND_NEU, { ...k, geburtsgewichtG: "299" }).geburtsgewichtG).toContain("300");
    expect(fehler(KIND_NEU, { ...k, geburtsgewichtG: "7001" }).geburtsgewichtG).toBeDefined();
    expect(fehler(KIND_NEU, { ...k, geburtsgewichtG: "3,5" }).geburtsgewichtG).toBe("Bitte eine ganze Zahl angeben.");
    expect(ok(KIND_NEU, { ...k, geburtsgewichtG: "1450" }).kind?.geburtsgewichtG).toBe(1450);
  });

  it("Klassenstufe nur bei Schule; Sprachen als Liste", () => {
    expect(fehler(KIND_NEU, { ...k, einrichtung: "KITA", klassenstufe: "2" }).klassenstufe).toContain("Schule");
    expect(ok(KIND_NEU, { ...k, einrichtung: "SCHULE", klassenstufe: "2" }).kind?.klassenstufe).toBe(2);
    expect(ok(KIND_NEU, { ...k, sprachsituation: "MEHRSPRACHIG", sprachen: "Deutsch, Türkisch;" }).kind?.sprachen).toEqual([
      "Deutsch",
      "Türkisch",
    ]);
    expect(fehler(KIND_NEU, { ...k, sprachsituation: "EINSPRACHIG", sprachen: "Deutsch, Türkisch" }).sprachen).toBeDefined();
  });

  it("Vorsorge: leere Zeilen (nur Typ) ignoriert, Datum nicht vor Geburt, keine Duplikate", () => {
    const d = ok(KIND_NEU, {
      ...k,
      vorsorge: [
        { typ: "U1", datum: "2026-01-01", ergebnis: "UNAUFFAELLIG" },
        { typ: "U2", datum: "", ergebnis: "" },
        { typ: "U3", ergebnis: "AUFFAELLIG" },
      ],
    });
    expect(d.kind?.vorsorge).toHaveLength(2);
    expect(fehler(KIND_NEU, { ...k, vorsorge: [{ typ: "U1", datum: "2025-12-31" }] })["vorsorge.0.datum"]).toContain("Geburtsdatum");
    expect(fehler(KIND_NEU, { ...k, vorsorge: [{ typ: "U1", ergebnis: "AUFFAELLIG" }, { typ: "U1", ergebnis: "AUFFAELLIG" }] })["vorsorge.1.typ"]).toBe(
      "Doppelte Vorsorgeuntersuchung.",
    );
    expect(fehler(KIND_NEU, { ...k, vorsorge: [{ typ: "U10", ergebnis: "AUFFAELLIG" }] })["vorsorge.0.typ"]).toBeDefined();
  });

  it("Wachstum: Datum Pflicht, mindestens ein Messwert, Kopfumfang 20–70 cm", () => {
    const d = ok(KIND_NEU, { ...k, wachstum: [{ gemessenAm: "2026-04-01", groesseCm: "61,5", gewichtKg: "5,9", kopfumfangCm: "40" }] });
    expect(d.kind?.wachstum[0]).toMatchObject({ groesseCm: 61.5, gewichtKg: 5.9, kopfumfangCm: 40 });
    expect(fehler(KIND_NEU, { ...k, wachstum: [{ groesseCm: "60" }] })["wachstum.0.gemessenAm"]).toBe("Bitte das Messdatum angeben.");
    expect(fehler(KIND_NEU, { ...k, wachstum: [{ gemessenAm: "2026-04-01" }] })["wachstum.0.groesseCm"]).toContain("mindestens einen");
    expect(fehler(KIND_NEU, { ...k, wachstum: [{ gemessenAm: "2026-04-01", kopfumfangCm: "19" }] })["wachstum.0.kopfumfangCm"]).toBeDefined();
  });

  it("Kinderfelder werden bei Erwachsenenprofilen verworfen", () => {
    const d = ok(PATIENT, { ...basis, sswWochen: "28", vorsorge: [{ typ: "U1", ergebnis: "AUFFAELLIG" }] });
    expect(d.kind).toBeNull();
  });
});

describe("REQ-114 Arzt-Felder nur für Rolle ARZT", () => {
  const arztFelder = {
    nierenfunktion: "LEICHT_EINGESCHRAENKT",
    leberfunktion: "NORMAL",
    laborwerte: [{ parameter: "Kreatinin", wert: "1,3", einheit: "mg/dl", gemessenAm: "2026-09-30" }],
  };

  it("Arzt: werden geprüft und übernommen", () => {
    const d = ok(ARZT, { ...basis, ...arztFelder });
    expect(d.arzt).toEqual({
      nierenfunktion: "LEICHT_EINGESCHRAENKT",
      leberfunktion: "NORMAL",
      laborwerte: [{ parameter: "Kreatinin", wert: 1.3, einheit: "mg/dl", gemessenAm: new Date("2026-09-30T00:00:00Z") }],
    });
  });

  it("Arzt: Laborwert braucht Zahl, Einheit und Datum", () => {
    const f = fehler(ARZT, { ...basis, laborwerte: [{ parameter: "eGFR", wert: "hoch" }] });
    expect(f["laborwerte.0.wert"]).toBe("Bitte einen Zahlenwert angeben.");
    expect(f["laborwerte.0.einheit"]).toBe("Bitte die Einheit angeben.");
    expect(f["laborwerte.0.gemessenAm"]).toBe("Bitte das Datum der Messung angeben.");
    expect(ok(ARZT, { ...basis, laborwerte: [{ parameter: "BE", wert: "-2,5", einheit: "mmol/l", gemessenAm: "2026-09-30" }] }).arzt?.laborwerte[0]?.wert).toBe(-2.5);
  });

  it("Patient: eingeschleuste Arzt-Felder werden verworfen", () => {
    const r = pruefeProfil(PATIENT, { ...basis, ...arztFelder });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.daten.arzt).toBeNull();
    expect(r.daten.basis).not.toHaveProperty("nierenfunktion");
    expect(r.daten.basis).not.toHaveProperty("laborwerte");
  });
});

describe("istLeereZeile", () => {
  it("erkennt leere Zeilen", () => {
    expect(istLeereZeile({ a: "", b: "  " })).toBe(true);
    expect(istLeereZeile({ typ: "U1", datum: "" }, ["typ"])).toBe(true);
    expect(istLeereZeile({ a: "x" })).toBe(false);
    expect(istLeereZeile(undefined)).toBe(true);
  });
});

describe("RISK-017 Nachkommastellen passend zur Datenbankspalte (abweisen statt runden)", () => {
  const kind = { ...kindBasis, sorgerechtBestaetigt: true };

  it("hatHoechstensNachkommastellen", () => {
    expect(hatHoechstensNachkommastellen(180.5, 1)).toBe(true);
    expect(hatHoechstensNachkommastellen(180.55, 1)).toBe(false);
    expect(hatHoechstensNachkommastellen(1.1, 1)).toBe(true); // Gleitkomma 1.1 * 10
    expect(hatHoechstensNachkommastellen(0.123, 3)).toBe(true);
    expect(hatHoechstensNachkommastellen(-2.5, 4)).toBe(true);
    expect(hatHoechstensNachkommastellen(3, 0)).toBe(true);
    // Große Beträge ohne Gleitkomma-Fehlalarm (QA-Befund N1)
    expect(hatHoechstensNachkommastellen(12345678.1234, 4)).toBe(true);
    expect(hatHoechstensNachkommastellen(5623870.8758, 4)).toBe(true);
    expect(hatHoechstensNachkommastellen(12345678.12345, 4)).toBe(false);
    expect(hatHoechstensNachkommastellen(1e-7, 4)).toBe(false);
    expect(hatHoechstensNachkommastellen(1e21, 0)).toBe(true);
    expect(hatHoechstensNachkommastellen(Number.NaN, 4)).toBe(false);
  });

  it("Größe Decimal(5,1): höchstens 1 Nachkommastelle", () => {
    expect(ok(PATIENT, { ...basis, groesseCm: "180,5" }).basis.groesseCm).toBe(180.5);
    expect(fehler(PATIENT, { ...basis, groesseCm: "180,55" }).groesseCm).toBe("Höchstens 1 Nachkommastelle.");
  });

  it("Gewicht Decimal(6,3): höchstens 3 Nachkommastellen", () => {
    expect(ok(PATIENT, { ...basis, gewichtKg: "3,125" }).basis.gewichtKg).toBe(3.125);
    expect(fehler(PATIENT, { ...basis, gewichtKg: "3,1255" }).gewichtKg).toBe("Höchstens 3 Nachkommastellen.");
  });

  it("Packungsjahre Decimal(5,1)", () => {
    expect(fehler(PATIENT, { ...basis, rauchen: "AKTUELL", packungsjahre: "12,25" }).packungsjahre).toBe("Höchstens 1 Nachkommastelle.");
  });

  it("Wachstum: Größe 1, Gewicht 3, Kopfumfang Decimal(4,1) 1 Nachkommastelle", () => {
    const f = fehler(KIND_NEU, {
      ...kind,
      wachstum: [{ gemessenAm: "2026-04-01", groesseCm: "61,55", gewichtKg: "5,1234", kopfumfangCm: "40,25" }],
    });
    expect(f["wachstum.0.groesseCm"]).toBe("Höchstens 1 Nachkommastelle.");
    expect(f["wachstum.0.gewichtKg"]).toBe("Höchstens 3 Nachkommastellen.");
    expect(f["wachstum.0.kopfumfangCm"]).toBe("Höchstens 1 Nachkommastelle.");
  });

  it("Laborwert Decimal(12,4): 4 Nachkommastellen, Betrag < 10^8", () => {
    const lw = (wert: string) => ({ ...basis, laborwerte: [{ parameter: "X", wert, einheit: "u", gemessenAm: "2026-09-01" }] });
    expect(ok(ARZT, lw("0,0001")).arzt?.laborwerte[0]?.wert).toBe(0.0001);
    expect(ok(ARZT, lw("99999999,9999")).arzt?.laborwerte[0]?.wert).toBe(99999999.9999);
    expect(fehler(ARZT, lw("0,00001"))["laborwerte.0.wert"]).toBe("Höchstens 4 Nachkommastellen.");
    expect(fehler(ARZT, lw("100000000"))["laborwerte.0.wert"]).toContain("zwischen");
  });
});

describe("REQ-104 Kinderprofile ohne Schwangerschaft/Stillzeit", () => {
  it("Eingaben werden verworfen, gespeichert wird UNBEKANNT", () => {
    const k = { ...kindBasis, sorgerechtBestaetigt: true };
    expect(ok(KIND_NEU, { ...k, schwangerschaft: "SCHWANGER" }).basis.schwangerschaft).toBe("UNBEKANNT");
    expect(ok(KIND_BEARBEITEN, { ...kindBasis, schwangerschaft: "STILLEND" }).basis.schwangerschaft).toBe("UNBEKANNT");
    expect(ok({ ...ARZT, kind: true }, { ...kindBasis, schwangerschaft: "SCHWANGER" }).basis.schwangerschaft).toBe("UNBEKANNT");
  });
});
