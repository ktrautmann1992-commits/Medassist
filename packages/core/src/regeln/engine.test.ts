import { describe, expect, it } from "vitest";
import { genutzteSymptome, imAltersbereich, werteAus } from "./bedingung";
import { befundlageFuerProfil, type Befundlage } from "./befundlage";
import { hoechste, normalisiereAntwort, pruefeVorrangig } from "./engine";
import { BEREITSCHAFTSDIENST, NOTRUF, TELEFONSEELSORGE } from "./kontakte";
import { standardRegelwerk } from "./standard";

const w = standardRegelwerk();

function befund(teil: Partial<Befundlage> = {}): Befundlage {
  return {
    alter: { tage: 365 * 30, monate: 360 },
    korrigiertesAlter: null,
    symptome: [],
    messwerte: {},
    antworten: {},
    schwangerschaft: "UNBEKANNT",
    psychisch: false,
    ...teil,
  };
}

describe("REQ-205 Rangfolge und Ergebnis", () => {
  it("NOTFALL > DRINGEND > ROUTINE > BEOBACHTEN", () => {
    expect(hoechste(["BEOBACHTEN", "DRINGEND", "ROUTINE"])).toBe("DRINGEND");
    expect(hoechste(["ROUTINE", "NOTFALL", "DRINGEND"])).toBe("NOTFALL");
    expect(hoechste(["BEOBACHTEN", "ROUTINE"])).toBe("ROUTINE");
    expect(hoechste([])).toBeNull();
  });

  it("ausgelöste Regeln enthalten id, version, quelle, status und die Regelwerk-Version", () => {
    const e = pruefeVorrangig(w, befund({ symptome: ["bewusstlosigkeit"] }));
    expect(e.regelwerkVersion).toBe(w.version);
    expect(e.redFlags[0]).toMatchObject({ id: "RF-ALLG-003", version: "0.1.0", quelle: null, status: "ungeprüft", geprueftVon: null });
    expect(e.enthaeltUngepruefteRegeln).toBe(true);
    expect(e.redFlagDringlichkeit).toBe("NOTFALL");
  });

  it("keine Symptome → KEINE_WARNZEICHEN, Krisenpfad nicht aktiv", () => {
    const e = pruefeVorrangig(w, befund());
    expect(e).toMatchObject({ status: "KEINE_WARNZEICHEN", hoechsteDringlichkeit: null, krisenpfadAktiv: false, ablaufBeenden: false });
    expect(e.enthaeltUngepruefteRegeln).toBe(false);
  });

  it("ist deterministisch und verändert die Eingabe nicht", () => {
    const b = befund({ symptome: ["atemnot"], psychisch: true });
    const kopie = structuredClone(b);
    expect(pruefeVorrangig(w, b)).toEqual(pruefeVorrangig(w, b));
    expect(b).toEqual(kopie);
  });
});

describe("REQ-208/REQ-209/REQ-210 Krisenpfad", () => {
  it("positive Antwort → KRISE, Grund positiv, ablaufBeenden", () => {
    const e = pruefeVorrangig(w, befund({ psychisch: true, antworten: { krise_gedanken_nicht_leben: "ja", krise_gedanken_selbstverletzung: "nein", krise_plaene: "nein" } }));
    expect(e).toMatchObject({ status: "KRISE", kriseGrund: "positiv", ablaufBeenden: true, hoechsteDringlichkeit: "NOTFALL" });
    expect(e.krisenRegeln[0]!.anlaufstelle).toBe("KRISE_AKUTVORSTELLUNG");
  });

  it("unbeantwortet → konservativ KRISE (Grund unvollständig)", () => {
    const e = pruefeVorrangig(w, befund({ psychisch: true }));
    expect(e).toMatchObject({ status: "KRISE", kriseGrund: "unvollstaendig", ablaufBeenden: true });
  });

  it("Krise verdeckt keine Red Flag; Notfallhinweis nur aus Red Flags", () => {
    const e = pruefeVorrangig(w, befund({ psychisch: true, symptome: ["atemnot"] }));
    expect(e.status).toBe("KRISE");
    expect(e.redFlags.map((r) => r.id)).toEqual(["RF-ALLG-002"]);
    expect(e.redFlagDringlichkeit).toBe("DRINGEND");
  });
});

