import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pruefeVorrangig } from "./engine";
import { baueRegelwerkOhneSelbsttest, ladeRegelwerk, RegelwerkFehler, type RegelDateien } from "./laden";
import { bedingungSchema } from "./schema";
import { REGEL_DATEIEN, standardRegelwerk } from "./standard";
import { testfallDateiSchema } from "./testfaelle-schema";

const REGEL_ORDNER = path.resolve(import.meta.dirname, "../../../../content/regeln");

/* eslint-disable @typescript-eslint/no-explicit-any -- Tests verändern Rohdaten gezielt. */
function kopie(): RegelDateien & { vokabular: any; redFlags: any; krisenpfad: any } {
  return structuredClone(REGEL_DATEIEN) as any;
}

function fehlerVon(f: () => unknown): RegelwerkFehler {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(RegelwerkFehler);
    return e as RegelwerkFehler;
  }
  throw new Error("Es wurde kein RegelwerkFehler geworfen.");
}

describe("REQ-201 alle Regeldateien unter /content/regeln", () => {
  it("jede Datei ist bekannt und gültig; das Regelwerk lädt", () => {
    const dateien = readdirSync(REGEL_ORDNER).sort();
    expect(dateien).toEqual(["krisenpfad.json", "red-flags.json", "testfaelle.json", "vokabular.json"]);
    const roh = Object.fromEntries(dateien.map((d) => [d, JSON.parse(readFileSync(path.join(REGEL_ORDNER, d), "utf8"))]));
    // Die gebündelten Importe entsprechen den Dateien auf der Platte.
    expect(roh["vokabular.json"]).toEqual(REGEL_DATEIEN.vokabular);
    expect(roh["red-flags.json"]).toEqual(REGEL_DATEIEN.redFlags);
    expect(roh["krisenpfad.json"]).toEqual(REGEL_DATEIEN.krisenpfad);
    const w = ladeRegelwerk({ vokabular: roh["vokabular.json"], redFlags: roh["red-flags.json"], krisenpfad: roh["krisenpfad.json"] });
    expect(w.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(testfallDateiSchema.safeParse(roh["testfaelle.json"]).success).toBe(true);
  });

  it("REQ-206: Start-Regelsatz ist vollständig als ungeprüft ohne Quelle gekennzeichnet", () => {
    const w = standardRegelwerk();
    for (const r of [...w.redFlags, ...w.krisenRegeln]) {
      expect(r.status, r.id).toBe("ungeprüft");
      expect(r.quelle, r.id).toBeNull();
      expect(r.geprueftVon, r.id).toBeNull();
      expect(r.quelleHinweis, r.id).toMatch(/fachlich|Quelle/);
    }
    expect(w.fragenStatus).toBe("ungeprüft");
    expect(w.fragenHinweis).toContain("fachliche Prüfung erforderlich");
  });

  it("REQ-206: Kinder-Red-Flags aus CLAUDE.md §3a sind enthalten", () => {
    const titel = standardRegelwerk().redFlags.map((r) => r.titel);
    expect(titel).toEqual(
      expect.arrayContaining([
        "Fieber bei Säuglingen unter 3 Monaten",
        "Trinkschwäche beim Säugling",
        "Ungewöhnliche Teilnahmslosigkeit, kaum ansprechbar",
        "Verlust bereits erworbener Fähigkeiten",
      ]),
    );
  });

  it("geladene Regeln sind unveränderlich", () => {
    const r = standardRegelwerk().redFlags[0]!;
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.bedingung)).toBe(true);
  });
});

