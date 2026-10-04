import { gespeicherteEingabeSchema, naechsterSchritt, standardFragenkataloge, standardRegelwerk, type GespeicherteEingabeRoh, type Rolle } from "@medassist/core";
import { describe, expect, it } from "vitest";
import { textFuer, schrittAnsicht } from "./ansicht";
import { anzeigeStatus, bewerteFall, hinweisEskaliert, neuerFallStatus, ohneDringlichkeitText, statusText, type FallKontext, type FallStatusWert } from "./auswertung";
import { kriseSignal, verarbeiteSchritt, warnSignal } from "./schritt";

const regelwerk = standardRegelwerk();
const kataloge = standardFragenkataloge();
const STICHTAG = new Date("2026-10-03T00:00:00Z");

function profil(geburtsdatum: string, kind = false) {
  return { geburtsdatum: new Date(`${geburtsdatum}T00:00:00Z`), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT" as const, istKinderprofil: kind };
}

function e(schritt: string, wert: unknown, teilweise = false): GespeicherteEingabeRoh {
  return { frageId: schritt, strukturiert: { v: 1, katalogVersion: "0.1.0", schritt, teilweise, wert } };
}
const NEIN = { krise_gedanken_nicht_leben: "nein", krise_gedanken_selbstverletzung: "nein", krise_plaene: "nein" };

function kontext(teil: Partial<FallKontext>): FallKontext {
  return { regelwerk, kataloge, bereich: "KOERPERLICH", profil: profil("1980-01-01"), eingaben: [], rolle: "PATIENT", stichtag: STICHTAG, alterMonate: 560, ...teil };
}

function fd(eintraege: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of eintraege) f.append(k, v);
  return f;
}

