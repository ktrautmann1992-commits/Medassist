import { pruefeRegelEingabe, standardRegelwerk } from "@medassist/core";
import { describe, expect, it } from "vitest";
import { fehlgeschlagenState, krisenVerdachtAusFormData, regelEingabeAusFormData } from "./form";

describe("REQ-203/REQ-215 Formulardaten für die Regelprüfung", () => {
  it("übernimmt Symptome, Messwerte, Antworten und seelische Beschwerden", () => {
    const fd = new FormData();
    fd.append("profilId", "p1");
    fd.append("symptom", "fieber");
    fd.append("symptom", "atemnot");
    fd.append("messwert.temperatur_c", "38,2");
    fd.append("antwort.krise_plaene", "nein");
    fd.append("psychisch", "on");
    expect(regelEingabeAusFormData(fd)).toEqual({
      symptome: ["fieber", "atemnot"],
      messwerte: [["temperatur_c", "38,2"]],
      antworten: [["krise_plaene", "nein"]],
      psychisch: true,
    });
  });

  it("B2: mehrfach übermittelte Felder bleiben alle erhalten", () => {
    const fd = new FormData();
    fd.append("antwort.krise_plaene", "ja");
    fd.append("antwort.krise_plaene", "nein");
    fd.append("messwert.temperatur_c", "39");
    fd.append("messwert.temperatur_c", "");
    fd.append("psychisch", "");
    const roh = regelEingabeAusFormData(fd);
    expect(roh.antworten).toEqual([["krise_plaene", "ja"], ["krise_plaene", "nein"]]);
    expect(roh.messwerte).toEqual([["temperatur_c", "39"], ["temperatur_c", ""]]);
    expect(roh.psychisch).toBe(false);
  });

  it("ein eingeschleustes Alter wird ignoriert, unbekannte IDs werden abgewiesen", () => {
    const fd = new FormData();
    fd.append("alterTage", "10");
    fd.append("symptom", "erfunden");
    fd.append("antwort.erfunden", "ja");
    const roh = regelEingabeAusFormData(fd);
    expect(roh).not.toHaveProperty("alterTage");
    const r = pruefeRegelEingabe(standardRegelwerk(), roh);
    expect(Object.keys(r.feldFehler).sort()).toEqual(["antwort.erfunden", "symptome"]);
  });
});

describe("REQ-220 Fallback-Hilfen (S-2)", () => {
  it("Krisenverdacht aus FormData", () => {
    const leer = new FormData();
    expect(krisenVerdachtAusFormData(leer)).toBe(false);
    const a = new FormData();
    a.append("antwort.irgendwas", "");
    expect(krisenVerdachtAusFormData(a)).toBe(true);
    const p = new FormData();
    p.append("psychisch", "on");
    expect(krisenVerdachtAusFormData(p)).toBe(true);
    const p2 = new FormData();
    p2.append("psychisch", " ");
    expect(krisenVerdachtAusFormData(p2)).toBe(false);
  });

  it("fehlgeschlagener Zustand enthält Notfall- und ggf. Krisenhinweis", () => {
    expect(fehlgeschlagenState(true).fallback).toEqual({
      krise: true,
      notfall: { dringlichkeit: "NOTFALL", zeitrahmen: "SOFORT", titel: "Prüfung fehlgeschlagen – im Notfall Notruf 112" },
    });
    expect(fehlgeschlagenState(false).fallback?.krise).toBe(false);
  });
});
