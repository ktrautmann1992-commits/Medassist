import { describe, expect, it } from "vitest";
import { BERECHTIGUNGEN, hatBerechtigung, pruefeZugang } from "./permissions";

describe("REQ-018 Rollenberechtigungen", () => {
  it("Patient bekommt keine Medikamentenempfehlung und keinen Arztbericht", () => {
    expect(hatBerechtigung("PATIENT", "medikation:empfehlen")).toBe(false);
    expect(hatBerechtigung("PATIENT", "therapieplan:voll")).toBe(false);
    expect(hatBerechtigung("PATIENT", "diagnose:differential")).toBe(false);
    expect(hatBerechtigung("PATIENT", "bericht:arzt")).toBe(false);
  });

  it("Arzt darf Medikation, aber keine Kinderprofile anlegen", () => {
    expect(hatBerechtigung("ARZT", "medikation:empfehlen")).toBe(true);
    expect(hatBerechtigung("ARZT", "profil:kinder:verwalten")).toBe(false);
  });

  it("jede Berechtigung ist mindestens einer Rolle zugeordnet", () => {
    for (const rollen of Object.values(BERECHTIGUNGEN)) expect(rollen.length).toBeGreaterThan(0);
  });
});

describe("REQ-013/REQ-015/REQ-016 Zugang nur mit E-Mail-Bestätigung und 2FA", () => {
  const t = new Date();
  it.each([
    [{ emailVerifiziertAm: null, totpAktiviertAm: t }, { zweiterFaktorAm: t }, "EMAIL_NICHT_VERIFIZIERT"],
    [{ emailVerifiziertAm: t, totpAktiviertAm: null }, { zweiterFaktorAm: null }, "ZWEI_FA_NICHT_EINGERICHTET"],
    [{ emailVerifiziertAm: t, totpAktiviertAm: t }, { zweiterFaktorAm: null }, "ZWEI_FA_AUSSTEHEND"],
  ] as const)("verweigert: %#", (konto, sitzung, grund) => {
    expect(pruefeZugang(konto, sitzung)).toEqual({ erlaubt: false, grund });
  });

  it("erlaubt bei vollständiger Authentifizierung", () => {
    expect(pruefeZugang({ emailVerifiziertAm: t, totpAktiviertAm: t }, { zweiterFaktorAm: t })).toEqual({
      erlaubt: true,
    });
  });
});
