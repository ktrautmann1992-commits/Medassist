import { describe, expect, it } from "vitest";
import { standardRegelwerk } from "../regeln/standard";
import { gespeicherteEingabeSchema, pruefeAntwort, pruefeKrise, pruefeRegion, pruefeSchnellcheck } from "./antwort";
import { standardFragenkataloge } from "./standard";

const k = standardFragenkataloge();
const w = standardRegelwerk();
const KAT = k.kataloge.KOERPERLICH;
const f = (id: string) => KAT.fragenById.get(id)!;

describe("REQ-310 Antworten je Fragetyp", () => {
  it("Einfachauswahl: genau eine bekannte Option", () => {
    expect(pruefeAntwort(f("k_art"), { werte: ["schmerz"] })).toEqual({ ok: true, wert: { typ: "einfach", option: "schmerz" } });
    expect(pruefeAntwort(f("k_art"), { werte: [] })).toMatchObject({ ok: false, fehler: "Bitte eine Antwort wählen." });
    expect(pruefeAntwort(f("k_art"), { werte: ["schmerz", "haut"] })).toMatchObject({ ok: false, fehler: "Bitte nur eine Antwort wählen." });
    expect(pruefeAntwort(f("k_art"), { werte: ["__proto__"] })).toMatchObject({ ok: false });
    expect(pruefeAntwort(f("k_art"), { werte: [{}] })).toMatchObject({ ok: false });
  });

  it("Überspringen ⇒ keine Angabe, außer bei Pflichtfragen", () => {
    expect(pruefeAntwort(f("k_art"), { werte: [], ueberspringen: true })).toEqual({ ok: true, wert: { typ: "keine_angabe" } });
    expect(pruefeAntwort(f("k_begleitsymptome"), { werte: [], ueberspringen: true })).toMatchObject({ ok: false, fehler: expect.stringContaining("Pflicht") });
  });

  it("Mehrfachauswahl mit Symptomen: Symptome gehen auch bei Fehlern nicht verloren", () => {
    const b = f("k_begleitsymptome");
    expect(pruefeAntwort(b, { werte: ["atemnot", "fieber"] })).toEqual({
      ok: true,
      wert: { typ: "mehrfach", optionen: ["atemnot", "fieber"], keine: false, symptome: ["atemnot", "fieber"] },
    });
    expect(pruefeAntwort(b, { werte: [], keine: "on" })).toEqual({ ok: true, wert: { typ: "mehrfach", optionen: [], keine: true, symptome: [] } });
    // „Nichts davon“ + Warnzeichen ⇒ abgewiesen, Warnzeichen bleiben erhalten
    expect(pruefeAntwort(b, { werte: ["bewusstlosigkeit"], keine: "on" })).toEqual({
      ok: false,
      fehler: expect.stringContaining("nicht beides"),
      symptome: ["bewusstlosigkeit"],
    });
    // unbekannte ID (Manipulation) ⇒ abgewiesen, gültige Warnzeichen bleiben erhalten
    expect(pruefeAntwort(b, { werte: ["atemnot", "erfunden"] })).toEqual({ ok: false, fehler: expect.any(String), symptome: ["atemnot"] });
    expect(pruefeAntwort(b, { werte: [] })).toMatchObject({ ok: false, symptome: [] });
    // „Überspringen“ mit angekreuzten Symptomen wird nicht als „keine Angabe“ gewertet
    const a = f("k_ausloeser");
    expect(pruefeAntwort(a, { werte: ["bewegung"], ueberspringen: true })).toEqual({ ok: true, wert: { typ: "keine_angabe" } });
    expect(pruefeAntwort(b, { werte: ["atemnot"], ueberspringen: true })).toMatchObject({ ok: true, wert: { symptome: ["atemnot"] } });
  });

  it("Skala 0–10: nur ganze Zahl im Bereich", () => {
    const s = f("k_staerke");
    expect(pruefeAntwort(s, { werte: ["7"] })).toEqual({ ok: true, wert: { typ: "skala", wert: 7 } });
    expect(pruefeAntwort(s, { werte: ["0"] })).toMatchObject({ ok: true });
    for (const x of ["11", "-1", "7,5", "7 ", "sieben", ""]) expect(pruefeAntwort(s, { werte: [x] }).ok, x).toBe(x === "7 ");
    expect(pruefeAntwort(s, { werte: ["3", "4"] })).toMatchObject({ ok: false });
  });

  it("Freitext: kurz, ohne Steuerzeichen", () => {
    const t = f("k_ergaenzung");
    expect(pruefeAntwort(t, { werte: ["  seit dem Urlaub  "] })).toEqual({ ok: true, wert: { typ: "freitext", text: "seit dem Urlaub" } });
    expect(pruefeAntwort(t, { werte: ["x".repeat(201)] })).toMatchObject({ ok: false, fehler: "Bitte höchstens 200 Zeichen eingeben." });
    expect(pruefeAntwort(t, { werte: ["a\u0000b"] })).toMatchObject({ ok: false });
    expect(pruefeAntwort(t, { werte: [""] })).toMatchObject({ ok: false });
  });

  it("Dauer: Anzahl 1–99 und erlaubte Einheit", () => {
    const d = f("k_dauer");
    expect(pruefeAntwort(d, { werte: [], anzahl: "3", einheit: "tage" })).toEqual({ ok: true, wert: { typ: "dauer", anzahl: 3, einheit: "tage" } });
    expect(pruefeAntwort(d, { werte: [], anzahl: "0", einheit: "tage" })).toMatchObject({ ok: false });
    expect(pruefeAntwort(d, { werte: [], anzahl: "100", einheit: "tage" })).toMatchObject({ ok: false });
    expect(pruefeAntwort(d, { werte: [], anzahl: "2,5", einheit: "tage" })).toMatchObject({ ok: false });
    expect(pruefeAntwort(d, { werte: [], anzahl: "3", einheit: "minuten" })).toMatchObject({ ok: false, fehler: "Bitte eine Einheit wählen." });
  });
});

