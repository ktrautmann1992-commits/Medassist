import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { standardRegelwerk } from "../regeln/standard";
import { FragenkatalogFehler, MIN_TREFFERFLAECHE, formGrenzen, ladeFragenkataloge, type FragenDateien } from "./laden";
import { BEREICHE } from "./schema";
import { FRAGEN_DATEIEN, standardFragenkataloge } from "./standard";

const ORDNER = path.resolve(import.meta.dirname, "../../../../content/fragen");

/* eslint-disable @typescript-eslint/no-explicit-any -- Tests verändern Rohdaten gezielt. */
function kopie(): FragenDateien & { koerperkarte: any; koerperlich: any; seelisch: any; entwicklung: any } {
  return structuredClone(FRAGEN_DATEIEN) as any;
}

function fehlerVon(dateien: FragenDateien): FragenkatalogFehler {
  try {
    ladeFragenkataloge(dateien, standardRegelwerk());
  } catch (e) {
    expect(e).toBeInstanceOf(FragenkatalogFehler);
    return e as FragenkatalogFehler;
  }
  throw new Error("Es wurde kein FragenkatalogFehler geworfen.");
}

const frage = (d: any, id: string) => d.fragen.find((f: any) => f.id === id);

describe("REQ-300 alle Dateien unter /content/fragen", () => {
  it("jede Datei ist bekannt und gültig; gebündelte Importe entsprechen den Dateien", () => {
    const dateien = readdirSync(ORDNER).sort();
    expect(dateien).toEqual(["entwicklung.json", "koerperkarte.json", "koerperlich.json", "seelisch.json"]);
    const roh = Object.fromEntries(dateien.map((d) => [d, JSON.parse(readFileSync(path.join(ORDNER, d), "utf8"))]));
    expect(roh["koerperkarte.json"]).toEqual(FRAGEN_DATEIEN.koerperkarte);
    expect(roh["koerperlich.json"]).toEqual(FRAGEN_DATEIEN.koerperlich);
    expect(roh["seelisch.json"]).toEqual(FRAGEN_DATEIEN.seelisch);
    expect(roh["entwicklung.json"]).toEqual(FRAGEN_DATEIEN.entwicklung);
    const k = ladeFragenkataloge(
      { koerperkarte: roh["koerperkarte.json"], koerperlich: roh["koerperlich.json"], seelisch: roh["seelisch.json"], entwicklung: roh["entwicklung.json"] },
      standardRegelwerk(),
    );
    // REQ-320: mit dem Entwicklungskatalog gemeinsam auf 0.2.0 angehoben.
    expect(k.version).toBe("0.2.0");
  });

  it("REQ-300/RISK-032: Start-Kataloge sind ungeprüft und ohne Quelle gekennzeichnet", () => {
    const k = standardFragenkataloge();
    for (const x of [k.koerperkarte, k.kataloge.KOERPERLICH, k.kataloge.PSYCHISCH, k.kataloge.ENTWICKLUNG]) {
      expect(x.status).toBe("ungeprüft");
      expect(x.quelle).toBeNull();
      expect(x.geprueftVon).toBeNull();
      expect(x.quelleHinweis).toMatch(/fachlich prüfen/);
    }
  });

  it("Status „geprüft“ ohne Quelle und Prüfer ist ein Ladefehler", () => {
    const d = kopie();
    d.seelisch.status = "geprüft";
    expect(fehlerVon(d).message).toContain("verlangt Quelle und geprueftVon");
  });

  it("unbekannte Felder werden abgewiesen (z. B. Ausdruck als Zeichenkette)", () => {
    const d = kopie();
    frage(d.koerperlich, "k_schmerzart").bedingung = { ausdruck: "antworten.k_art == 'schmerz'" };
    expect(fehlerVon(d).message).toContain("koerperlich.json");
    const d2 = kopie();
    d2.koerperlich.fragen[0].code = "1";
    expect(() => ladeFragenkataloge(d2, standardRegelwerk())).toThrow(FragenkatalogFehler);
  });

  it("abweichende Katalog-Versionen sind ein Ladefehler", () => {
    const d = kopie();
    d.seelisch.katalogVersion = "0.3.0";
    expect(fehlerVon(d).message).toContain("Katalog-Versionen unterscheiden sich");
  });

  it("vertauschter Bereich ist ein Ladefehler", () => {
    const d = kopie();
    d.seelisch.bereich = "KOERPERLICH";
    expect(fehlerVon(d).message).toContain("erwartet „PSYCHISCH“");
  });

  it("validierte Fragebögen werden nicht verwendet (keine PHQ/GAD-Bezeichnungen als Quelle)", () => {
    const k = standardFragenkataloge();
    for (const b of BEREICHE) expect(JSON.stringify(k.kataloge[b].fragen)).not.toMatch(/PHQ|GAD-7|C-SSRS/);
  });
});