describe("REQ-307 Bewertung eines Falls mit der Regel-Engine", () => {
  it("Säugling (6 Wochen) + Fieber im Schnellcheck ⇒ DRINGEND/SOFORT, Status NOTFALLHINWEIS", () => {
    const b = bewerteFall(kontext({ profil: profil("2026-08-22", true), alterMonate: 1, eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: ["fieber"], keine: false, messwerte: {} })] }));
    expect(b.notfall).toBe("DRINGEND");
    expect(b.state?.ergebnis?.notfallhinweis).toEqual({ dringlichkeit: "DRINGEND", zeitrahmen: "SOFORT" });
    expect(b.state?.ergebnis?.ausgeloesteRegeln[0]?.id).toBe("RF-KIND-001");
    expect(neuerFallStatus({ status: "ENTWURF", dringlichkeit: null }, b, false, true)).toEqual({ status: "NOTFALLHINWEIS", dringlichkeit: "DRINGEND" });
    // DRINGEND ⇒ weiter ohne Bestätigungsschritt (REQ-308)
    expect(naechsterSchritt(kataloge, b.stand).art).toBe("region");
  });

  it("Erwachsener + Fieber ⇒ keine Warnzeichen; NOTFALL ⇒ Bestätigungsschritt", () => {
    const ohne = bewerteFall(kontext({ eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: ["fieber"], keine: false, messwerte: {} })] }));
    expect(ohne.state?.ergebnis?.status).toBe("KEINE_WARNZEICHEN");
    expect(ohne.notfall).toBeNull();
    const mit = bewerteFall(kontext({ eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: ["bewusstlosigkeit"], keine: false, messwerte: {} })] }));
    expect(mit.notfall).toBe("NOTFALL");
    expect(naechsterSchritt(kataloge, mit.stand).art).toBe("notfall_weiter");
  });

  it("REQ-311 seelisch: vor dem Screening keine Bewertung; Krise ⇒ Ablauf beendet, KRISENHINWEIS", () => {
    const leer = bewerteFall(kontext({ bereich: "PSYCHISCH" }));
    expect(leer.state).toBeNull();
    expect(naechsterSchritt(kataloge, leer.stand).art).toBe("krise");
    const krise = bewerteFall(kontext({ bereich: "PSYCHISCH", eingaben: [e("krise", { typ: "krise", antworten: { ...NEIN, krise_plaene: "ja" } })] }));
    expect(krise.krise).toBe(true);
    expect(naechsterSchritt(kataloge, krise.stand).art).toBe("beendet");
    expect(neuerFallStatus({ status: "ENTWURF", dringlichkeit: null }, krise, true, true)).toEqual({ status: "KRISENHINWEIS", dringlichkeit: "NOTFALL" });
    const nein = bewerteFall(kontext({ bereich: "PSYCHISCH", eingaben: [e("krise", { typ: "krise", antworten: NEIN })] }));
    expect(nein.krise).toBe(false);
    expect(naechsterSchritt(kataloge, nein.stand).art).toBe("schnellcheck");
  });

  it("REQ-213 Rollenfilter serverseitig: Patient ohne ärztlichen Hinweistext", () => {
    const eingaben = [e("schnellcheck", { typ: "schnellcheck", symptome: ["atemnot"], keine: false, messwerte: {} })];
    const patient = bewerteFall(kontext({ eingaben, rolle: "PATIENT" }));
    const arzt = bewerteFall(kontext({ eingaben, rolle: "ARZT" }));
    expect(patient.state?.ergebnis?.rolle).toBe("PATIENT");
    expect(patient.state?.ergebnis?.ausgeloesteRegeln[0]).not.toHaveProperty("hinweisArzt");
    expect(arzt.state?.ergebnis?.ausgeloesteRegeln[0]).toHaveProperty("hinweisArzt");
  });

  it("RISK-035: nicht lesbare Eingabe ⇒ unvollständig (nie „keine Warnzeichen“ ohne Hinweis)", () => {
    const b = bewerteFall(kontext({ eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} }), { frageId: "k_art", strukturiert: { kaputt: 1 } }] }));
    expect(b.state?.ergebnis?.status).toBe("KEINE_WARNZEICHEN");
    expect(b.unvollstaendig).toBe(true);
  });

  it("REQ-220/REQ-314: interner Fehler ⇒ statischer Hinweis; Status nur bei Krisenverdacht geändert", () => {
    const kaputt = { ...profil("1980-01-01"), get geburtsdatum(): Date { throw new Error("kaputt"); } };
    const k = bewerteFall(kontext({ profil: kaputt, eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} })] }));
    expect(k.fehlgeschlagen).toBe(true);
    expect(k.notfall).toBe("NOTFALL");
    expect(neuerFallStatus({ status: "IN_EINGRENZUNG", dringlichkeit: null }, k, false, true)).toEqual({ status: "IN_EINGRENZUNG", dringlichkeit: null });
    const p = bewerteFall(kontext({ bereich: "PSYCHISCH", profil: kaputt, eingaben: [e("krise", { typ: "krise", antworten: NEIN })] }));
    expect(p.fehlgeschlagen).toBe(true);
    expect(p.krise).toBe(true);
    expect(neuerFallStatus({ status: "IN_EINGRENZUNG", dringlichkeit: null }, p, false, true).status).toBe("KRISENHINWEIS");
  });

  it("REQ-314: Status und Dringlichkeit werden nie herabgestuft", () => {
    const ohne = bewerteFall(kontext({ eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} })] }));
    expect(neuerFallStatus({ status: "NOTFALLHINWEIS", dringlichkeit: "NOTFALL" }, ohne, true, true)).toEqual({ status: "NOTFALLHINWEIS", dringlichkeit: "NOTFALL" });
    expect(neuerFallStatus({ status: "ENTWURF", dringlichkeit: null }, ohne, true, true).status).toBe("ABGESCHLOSSEN");
    expect(neuerFallStatus({ status: "ENTWURF", dringlichkeit: null }, ohne, false, true).status).toBe("IN_EINGRENZUNG");
  });

  it("Hinweis-Eskalation für den Fokus", () => {
    const leer = bewerteFall(kontext({}));
    const dringend = bewerteFall(kontext({ eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: ["atemnot"], keine: false, messwerte: {} })] }));
    const notfall = bewerteFall(kontext({ eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: ["atemnot", "blaue_lippen"], keine: false, messwerte: {} })] }));
    expect(hinweisEskaliert(leer, dringend)).toBe(true);
    expect(hinweisEskaliert(dringend, notfall)).toBe(true);
    expect(hinweisEskaliert(notfall, notfall)).toBe(false);
  });
});

