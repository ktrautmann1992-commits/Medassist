import { describe, expect, it } from "vitest";
import { hashPasswort, pruefePasswort } from "./password";

describe("REQ-012 Passwort-Hashing", () => {
  it("speichert Argon2id, nie Klartext", async () => {
    const h = await hashPasswort("sicheres-Passwort-1");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(h).not.toContain("sicheres-Passwort-1");
  });

  it("prüft korrekt und lehnt falsche Passwörter ab", async () => {
    const h = await hashPasswort("sicheres-Passwort-1");
    expect(await pruefePasswort(h, "sicheres-Passwort-1")).toBe(true);
    expect(await pruefePasswort(h, "sicheres-Passwort-2")).toBe(false);
  });

  it("gibt bei kaputtem Hash false statt Fehler", async () => {
    expect(await pruefePasswort("kein-hash", "x")).toBe(false);
  });
});