describe("REQ-306 Schnellcheck", () => {
  const roh = (teil: Partial<Parameters<typeof pruefeSchnellcheck>[2]>) => ({ symptome: [], keine: null, messwerte: [], ...teil });

  it("ausdrückliche Antwort ist Pflicht", () => {
    const e = pruefeSchnellcheck(KAT, w, roh({}));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.feldFehler.keine?.[0]).toContain("„Nichts davon trifft zu“ bestätigen");
    expect(pruefeSchnellcheck(KAT, w, roh({ keine: "on" }))).toEqual({ ok: true, wert: { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} } });
  });

  it("Warnzeichen + Temperatur (REQ-219-Lesart)", () => {
    expect(pruefeSchnellcheck(KAT, w, roh({ symptome: ["fieber"], messwerte: [["temperatur_c", "38,5 °C"]] }))).toEqual({
      ok: true,
      wert: { typ: "schnellcheck", symptome: ["fieber"], keine: false, messwerte: { temperatur_c: [38.5] } },
    });
    // leere Temperatur ist optional
    expect(pruefeSchnellcheck(KAT, w, roh({ keine: "on", messwerte: [["temperatur_c", ""]] })).ok).toBe(true);
  });

  it("Fehler verwerfen keine Warnzeichen (Teilauswertung)", () => {
    const e = pruefeSchnellcheck(KAT, w, roh({ symptome: ["atemnot", "erfunden"], keine: "on", messwerte: [["temperatur_c", "37, 39"]] }));
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(e.teil).toEqual({ typ: "schnellcheck", symptome: ["atemnot"], keine: false, messwerte: {} });
    expect(Object.keys(e.feldFehler).sort()).toEqual(["keine", "messwert.temperatur_c", "symptome"]);
    expect(e.feldFehler["messwert.temperatur_c"]?.[0]).toContain("Bitte nur einen Wert angeben");
  });
});

describe("REQ-311 Krisen-Screening", () => {
  it("fehlende, ungültige und mehrfache Antworten werden konservativ normalisiert", () => {
    expect(pruefeKrise(w, [["krise_gedanken_nicht_leben", "nein"], ["krise_gedanken_selbstverletzung", "nein"], ["krise_plaene", "nein"]])).toEqual({
      typ: "krise",
      antworten: { krise_gedanken_nicht_leben: "nein", krise_gedanken_selbstverletzung: "nein", krise_plaene: "nein" },
    });
    expect(
      pruefeKrise(w, [
        ["krise_gedanken_nicht_leben", "nein"],
        ["krise_gedanken_nicht_leben", "ja"],
        ["krise_gedanken_selbstverletzung", "JA"],
        ["unbekannt", "nein"],
      ]).antworten,
    ).toEqual({ krise_gedanken_nicht_leben: "ja", krise_gedanken_selbstverletzung: "keine_angabe", krise_plaene: "keine_angabe" });
  });
});

describe("REQ-303 Region und gespeichertes Schema", () => {
  it("genau eine bekannte Region", () => {
    expect(pruefeRegion(k.koerperkarte, ["brust"])).toEqual({ ok: true, region: "brust" });
    expect(pruefeRegion(k.koerperkarte, [])).toMatchObject({ ok: false });
    expect(pruefeRegion(k.koerperkarte, ["brust", "kopf"])).toMatchObject({ ok: false });
    expect(pruefeRegion(k.koerperkarte, ["mond"])).toMatchObject({ ok: false });
  });

  it("REQ-313: gespeicherte Eingaben werden streng geprüft", () => {
    const gut = { v: 1, katalogVersion: "0.1.0", schritt: "k_art", teilweise: false, wert: { typ: "einfach", option: "schmerz" } };
    expect(gespeicherteEingabeSchema.safeParse(gut).success).toBe(true);
    for (const schlecht of [
      { ...gut, v: 2 },
      { ...gut, extra: 1 },
      { ...gut, wert: { typ: "einfach", option: "Schmerz!" } },
      { ...gut, wert: { typ: "skala", wert: 11 } },
      { ...gut, wert: { typ: "schnellcheck", symptome: ["atemnot"], keine: false, messwerte: { temperatur_c: [Number.NaN] } } },
      { ...gut, wert: { typ: "krise", antworten: { krise_plaene: "JA" } } },
    ]) {
      expect(gespeicherteEingabeSchema.safeParse(schlecht).success, JSON.stringify(schlecht)).toBe(false);
    }
  });
});
