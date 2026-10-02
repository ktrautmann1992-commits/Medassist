import { describe, expect, it } from "vitest";
import { MAX_FEHLVERSUCHE, SPERRDAUER_MS, istGesperrt, nachErfolg, nachFehlversuch } from "./lockout";

describe("REQ-020 Kontosperre", () => {
  const jetzt = new Date("2026-10-01T12:00:00Z");

  it("sperrt nach 5 Fehlversuchen für 15 Minuten", () => {
    let s = nachErfolg();
    for (let i = 1; i < MAX_FEHLVERSUCHE; i++) {
      s = nachFehlversuch(s, jetzt);
      expect(istGesperrt(s, jetzt)).toBe(false);
    }
    s = nachFehlversuch(s, jetzt);
    expect(istGesperrt(s, jetzt)).toBe(true);
    expect(istGesperrt(s, new Date(jetzt.getTime() + SPERRDAUER_MS - 1))).toBe(true);
    expect(istGesperrt(s, new Date(jetzt.getTime() + SPERRDAUER_MS))).toBe(false);
  });

  it("Erfolg setzt zurück", () => {
    expect(nachErfolg()).toEqual({ fehlversuche: 0, gesperrtBis: null });
  });
});
