import { describe, expect, it } from "vitest";
import { anwendbareFragen, bearbeitbareSchritte, erlaubterSchritt, naechsterSchritt, pfad, schrittId, type AblaufStand } from "../eingrenzung/ablauf";
import { pruefeAntwort, type AntwortWert } from "../eingrenzung/antwort";
import { ablaufStandAus, sammleEingaben } from "../eingrenzung/eingaben";
import { FragenkatalogFehler, ladeFragenkataloge, type FragenDateien } from "../eingrenzung/laden";
import { FRAGEN_DATEIEN, standardFragenkataloge } from "../eingrenzung/standard";
import { befundlageFuerProfil } from "../regeln/befundlage";
import { pruefeRegelEingabe } from "../regeln/eingabe";
import { pruefeVorrangig } from "../regeln/engine";
import { standardRegelwerk } from "../regeln/standard";
import {
  altersbereichText,
  entwicklungsAlter,
  imMonatsBereich,
  pruefeBereiche,
  pruefeEntwicklungsZulaessigkeit,
  verfuegbareBereiche,
} from "./alter";
import { bewerteEntwicklung, HINWEIS_VORSORGE, type EntwicklungsEingaben } from "./ergebnis";
import { filtereEntwicklungNachRolle } from "./rollenfilter";

/* eslint-disable @typescript-eslint/no-explicit-any -- Tests verändern Rohdaten gezielt. */
const k = standardFragenkataloge();
const e = k.entwicklung;
const katalog = k.kataloge.ENTWICKLUNG;
const w = standardRegelwerk();

function kopie(): FragenDateien & { entwicklung: any } {
  return structuredClone(FRAGEN_DATEIEN) as any;
}
function fehlerVon(d: FragenDateien): string {
  try {
    ladeFragenkataloge(d, w);
  } catch (x) {
    expect(x).toBeInstanceOf(FragenkatalogFehler);
    return (x as Error).message;
  }
  throw new Error("Es wurde kein FragenkatalogFehler geworfen.");
}
const bereich = (d: any, id: string) => d.entwicklung.bereiche.find((b: any) => b.id === id);
const frage = (d: any, b: string, id: string) => bereich(d, b).fragen.find((q: any) => q.id === id);

const einfach = (option: string): AntwortWert => ({ typ: "einfach", option });
const NEIN: AntwortWert = { typ: "mehrfach", optionen: [], keine: true, symptome: [] };
const UTC = (s: string) => new Date(`${s}T00:00:00Z`);

describe("REQ-320 Entwicklungskatalog als Daten", () => {
  it("lädt mit sechs Bereichen nach CLAUDE.md §5, ungeprüft und ohne Quelle", () => {
    expect(e.bereiche.map((b) => b.id)).toEqual(["sprache", "motorik", "wahrnehmung", "sozial", "lernen", "alltag"]);
    expect(e.bereiche.map((b) => b.bezeichnung)).toContain("Sprache und Sprechen");
    expect(katalog.status).toBe("ungeprüft");
    expect(katalog.quelle).toBeNull();
    expect(katalog.geprueftVon).toBeNull();
    expect(katalog.hinweis).toMatch(/keine validierten Entwicklungs-Screenings/);
    expect(e.version).toBe(k.version);
  });

  it("REQ-321 jede Bereichsfrage hat einen Altersbereich, ist Pflicht und bietet „unsicher“", () => {
    for (const f of katalog.fragen) {
      expect(f.pflicht, f.id).toBe(true);
      if (f.gruppe === null) continue;
      expect(f.alter, f.id).not.toBeNull();
      expect(f.typ === "einfach" && f.optionen.some((o) => o.id === "unsicher"), f.id).toBe(true);
      expect(f.textKind, f.id).toMatch(/Kind/);
      // Keine Normwerte, Prozent- oder Perzentilangaben (CLAUDE.md §12)
      expect(`${f.textKind} ${f.textFremd}`, f.id).not.toMatch(/%|Perzentil|Prozent/);
    }
  });

  it("REQ-321/REQ-326 jeder Bereich hat Anlaufstellen, die Kinderarztpraxis immer zuerst; Zuordnung nach CLAUDE.md", () => {
    for (const b of e.bereiche) expect(b.anlaufstellen[0]?.id, b.id).toBe("kinderarzt");
    const ids = (b: string) => e.bereicheById.get(b)!.anlaufstellen.map((a) => a.id);
    expect(ids("sprache")).toEqual(["kinderarzt", "logopaedie", "hno_paedaudiologie"]);
    expect(ids("motorik")).toEqual(["kinderarzt", "ergotherapie", "physiotherapie"]);
    expect(ids("wahrnehmung")).toEqual(["kinderarzt", "augenarzt", "hno_arzt", "ergotherapie"]);
    expect(ids("sozial")).toEqual(["kinderarzt", "kjp_psychotherapie", "kjp_psychiatrie", "spz"]);
    expect(ids("lernen")).toEqual(["kinderarzt"]);
    expect(e.bereicheById.get("sprache")!.anlaufstellen[0]!.hinweis).toMatch(/ärztliche Verordnung/);
    expect(e.anlaufstellenQuelle).toMatch(/CLAUDE\.md.*ungeprüft/);
  });

  it("REQ-321/REQ-324 Regression-Pflichtfrage ist an das Engine-Vokabular gebunden (Warnzeichen)", () => {
    const p = katalog.fragenById.get(e.pflichtfrageId)!;
    expect(p.gruppe).toBeNull();
    expect(p.typ).toBe("mehrfach");
    expect(p.typ === "mehrfach" && p.optionen.find((o) => o.symptom === "verlust_erworbener_faehigkeiten")?.warnzeichen).toBe(true);
    expect(w.symptome.get(e.regressionSymptom)?.warnzeichen).toBe(true);
    expect(katalog.schnellcheck.symptome.map((s) => s.id)).toContain(e.regressionSymptom);
  });
});

