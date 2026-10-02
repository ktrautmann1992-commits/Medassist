import { describe, expect, it } from "vitest";
import { feldFehlerAus } from "./state";
import { formDataZuObjekt } from "./form-objekt";

function fd(paare: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of paare) f.append(k, v);
  return f;
}

describe("formDataZuObjekt", () => {
  it("baut Listen aus Punkt-Namen", () => {
    const o = formDataZuObjekt(
      fd([
        ["vorname", "Lena"],
        ["vorerkrankungen.0.bezeichnung", "Asthma"],
        ["vorerkrankungen.0.icd10Code", "J45.0"],
        ["vorerkrankungen.1.bezeichnung", "Heuschnupfen"],
      ]),
    );
    expect(o).toEqual({
      vorname: "Lena",
      vorerkrankungen: [{ bezeichnung: "Asthma", icd10Code: "J45.0" }, { bezeichnung: "Heuschnupfen" }],
    });
  });

  it("Lücken bleiben als undefined erhalten (Indizes für Fehlermeldungen)", () => {
    const o = formDataZuObjekt(fd([["a.2.x", "1"]]));
    expect(o.a).toEqual([undefined, undefined, { x: "1" }]);
  });

  it("ignoriert Prototyp-Schlüssel, interne Felder, Dateien und zu große Indizes", () => {
    const f = fd([
      ["__proto__.polluted", "ja"],
      ["a.constructor.prototype.x", "ja"],
      ["$ACTION_ID_123", "x"],
      ["liste.5000.x", "zu groß"],
      ["profilId", "abc"],
    ]);
    f.append("datei", new Blob(["x"]), "x.txt");
    const o = formDataZuObjekt(f, ["profilId"]);
    expect(o).toEqual({});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("erster Wert gewinnt; widersprüchliche Struktur wird verworfen", () => {
    expect(formDataZuObjekt(fd([["a", "1"], ["a", "2"]]))).toEqual({ a: "1" });
    expect(formDataZuObjekt(fd([["a", "1"], ["a.b", "2"]]))).toEqual({ a: "1" });
    expect(formDataZuObjekt(fd([["a.0", "1"], ["a.x", "2"]]))).toEqual({ a: ["1"] });
  });
});

describe("feldFehlerAus", () => {
  it("vollständiger Pfad als Schlüssel", () => {
    expect(
      feldFehlerAus([
        { path: ["vorname"], message: "A" },
        { path: ["vorerkrankungen", 1, "icd10Code"], message: "B" },
        { path: [], message: "C" },
      ]),
    ).toEqual({ vorname: ["A"], "vorerkrankungen.1.icd10Code": ["B"], _: ["C"] });
  });
});
