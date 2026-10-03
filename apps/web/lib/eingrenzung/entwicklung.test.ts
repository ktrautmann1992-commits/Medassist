import {
  bewerteEntwicklung,
  filtereEntwicklungNachRolle,
  naechsterSchritt,
  standardFragenkataloge,
  standardRegelwerk,
  type GespeicherteEingabeRoh,
} from "@medassist/core";
import { describe, expect, it } from "vitest";
import { schrittAnsicht } from "./ansicht";
import { bewerteFall, hinweisEskaliert, neuerFallStatus, type FallKontext } from "./auswertung";
import { notBewertung } from "./notbewertung";
import { verarbeiteSchritt, warnSignal } from "./schritt";

/**
 * Meilenstein 4b – Weg 3 (REQ-322 – REQ-330): Auswertung, Bereichsauswahl und Rollenfilter
 * in der Web-Schicht – rein, ohne Datenbank.
 */
const regelwerk = standardRegelwerk();
const kataloge = standardFragenkataloge();
const STICHTAG = new Date("2026-10-03T00:00:00Z");
const kind3 = { geburtsdatum: new Date("2023-10-03T00:00:00Z"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT" as const, istKinderprofil: true };

function e(schritt: string, wert: unknown, teilweise = false): GespeicherteEingabeRoh {
  return { frageId: schritt, strukturiert: { v: 1, katalogVersion: "0.2.0", schritt, teilweise, wert } };
}
function kontext(teil: Partial<FallKontext> = {}): FallKontext {
  return { regelwerk, kataloge, bereich: "ENTWICKLUNG", profil: kind3, eingaben: [], rolle: "PATIENT", stichtag: STICHTAG, alterMonate: 36, ...teil };
}
function fd(eintraege: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of eintraege) f.append(k, v);
  return f;
}
const A36 = { monate: 36, korrigiert: false };
const SCHNELL_NICHTS = e("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} });
const REGR_NEIN = e("e_regression", { typ: "mehrfach", optionen: [], keine: true, symptome: [] });

describe("REQ-323 Ablauf in der Web-Schicht", () => {
  it("Schnellcheck → Pflichtfrage → Bereichsauswahl; Bereichsauswahl wird serverseitig geprüft", () => {
    expect(naechsterSchritt(kataloge, bewerteFall(kontext()).stand).art).toBe("schnellcheck");
    const b1 = bewerteFall(kontext({ eingaben: [SCHNELL_NICHTS] }));
    expect(naechsterSchritt(kataloge, b1.stand)).toMatchObject({ art: "frage", frage: { id: "e_regression" } });
    const b2 = bewerteFall(kontext({ eingaben: [SCHNELL_NICHTS, REGR_NEIN] }));
    expect(naechsterSchritt(kataloge, b2.stand).art).toBe("bereiche");

    const alle = verarbeiteSchritt(kataloge, regelwerk, "ENTWICKLUNG", { art: "bereiche" }, fd([["aktion", "alle"]]), A36);
    expect(alle.eingaben[0]?.strukturiert.wert).toEqual({ typ: "bereiche", bereiche: ["sprache", "motorik", "wahrnehmung", "sozial", "alltag"], alterMonate: 36, korrigiert: false });
    const eine = verarbeiteSchritt(kataloge, regelwerk, "ENTWICKLUNG", { art: "bereiche" }, fd([["bereich", "sprache"]]), A36);
    expect(eine.eingaben[0]).toMatchObject({ frageId: "bereiche", inhalt: "Bereiche: Sprache und Sprechen" });
    // Lernen ist mit 3 Jahren nicht angeboten; manipulierte/unbekannte Bereiche werden abgewiesen
    for (const wert of ["lernen", "xyz"]) {
      const r = verarbeiteSchritt(kataloge, regelwerk, "ENTWICKLUNG", { art: "bereiche" }, fd([["bereich", wert]]), A36);
      expect(r.eingaben).toEqual([]);
      expect(r.feldFehler?.bereiche?.[0]).toMatch(/Unbekannter Bereich/);
    }
    expect(verarbeiteSchritt(kataloge, regelwerk, "ENTWICKLUNG", { art: "bereiche" }, fd([]), A36).feldFehler?.bereiche?.[0]).toMatch(/mindestens einen Bereich/);
    // Bereichsauswahl in einem Weg-2-Fall ⇒ nicht möglich
    expect(verarbeiteSchritt(kataloge, regelwerk, "KOERPERLICH", { art: "bereiche" }, fd([["aktion", "alle"]]), A36).eingaben).toEqual([]);
  });

  it("Ansicht: nur angebotene Bereiche; Fragen tragen den Bereichsnamen und die Eltern- bzw. Arzt-Formulierung", () => {
    const b = bewerteFall(kontext({ eingaben: [SCHNELL_NICHTS, REGR_NEIN, e("bereiche", { typ: "bereiche", bereiche: ["sprache"], alterMonate: 36, korrigiert: false })] }));
    const s = naechsterSchritt(kataloge, b.stand);
    expect(s).toMatchObject({ art: "frage", frage: { id: "s_hoeren" } });
    const patient = schrittAnsicht(kataloge, regelwerk, "ENTWICKLUNG", s, b.gesammelt, "PATIENT", true, 36);
    expect(patient).toMatchObject({ art: "frage", gruppe: "Sprache und Sprechen", text: expect.stringContaining("Reagiert Ihr Kind") });
    const arzt = schrittAnsicht(kataloge, regelwerk, "ENTWICKLUNG", s, b.gesammelt, "ARZT", true, 36);
    expect(arzt).toMatchObject({ art: "frage", text: expect.stringContaining("Reagiert das Kind") });
    const auswahl = schrittAnsicht(kataloge, regelwerk, "ENTWICKLUNG", { art: "bereiche" }, b.gesammelt, "PATIENT", true, 80);
    expect(auswahl?.art === "bereiche" && auswahl.bereiche.map((x) => x.id)).toContain("lernen");
    expect(auswahl?.art === "bereiche" && auswahl.gewaehlt).toEqual(["sprache"]);
  });
});

describe("REQ-324 Regression ⇒ Red Flag über die Regel-Engine, Status nur hochgestuft", () => {
  it("Pflichtfrage „verlernt“ ⇒ DRINGEND (RF-KIND-004), Hinweis eskaliert, NOTFALLHINWEIS", () => {
    const vorher = bewerteFall(kontext({ eingaben: [SCHNELL_NICHTS] }));
    const regr = e("e_regression", { typ: "mehrfach", optionen: ["verlust_erworbener_faehigkeiten"], keine: false, symptome: ["verlust_erworbener_faehigkeiten"] });
    const nachher = bewerteFall(kontext({ eingaben: [SCHNELL_NICHTS, regr] }));
    expect(nachher.notfall).toBe("DRINGEND");
    expect(nachher.state?.ergebnis?.ausgeloesteRegeln.map((r) => r.id)).toContain("RF-KIND-004");
    expect(hinweisEskaliert(vorher, nachher)).toBe(true);
    expect(neuerFallStatus({ status: "IN_EINGRENZUNG", dringlichkeit: null }, nachher, false, true)).toEqual({ status: "NOTFALLHINWEIS", dringlichkeit: "DRINGEND" });
    // DRINGEND ⇒ Ablauf geht weiter (Bereichsauswahl), Hinweis bleibt oben
    expect(naechsterSchritt(kataloge, nachher.stand).art).toBe("bereiche");
  });

  it("abgewiesene Pflichtfrage mit angekreuzter Regression ⇒ Teil-Eingabe (Warnzeichen geht nicht verloren)", () => {
    const s = warnSignal(kataloge, regelwerk, "ENTWICKLUNG", "e_regression", fd([["wert", "verlust_erworbener_faehigkeiten"], ["keine", "on"]]));
    expect(s?.strukturiert).toMatchObject({ teilweise: true, wert: { symptome: ["verlust_erworbener_faehigkeiten"] } });
  });

  it("Notbewertung (Speichern fehlgeschlagen) wertet die Bereichsauswahl und Regression im Speicher aus", () => {
    const state = notBewertung(
      { regelwerk, kataloge, bereich: "ENTWICKLUNG", profil: kind3, rolle: "PATIENT", stichtag: STICHTAG, alterMonate: 36 },
      [SCHNELL_NICHTS],
      fd([["schritt", "e_regression"], ["wert", "verlust_erworbener_faehigkeiten"]]),
    );
    expect(state.ergebnis?.notfallhinweis?.dringlichkeit).toBe("DRINGEND");
  });
});

describe("REQ-325 – REQ-328 Ergebnis und Rollenfilter aus gespeicherten Eingaben", () => {
  const eingaben = [
    SCHNELL_NICHTS,
    REGR_NEIN,
    e("bereiche", { typ: "bereiche", bereiche: ["sprache"], alterMonate: 36, korrigiert: false }),
    e("s_hoeren", { typ: "einfach", option: "ja" }),
    e("s_verstehen", { typ: "einfach", option: "ja" }),
    e("s_mitteilen", { typ: "einfach", option: "ja" }),
    e("s_saetze", { typ: "einfach", option: "ja" }),
    e("s_redefluss", { typ: "einfach", option: "nein" }),
    e("s_sorge", { typ: "einfach", option: "ja" }),
  ];
  const b = bewerteFall(kontext({ eingaben }));
  const erg = bewerteEntwicklung(kataloge.kataloge.ENTWICKLUNG, kataloge.entwicklung, b.gesammelt, { monate: 36, korrigiert: false });

  it("Sorge der Eltern ⇒ Abklärung empfohlen, Kinderarztpraxis zuerst, dann Logopädie und HNO/Pädaudiologie", () => {
    expect(naechsterSchritt(kataloge, b.stand).art).toBe("zusammenfassung");
    expect(b.state?.ergebnis?.status).toBe("KEINE_WARNZEICHEN");
    expect(erg.bereiche[0]).toMatchObject({ id: "sprache", einstufung: "ABKLAERUNG" });
    expect(erg.bereiche[0]!.anlaufstellen.map((a) => a.id)).toEqual(["kinderarzt", "logopaedie", "hno_paedaudiologie"]);
  });

  it("Patient: Förderideen, keine Arzt-Felder; Arzt: Übersicht und ärztlicher Hinweis, keine Förderideen", () => {
    const p = filtereEntwicklungNachRolle(erg, "PATIENT");
    expect(JSON.stringify(p)).not.toMatch(/uebersicht|textArzt|arztHinweis/);
    expect(p.bereiche[0]).toHaveProperty("foerderideen");
    const a = filtereEntwicklungNachRolle(erg, "ARZT");
    expect(a.rolle === "ARZT" && a.bereiche[0]!.uebersicht.length).toBeGreaterThan(3);
    expect(JSON.stringify(a)).not.toContain("foerderideen");
  });
});

describe("QA E1/E2 in der Web-Schicht", () => {
  it("„Ich bin mir nicht sicher“ ⇒ DRINGEND (auch in der Notbewertung); Pflichtfrage danach nicht mehr erlaubt", () => {
    const unsicher = e("e_regression", { typ: "mehrfach", optionen: ["regression_unsicher"], keine: false, symptome: ["verlust_erworbener_faehigkeiten"] });
    const b = bewerteFall(kontext({ eingaben: [SCHNELL_NICHTS, unsicher] }));
    expect(b.notfall).toBe("DRINGEND");
    const state = notBewertung(
      { regelwerk, kataloge, bereich: "ENTWICKLUNG", profil: kind3, rolle: "PATIENT", stichtag: STICHTAG, alterMonate: 36 },
      [SCHNELL_NICHTS],
      fd([["schritt", "e_regression"], ["wert", "regression_unsicher"]]),
    );
    expect(state.ergebnis?.notfallhinweis?.dringlichkeit).toBe("DRINGEND");
  });

  it("Bereichsauswahl ohne bekanntes Alter wird abgewiesen; das Alter wird mit der Auswahl gespeichert", () => {
    expect(verarbeiteSchritt(kataloge, regelwerk, "ENTWICKLUNG", { art: "bereiche" }, fd([["aktion", "alle"]]), null).fehler).toMatch(/Alter ist unbekannt/);
    const r = verarbeiteSchritt(kataloge, regelwerk, "ENTWICKLUNG", { art: "bereiche" }, fd([["bereich", "sprache"]]), { monate: 20, korrigiert: true });
    expect(r.eingaben[0]?.strukturiert.wert).toEqual({ typ: "bereiche", bereiche: ["sprache"], alterMonate: 20, korrigiert: true });
  });
});