describe("REQ-321 Selbsttests beim Laden (Fail-safe)", () => {
  it("Frage ohne Altersbereich ⇒ Schemafehler", () => {
    const d = kopie();
    delete frage(d, "sprache", "s_hoeren").alter;
    expect(fehlerVon(d)).toContain("entwicklung.json");
  });
  it("unbekanntes Feld ⇒ Ladefehler", () => {
    const d = kopie();
    frage(d, "sprache", "s_hoeren").norm = "24 Monate";
    expect(fehlerVon(d)).toContain("entwicklung.json");
  });
  it("Kinderarztpraxis nicht zuerst ⇒ Ladefehler", () => {
    const d = kopie();
    bereich(d, "sprache").anlaufstellen = ["logopaedie", "kinderarzt"];
    expect(fehlerVon(d)).toContain("erste Anlaufstelle muss „kinderarzt“ sein");
  });
  it("unbekannte Anlaufstelle ⇒ Ladefehler", () => {
    const d = kopie();
    bereich(d, "motorik").anlaufstellen.push("osteopathie");
    expect(fehlerVon(d)).toContain("unbekannte Anlaufstelle „osteopathie“");
  });
  it("Bereich ohne Sorge-Frage ⇒ Ladefehler", () => {
    const d = kopie();
    bereich(d, "alltag").fragen = bereich(d, "alltag").fragen.filter((q: any) => q.rolle !== "sorge");
    expect(fehlerVon(d)).toContain("genau eine Sorge-Frage");
  });
  it("„unsicher“ als ALTERSGERECHT ⇒ Ladefehler (konservativ)", () => {
    const d = kopie();
    frage(d, "sprache", "s_saetze").optionen.find((o: any) => o.id === "unsicher").einstufung = "ALTERSGERECHT";
    expect(fehlerVon(d)).toContain("„unsicher“ darf nicht ALTERSGERECHT sein");
  });
  it("Kernbeobachtung mit „nein“ nur BEOBACHTEN ⇒ Ladefehler", () => {
    const d = kopie();
    frage(d, "sprache", "s_hoeren").optionen.find((o: any) => o.id === "nein").einstufung = "BEOBACHTEN";
    expect(fehlerVon(d)).toContain("auffällige Optionen müssen ABKLAERUNG sein");
  });
  it("Frage-Altersbereich außerhalb des Bereichs ⇒ Ladefehler", () => {
    const d = kopie();
    frage(d, "lernen", "l_lesen").alter = { minMonate: 36, unterMonate: 216 };
    expect(fehlerVon(d)).toContain("Altersbereich liegt außerhalb des Bereichs");
  });
  it("Pflichtfrage ohne Regressions-Symptom ⇒ Ladefehler", () => {
    const d = kopie();
    d.entwicklung.pflichtfrage.optionen = d.entwicklung.pflichtfrage.optionen.filter((o: any) => o.id);
    expect(fehlerVon(d)).toContain("bietet das Symptom „verlust_erworbener_faehigkeiten“ nicht an");
  });
  it("QA E1: „Ich bin mir nicht sicher“ ohne Regressions-Symptom ⇒ Ladefehler", () => {
    const d = kopie();
    d.entwicklung.pflichtfrage.optionen.find((o: any) => o.id === "regression_unsicher").symptom = "atemnot";
    expect(fehlerVon(d)).toContain("Option „regression_unsicher“ muss das Symptom „verlust_erworbener_faehigkeiten“ setzen");
    const d2 = kopie();
    delete d2.entwicklung.pflichtfrage.optionen.find((o: any) => o.id === "regression_unsicher").symptom;
    expect(fehlerVon(d2)).toContain("entwicklung.json");
  });
  it("regressionSymptom unbekannt oder kein Warnzeichen ⇒ Ladefehler", () => {
    const d = kopie();
    d.entwicklung.regressionSymptom = "fieber";
    expect(fehlerVon(d)).toContain("kein Warnzeichen");
    const d2 = kopie();
    d2.entwicklung.regressionSymptom = "gibt_es_nicht";
    expect(fehlerVon(d2)).toContain("nicht im Engine-Vokabular");
  });
  it("Schnellcheck ohne alle Warnzeichen ⇒ Ladefehler", () => {
    const d = kopie();
    d.entwicklung.schnellcheck.symptome = d.entwicklung.schnellcheck.symptome.filter((s: string) => s !== "atemnot");
    expect(fehlerVon(d)).toContain("Warnzeichen „atemnot“ fehlt im Schnellcheck");
  });
  it("abweichende Katalog-Version ⇒ Ladefehler", () => {
    const d = kopie();
    d.entwicklung.katalogVersion = "9.9.9";
    expect(fehlerVon(d)).toContain("Katalog-Versionen unterscheiden sich");
  });
  it("Status „geprüft“ ohne Quelle ⇒ Ladefehler", () => {
    const d = kopie();
    d.entwicklung.status = "geprüft";
    expect(fehlerVon(d)).toContain("verlangt Quelle und geprueftVon");
  });
  it("Frage-ID gleich reservierter Schritt-ID ⇒ Ladefehler", () => {
    const d = kopie();
    frage(d, "sprache", "s_saetze").id = "bereiche";
    expect(fehlerVon(d)).toContain("ID ist reserviert");
  });
});