describe("REQ-306/REQ-310/REQ-313 Verarbeitung der Formulardaten je Schritt", () => {
  const kat = (b: "KOERPERLICH" | "PSYCHISCH", s: Parameters<typeof verarbeiteSchritt>[3], daten: [string, string][]) =>
    verarbeiteSchritt(kataloge, regelwerk, b, s, fd(daten));
  const gueltig = (x: unknown) => expect(gespeicherteEingabeSchema.safeParse(x).success).toBe(true);

  it("Schnellcheck: gültig, Pflichtangabe, Teil-Eingabe bei Fehlern", () => {
    const ok = kat("KOERPERLICH", { art: "schnellcheck" }, [["symptom", "fieber"], ["messwert.temperatur_c", "38,5"]]);
    expect(ok.fehler).toBeUndefined();
    expect(ok.eingaben[0]?.strukturiert.wert).toEqual({ typ: "schnellcheck", symptome: ["fieber"], keine: false, messwerte: { temperatur_c: [38.5] } });
    expect(ok.eingaben[0]?.inhalt).toBe("Warnzeichen-Schnellcheck: Fieber");
    gueltig(ok.eingaben[0]?.strukturiert);

    const leer = kat("KOERPERLICH", { art: "schnellcheck" }, []);
    expect(leer.eingaben).toEqual([]);
    expect(leer.feldFehler?.keine?.[0]).toContain("bestätigen");

    const teil = kat("KOERPERLICH", { art: "schnellcheck" }, [["symptom", "atemnot"], ["messwert.temperatur_c", "37, 39"]]);
    expect(teil.fehler).toBeDefined();
    expect(teil.eingaben[0]?.strukturiert).toMatchObject({ teilweise: true, wert: { symptome: ["atemnot"] } });
    gueltig(teil.eingaben[0]?.strukturiert);
  });

  it("Frage: Warnzeichen in Begleitsymptomen bleiben bei widersprüchlicher Auswahl erhalten", () => {
    const frage = kataloge.kataloge.KOERPERLICH.fragenById.get("k_begleitsymptome")!;
    const v = kat("KOERPERLICH", { art: "frage", frage }, [["wert", "atemnot"], ["keine", "on"]]);
    expect(v.feldFehler?.wert?.[0]).toContain("nicht beides");
    expect(v.eingaben[0]?.strukturiert).toMatchObject({ teilweise: true, wert: { typ: "mehrfach", symptome: ["atemnot"] } });
    gueltig(v.eingaben[0]?.strukturiert);
    const ueber = kat("KOERPERLICH", { art: "frage", frage: kataloge.kataloge.KOERPERLICH.fragenById.get("k_art")! }, [["aktion", "ueberspringen"]]);
    expect(ueber.eingaben[0]?.strukturiert.wert).toEqual({ typ: "keine_angabe" });
    expect(ueber.eingaben[0]?.inhalt).toBe("Art der Beschwerden: keine Angabe");
  });

  it("Region, Notfall-Bestätigung und Krisen-Screening", () => {
    expect(kat("KOERPERLICH", { art: "region" }, [["region", "mond"]]).eingaben).toEqual([]);
    const r = kat("KOERPERLICH", { art: "region" }, [["region", "brust"]]);
    expect(r.eingaben[0]).toMatchObject({ typ: "KOERPERREGION", koerperregion: "brust", inhalt: "Brust" });
    expect(kat("KOERPERLICH", { art: "notfall_weiter" }, []).feldFehler?.bestaetigt).toBeDefined();
    expect(kat("KOERPERLICH", { art: "notfall_weiter" }, [["bestaetigt", "on"]]).eingaben[0]?.strukturiert.wert).toEqual({ typ: "notfall_bestaetigung" });
    const k = kat("PSYCHISCH", { art: "krise" }, [["antwort.krise_plaene", "nein"]]);
    expect(k.eingaben[0]?.strukturiert.wert).toEqual({
      typ: "krise",
      antworten: { krise_gedanken_nicht_leben: "keine_angabe", krise_gedanken_selbstverletzung: "keine_angabe", krise_plaene: "nein" },
    });
    expect(k.eingaben[0]?.inhalt).toContain("nicht alle Fragen");
    gueltig(k.eingaben[0]?.strukturiert);
  });

  it("Beendete/Zusammenfassungs-Schritte nehmen nichts an", () => {
    expect(kat("KOERPERLICH", { art: "beendet" }, [["wert", "x"]]).eingaben).toEqual([]);
  });
});

