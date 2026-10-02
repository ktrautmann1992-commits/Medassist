import { describe, expect, it } from "vitest";
import { berechneBmi } from "./bmi";

describe("REQ-033 berechneBmi", () => {
  it("berechnet und rundet auf eine Nachkommastelle", () => {
    expect(berechneBmi(180, 75)).toBe(23.1);
    expect(berechneBmi(50, 3.4)).toBe(13.6);
  });

  it("weist unplausible Werte ab", () => {
    expect(() => berechneBmi(0, 70)).toThrow(RangeError);
    expect(() => berechneBmi(180, 0)).toThrow(RangeError);
    expect(() => berechneBmi(180, Number.NaN)).toThrow(RangeError);
    expect(() => berechneBmi(1.8, 75)).toThrow(/Körpergröße/); // Meter statt cm
  });
});