describe("REQ-322 Entwicklungsalter, Zulässigkeit, Altersfilter", () => {
  const stichtag = UTC("2026-10-03");
  const kind = (geburt: string, ssw: number | null = null, tage = 0) => ({
    istKinderprofil: true,
    geburtsdatum: UTC(geburt),
    sswBeiGeburtWochen: ssw,
    sswBeiGeburtTage: ssw === null ? null : tage,
  });

  it("chronologisch in vollen Kalendermonaten", () => {
    expect(entwicklungsAlter(kind("2023-10-03"), stichtag)).toMatchObject({ monate: 36, korrigiert: false });
    expect(entwicklungsAlter(kind("2023-10-04"), stichtag)).toMatchObject({ monate: 35 });
  });

  it("Frühgeborenes (30+0 SSW): korrigiertes Alter bis 24 Monate chronologisch, danach chronologisch", () => {
    // 10 Wochen Korrektur: 14 Monate chronologisch ⇒ korrigiert 11 Monate (vor 12 ⇒ außerhalb des Katalogs)
    const a = entwicklungsAlter(kind("2025-08-03", 30), stichtag)!;
    expect(a).toMatchObject({ chronologischMonate: 14, monate: 11, korrigiert: true });
    expect(a.anzeige).toMatch(/korrigiert/);
    expect(pruefeEntwicklungsZulaessigkeit(kind("2025-08-03", 30), e, stichtag)).toMatchObject({ ok: false, grund: "ausserhalb_katalog" });
    // 24 Monate chronologisch ⇒ keine Korrektur mehr
    expect(entwicklungsAlter(kind("2024-10-03", 30), stichtag)).toMatchObject({ monate: 24, korrigiert: false });
    // vor dem errechneten Termin ⇒ 0 Monate (korrigiert)
    expect(entwicklungsAlter(kind("2026-09-01", 30), stichtag)).toMatchObject({ monate: 0, korrigiert: true });
    // Termingeburt (39+0) ⇒ keine Korrektur
    expect(entwicklungsAlter(kind("2025-08-03", 39), stichtag)).toMatchObject({ monate: 14, korrigiert: false });
  });

  it("Zulässigkeit: nur Kinderprofile unter 18 Jahren, Katalog ab 12 Monaten (Grenzen ±1 Monat)", () => {
    expect(pruefeEntwicklungsZulaessigkeit({ ...kind("2023-10-03"), istKinderprofil: false }, e, stichtag)).toMatchObject({ ok: false, grund: "kein_kinderprofil" });
    expect(pruefeEntwicklungsZulaessigkeit(kind("2025-11-03"), e, stichtag)).toMatchObject({ ok: false, grund: "ausserhalb_katalog" }); // 11 Monate
    expect(pruefeEntwicklungsZulaessigkeit(kind("2025-10-03"), e, stichtag)).toMatchObject({ ok: true }); // 12 Monate
    expect(pruefeEntwicklungsZulaessigkeit(kind("2008-11-03"), e, stichtag)).toMatchObject({ ok: true }); // 215 Monate
    expect(pruefeEntwicklungsZulaessigkeit(kind("2008-10-03"), e, stichtag)).toMatchObject({ ok: false, grund: "volljaehrig" }); // 18 Jahre
    expect(pruefeEntwicklungsZulaessigkeit({ ...kind("2023-10-03"), geburtsdatum: new Date(Number.NaN) }, e, stichtag)).toMatchObject({ ok: false, grund: "alter_unbekannt" });
    expect(altersbereichText(e.alter)).toBe("12 Monaten bis unter 18 Jahren");
  });

  it("Bereiche je Alter: Lernen erst ab 72 Monaten (±1 Monat)", () => {
    expect(verfuegbareBereiche(e, 71).map((b) => b.id)).not.toContain("lernen");
    expect(verfuegbareBereiche(e, 72).map((b) => b.id)).toContain("lernen");
    expect(verfuegbareBereiche(e, 11)).toEqual([]);
    expect(verfuegbareBereiche(e, 12).map((b) => b.id)).toEqual(["sprache", "motorik", "wahrnehmung", "sozial", "alltag"]);
  });

  it("Fragen nur im Altersbereich (inklusiv/exklusiv, ±1 Monat), nur gewählte Bereiche", () => {
    const ids = (monate: number) =>
      anwendbareFragen(k, { ...basis, alterMonate: monate, bereiche: ["motorik"] }).map((f) => f.id);
    // m_laufen: 24 bis unter 72 Monate
    expect(ids(23)).not.toContain("m_laufen");
    expect(ids(24)).toContain("m_laufen");
    expect(ids(71)).toContain("m_laufen");
    expect(ids(72)).not.toContain("m_laufen");
    expect(ids(36)).not.toContain("s_hoeren");
    expect(ids(36)[0]).toBe(e.pflichtfrageId);
    expect(imMonatsBereich(null, 5)).toBe(true);
    expect(imMonatsBereich({ minMonate: 12, unterMonate: 24 }, null)).toBe(true);
  });
});

