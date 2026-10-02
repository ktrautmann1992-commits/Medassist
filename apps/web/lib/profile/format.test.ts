import { describe, expect, it } from "vitest";
import { datumDe, eingabeZahl, isoDatum, stichtagHeute, zahlDe } from "./format";

describe("Anzeigeformate", () => {
  it("Datum deutsch", () => {
    expect(datumDe("2026-01-31")).toBe("31.01.2026");
    expect(datumDe(null)).toBe("–");
    expect(isoDatum(new Date("2026-01-31T00:00:00Z"))).toBe("2026-01-31");
  });

  it("Zahlen mit Dezimalkomma", () => {
    expect(zahlDe("61.5")).toBe("61,5");
    expect(zahlDe(null)).toBe("–");
    expect(eingabeZahl("1.250")).toBe("1,250");
    expect(eingabeZahl(null)).toBe("");
  });
});

describe("stichtagHeute", () => {
  it("Kalendertag in Europe/Berlin", () => {
    expect(stichtagHeute(new Date("2026-10-01T22:30:00Z")).toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(stichtagHeute(new Date("2026-10-01T12:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