describe("REQ-301 Fragen und Optionen", () => {
  it("unbekannte Vokabular-ID in einer Option ist ein Ladefehler", () => {
    const d = kopie();
    frage(d.koerperlich, "k_begleitsymptome").optionen.push({ symptom: "kopfweh_xyz" });
    expect(fehlerVon(d).message).toContain("unbekanntes Symptom „kopfweh_xyz“");
  });

  it("eigene Option mit der ID eines Symptoms ist ein Ladefehler", () => {
    const d = kopie();
    frage(d.koerperlich, "k_ausloeser").optionen.push({ id: "atemnot", bezeichnung: "Atemnot", fachbegriff: null });
    expect(fehlerVon(d).message).toContain("hat die ID eines Symptoms");
  });

  it("doppelte Frage- oder Options-IDs sind Ladefehler", () => {
    const d = kopie();
    d.koerperlich.fragen.push(structuredClone(frage(d.koerperlich, "k_ergaenzung")));
    expect(fehlerVon(d).message).toContain("Frage-ID „k_ergaenzung“ ist doppelt");
    const d2 = kopie();
    const o = frage(d2.koerperlich, "k_art").optionen;
    o.push(structuredClone(o[0]));
    expect(fehlerVon(d2).message).toContain("Option „schmerz“ ist doppelt");
  });

  it("reservierte Schritt-IDs und Krisenfrage-IDs sind als Frage-ID verboten", () => {
    const d = kopie();
    frage(d.seelisch, "s_ergaenzung").id = "region";
    expect(fehlerVon(d).message).toContain("ist reserviert");
    const d2 = kopie();
    frage(d2.seelisch, "s_ergaenzung").id = "krise_plaene";
    expect(fehlerVon(d2).message).toContain("bereits eine Krisenfrage");
    // REQ-401: Schritt „beschreibung“ (Weg 1) ist ebenfalls reserviert.
    const d3 = kopie();
    frage(d3.koerperlich, "k_ergaenzung").id = "beschreibung";
    expect(fehlerVon(d3).message).toContain("„beschreibung“ ist reserviert");
  });

  it("Symptom-Optionen übernehmen Bezeichnung, Fachbegriff und Warnzeichen aus dem Vokabular", () => {
    const w = standardRegelwerk();
    const f = standardFragenkataloge().kataloge.KOERPERLICH.fragenById.get("k_begleitsymptome")!;
    expect(f.typ).toBe("mehrfach");
    if (f.typ !== "mehrfach") return;
    const atemnot = f.optionen.find((o) => o.id === "atemnot")!;
    expect(atemnot).toEqual({ id: "atemnot", bezeichnung: "Atemnot", fachbegriff: "Dyspnoe", symptom: "atemnot", warnzeichen: true });
    // Begleitsymptome bieten alle Warnzeichen des Vokabulars an.
    for (const s of w.symptome.values()) if (s.warnzeichen) expect(f.optionen.map((o) => o.symptom)).toContain(s.id);
    expect(f.pflicht).toBe(true);
  });

  it("jede Frage hat Texte für eigene Person, Kind und Fremdanamnese", () => {
    const k = standardFragenkataloge();
    for (const b of BEREICHE) {
      for (const f of k.kataloge[b].fragen) {
        expect(f.text.length, f.id).toBeGreaterThan(5);
        expect(f.textKind, f.id).toMatch(/Kind/);
        expect(f.textFremd, f.id).not.toBe(f.text);
      }
    }
  });
});