const basis: AblaufStand = {
  bereich: "ENTWICKLUNG",
  kriseErledigt: false,
  krise: false,
  schnellcheckErledigt: true,
  notfallAktiv: false,
  notfallBestaetigt: false,
  region: null,
  antworten: {},
  kinderprofil: true,
  alterMonate: 36,
  bereiche: null,
};

describe("REQ-323 Ablauf Entwicklungs-Check", () => {
  const id = (s: Partial<AblaufStand>) => schrittId(naechsterSchritt(k, { ...basis, ...s }));

  it("Schnellcheck → Pflichtfrage Regression → Bereichsauswahl → Fragen → Ergebnis", () => {
    expect(id({ schnellcheckErledigt: false })).toBe("schnellcheck");
    expect(id({ notfallAktiv: true })).toBe("notfall_weiter");
    expect(id({})).toBe("e_regression");
    expect(id({ antworten: { e_regression: NEIN } })).toBe("bereiche");
    expect(id({ antworten: { e_regression: NEIN }, bereiche: ["sprache"] })).toBe("s_hoeren");
    const alle: Record<string, AntwortWert> = { e_regression: NEIN };
    for (const f of anwendbareFragen(k, { ...basis, bereiche: ["sprache"] })) if (f.gruppe) alle[f.id] = einfach("ja");
    expect(id({ antworten: alle, bereiche: ["sprache"] })).toBe("zusammenfassung");
  });

  it("Pfad und Bearbeiten: Bereichsauswahl ist nach der Wahl bearbeitbar, Schnellcheck nie", () => {
    const s = { ...basis, antworten: { e_regression: NEIN, s_hoeren: einfach("ja") }, bereiche: ["sprache"] };
    expect(pfad(k, s).slice(0, 3)).toEqual(["schnellcheck", "e_regression", "bereiche"]);
    expect(erlaubterSchritt(k, s, "bereiche")).toEqual({ art: "bereiche" });
    expect(erlaubterSchritt(k, s, "schnellcheck")).toBeNull();
    expect(erlaubterSchritt(k, { ...basis, antworten: {} }, "bereiche")).toBeNull();
  });

  it("Bereichsauswahl wird gespeichert und gelesen; unbekannte Bereiche sind nicht lesbar", () => {
    const eingabe = (bereiche: string[]) => ({
      frageId: "bereiche",
      strukturiert: { v: 1, katalogVersion: "0.2.0", schritt: "bereiche", teilweise: false, wert: { typ: "bereiche", bereiche, alterMonate: 36, korrigiert: false } },
    });
    const g = sammleEingaben(k, w, "ENTWICKLUNG", [eingabe(["sprache", "motorik"])]);
    expect(g.bereiche).toEqual(["sprache", "motorik"]);
    expect(g.ungueltig).toBe(0);
    const g2 = sammleEingaben(k, w, "ENTWICKLUNG", [eingabe(["gibt_es_nicht"])]);
    expect(g2.bereiche).toBeNull();
    expect(g2.ungueltig).toBe(1);
    // Bereichsauswahl in einem Weg-2-Fall ⇒ nicht lesbar
    expect(sammleEingaben(k, w, "KOERPERLICH", [eingabe(["sprache"])]).ungueltig).toBe(1);
  });

  it("pruefeBereiche: alle, Teilmenge, unbekannt, leer, für das Alter nicht angeboten", () => {
    expect(pruefeBereiche(e, 36, [], true)).toEqual({ ok: true, bereiche: ["sprache", "motorik", "wahrnehmung", "sozial", "alltag"] });
    expect(pruefeBereiche(e, 36, ["motorik", "sprache", "sprache"], false)).toEqual({ ok: true, bereiche: ["sprache", "motorik"] });
    expect(pruefeBereiche(e, 36, ["lernen"], false)).toMatchObject({ ok: false });
    expect(pruefeBereiche(e, 36, ["xyz"], false)).toMatchObject({ ok: false });
    expect(pruefeBereiche(e, 36, [], false)).toMatchObject({ ok: false, fehler: expect.stringContaining("mindestens einen Bereich") });
    expect(pruefeBereiche(e, 36, [42], false)).toMatchObject({ ok: false });
  });
});