describe("REQ-201/REQ-203 Fail-safe beim Laden", () => {
  it("ungültige Regeldatei → Fehler (fehlendes Pflichtfeld)", () => {
    const d = kopie();
    delete d.redFlags.regeln[0].status;
    const f = fehlerVon(() => ladeRegelwerk(d));
    expect(f.message).toContain("red-flags.json");
    expect(f.details.join()).toContain("regeln.0.status");
  });

  it("ungültige Dringlichkeit → Fehler", () => {
    const d = kopie();
    d.redFlags.regeln[0].ergebnis.dringlichkeit = "SEHR_DRINGEND";
    fehlerVon(() => ladeRegelwerk(d));
  });

  it("unbekannte Symptom-ID in einer Regel → Fehler", () => {
    const d = kopie();
    d.redFlags.regeln[0].bedingung = { symptom: "fiber" };
    expect(fehlerVon(() => ladeRegelwerk(d)).details).toContain("RF-ALLG-001: unbekanntes Symptom „fiber“.");
  });

  it("unbekannte Messwert- und Frage-ID → Fehler", () => {
    const d = kopie();
    d.redFlags.regeln[0].bedingung = { alle: [{ messwert: "puls", op: ">", wert: 1 }, { antwort: "gibt_es_nicht", gleich: "ja" }] };
    const details = fehlerVon(() => ladeRegelwerk(d)).details;
    expect(details).toContain("RF-ALLG-001: unbekannter Messwert „puls“.");
    expect(details).toContain("RF-ALLG-001: unbekannte Frage „gibt_es_nicht“.");
  });

  it("abweichende Regelwerk-Version → Fehler", () => {
    const d = kopie();
    d.krisenpfad.regelwerkVersion = "9.9.9";
    expect(fehlerVon(() => ladeRegelwerk(d)).details.join()).toContain("Versionen unterscheiden sich");
  });

  it("doppelte Regel-ID → Fehler", () => {
    const d = kopie();
    d.redFlags.regeln[1].id = d.redFlags.regeln[0].id;
    expect(fehlerVon(() => ladeRegelwerk(d)).details.join()).toContain("doppelt");
  });

  it("RISK-025: „geprüft“ ohne Quelle und Prüfer → Fehler", () => {
    const d = kopie();
    d.redFlags.regeln[0].status = "geprüft";
    expect(fehlerVon(() => ladeRegelwerk(d)).details.join()).toContain("verlangt Quelle");
  });

  it("ohne Quelle ist ein Quellenhinweis Pflicht", () => {
    const d = kopie();
    d.redFlags.regeln[0].quelleHinweis = null;
    fehlerVon(() => ladeRegelwerk(d));
  });

  it("geprüfte Regel mit Quelle und Prüfer ist zulässig", () => {
    const d = kopie();
    Object.assign(d.redFlags.regeln[0], {
      status: "geprüft",
      quelle: { titel: "Testquelle (fiktiv, nur Test)", version: "1.0", url: null },
      geprueftVon: "Test",
    });
    expect(ladeRegelwerk(d).redFlags[0]!.status).toBe("geprüft");
  });

  it("Red-Flag-Regel darf keine Krise setzen; Krisenregel muss Krise und Ablaufende setzen", () => {
    const d = kopie();
    d.redFlags.regeln[0].ergebnis.krise = true;
    fehlerVon(() => ladeRegelwerk(d));
    const k = kopie();
    k.krisenpfad.regeln[0].ergebnis.ablaufBeenden = false;
    fehlerVon(() => ladeRegelwerk(k));
  });

  it("REQ-209: Selbsttest – Krisenpfad ohne Regel für fehlende Antworten → Fehler", () => {
    const d = kopie();
    d.krisenpfad.regeln = d.krisenpfad.regeln.filter((r: { id: string }) => r.id !== "KP-002");
    const f = fehlerVon(() => ladeRegelwerk(d));
    expect(f.message).toContain("Selbsttest Krisenpfad");
    expect(f.details.join()).toContain("Fehlende Antwort");
  });

  it("REQ-218: Selbsttest – Sicherheitsnetz unter DRINGEND → Fehler", () => {
    const d = kopie();
    d.redFlags.sicherheitsnetz.ergebnis.dringlichkeit = "ROUTINE";
    d.redFlags.sicherheitsnetz.ergebnis.zeitrahmen = "IN_TAGEN";
    expect(fehlerVon(() => ladeRegelwerk(d)).details.join()).toContain("mindestens DRINGEND");
  });

  it("REQ-218: neues Warnzeichen ohne eigene Regel wird vom Sicherheitsnetz abgedeckt", () => {
    const d = kopie();
    d.vokabular.symptome.push({ id: "test_zeichen", bezeichnung: "Testzeichen", fachbegriff: null, warnzeichen: true });
    const w = ladeRegelwerk(d);
    expect(w.symptome.get("test_zeichen")?.warnzeichen).toBe(true);
  });

  it("REQ-222: Entfernen einer NOTFALL-Regel ⇒ Ladefehler (Mindest-Dringlichkeit)", () => {
    const d = kopie();
    d.redFlags.regeln = d.redFlags.regeln.filter((r: { id: string }) => r.id !== "RF-ALLG-003");
    const f = fehlerVon(() => ladeRegelwerk(d));
    expect(f.message).toContain("Selbsttest Sicherheitsnetz");
    expect(f.details.join()).toContain("„bewusstlosigkeit“");
    expect(f.details.join()).toContain("mindestens NOTFALL");
  });

  it("REQ-222: Mindeststufe nur für Warnzeichen; Herabstufen einer NOTFALL-Regel ⇒ Ladefehler", () => {
    const d = kopie();
    d.vokabular.symptome.find((s: { id: string }) => s.id === "fieber").mindestens = "DRINGEND";
    fehlerVon(() => ladeRegelwerk(d));
    const k = kopie();
    const r = k.redFlags.regeln.find((x: { id: string }) => x.id === "RF-ALLG-004");
    r.ergebnis.dringlichkeit = "DRINGEND";
    r.ergebnis.anlaufstelle = "BEREITSCHAFTSDIENST_116117";
    expect(fehlerVon(() => ladeRegelwerk(k)).details.join()).toContain("laehmung_ploetzlich");
  });

  it("REQ-222: Mindeststufen im Start-Vokabular (nur bereits als NOTFALL eingestufte Zeichen)", () => {
    const m = [...standardRegelwerk().symptome.values()].filter((s) => s.mindestens).map((s) => [s.id, s.mindestens]);
    expect(m).toEqual([
      ["teilnahmslosigkeit", "NOTFALL"],
      ["bewusstlosigkeit", "NOTFALL"],
      ["laehmung_ploetzlich", "NOTFALL"],
      ["sprachstoerung_ploetzlich", "NOTFALL"],
    ]);
  });

  it("N-2: Lücke in einer NOTFALL-Regel (RF-ALLG-003 nur < 24 und ≥ 120 Monate) ⇒ Ladefehler; zur Laufzeit trotzdem NOTFALL (SN-002)", () => {
    const d = kopie();
    const i = d.redFlags.regeln.findIndex((r: { id: string }) => r.id === "RF-ALLG-003");
    const original = d.redFlags.regeln[i];
    d.redFlags.regeln.splice(
      i,
      1,
      { ...structuredClone(original), id: "RF-ALLG-003", altersbereich: { unterMonate: 24, bezug: "chronologisch" } },
      { ...structuredClone(original), id: "RF-ALLG-006", altersbereich: { minMonate: 120, bezug: "chronologisch" } },
    );
    const f = fehlerVon(() => ladeRegelwerk(d));
    expect(f.details.join()).toContain("„bewusstlosigkeit“");
    // Laufzeit-Absicherung (nur zum Test ohne Selbsttest gebaut): 5-Jähriger mit Bewusstlosigkeit ⇒ NOTFALL
    const w = baueRegelwerkOhneSelbsttest(d);
    const e = pruefeVorrangig(w, {
      alter: { tage: 1826, monate: 60 },
      korrigiertesAlter: null,
      symptome: ["bewusstlosigkeit"],
      messwerte: {},
      antworten: {},
      schwangerschaft: "UNBEKANNT",
      psychisch: false,
    });
    expect(e.status).toBe("NOTFALL");
    expect(e.redFlags.map((r) => r.id)).toEqual(["SN-002", "SN-001"]);
    expect(e.redFlags[0]).toMatchObject({ anlaufstelle: "NOTRUF_112", status: "ungeprüft", regelwerk: "sicherheitsnetz" });
  });

  it("N-2: Selbsttest prüft Altersgrenzen ±1 (Lücke genau an einer Grenze ⇒ Ladefehler)", () => {
    const d = kopie();
    const i = d.redFlags.regeln.findIndex((r: { id: string }) => r.id === "RF-ALLG-003");
    const original = d.redFlags.regeln[i];
    // Lücke nur im Monat 216 (zwischen unter 216 und ab 217 Monaten)
    d.redFlags.regeln.splice(
      i,
      1,
      { ...structuredClone(original), id: "RF-ALLG-003", altersbereich: { unterMonate: 216, bezug: "chronologisch" } },
      { ...structuredClone(original), id: "RF-ALLG-006", altersbereich: { minMonate: 217, bezug: "chronologisch" } },
    );
    expect(fehlerVon(() => ladeRegelwerk(d)).details.join()).toContain("216 Monate");
  });

  it("REQ-222: Entfernen von „mindestens“ bei einem Zeichen mit altersunabhängiger NOTFALL-Regel ⇒ Ladefehler", () => {
    const d = kopie();
    delete d.vokabular.symptome.find((s: { id: string }) => s.id === "bewusstlosigkeit").mindestens;
    expect(fehlerVon(() => ladeRegelwerk(d)).details).toContain("RF-ALLG-003: Warnzeichen „bewusstlosigkeit“ braucht „mindestens: NOTFALL“ im Vokabular.");
    const k = kopie();
    const z = k.vokabular.symptome.find((s: { id: string }) => s.id === "bewusstlosigkeit");
    delete z.mindestens;
    z.warnzeichen = false;
    fehlerVon(() => ladeRegelwerk(k));
  });

  it("N-2: Mindest-Dringlichkeit muss NOTFALL mit Notruf 112 sein", () => {
    const d = kopie();
    d.redFlags.mindestDringlichkeit.ergebnis.dringlichkeit = "DRINGEND";
    d.redFlags.mindestDringlichkeit.ergebnis.anlaufstelle = "BEREITSCHAFTSDIENST_116117";
    fehlerVon(() => ladeRegelwerk(d));
  });

  it("S2: Zeitrahmen muss zur Dringlichkeit passen", () => {
    const d = kopie();
    d.redFlags.regeln[0].ergebnis.zeitrahmen = "HEUTE"; // RF-ALLG-001 ist NOTFALL
    expect(fehlerVon(() => ladeRegelwerk(d)).details.join()).toContain("Zeitrahmen");
  });

  it("REQ-209: Selbsttest – Frage ohne Ja-Regel → Fehler", () => {
    const d = kopie();
    d.krisenpfad.regeln[0].bedingung.eines.pop();
    expect(fehlerVon(() => ladeRegelwerk(d)).details.join()).toContain('Antwort "ja" auf „krise_plaene“');
  });
});

