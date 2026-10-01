import { describe, expect, it } from "vitest";
import { berechneAlter, berechneKorrigiertesAlter, gestationsTage, istFruehgeboren } from "./age";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("REQ-032 berechneAlter", () => {
  it("Neugeborenes am Geburtstag: 0 Tage", () => {
    const a = berechneAlter(d("2026-10-01"), d("2026-10-01"));
    expect(a).toMatchObject({ jahre: 0, monate: 0, tage: 0, gesamtTage: 0, anzeige: "0 Tage" });
  });

  it("1 Tag → Einzahl", () => {
    expect(berechneAlter(d("2026-09-30"), d("2026-10-01")).anzeige).toBe("1 Tag");
  });

  it("zeigt Wochen bei Säuglingen unter 3 Monaten", () => {
    expect(berechneAlter(d("2026-08-20"), d("2026-10-01")).anzeige).toBe("6 Wochen");
  });

  it("zeigt Monate bis 24 Monate", () => {
    const a = berechneAlter(d("2025-12-01"), d("2026-10-01"));
    expect(a).toMatchObject({ jahre: 0, monate: 10, gesamtMonate: 10, anzeige: "10 Monate" });
  });

  it("zeigt Jahre ab 2 Jahren", () => {
    const a = berechneAlter(d("2022-03-12"), d("2026-10-01"));
    expect(a).toMatchObject({ jahre: 4, monate: 6, tage: 19, anzeige: "4 Jahre" });
  });

  it("Geburtstag am Vortag zählt noch nicht als volles Jahr", () => {
    expect(berechneAlter(d("1990-10-02"), d("2026-10-01")).jahre).toBe(35);
    expect(berechneAlter(d("1990-10-01"), d("2026-10-01")).jahre).toBe(36);
  });

  it("behandelt 29. Februar und Monatsenden", () => {
    expect(berechneAlter(d("2024-02-29"), d("2025-02-27"))).toMatchObject({ jahre: 0, monate: 11, tage: 29 });
    expect(berechneAlter(d("2024-02-29"), d("2025-02-28"))).toMatchObject({ jahre: 1, monate: 0, tage: 0 });
    expect(berechneAlter(d("2024-02-29"), d("2025-03-01"))).toMatchObject({ jahre: 1, monate: 0, tage: 1 });
    expect(berechneAlter(d("2026-01-31"), d("2026-03-01"))).toMatchObject({ monate: 1, tage: 1 });
  });

  it("ignoriert Uhrzeit", () => {
    const a = berechneAlter(new Date("2026-09-30T23:59:00Z"), new Date("2026-10-01T00:01:00Z"));
    expect(a.gesamtTage).toBe(1);
  });

  it("wirft bei Stichtag vor Geburt oder ungültigem Datum", () => {
    expect(() => berechneAlter(d("2026-10-02"), d("2026-10-01"))).toThrow(RangeError);
    expect(() => berechneAlter(new Date("x"), d("2026-10-01"))).toThrow(RangeError);
  });
});

describe("REQ-036 korrigiertes Alter", () => {
  it("Gestationsalter in Tagen", () => {
    expect(gestationsTage({ wochen: 32, tage: 4 })).toBe(228);
    expect(() => gestationsTage({ wochen: 32, tage: 7 })).toThrow(RangeError);
    expect(() => gestationsTage({ wochen: 10, tage: 0 })).toThrow(RangeError);
  });

  it("Grenze Frühgeburt bei 37+0", () => {
    expect(istFruehgeboren({ wochen: 36, tage: 6 })).toBe(true);
    expect(istFruehgeboren({ wochen: 37, tage: 0 })).toBe(false);
  });

  it("gibt null bei Termingeburt", () => {
    expect(berechneKorrigiertesAlter(d("2026-01-01"), { wochen: 39, tage: 3 }, d("2026-10-01"))).toBeNull();
  });

  it("zieht die fehlenden Wochen ab (28+0 → 12 Wochen Korrektur)", () => {
    const k = berechneKorrigiertesAlter(d("2026-01-01"), { wochen: 28, tage: 0 }, d("2026-10-01"));
    expect(k?.korrekturTage).toBe(84);
    // chronologisch 9 Monate, korrigiert errechneter Termin 2026-03-26 → 6 Monate
    expect(k?.alter?.gesamtMonate).toBe(6);
    expect(k?.korrekturUeblich).toBe(true);
  });

  it("alter = null vor dem errechneten Termin", () => {
    const k = berechneKorrigiertesAlter(d("2026-09-01"), { wochen: 30, tage: 0 }, d("2026-10-01"));
    expect(k?.alter).toBeNull();
  });

  it("Korrektur nach 24 Monaten nicht mehr üblich", () => {
    const k = berechneKorrigiertesAlter(d("2023-01-01"), { wochen: 30, tage: 0 }, d("2026-10-01"));
    expect(k?.korrekturUeblich).toBe(false);
  });
});