describe("REQ-324/REQ-325 Ergebnisregeln (konservativ)", () => {
  const alter = { monate: 36, korrigiert: false };
  const unauffaellig = (b: string, monate = 36): Record<string, AntwortWert> => {
    const a: Record<string, AntwortWert> = { e_regression: NEIN };
    for (const fid of e.bereicheById.get(b)!.fragen) {
      const m = e.meta.get(fid)!;
      if (!imMonatsBereich(m.alter, monate)) continue;
      a[fid] = einfach([...m.einstufung].find(([, s]) => s === "ALTERSGERECHT")![0]);
    }
    return a;
  };
  const bewerte = (antworten: Record<string, AntwortWert>, bereiche = ["sprache"], symptome: string[] = []) =>
    bewerteEntwicklung(katalog, e, { antworten, symptome, bereiche } satisfies EntwicklungsEingaben, alter).bereiche;

  it("nur unauffällige Antworten ⇒ „Keine Auffälligkeit in den Demo-Fragen“, ersetzt keine U-Untersuchung", () => {
    const [r] = bewerte(unauffaellig("sprache"));
    expect(r).toMatchObject({ einstufung: "ALTERSGERECHT", titel: "Keine Auffälligkeit in den Demo-Fragen", unvollstaendig: false, gruende: [] });
    expect(r!.textPatient).toMatch(/ersetzt keine Vorsorgeuntersuchung \(U-Untersuchung\)/);
    expect(r!.textPatient).toMatch(/Bandbreite/);
    expect(HINWEIS_VORSORGE).toMatch(/stellt keine Entwicklungsstörung fest/);
  });

  it("Sorge der Eltern „ja“ oder „unsicher“ ⇒ Abklärung empfohlen", () => {
    expect(bewerte({ ...unauffaellig("sprache"), s_sorge: einfach("ja") })[0]).toMatchObject({ einstufung: "ABKLAERUNG", titel: "Abklärung empfohlen" });
    expect(bewerte({ ...unauffaellig("sprache"), s_sorge: einfach("unsicher") })[0]!.einstufung).toBe("ABKLAERUNG");
    expect(bewerte({ ...unauffaellig("sprache"), s_sorge: einfach("ja") })[0]!.gruende).toContain("Sorge der Eltern: Ja, ich mache mir Sorgen");
  });

  it("Kernbeobachtung „nein“/„unsicher“ ⇒ Abklärung; weitere Beobachtung auffällig ⇒ Beobachten", () => {
    expect(bewerte({ ...unauffaellig("sprache"), s_hoeren: einfach("nein") })[0]!.einstufung).toBe("ABKLAERUNG");
    expect(bewerte({ ...unauffaellig("sprache"), s_hoeren: einfach("unsicher") })[0]!.einstufung).toBe("ABKLAERUNG");
    expect(bewerte({ ...unauffaellig("sprache"), s_saetze: einfach("nein") })[0]!.einstufung).toBe("BEOBACHTEN");
    expect(bewerte({ ...unauffaellig("sprache"), s_redefluss: einfach("ja") })[0]!.einstufung).toBe("BEOBACHTEN");
    // Höchste Einstufung gewinnt
    expect(bewerte({ ...unauffaellig("sprache"), s_saetze: einfach("nein"), s_hoeren: einfach("nein") })[0]!.einstufung).toBe("ABKLAERUNG");
  });

  it("fehlende, übersprungene oder unbekannte Antwort ⇒ Abklärung (Angaben unvollständig)", () => {
    const a = unauffaellig("sprache");
    delete a.s_verstehen;
    expect(bewerte(a)[0]).toMatchObject({ einstufung: "ABKLAERUNG", unvollstaendig: true });
    expect(bewerte({ ...unauffaellig("sprache"), s_saetze: { typ: "keine_angabe" } })[0]!.einstufung).toBe("ABKLAERUNG");
    expect(bewerte({ ...unauffaellig("sprache"), s_saetze: einfach("vielleicht") })[0]!.einstufung).toBe("ABKLAERUNG");
  });

  it("Regression (Schnellcheck oder Pflichtfrage) oder „unsicher“ ⇒ jeder Bereich Abklärung", () => {
    const a = { ...unauffaellig("sprache"), ...unauffaellig("motorik") };
    const r1 = bewerteEntwicklung(katalog, e, { antworten: a, symptome: ["verlust_erworbener_faehigkeiten"], bereiche: ["sprache", "motorik"] }, alter);
    expect(r1.regression).toBe("ja");
    expect(r1.bereiche.map((b) => b.einstufung)).toEqual(["ABKLAERUNG", "ABKLAERUNG"]);
    const regr: AntwortWert = { typ: "mehrfach", optionen: ["verlust_erworbener_faehigkeiten"], keine: false, symptome: ["verlust_erworbener_faehigkeiten"] };
    expect(bewerte({ ...unauffaellig("sprache"), e_regression: regr })[0]!.einstufung).toBe("ABKLAERUNG");
    const unsicher: AntwortWert = { typ: "mehrfach", optionen: ["regression_unsicher"], keine: false, symptome: [] };
    const r2 = bewerteEntwicklung(katalog, e, { antworten: { ...unauffaellig("sprache"), e_regression: unsicher }, symptome: [], bereiche: ["sprache"] }, alter);
    expect(r2.regression).toBe("unsicher");
    expect(r2.bereiche[0]!.einstufung).toBe("ABKLAERUNG");
    expect(r2.bereiche[0]!.gruende[0]).toMatch(/Sie sind unsicher, ob Ihr Kind Fähigkeiten wieder verlernt hat – bitte heute ärztlich abklären lassen/);
  });

  it("Regression ⇒ Red Flag über die Regel-Engine (RF-KIND-004, DRINGEND) – keine eigene Regel", () => {
    const regr: AntwortWert = { typ: "mehrfach", optionen: ["verlust_erworbener_faehigkeiten"], keine: false, symptome: ["verlust_erworbener_faehigkeiten"] };
    const g = sammleEingaben(k, w, "ENTWICKLUNG", [
      { frageId: "e_regression", strukturiert: { v: 1, katalogVersion: "0.2.0", schritt: "e_regression", teilweise: false, wert: regr } },
    ]);
    expect(g.symptome).toEqual(["verlust_erworbener_faehigkeiten"]);
    const eingabe = pruefeRegelEingabe(w, g.regelEingabe);
    const profil = { geburtsdatum: UTC("2023-10-03"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT" as const };
    const r = pruefeVorrangig(w, befundlageFuerProfil(profil, eingabe.daten, UTC("2026-10-03")));
    expect(r.redFlagDringlichkeit).toBe("DRINGEND");
    expect(r.redFlags.map((x) => x.id)).toContain("RF-KIND-004");
  });

  it("Lernen nur mit Schulalter; nicht gewählte Bereiche erscheinen nicht", () => {
    const r = bewerteEntwicklung(katalog, e, { antworten: unauffaellig("lernen", 96), symptome: [], bereiche: ["lernen"] }, { monate: 96, korrigiert: false });
    expect(r.bereiche.map((b) => b.id)).toEqual(["lernen"]);
    expect(r.bereiche[0]!.einstufung).toBe("ALTERSGERECHT");
  });
});

describe("REQ-327/REQ-328 Rollenfilter (Whitelist)", () => {
  const erg = bewerteEntwicklung(
    katalog,
    e,
    { antworten: { e_regression: NEIN, s_hoeren: einfach("nein") }, symptome: [], bereiche: ["sprache"] },
    { monate: 36, korrigiert: true },
  );

  it("Patient: keine ärztliche Übersicht, kein ärztlicher Text; unbekannte Felder entfernt; striktes Schema", () => {
    const p = filtereEntwicklungNachRolle({ ...erg, geheim: "x", bereiche: erg.bereiche.map((b) => ({ ...b, diagnosegruppe: "SP1" })) } as any, "PATIENT");
    const json = JSON.stringify(p);
    if (p.rolle !== "PATIENT") throw new Error("Patientensicht erwartet");
    expect(json).not.toContain("uebersicht");
    expect(json).not.toContain("textArzt");
    expect(json).not.toContain("arztHinweis");
    expect(json).not.toContain("Heilmittelverordnung");
    expect(json).not.toContain("geheim");
    expect(json).not.toContain("SP1");
    expect(p.bereiche[0]!.foerderideen.length).toBeGreaterThan(0);
    expect(p.bereiche[0]!.anlaufstellen[0]!.id).toBe("kinderarzt");
  });

  it("Arzt: Übersicht und ärztlicher Hinweis, keine Förderideen; Original unverändert", () => {
    const a = filtereEntwicklungNachRolle(erg, "ARZT");
    expect(a.rolle).toBe("ARZT");
    if (a.rolle !== "ARZT") throw new Error();
    expect(a.arztHinweis).toMatch(/Heilmittelverordnung nach ärztlicher Beurteilung/);
    expect(a.arztHinweis).toMatch(/Diagnosegruppen nach Heilmittelkatalog sind im Prototyp nicht hinterlegt/);
    expect(a.bereiche[0]!.uebersicht.map((x) => x.frageId)).toContain("s_hoeren");
    expect("foerderideen" in a.bereiche[0]!).toBe(false);
    expect(erg.bereiche[0]!.foerderideen.length).toBeGreaterThan(0);
  });

  it("unbekannte Rolle ⇒ keine Ausgabe", () => {
    expect(() => filtereEntwicklungNachRolle(erg, "GAST" as any)).toThrow();
  });
});

describe("QA E1 – E3 Nachbesserungen (konservativ, Alter festgehalten, keine Abwahl)", () => {
  const roh = (schritt: string, wert: unknown) => ({ frageId: schritt, strukturiert: { v: 1, katalogVersion: "0.2.0", schritt, teilweise: false, wert } });
  const SYM = "verlust_erworbener_faehigkeiten";
  const UNSICHER = { typ: "mehrfach", optionen: ["regression_unsicher"], keine: false, symptome: [SYM] };
  const NEIN_ROH = { typ: "mehrfach", optionen: [], keine: true, symptome: [] };
  const profil = { geburtsdatum: UTC("2023-09-20"), sswBeiGeburtWochen: null, sswBeiGeburtTage: null, schwangerschaft: "UNBEKANNT" as const };

  it("E1: „Ich bin mir nicht sicher“ setzt das Regressions-Symptom ⇒ Regel-Engine DRINGEND (RF-KIND-004)", () => {
    const p = katalog.fragenById.get("e_regression")!;
    const r = pruefeAntwort(p, { werte: ["regression_unsicher"] });
    expect(r).toEqual({ ok: true, wert: UNSICHER });
    const beide = pruefeAntwort(p, { werte: ["regression_unsicher", SYM] });
    expect(beide.ok && beide.wert.typ === "mehrfach" && beide.wert.symptome).toEqual([SYM]);
    const g = sammleEingaben(k, w, "ENTWICKLUNG", [roh("e_regression", UNSICHER)]);
    const pr = pruefeVorrangig(w, befundlageFuerProfil(profil, pruefeRegelEingabe(w, g.regelEingabe).daten, UTC("2026-10-03")));
    expect(pr.redFlagDringlichkeit).toBe("DRINGEND");
    expect(pr.redFlags.map((x) => x.id)).toContain("RF-KIND-004");
  });

  it("E1: unsicher → später „Nein“ ⇒ Warnzeichen bleibt (Vereinigung), Bereiche Abklärung; Pflichtfrage nicht bearbeitbar", () => {
    const eingaben = [
      roh("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} }),
      roh("e_regression", UNSICHER),
      roh("bereiche", { typ: "bereiche", bereiche: ["alltag"], alterMonate: 36, korrigiert: false }),
      roh("e_regression", NEIN_ROH),
    ];
    const g = sammleEingaben(k, w, "ENTWICKLUNG", eingaben);
    expect(g.symptome).toContain(SYM);
    const r = bewerteEntwicklung(katalog, e, { ...g, antworten: { ...g.antworten, a_schlaf: einfach("nein"), a_essen: einfach("nein"), a_sauberkeit: einfach("nein"), a_sorge: einfach("nein") } }, { monate: 36, korrigiert: false });
    expect(r.bereiche[0]!.einstufung).toBe("ABKLAERUNG");
    const stand = ablaufStandAus("ENTWICKLUNG", g, { krise: false, notfallAktiv: false, kinderprofil: true, alterMonate: 36 });
    expect(bearbeitbareSchritte(k, stand)).not.toContain("e_regression");
    expect(erlaubterSchritt(k, stand, "e_regression")).toBeNull();
  });

  it("E2: Entwicklungsalter wird bei der Bereichsauswahl festgehalten; Altersverschiebung ändert das Ergebnis nicht", () => {
    const eingaben = [
      roh("schnellcheck", { typ: "schnellcheck", symptome: [], keine: true, messwerte: {} }),
      roh("e_regression", NEIN_ROH),
      roh("bereiche", { typ: "bereiche", bereiche: ["motorik"], alterMonate: 71, korrigiert: false }),
      roh("m_koerperseiten", einfach("ja")),
      roh("m_laufen", einfach("nein")),
      roh("m_bewegung", einfach("ja")),
      roh("m_stift", einfach("ja")),
      roh("m_sorge", einfach("nein")),
    ];
    const g = sammleEingaben(k, w, "ENTWICKLUNG", eingaben);
    expect(g.entwicklungsAlter).toEqual({ monate: 71, korrigiert: false });
    // Heute 72 bzw. 83 Monate (ein Monat / ein Jahr später): Ablauf und Ergebnis nutzen 71 Monate
    for (const heute of [72, 83]) {
      const stand = ablaufStandAus("ENTWICKLUNG", g, { krise: false, notfallAktiv: false, kinderprofil: true, alterMonate: heute });
      expect(stand.alterMonate).toBe(71);
      expect(naechsterSchritt(k, stand).art).toBe("zusammenfassung");
    }
    // Auch mit dem heutigen Alter: beantwortete Fragen zählen immer
    for (const monate of [71, 72, 83]) {
      expect(bewerteEntwicklung(katalog, e, g, { monate, korrigiert: false }).bereiche[0]!.einstufung).toBe("ABKLAERUNG");
    }
    // Erneute Bereichsauswahl ändert das festgehaltene Alter nicht
    const g2 = sammleEingaben(k, w, "ENTWICKLUNG", [...eingaben, roh("bereiche", { typ: "bereiche", bereiche: ["motorik"], alterMonate: 72, korrigiert: false })]);
    expect(g2.entwicklungsAlter?.monate).toBe(71);
  });

  it("E3: Bereich mit beantworteten Fragen bleibt gewählt, auch wenn er abgewählt wird", () => {
    const g = sammleEingaben(k, w, "ENTWICKLUNG", [
      roh("e_regression", NEIN_ROH),
      roh("bereiche", { typ: "bereiche", bereiche: ["sprache", "alltag"], alterMonate: 36, korrigiert: false }),
      roh("s_hoeren", einfach("nein")),
      roh("bereiche", { typ: "bereiche", bereiche: ["alltag"], alterMonate: 36, korrigiert: false }),
    ]);
    expect(g.bereiche).toEqual(["sprache", "alltag"]);
    expect(bewerteEntwicklung(katalog, e, g, { monate: 36, korrigiert: false }).bereiche[0]).toMatchObject({ id: "sprache", einstufung: "ABKLAERUNG" });
  });
});