describe("REQ-310/REQ-221 Texte je Rolle und Profil", () => {
  const t = { text: "Sie", textKind: "Kind", textFremd: "Patient" };
  it.each([
    ["PATIENT", false, "Sie"],
    ["PATIENT", true, "Kind"],
    ["ARZT", false, "Patient"],
    ["ARZT", true, "Patient"],
  ] as [Rolle, boolean, string][])("%s, Kinderprofil %s ⇒ %s", (rolle, kind, erwartet) => {
    expect(textFuer(rolle, kind, t)).toBe(erwartet);
  });

  it("Krisenfragen als Fremdanamnese für Ärztinnen und Ärzte", () => {
    const b = bewerteFall(kontext({ bereich: "PSYCHISCH" }));
    const a = schrittAnsicht(kataloge, regelwerk, "PSYCHISCH", { art: "krise" }, b.gesammelt, "ARZT", false);
    expect(a?.art === "krise" && a.fragen[0]?.text).toContain("Hatte die Patientin bzw. der Patient");
  });
});

describe("QA B1 Rang-Logik: Status/Dringlichkeit nie herabgestuft", () => {
  const RANG: FallStatusWert[] = ["ENTWURF", "IN_EINGRENZUNG", "ABGESCHLOSSEN", "NOTFALLHINWEIS", "KRISENHINWEIS"];
  const ohne = bewerteFall(kontext({ eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} })] }));
  it.each(RANG)("gespeichert %s bleibt mindestens erhalten", (alt) => {
    for (const abgeschlossen of [false, true]) {
      const neu = neuerFallStatus({ status: alt, dringlichkeit: "NOTFALL" }, ohne, abgeschlossen, true);
      expect(RANG.indexOf(neu.status)).toBeGreaterThanOrEqual(RANG.indexOf(alt));
      expect(neu.dringlichkeit).toBe("NOTFALL");
    }
  });

  it("verlorenes Update: gespeichert IN_EINGRENZUNG, Eingaben enthalten Krise ⇒ Anzeige KRISENHINWEIS/NOTFALL", () => {
    const b = bewerteFall(kontext({ bereich: "PSYCHISCH", eingaben: [e("krise", { typ: "krise", antworten: { ...NEIN, krise_plaene: "ja" } }), e("krise", { typ: "krise", antworten: NEIN })] }));
    expect(anzeigeStatus({ status: "IN_EINGRENZUNG", dringlichkeit: null }, b, false, true)).toEqual({ status: "KRISENHINWEIS", dringlichkeit: "NOTFALL" });
    const n = bewerteFall(kontext({ eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} }), e("schnellcheck", { typ: "schnellcheck", symptome: ["bewusstlosigkeit"], keine: false, messwerte: {} })] }));
    expect(anzeigeStatus({ status: "IN_EINGRENZUNG", dringlichkeit: null }, n, false, true)).toEqual({ status: "NOTFALLHINWEIS", dringlichkeit: "NOTFALL" });
  });

  it("QA B7/B2: Statustext und Text ohne Dringlichkeit", () => {
    expect(statusText("NOTFALLHINWEIS", "DRINGEND")).toBe("Warnhinweis");
    expect(statusText("NOTFALLHINWEIS", "NOTFALL")).toBe("Notfallhinweis");
    expect(ohneDringlichkeitText(bewerteFall(kontext({})))).toBe("Noch nicht geprüft");
    expect(ohneDringlichkeitText(bewerteFall(kontext({ bereich: "PSYCHISCH" })))).toBe("Noch nicht geprüft");
    expect(ohneDringlichkeitText(ohne)).toBe("Keine Warnzeichen erkannt (Demo-Regelsatz)");
    const kaputt = bewerteFall(kontext({ eingaben: [{ frageId: "k_art", strukturiert: 1 }] }));
    expect(ohneDringlichkeitText(kaputt)).toBe("Prüfung unvollständig");
  });
});