describe("REQ-204 Alter", () => {
  it("unbekanntes Alter → altersbeschränkte Regeln greifen konservativ", () => {
    const e = pruefeVorrangig(w, befund({ alter: null, symptome: ["fieber", "brustschmerz_akut"] }));
    expect(e.redFlags.map((r) => r.id).sort()).toEqual(["RF-ERW-001", "RF-KIND-001"]);
  });

  it("korrigiertes Alter nur bei Bezug chronologisch_oder_korrigiert", () => {
    const b = befund({ alter: { tage: 120, monate: 3 }, korrigiertesAlter: { tage: 36, monate: 1 } });
    expect(imAltersbereich({ unterTage: 90, bezug: "chronologisch_oder_korrigiert" }, b)).toBe(true);
    expect(imAltersbereich({ unterTage: 90, bezug: "chronologisch" }, b)).toBe(false);
    expect(imAltersbereich({ minMonate: 216, bezug: "chronologisch" }, befund())).toBe(true);
    expect(imAltersbereich(null, b)).toBe(true);
  });

  it("Befundlage: Alter aus Geburtsdatum, korrigiertes Alter vor dem Termin = 0", () => {
    const stichtag = new Date("2026-10-03T00:00:00Z");
    const b = befundlageFuerProfil(
      { geburtsdatum: new Date("2026-09-03T00:00:00Z"), sswBeiGeburtWochen: 30, sswBeiGeburtTage: 0, schwangerschaft: "UNBEKANNT" },
      { symptome: ["fieber", "fieber"], messwerte: {}, antworten: {}, psychisch: false },
      stichtag,
    );
    expect(b.alter).toEqual({ tage: 30, monate: 1 });
    expect(b.korrigiertesAlter).toEqual({ tage: 0, monate: 0 });
    expect(b.symptome).toEqual(["fieber"]);
  });

  it("Geburtsdatum in der Zukunft → Alter unbekannt (konservativ)", () => {
    const b = befundlageFuerProfil(
      { geburtsdatum: new Date("2030-01-01T00:00:00Z"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "NEIN" },
      { symptome: [], messwerte: {}, antworten: {}, psychisch: false },
      new Date("2026-10-03T00:00:00Z"),
    );
    expect(b.alter).toBeNull();
  });
});

describe("REQ-202 Bedingungen", () => {
  it("Alters-, Schwangerschafts- und Messwertbedingungen", () => {
    const b = befund({ alter: { tage: 89, monate: 2 }, messwerte: { temperatur_c: [38] }, schwangerschaft: "SCHWANGER" });
    expect(werteAus({ alter_tage: { "<": 90 } }, b)).toBe(true);
    expect(werteAus({ alter_tage: { ">=": 90 } }, b)).toBe(false);
    expect(werteAus({ alter_monate: { ">=": 2, "<": 3 } }, b)).toBe(true);
    expect(werteAus({ schwangerschaft: "SCHWANGER" }, b)).toBe(true);
    expect(werteAus({ schwangerschaft: "STILLEND" }, b)).toBe(false);
    expect(werteAus({ messwert: "temperatur_c", op: ">=", wert: 38 }, b)).toBe(true);
    expect(werteAus({ messwert: "temperatur_c", op: ">", wert: 38 }, b)).toBe(false);
    expect(werteAus({ alter_tage: { "<": 90 } }, befund({ alter: null }))).toBe(true);
  });

  it("fehlender Messwert erfüllt keine Messwert-Bedingung", () => {
    expect(werteAus({ messwert: "temperatur_c", op: "<", wert: 100 }, befund())).toBe(false);
  });

  it("mehrere Messwerte: ein Wert genügt", () => {
    expect(werteAus({ messwert: "temperatur_c", op: ">=", wert: 38 }, befund({ messwerte: { temperatur_c: [36, 38.2] } }))).toBe(true);
  });
});

describe("REQ-219/S1 ungültige Befundlage wird verworfen, ohne Hinweise zu unterdrücken", () => {
  it("unbekannte IDs werden gemeldet, Rest wird ausgewertet", () => {
    const e = pruefeVorrangig(
      w,
      befund({ symptome: ["fiber", "bewusstlosigkeit"], messwerte: { puls: [80] }, antworten: { unbekannt: "ja", krise_plaene: "ja" } }),
    );
    expect(e.status).toBe("KRISE");
    expect(e.redFlags.map((r) => r.id)).toEqual(["RF-ALLG-003"]);
    expect(e.befundlageFehler).toHaveLength(3);
  });

  it.each([[NaN], [Infinity], [-Infinity], [29.99], [45.01], ["38"]])("Messwert %j wird verworfen, Notfall bleibt", (wert) => {
    const e = pruefeVorrangig(w, befund({ symptome: ["bewusstlosigkeit"], messwerte: { temperatur_c: [wert as number] } }));
    expect(e.status).toBe("NOTFALL");
    expect(e.befundlageFehler).toHaveLength(1);
  });

  it("NaN-Temperatur beim Säugling löst nichts aus und wird gemeldet", () => {
    const e = pruefeVorrangig(w, befund({ alter: { tage: 42, monate: 1 }, messwerte: { temperatur_c: [NaN] } }));
    expect(e.status).toBe("KEINE_WARNZEICHEN");
    expect(e.befundlageFehler).toEqual(["Ungültiger Wert für „temperatur_c“ verworfen."]);
  });

  it("Prototyp-Schlüssel werden nicht als Antwort oder Symptom gewertet", () => {
    const e = pruefeVorrangig(w, befund({ symptome: ["constructor", "__proto__"], antworten: JSON.parse('{"__proto__":"ja","constructor":"ja"}') }));
    expect(e.status).toBe("KEINE_WARNZEICHEN");
    expect(e.befundlageFehler.length).toBeGreaterThanOrEqual(3);
  });

  it("ungültiges Alter → unbekannt (konservativ)", () => {
    const e = pruefeVorrangig(w, befund({ alter: { tage: NaN, monate: 1 }, symptome: ["fieber"] }));
    expect(e.redFlags.map((r) => r.id)).toEqual(["RF-KIND-001"]);
  });
});

describe("B5 Krisenantworten: nur exakt „nein“ entwarnt", () => {
  it.each([["JA"], ["yes"], [""], [null], [1], [true], [" nein"], ["Nein"], [[]], [["nein", "ja"]]])("Wert %j ⇒ KRISE", (wert) => {
    const nein = { krise_gedanken_nicht_leben: "nein", krise_gedanken_selbstverletzung: "nein", krise_plaene: "nein" };
    expect(pruefeVorrangig(w, befund({ antworten: { ...nein, krise_plaene: wert } })).status).toBe("KRISE");
    expect(pruefeVorrangig(w, befund({ psychisch: true, antworten: { ...nein, krise_plaene: wert } })).status).toBe("KRISE");
  });

  it("normalisiereAntwort", () => {
    expect(normalisiereAntwort("ja")).toBe("ja");
    expect(normalisiereAntwort("nein")).toBe("nein");
    expect(normalisiereAntwort(["nein", "nein"])).toBe("nein");
    expect(normalisiereAntwort(["nein", "keine_angabe"])).toBe("keine_angabe");
    expect(normalisiereAntwort(undefined)).toBe("keine_angabe");
  });

  it("S4: psychisch als beliebiger wahrer Wert aktiviert den Krisenpfad", () => {
    expect(pruefeVorrangig(w, befund({ psychisch: "true" as unknown as boolean })).status).toBe("KRISE");
  });
});

describe("REQ-218 Sicherheitsnetz", () => {
  it.each([
    ["teilnahmslosigkeit", { tage: 11000, monate: 361 }, "RF-ALLG-005"],
    ["brustschmerz_akut", { tage: 6570, monate: 215 }, "SN-001"],
    ["trinkschwaeche", { tage: 400, monate: 13 }, "SN-001"],
    ["verlust_erworbener_faehigkeiten", { tage: 11000, monate: 361 }, "SN-001"],
    ["blaue_lippen", { tage: 11000, monate: 361 }, "SN-001"],
  ])("%s außerhalb des Regelbereichs ⇒ nie KEINE_WARNZEICHEN", (s, alter, id) => {
    const e = pruefeVorrangig(w, befund({ alter, symptome: [s] }));
    expect(["NOTFALL", "DRINGEND"]).toContain(e.status);
    expect(e.redFlags.map((r) => r.id)).toContain(id);
  });

  it("Sicherheitsnetz nennt die Warnzeichen und ist ungeprüft", () => {
    const e = pruefeVorrangig(w, befund({ symptome: ["blaue_lippen", "trinkschwaeche"] }));
    expect(e.redFlags).toHaveLength(1);
    expect(e.redFlags[0]).toMatchObject({ regelwerk: "sicherheitsnetz", id: "SN-001", dringlichkeit: "DRINGEND", status: "ungeprüft" });
    expect(e.redFlags[0]!.titel).toContain("Bläuliche Lippen");
    expect(e.redFlags[0]!.titel).toContain("Trinkt kaum");
  });

  it("abgedecktes Warnzeichen löst kein Sicherheitsnetz aus; Fieber allein ist kein Warnzeichen", () => {
    expect(pruefeVorrangig(w, befund({ symptome: ["atemnot", "blaue_lippen"] })).redFlags.map((r) => r.id)).toEqual(["RF-ALLG-001", "RF-ALLG-002"]);
    expect(pruefeVorrangig(w, befund({ symptome: ["fieber"] })).status).toBe("KEINE_WARNZEICHEN");
  });
});

describe("B3 Altersgrenze kalendergenau", () => {
  it.each([
    ["2026-07-04", "2026-10-03", true],
    ["2026-07-03", "2026-10-03", false],
    ["2026-07-03", "2026-10-02", true],
    ["2025-11-30", "2026-02-27", true],
    ["2025-11-30", "2026-02-28", false],
  ])("Geburt %s, Stichtag %s ⇒ Regel %s", (geburt, stichtag, greift) => {
    const b = befundlageFuerProfil(
      { geburtsdatum: new Date(`${geburt}T00:00:00Z`), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT" },
      { symptome: ["fieber"], messwerte: {}, antworten: {}, psychisch: false },
      new Date(`${stichtag}T00:00:00Z`),
    );
    expect(pruefeVorrangig(w, b).redFlags.some((r) => r.id === "RF-KIND-001")).toBe(greift);
  });
});

describe("S2 Zeitrahmen", () => {
  it("Fieber < 3 Monate: DRINGEND mit Zeitrahmen SOFORT; Atemnot allein: HEUTE", () => {
    const f = pruefeVorrangig(w, befund({ alter: { tage: 42, monate: 1 }, symptome: ["fieber", "atemnot"] }));
    expect(f.redFlags.map((r) => [r.id, r.zeitrahmen])).toEqual([["RF-KIND-001", "SOFORT"], ["RF-ALLG-002", "HEUTE"]]);
    expect(f.redFlagZeitrahmen).toBe("SOFORT");
  });
});

describe("REQ-207/REQ-208 Kontakte (RISK-028)", () => {
  it("Nummern exakt nach CLAUDE.md §5 mit tel:-Links", () => {
    expect(NOTRUF).toMatchObject({ nummer: "112", href: "tel:112" });
    expect(BEREITSCHAFTSDIENST).toMatchObject({ nummer: "116117", href: "tel:116117" });
    expect(TELEFONSEELSORGE.map((k) => [k.nummer, k.href])).toEqual([
      ["0800 111 0 111", "tel:08001110111"],
      ["0800 111 0 222", "tel:08001110222"],
    ]);
  });

  it("Notfall-Regeln verweisen auf 112, dringende auf 116117", () => {
    for (const r of w.redFlags) {
      expect(r.ergebnis.anlaufstelle, r.id).toBe(r.ergebnis.dringlichkeit === "NOTFALL" ? "NOTRUF_112" : "BEREITSCHAFTSDIENST_116117");
      expect(r.ergebnis.hinweisPatient, r.id).toContain(r.ergebnis.dringlichkeit === "NOTFALL" ? "112" : "116117");
    }
  });
});

describe("S-3 ungültige Strukturen der Befundlage", () => {
  it.each([[null], [[]], ["ja"], [undefined], [42]])("antworten = %j ⇒ gemeldet und KRISE (konservativ)", (antworten) => {
    const e = pruefeVorrangig(w, befund({ antworten: antworten as never }));
    expect(e.status).toBe("KRISE");
    expect(e.befundlageFehler.join()).toContain("Antworten haben eine ungültige Struktur");
  });

  it("symptome/messwerte mit falscher Struktur ⇒ gemeldet, übrige Auswertung läuft", () => {
    const e = pruefeVorrangig(w, befund({ symptome: null as never, messwerte: [38] as never, antworten: { krise_plaene: "ja" } }));
    expect(e.status).toBe("KRISE");
    expect(e.befundlageFehler).toEqual([
      "Symptome haben eine ungültige Struktur – verworfen.",
      "Messwerte haben eine ungültige Struktur – verworfen.",
    ]);
  });
});

describe("H-2 abgedeckt nur im erfüllten Zweig", () => {
  it("Symptom in einem nicht erfüllten Zweig gilt nicht als genutzt", () => {
    const b = befund({ symptome: ["atemnot", "bewusstlosigkeit"] });
    expect(
      genutzteSymptome({ eines: [{ alle: [{ symptom: "atemnot" }, { symptom: "blaue_lippen" }] }, { symptom: "bewusstlosigkeit" }] }, b),
    ).toEqual(["bewusstlosigkeit"]);
    expect(genutzteSymptome({ symptom: "fieber" }, b)).toEqual([]);
  });
});

describe("N-3 nur einfache Objekte", () => {
  it("antworten als Map ⇒ gemeldet und KRISE", () => {
    const e = pruefeVorrangig(w, befund({ antworten: new Map([["krise_plaene", "nein"]]) as never }));
    expect(e.status).toBe("KRISE");
    expect(e.befundlageFehler.join()).toContain("Antworten haben eine ungültige Struktur");
  });

  it("messwerte als Map oder Klasseninstanz ⇒ gemeldet", () => {
    class Werte {
      temperatur_c = [39];
    }
    for (const messwerte of [new Map([["temperatur_c", [39]]]), new Werte()]) {
      const e = pruefeVorrangig(w, befund({ alter: { tage: 42, monate: 1 }, messwerte: messwerte as never }));
      expect(e.befundlageFehler).toEqual(["Messwerte haben eine ungültige Struktur – verworfen."]);
    }
  });

  it("Objekt ohne Prototyp wird akzeptiert", () => {
    const antworten = Object.assign(Object.create(null) as Record<string, unknown>, { krise_plaene: "ja" });
    const e = pruefeVorrangig(w, befund({ antworten }));
    expect(e.kriseGrund).toBe("positiv");
    expect(e.befundlageFehler).toEqual([]);
  });
});

describe("N-2 Mindest-Dringlichkeit zur Laufzeit", () => {
  it("im Standard-Regelwerk keine zusätzliche SN-002, wenn die Regel bereits NOTFALL liefert", () => {
    const e = pruefeVorrangig(w, befund({ symptome: ["bewusstlosigkeit", "laehmung_ploetzlich"] }));
    expect(e.redFlags.map((r) => r.id)).toEqual(["RF-ALLG-003", "RF-ALLG-004"]);
  });
});