describe("REQ-202 nur erlaubte, deklarative Operatoren (kein eval/Function)", () => {
  const ungueltig = [
    { ausdruck: "alter < 90" },
    { symptom: "fieber", code: "process.exit()" },
    "fieber && alter < 90",
    { eval: "1" },
    { function: "return true" },
    { nicht: { symptom: "fieber" } },
    { alle: [] },
    { eines: [] },
    { messwert: "temperatur_c", op: "=>", wert: 38 },
    { messwert: "temperatur_c", op: ">=", wert: "38" },
    { alter_tage: {} },
    { alter_tage: { "!=": 3 } },
    { antwort: "krise_plaene", gleich: "vielleicht" },
    { symptom: "Fieber!" },
  ];
  it.each(ungueltig.map((b) => [JSON.stringify(b), b]))("%s wird abgewiesen", (_n, b) => {
    expect(bedingungSchema.safeParse(b).success).toBe(false);
  });

  it("zu tiefe Verschachtelung → Fehler", () => {
    const d = kopie();
    let b: unknown = { symptom: "fieber" };
    for (let i = 0; i < 7; i++) b = { alle: [b] };
    d.redFlags.regeln[0].bedingung = b;
    expect(fehlerVon(() => ladeRegelwerk(d)).details.join()).toContain("verschachtelt");
  });

  it("der Quelltext der Regel-Engine enthält kein eval und kein Function", () => {
    const ordner = import.meta.dirname;
    for (const datei of readdirSync(ordner).filter((d) => d.endsWith(".ts") && !d.endsWith(".test.ts"))) {
      const quelltext = readFileSync(path.join(ordner, datei), "utf8");
      expect(quelltext, datei).not.toMatch(/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(/);
    }
  });

  it("Regeldateien enthalten nur bekannte Bedingungsschlüssel", () => {
    const erlaubt = new Set(["alle", "eines", "symptom", "messwert", "op", "wert", "alter_tage", "alter_monate", "antwort", "gleich", "schwangerschaft", "<", "<=", ">", ">="]);
    const pruefe = (b: unknown): void => {
      if (Array.isArray(b)) return b.forEach(pruefe);
      if (b && typeof b === "object") {
        for (const [k, v] of Object.entries(b)) {
          expect(erlaubt, k).toContain(k);
          pruefe(v);
        }
      }
    };
    for (const r of [...REGEL_DATEIEN.redFlags.regeln, ...REGEL_DATEIEN.krisenpfad.regeln]) pruefe(r.bedingung);
  });
});