describe("QA B5 Krisenantworten in jedem Schritt", () => {
  it("eingeschleuste Krisenantwort im Schnellcheck wird als Krisen-Eingabe gespeichert ⇒ KRISE", () => {
    const v = verarbeiteSchritt(kataloge, regelwerk, "PSYCHISCH", { art: "schnellcheck" }, fd([["keine", "on"], ["antwort.krise_plaene", "ja"]]));
    expect(v.eingaben.map((x) => x.frageId)).toEqual(["krise", "schnellcheck"]);
    const b = bewerteFall(
      kontext({
        bereich: "PSYCHISCH",
        eingaben: [e("krise", { typ: "krise", antworten: NEIN }), ...v.eingaben.map((x) => ({ frageId: x.frageId, strukturiert: x.strukturiert }))],
      }),
    );
    expect(b.krise).toBe(true);
    expect(naechsterSchritt(kataloge, b.stand).art).toBe("beendet");
  });

  it("auch im körperlichen Ablauf; unbekannte antwort.*-Felder werden ignoriert", () => {
    const v = verarbeiteSchritt(kataloge, regelwerk, "KOERPERLICH", { art: "region" }, fd([["region", "brust"], ["antwort.krise_gedanken_nicht_leben", "JA"], ["antwort.sonstwas", "ja"]]));
    expect(v.eingaben[0]?.strukturiert.wert).toMatchObject({ typ: "krise", antworten: { krise_gedanken_nicht_leben: "keine_angabe" } });
    const b = bewerteFall(kontext({ eingaben: v.eingaben.map((x) => ({ frageId: x.frageId, strukturiert: x.strukturiert })) }));
    expect(b.krise).toBe(true);
    expect(verarbeiteSchritt(kataloge, regelwerk, "KOERPERLICH", { art: "region" }, fd([["region", "brust"], ["antwort.sonstwas", "ja"]])).eingaben).toHaveLength(1);
  });

  it("kriseSignal: nur bei einer Antwort ungleich „nein“ (für abgewiesene Schritte/abgeschlossene Fälle)", () => {
    expect(kriseSignal(kataloge, regelwerk, fd([]))).toBeNull();
    expect(kriseSignal(kataloge, regelwerk, fd(Object.entries(NEIN).map(([k, v]) => [`antwort.${k}`, v])))).toBeNull();
    expect(kriseSignal(kataloge, regelwerk, fd([["antwort.krise_plaene", "nein"]]))?.frageId).toBe("krise");
    expect(kriseSignal(kataloge, regelwerk, fd([...Object.entries(NEIN).map(([k, v]) => [`antwort.${k}`, v] as [string, string]), ["antwort.krise_plaene", "ja"]]))).not.toBeNull();
  });
});

describe("QA B1/RISK-029 Warnzeichen aus abgewiesenen Schritten gehen nicht verloren", () => {
  it("Schnellcheck aus veraltetem Tab ⇒ Teil-Eingabe (ändert den Ablauf nicht, zählt für die Engine)", () => {
    const w = warnSignal(kataloge, regelwerk, "KOERPERLICH", "schnellcheck", fd([["symptom", "bewusstlosigkeit"]]));
    expect(w?.strukturiert).toMatchObject({ teilweise: true, wert: { symptome: ["bewusstlosigkeit"] } });
    const b = bewerteFall(
      kontext({ eingaben: [e("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} }), { frageId: w!.frageId, strukturiert: w!.strukturiert }] }),
    );
    expect(b.notfall).toBe("NOTFALL");
    expect(b.gesammelt.schnellcheckErledigt).toBe(true);
  });

  it("Begleitsymptome mit Warnzeichen ja, „Nichts davon“/eigene Optionen/unbekannter Schritt nein", () => {
    expect(warnSignal(kataloge, regelwerk, "KOERPERLICH", "k_begleitsymptome", fd([["wert", "atemnot"]]))?.strukturiert.teilweise).toBe(true);
    expect(warnSignal(kataloge, regelwerk, "KOERPERLICH", "schnellcheck", fd([["keine", "on"]]))).toBeNull();
    expect(warnSignal(kataloge, regelwerk, "KOERPERLICH", "k_ausloeser", fd([["wert", "bewegung"]]))).toBeNull();
    expect(warnSignal(kataloge, regelwerk, "KOERPERLICH", "k_art", fd([["wert", "schmerz"]]))).toBeNull();
    expect(warnSignal(kataloge, regelwerk, "KOERPERLICH", "gibt_es_nicht", fd([["symptom", "atemnot"]]))).toBeNull();
  });
});
