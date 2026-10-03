import { describe, expect, it } from "vitest";
import { befundlageFuerProfil } from "../regeln/befundlage";
import { pruefeRegelEingabe } from "../regeln/eingabe";
import { pruefeVorrangig } from "../regeln/engine";
import { standardRegelwerk } from "../regeln/standard";
import { naechsterSchritt } from "./ablauf";
import { begrenzeMesswerte, gespeicherteEingabeSchema, MAX_WERTE_JE_MESSWERT, pruefeSchnellcheck } from "./antwort";
import { ablaufStandAus, sammleEingaben, type GespeicherteEingabeRoh } from "./eingaben";
import type { Bereich } from "./schema";
import { standardFragenkataloge } from "./standard";
import { antwortText, erstelleZusammenfassung } from "./zusammenfassung";

const k = standardFragenkataloge();
const w = standardRegelwerk();

function e(schritt: string, wert: unknown, teilweise = false): GespeicherteEingabeRoh {
  return { frageId: schritt, strukturiert: { v: 1, katalogVersion: "0.1.0", schritt, teilweise, wert } };
}
const sc = (symptome: string[], keine = false, messwerte: Record<string, number[]> = {}) => ({ typ: "schnellcheck", symptome, keine, messwerte });
const NEIN = { krise_gedanken_nicht_leben: "nein", krise_gedanken_selbstverletzung: "nein", krise_plaene: "nein" };

