import { gespeicherteEingabeSchema, standardFragenkataloge, standardRegelwerk, type Gesammelt } from "@medassist/core";
import { describe, expect, it } from "vitest";
import { bewerteFall, type FallKontext } from "./auswertung";
import { notBewertung, statischerNotfallZustand } from "./notbewertung";
import { absichern, signalIstNeu, verarbeiteSchritt, type NeueEingabe } from "./schritt";

const regelwerk = standardRegelwerk();
const kataloge = standardFragenkataloge();
const KONTEXT: Omit<FallKontext, "eingaben"> = {
  regelwerk,
  kataloge,
  bereich: "KOERPERLICH",
  profil: { geburtsdatum: new Date("1980-01-01T00:00:00Z"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT", istKinderprofil: false },
  rolle: "PATIENT",
  stichtag: new Date("2026-10-03T00:00:00Z"),
  alterMonate: 560,
};

function fd(eintraege: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of eintraege) f.append(k, v);
  return f;
}

describe("QA N1 Schreiben: nur lesbare Eingaben, Warnzeichen bleiben", () => {
  it.each([21, 200])("Schnellcheck „Bewusstlos“ + %i Temperaturwerte ⇒ gespeicherte Teil-Eingabe ist schemagültig und ergibt NOTFALL", (n) => {
    const v = verarbeiteSchritt(kataloge, regelwerk, "KOERPERLICH", { art: "schnellcheck" }, fd([["symptom", "bewusstlosigkeit"], ...Array.from({ length: n }, () => ["messwert.temperatur_c", "37,0"] as [string, string])]));
    expect(v.feldFehler?.["messwert.temperatur_c"]?.join(" ")).toContain("Zu viele Werte");
    const e = absichern(v.eingaben[0]!)!;
    expect(gespeicherteEingabeSchema.safeParse(e.strukturiert).success).toBe(true);
    const b = bewerteFall({ ...KONTEXT, eingaben: [{ frageId: e.frageId, strukturiert: e.strukturiert }] });
    expect(b.notfall).toBe("NOTFALL");
  });

  it("absichern: ungültige Eingabe wird auf sichere Teil-Eingabe mit allen Symptomen gekürzt", () => {
    const kaputt: NeueEingabe = {
      frageId: "schnellcheck",
      typ: "ANTWORT",
      inhalt: "x".repeat(5000),
      koerperregion: null,
      strukturiert: { v: 1, katalogVersion: "0.1.0", schritt: "schnellcheck", teilweise: false, wert: { typ: "schnellcheck", symptome: ["atemnot"], keine: false, messwerte: { temperatur_c: Array.from({ length: 50 }, (_, i) => 36 + i / 10) } } },
    };
    const e = absichern(kaputt)!;
    // REQ-402: Schreib-Obergrenze für `inhalt` seit Meilenstein 5 = 2000 Zeichen (längste Beschreibung).
    expect(e.inhalt).toHaveLength(2000);
    expect(e.strukturiert).toMatchObject({ teilweise: true, wert: { symptome: ["atemnot"] } });
    expect((e.strukturiert.wert as { messwerte: Record<string, number[]> }).messwerte.temperatur_c).toHaveLength(20);
    expect(gespeicherteEingabeSchema.safeParse(e.strukturiert).success).toBe(true);
  });
});

describe("QA N4 Warnsignal nur bei neuen Angaben", () => {
  const g = { symptome: ["atemnot"], messwerte: { temperatur_c: [38] } } as unknown as Gesammelt;
  const sig = (symptome: string[], messwerte: Record<string, number[]>): NeueEingabe => ({
    frageId: "schnellcheck",
    typ: "ANTWORT",
    inhalt: "",
    koerperregion: null,
    strukturiert: { v: 1, katalogVersion: "0.1.0", schritt: "schnellcheck", teilweise: true, wert: { typ: "schnellcheck", symptome, keine: false, messwerte } },
  });
  it("bekannt ⇒ nicht neu; neues Symptom oder neuer Wert ⇒ neu", () => {
    expect(signalIstNeu(sig(["atemnot"], { temperatur_c: [38] }), g)).toBe(false);
    expect(signalIstNeu(sig(["atemnot", "blaue_lippen"], {}), g)).toBe(true);
    expect(signalIstNeu(sig(["atemnot"], { temperatur_c: [39] }), g)).toBe(true);
  });
});

describe("QA N2 Speichern fehlgeschlagen ⇒ Hinweise aus der Bewertung im Speicher", () => {
  it("körperlich „Bewusstlos“ im Schnellcheck ⇒ Notfallhinweis NOTFALL", () => {
    const s = notBewertung(KONTEXT, [], fd([["schritt", "schnellcheck"], ["symptom", "bewusstlosigkeit"]]));
    expect(s.ergebnis?.notfallhinweis?.dringlichkeit).toBe("NOTFALL");
  });

  it("seelisch Krisenfrage „ja“ ⇒ Krisenhinweis", () => {
    const s = notBewertung({ ...KONTEXT, bereich: "PSYCHISCH" }, [], fd([["schritt", "krise"], ["antwort.krise_plaene", "ja"], ["antwort.krise_gedanken_nicht_leben", "nein"], ["antwort.krise_gedanken_selbstverletzung", "nein"]]));
    expect(s.ergebnis?.krisenhinweis).toEqual({ grund: "positiv" });
  });

  it("auch bei abgewiesenem Schritt: Krisensignal zählt", () => {
    const s = notBewertung(KONTEXT, [], fd([["schritt", "gibt_es_nicht"], ["antwort.krise_plaene", "ja"]]));
    expect(s.ergebnis?.krisenhinweis).toBeTruthy();
  });

  it("Bewertung selbst scheitert ⇒ statischer Hinweis (seelisch bzw. Krisenantwort ⇒ Krise)", () => {
    const kaputt = { ...KONTEXT, kataloge: null as never };
    const k = notBewertung(kaputt, [], fd([["schritt", "schnellcheck"]]));
    expect(k.fallback).toEqual({ krise: false, notfall: { dringlichkeit: "NOTFALL", zeitrahmen: "SOFORT", titel: "Speichern fehlgeschlagen – im Notfall Notruf 112" } });
    expect(notBewertung({ ...kaputt, bereich: "PSYCHISCH" }, [], fd([])).fallback?.krise).toBe(true);
    expect(statischerNotfallZustand(KONTEXT, fd([["antwort.krise_plaene", "keine_angabe"]])).fallback?.krise).toBe(true);
    expect(statischerNotfallZustand(KONTEXT, fd([["antwort.krise_plaene", "nein"]])).fallback?.krise).toBe(false);
  });

  it("seelisch ohne bewertbare Angaben ⇒ statischer Krisenhinweis", () => {
    expect(notBewertung({ ...KONTEXT, bereich: "PSYCHISCH" }, [], fd([["schritt", "krise"]])).ergebnis?.krisenhinweis).toBeTruthy();
  });
});

describe("QA R3-B1 Temperatur aus mehreren Abgaben", () => {
  const sc = (symptome: string[], keine: boolean, werte: number[], teilweise: boolean) => ({
    frageId: "schnellcheck",
    strukturiert: { v: 1, katalogVersion: "0.1.0", schritt: "schnellcheck", teilweise, wert: { typ: "schnellcheck", symptome, keine, messwerte: { temperatur_c: werte } } },
  });
  const saeugling = { ...KONTEXT, profil: { ...KONTEXT.profil, geburtsdatum: new Date("2026-08-22T00:00:00Z"), istKinderprofil: true }, alterMonate: 1 };

  it("Erwachsener 37,2 + 37,2 (abgewiesen, dann vollständig) ⇒ kein „unvollständig“", () => {
    const b = bewerteFall({ ...KONTEXT, eingaben: [sc(["atemnot"], false, [37.2], true), sc(["atemnot"], false, [37.2], false)] });
    expect(b.unvollstaendig).toBe(false);
    expect(b.state?.feldFehler).toBeUndefined();
  });

  it.each([
    [[37, 38.4]],
    [[38.4, 37]],
  ])("Säugling %j aus zwei Abgaben ⇒ DRINGEND, kein „unvollständig“ (Reihenfolge egal)", (werte) => {
    const b = bewerteFall({ ...saeugling, eingaben: [sc([], false, [werte[0]!], true), sc([], true, [werte[1]!], false)] });
    expect(b.notfall).toBe("DRINGEND");
    expect(b.unvollstaendig).toBe(false);
  });

  it("zwei verschiedene Werte innerhalb EINER Abgabe ⇒ weiterhin „unvollständig“, beide geprüft (DRINGEND)", () => {
    const b = bewerteFall({ ...saeugling, eingaben: [sc([], false, [37, 38.4], true)] });
    expect(b.unvollstaendig).toBe(true);
    expect(b.notfall).toBe("DRINGEND");
  });
});
