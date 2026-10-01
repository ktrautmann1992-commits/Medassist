import { describe, expect, it } from "vitest";
import { loginSchema, passwortSchema, registrierungSchema, totpCodeSchema } from "./schemas";

const patient = {
  rolle: "PATIENT",
  email: "  Test@Example.org ",
  passwort: "sicheres-Passwort-1",
  einwilligungDatenschutz: true,
  nurTestdaten: true,
};

describe("REQ-010/REQ-011/REQ-002 Registrierung", () => {
  it("akzeptiert Patient und normalisiert E-Mail", () => {
    const r = registrierungSchema.parse(patient);
    expect(r.rolle).toBe("PATIENT");
    expect(r.email).toBe("test@example.org");
  });

  it("lehnt unbekannte Rolle ab", () => {
    expect(registrierungSchema.safeParse({ ...patient, rolle: "ADMIN" }).success).toBe(false);
  });

  it("verlangt Einwilligung und Testdaten-Bestätigung", () => {
    expect(registrierungSchema.safeParse({ ...patient, einwilligungDatenschutz: false }).success).toBe(false);
    expect(registrierungSchema.safeParse({ ...patient, nurTestdaten: undefined }).success).toBe(false);
  });

  it("REQ-014 Arzt braucht Approbationsangaben", () => {
    const arzt = { ...patient, rolle: "ARZT" };
    expect(registrierungSchema.safeParse(arzt).success).toBe(false);
    const ok = registrierungSchema.safeParse({
      ...arzt,
      approbationsbehoerde: "Landesprüfungsamt (Demo)",
      approbationsdatum: "2015-06-01",
    });
    expect(ok.success).toBe(true);
    expect(
      registrierungSchema.safeParse({ ...arzt, approbationsbehoerde: "LPA", approbationsdatum: "2999-01-01" }).success,
    ).toBe(false);
  });
});

describe("REQ-011 Passwortregeln", () => {
  it.each([
    ["kurz1!", false],
    ["nurkleinbuchstaben", false],
    ["123456789012", false],
    ["kleinundZIFFER9", true],
    ["lange passphrase mit leerzeichen", true],
  ])("%s → %s", (pw, ok) => {
    expect(passwortSchema.safeParse(pw).success).toBe(ok);
  });
});

describe("Login und TOTP", () => {
  it("Login verlangt E-Mail und Passwort", () => {
    expect(loginSchema.safeParse({ email: "a@b.de", passwort: "" }).success).toBe(false);
  });

  it("REQ-015 TOTP-Code: 6 Ziffern, Leerzeichen erlaubt", () => {
    expect(totpCodeSchema.parse("123 456")).toBe("123456");
    expect(totpCodeSchema.safeParse("12345").success).toBe(false);
    expect(totpCodeSchema.safeParse("abcdef").success).toBe(false);
  });
});