describe("REQ-302 Bedingungen", () => {
  it("Verweis auf eine spätere Frage (Zyklus) ist ein Ladefehler", () => {
    const d = kopie();
    frage(d.koerperlich, "k_art").bedingung = { beantwortet: "k_dauer" };
    expect(fehlerVon(d).message).toContain("nur frühere Fragen sind erlaubt");
  });

  it("unbekannte Option, falscher Typ, unbekannte Region und Tiefe werden erkannt", () => {
    const d = kopie();
    frage(d.koerperlich, "k_schmerzart").bedingung = { antwort: "k_art", ist: "gibt_es_nicht" };
    expect(fehlerVon(d).message).toContain("Option „gibt_es_nicht“ gibt es in „k_art“ nicht");

    const d2 = kopie();
    frage(d2.koerperlich, "k_vorbehandlung").bedingung = { antwort: "k_art", enthaelt: "schmerz" };
    expect(fehlerVon(d2).message).toContain("„enthaelt“ nur für Mehrfachauswahl");

    const d3 = kopie();
    frage(d3.koerperlich, "k_seite").bedingung = { region: ["mond"] };
    expect(fehlerVon(d3).message).toContain("unbekannte Region „mond“");

    const d4 = kopie();
    frage(d4.koerperlich, "k_seite").bedingung = { nicht: { nicht: { nicht: { nicht: { kinderprofil: true } } } } };
    expect(fehlerVon(d4).message).toContain("tiefer als 4 Ebenen");
  });

  it("Region/Organsystem im seelischen Katalog ist ein Ladefehler", () => {
    const d = kopie();
    frage(d.seelisch, "s_ergaenzung").bedingung = { organsystem: "haut" };
    expect(fehlerVon(d).message).toContain("Region/Organsystem im seelischen Katalog nicht erlaubt");
  });

  it("der Quelltext enthält kein eval und kein Function", () => {
    for (const datei of readdirSync(import.meta.dirname).filter((d) => d.endsWith(".ts") && !d.endsWith(".test.ts"))) {
      const quelltext = readFileSync(path.join(import.meta.dirname, datei), "utf8");
      expect(quelltext, datei).not.toMatch(/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(/);
    }
  });
});

describe("REQ-306 Selbsttest Schnellcheck", () => {
  it("jedes Warnzeichen des Vokabulars ist im Schnellcheck beider Kataloge", () => {
    const w = standardRegelwerk();
    const k = standardFragenkataloge();
    for (const b of BEREICHE) {
      const ids = k.kataloge[b].schnellcheck.symptome.map((s) => s.id);
      for (const s of w.symptome.values()) if (s.warnzeichen) expect(ids, `${b}: ${s.id}`).toContain(s.id);
      expect(ids).toContain("fieber");
      expect(k.kataloge[b].schnellcheck.messwerte.map((m) => m.id)).toEqual(["temperatur_c"]);
    }
  });

  it("fehlt ein Warnzeichen im Schnellcheck, schlägt das Laden fehl", () => {
    const d = kopie();
    d.seelisch.schnellcheck.symptome = d.seelisch.schnellcheck.symptome.filter((s: string) => s !== "atemnot");
    expect(fehlerVon(d).message).toContain("Selbsttest: Warnzeichen „atemnot“ fehlt im Schnellcheck");
  });

  it("unbekanntes Symptom bzw. unbekannter Messwert im Schnellcheck ist ein Ladefehler", () => {
    const d = kopie();
    d.koerperlich.schnellcheck.symptome.push("bauchweh");
    d.koerperlich.schnellcheck.messwerte.push("puls");
    const m = fehlerVon(d).message;
    expect(m).toContain("unbekanntes Symptom „bauchweh“");
    expect(m).toContain("unbekannter Messwert „puls“");
  });
});

describe("REQ-303 Körperkarte", () => {
  it("Regionen von Kopf bis Fuß, vorne und hinten, Listen-Regionen, Organsysteme", () => {
    const karte = standardFragenkataloge().koerperkarte;
    const ids = karte.regionen.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["kopf", "brust", "unterer_ruecken", "fuss_links", "fuss_rechts", "allgemein", "haut_mehrere"]));
    expect(karte.regionen.filter((r) => r.formen.vorne.length).length).toBeGreaterThan(10);
    expect(karte.regionen.filter((r) => r.formen.hinten.length).length).toBeGreaterThan(10);
    // Listen-Regionen haben keine Formen
    expect(karte.regionenById.get("allgemein")!.formen).toEqual({ vorne: [], hinten: [] });
    for (const r of karte.regionen) {
      expect(r.organsysteme.length, r.id).toBeGreaterThan(0);
      for (const o of r.organsysteme) expect(karte.organsysteme.has(o), `${r.id}: ${o}`).toBe(true);
    }
  });

  it("Mindest-Trefferfläche und viewBox werden beim Laden geprüft", () => {
    const karte = standardFragenkataloge().koerperkarte;
    for (const r of karte.regionen) {
      for (const formen of [r.formen.vorne, r.formen.hinten]) {
        for (const f of formen) {
          const g = formGrenzen(f);
          expect(g.maxX - g.minX, r.id).toBeGreaterThanOrEqual(MIN_TREFFERFLAECHE);
          expect(g.maxY - g.minY, r.id).toBeGreaterThanOrEqual(MIN_TREFFERFLAECHE);
        }
      }
    }
    const d = kopie();
    d.koerperkarte.regionen.find((r: any) => r.id === "hand_links").formen.vorne = [{ ellipse: { cx: 200, cy: 276, rx: 8, ry: 8 } }];
    expect(fehlerVon(d).message).toContain("Trefferfläche kleiner als 36 × 36");
    const d2 = kopie();
    d2.koerperkarte.regionen.find((r: any) => r.id === "kopf").formen.vorne = [{ rechteck: { x: 230, y: 0, breite: 40, hoehe: 40, radius: 0 } }];
    expect(fehlerVon(d2).message).toContain("außerhalb des viewBox");
  });

  it("unbekanntes Organsystem und doppelte Region sind Ladefehler", () => {
    const d = kopie();
    d.koerperkarte.regionen[0].organsysteme.push("seele");
    d.koerperkarte.regionen.push(structuredClone(d.koerperkarte.regionen[1]));
    const m = fehlerVon(d).message;
    expect(m).toContain("unbekanntes Organsystem „seele“");
    expect(m).toContain("ist doppelt");
  });
});