/** Bewertung wie in der Web-App: Teilauswertung der Engine mit unbekanntem Alter. */
function bewerte(bereich: Bereich, eingaben: GespeicherteEingabeRoh[]) {
  const g = sammleEingaben(k, w, bereich, eingaben);
  const roh = pruefeRegelEingabe(w, g.regelEingabe);
  const befund = befundlageFuerProfil(
    { geburtsdatum: new Date("1980-01-01T00:00:00Z"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT" },
    roh.daten,
    new Date("2026-10-03T00:00:00Z"),
  );
  return { g, p: pruefeVorrangig(w, befund), feldFehler: roh.feldFehler };
}

describe("REQ-313 konservative Zusammenführung für die Regel-Engine", () => {
  it("Symptome werden über alle Eingaben vereinigt – auch Teil-Eingaben; kein Zurücknehmen", () => {
    const { g, p } = bewerte("KOERPERLICH", [
      e("schnellcheck", sc(["atemnot"]), true),
      e("schnellcheck", sc([], true)),
      e("region", { typ: "region", region: "brust" }),
      e("k_begleitsymptome", { typ: "mehrfach", optionen: ["blaue_lippen"], keine: false, symptome: ["blaue_lippen"] }),
      e("k_begleitsymptome", { typ: "mehrfach", optionen: [], keine: true, symptome: [] }),
    ]);
    expect(g.symptome).toEqual(["atemnot", "blaue_lippen"]);
    expect(g.schnellcheckErledigt).toBe(true);
    // letzte vollständige Antwort für den Ablauf
    expect(g.antworten.k_begleitsymptome).toMatchObject({ keine: true });
    expect(p.status).toBe("NOTFALL");
    expect(p.redFlags[0]?.id).toBe("RF-ALLG-001");
  });

  it("alle Messwerte werden geprüft (eine erfüllte Bedingung genügt)", () => {
    const g = sammleEingaben(k, w, "KOERPERLICH", [e("schnellcheck", sc(["fieber"], false, { temperatur_c: [37.2] })), e("schnellcheck", sc([], false, { temperatur_c: [39] }), true)]);
    expect(g.messwerte).toEqual({ temperatur_c: [37.2, 39] });
    expect(g.regelEingabe.messwerte).toEqual([
      ["temperatur_c", "37.2"],
      ["temperatur_c", "39"],
    ]);
  });

  it("Krisenantworten: alle Werte zählen – ein späteres „nein“ entschärft kein „ja“", () => {
    const { g, p } = bewerte("PSYCHISCH", [e("krise", { typ: "krise", antworten: { ...NEIN, krise_plaene: "ja" } }), e("krise", { typ: "krise", antworten: NEIN })]);
    expect(g.krisenAntworten?.krise_plaene).toBe("ja");
    expect(p.status).toBe("KRISE");
    expect(p.ablaufBeenden).toBe(true);
  });

  it("alle Krisenfragen „nein“ ⇒ keine Krise; seelisch erst nach dem Screening bewertbar", () => {
    expect(sammleEingaben(k, w, "PSYCHISCH", []).bewertbar).toBe(false);
    const { g, p } = bewerte("PSYCHISCH", [e("krise", { typ: "krise", antworten: NEIN })]);
    expect(g.bewertbar).toBe(true);
    expect(p.status).toBe("KEINE_WARNZEICHEN");
    expect(p.krisenpfadAktiv).toBe(true);
  });

  it("RISK-035: nicht lesbare Eingaben werden gezählt; eine nicht lesbare Krisen-Eingabe ergibt KRISE", () => {
    const { g, p, feldFehler } = bewerte("PSYCHISCH", [{ frageId: "krise", strukturiert: { kaputt: true } }]);
    expect(g.ungueltig).toBe(1);
    expect(g.kriseErledigt).toBe(true);
    expect(p.status).toBe("KRISE");
    expect(Object.keys(feldFehler).length).toBeGreaterThan(0);

    const g2 = sammleEingaben(k, w, "KOERPERLICH", [
      { frageId: "k_art", strukturiert: "unsinn" },
      // Spalte und Inhalt passen nicht zusammen
      { frageId: "k_art", strukturiert: { v: 1, katalogVersion: "0.1.0", schritt: "k_beginn", teilweise: false, wert: { typ: "keine_angabe" } } },
      // falscher Typ für die Frage
      e("k_art", { typ: "skala", wert: 3 }),
      // Schnellcheck-Wert unter falschem Schritt
      e("k_art", sc(["atemnot"])),
    ]);
    expect(g2.ungueltig).toBe(4);
    expect(g2.antworten).toEqual({});
  });

  it("Teil-Eingaben schließen keinen Schritt ab; Region und Notfall-Bestätigung werden übernommen", () => {
    const g = sammleEingaben(k, w, "KOERPERLICH", [
      e("schnellcheck", sc(["atemnot"]), true),
      e("k_art", { typ: "einfach", option: "schmerz" }, true),
      e("notfall_weiter", { typ: "notfall_bestaetigung" }),
      e("region", { typ: "region", region: "kopf" }),
      e("region", { typ: "region", region: "brust" }),
    ]);
    expect(g.schnellcheckErledigt).toBe(false);
    expect(g.antworten).toEqual({});
    expect(g.notfallBestaetigt).toBe(true);
    expect(g.region).toBe("brust");
    const stand = ablaufStandAus("KOERPERLICH", g, { krise: false, notfallAktiv: false, kinderprofil: false, alterMonate: null });
    expect(naechsterSchritt(k, stand).art).toBe("schnellcheck");
  });
});

describe("REQ-312 Zusammenfassung", () => {
  it("Patientensprache mit Fachbegriffen nur aus den Daten; nicht gestellte Fragen fehlen", () => {
    const eingaben = [
      e("schnellcheck", sc(["fieber"], false, { temperatur_c: [38.5] })),
      e("region", { typ: "region", region: "unterer_ruecken" }),
      e("k_art", { typ: "einfach", option: "schwellung" }),
      // Antwort auf eine Frage, die nach geänderter Art nicht mehr gestellt wird
      e("k_schmerzart", { typ: "einfach", option: "stechend" }),
      e("k_seite", { typ: "einfach", option: "links" }),
      e("k_dauer", { typ: "dauer", anzahl: 1, einheit: "wochen" }),
      e("k_staerke", { typ: "skala", wert: 6 }),
      e("k_ausloeser", { typ: "mehrfach", optionen: ["unfall"], keine: false, symptome: [] }),
      e("k_vorbehandlung", { typ: "keine_angabe" }),
    ];
    const g = sammleEingaben(k, w, "KOERPERLICH", eingaben);
    const stand = ablaufStandAus("KOERPERLICH", g, { krise: false, notfallAktiv: false, kinderprofil: false, alterMonate: 500 });
    const z = erstelleZusammenfassung(k, w, g, stand);
    expect(z.map((a) => a.id)).toEqual(["warnzeichen", "region", "angaben"]);
    const warn = z[0]!.eintraege;
    expect(warn[0]!.werte).toEqual([{ text: "Fieber", fachbegriff: "Pyrexie" }]);
    expect(warn[1]).toMatchObject({ bezeichnung: "Körpertemperatur", werte: [{ text: "38,5 °C" }] });
    expect(z[1]!.eintraege[0]!.werte).toEqual([{ text: "Unterer Rücken", fachbegriff: "Lumbalregion" }]);
    expect(z[1]!.eintraege[1]).toMatchObject({ hinweis: "ungeprüft" });
    const angaben = Object.fromEntries(z[2]!.eintraege.map((x) => [x.bezeichnung, x.werte.map((v) => v.text).join(", ")]));
    expect(angaben).toEqual({
      "Art der Beschwerden": "Schwellung",
      Seite: "Eher links",
      Dauer: "seit 1 Woche",
      Stärke: "6 von 10",
      Auslöser: "Nach einem Unfall oder Sturz",
      "Bisherige Behandlung": "keine Angabe",
    });
    expect(z[2]!.eintraege.find((x) => x.id === "k_ausloeser")!.werte[0]!.fachbegriff).toBe("Trauma");
    // Dativ: „seit 3 Tagen“
    expect(antwortText(k.kataloge.KOERPERLICH.fragenById.get("k_dauer")!, { typ: "dauer", anzahl: 3, einheit: "tage" })).toEqual([{ text: "seit 3 Tagen", fachbegriff: null }]);
    // keine Diagnosen/Fachrichtungen
    expect(JSON.stringify(z)).not.toMatch(/ICD|Diagnose|Facharzt|Fachrichtung/);
  });

  it("seelisch: Krisen-Screening und „keine Warnzeichen“", () => {
    const g = sammleEingaben(k, w, "PSYCHISCH", [e("krise", { typ: "krise", antworten: NEIN }), e("schnellcheck", sc([], true)), e("s_belastung", { typ: "skala", wert: 8 })]);
    const stand = ablaufStandAus("PSYCHISCH", g, { krise: false, notfallAktiv: false, kinderprofil: true, alterMonate: 100 });
    const z = erstelleZusammenfassung(k, w, g, stand);
    expect(z[0]).toMatchObject({ id: "krise", eintraege: [{ werte: [{ text: "Alle Fragen mit „Nein“ beantwortet" }] }] });
    expect(z[1]).toMatchObject({ id: "warnzeichen", eintraege: [{ werte: [{ text: "Keines der abgefragten Warnzeichen angegeben" }] }] });
    expect(z[2]).toMatchObject({ id: "angaben", eintraege: [{ bezeichnung: "Belastung", werte: [{ text: "8 von 10" }] }] });
  });
});

describe("QA N1 zu viele Messwerte / teilweise lesbare Eingaben", () => {
  it("begrenzeMesswerte behält kleinsten und größten Wert (Engine-Ergebnis unverändert)", () => {
    const werte = [...Array.from({ length: 30 }, () => 37), 39.5, 35];
    const b = begrenzeMesswerte(werte);
    expect(b).toHaveLength(MAX_WERTE_JE_MESSWERT);
    expect(b).toContain(39.5);
    expect(b).toContain(35);
    expect(begrenzeMesswerte([37, 38])).toEqual([37, 38]);
  });

  it.each([21, 200])("Schnellcheck mit %i Temperaturwerten: Feldfehler, ≤ 20 gespeichert, schemagültig, Warnzeichen erhalten", (anzahl) => {
    const kat = k.kataloge.KOERPERLICH;
    const e = pruefeSchnellcheck(kat, w, { symptome: ["bewusstlosigkeit"], keine: null, messwerte: [...Array.from({ length: anzahl - 1 }, () => ["temperatur_c", "37,0"] as const), ["temperatur_c", "39,9"]] });
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(e.feldFehler["messwert.temperatur_c"]?.join(" ")).toContain("Zu viele Werte");
    expect(e.teil.symptome).toEqual(["bewusstlosigkeit"]);
    expect(e.teil.messwerte.temperatur_c).toHaveLength(20);
    expect(e.teil.messwerte.temperatur_c).toContain(39.9);
    expect(gespeicherteEingabeSchema.safeParse({ v: 1, katalogVersion: "0.1.0", schritt: "schnellcheck", teilweise: true, wert: e.teil }).success).toBe(true);
  });

  it("nicht schemagültige Eingabe (z. B. 21 Messwerte aus Altbestand): Symptome und Messwerte werden gerettet ⇒ NOTFALL, unvollständig", () => {
    const kaputt = e("schnellcheck", sc(["bewusstlosigkeit", "erfunden"], false, { temperatur_c: Array.from({ length: 21 }, (_, i) => 36 + i / 10), puls: [200] }));
    const { g, p } = bewerte("KOERPERLICH", [kaputt]);
    expect(g.ungueltig).toBe(1);
    expect(g.symptome).toEqual(["bewusstlosigkeit"]);
    expect(g.messwerte.temperatur_c).toHaveLength(20);
    expect(g.messwerte.temperatur_c).toContain(38);
    expect(g.messwerte).not.toHaveProperty("puls");
    expect(p.status).toBe("NOTFALL");
  });
});

describe("QA N3 seelisch: Red Flags vor dem Krisen-Screening", () => {
  it("Warnzeichen vor dem Screening ⇒ bewertbar, nur Red Flags (keine Krise), Screening bleibt nächster Schritt", () => {
    const { g, p } = bewerte("PSYCHISCH", [e("schnellcheck", sc(["bewusstlosigkeit"]), true)]);
    expect(g.bewertbar).toBe(true);
    expect(g.regelEingabe.psychisch).toBe(false);
    expect(p.status).toBe("NOTFALL");
    expect(p.krisenpfadAktiv).toBe(false);
    const stand = ablaufStandAus("PSYCHISCH", g, { krise: false, notfallAktiv: true, kinderprofil: false, alterMonate: null });
    expect(naechsterSchritt(k, stand).art).toBe("krise");
  });
});

describe("QA R3-B1 Messwerte aus mehreren Abgaben", () => {
  it("identische Werte aus verschiedenen Abgaben ⇒ zusammengefasst, kein Eingabefehler", () => {
    const { g, feldFehler } = bewerte("KOERPERLICH", [
      e("schnellcheck", sc(["atemnot"], false, { temperatur_c: [37.2] }), true),
      e("schnellcheck", sc([], true, { temperatur_c: [37.2] })),
    ]);
    expect(g.messwerte).toEqual({ temperatur_c: [37.2] });
    expect(g.uneindeutig).toBe(false);
    expect(feldFehler).toEqual({});
  });

  it("verschiedene Werte aus verschiedenen Abgaben ⇒ alle geprüft, kein Fehler", () => {
    const { g, feldFehler } = bewerte("KOERPERLICH", [e("schnellcheck", sc(["fieber"], false, { temperatur_c: [37] }), true), e("schnellcheck", sc(["fieber"], false, { temperatur_c: [38.4] }))]);
    expect(g.messwerte).toEqual({ temperatur_c: [37, 38.4] });
    expect(g.uneindeutig).toBe(false);
    expect(feldFehler).toEqual({});
  });

  it("verschiedene Werte innerhalb EINER Abgabe ⇒ mehrdeutig (unvollständig), beide geprüft", () => {
    const g = sammleEingaben(k, w, "KOERPERLICH", [e("schnellcheck", sc(["fieber"], false, { temperatur_c: [37, 38.4] }), true)]);
    expect(g.uneindeutig).toBe(true);
    expect(g.regelEingabe.messwerte).toEqual([
      ["temperatur_c", "37"],
      ["temperatur_c", "38.4"],
    ]);
  });
});
