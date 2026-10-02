import { describe, expect, it } from "vitest";
import { darfArztFelderSehen, darfProfilZugreifen, type ProfilZugriffsDaten } from "./zugriff";

const patient = { id: "p1", rolle: "PATIENT" } as const;
const andererPatient = { id: "p2", rolle: "PATIENT" } as const;
const arzt = { id: "a1", rolle: "ARZT" } as const;
const andererArzt = { id: "a2", rolle: "ARZT" } as const;

const eigenes: ProfilZugriffsDaten = { kontoinhaberId: "p1", angelegtVonId: "p1", istKinderprofil: false, sorgeberechtigteIds: [] };
const kind: ProfilZugriffsDaten = { kontoinhaberId: null, angelegtVonId: "p1", istKinderprofil: true, sorgeberechtigteIds: ["p1"] };
const arztPatient: ProfilZugriffsDaten = { kontoinhaberId: null, angelegtVonId: "a1", istKinderprofil: false, sorgeberechtigteIds: [] };

describe("REQ-115 darfProfilZugreifen", () => {
  it("Patient: eigenes Profil und eigenes Kinderprofil", () => {
    expect(darfProfilZugreifen(patient, eigenes)).toBe(true);
    expect(darfProfilZugreifen(patient, kind)).toBe(true);
  });

  it("Patient: kein Zugriff auf fremde Profile", () => {
    expect(darfProfilZugreifen(andererPatient, eigenes)).toBe(false);
    expect(darfProfilZugreifen(andererPatient, kind)).toBe(false);
    expect(darfProfilZugreifen(patient, arztPatient)).toBe(false);
  });

  it("Patient: „angelegt von“ allein genügt nicht – Sorgeberechtigung nötig", () => {
    expect(darfProfilZugreifen(patient, { ...kind, sorgeberechtigteIds: [] })).toBe(false);
    // Sorgeberechtigung wirkt nur bei Kinderprofilen
    expect(darfProfilZugreifen(patient, { ...arztPatient, sorgeberechtigteIds: ["p1"] })).toBe(false);
  });

  it("zweiter Sorgeberechtigter erhält Zugriff über den Eintrag", () => {
    expect(darfProfilZugreifen(andererPatient, { ...kind, sorgeberechtigteIds: ["p1", "p2"] })).toBe(true);
  });

  it("Arzt: nur selbst angelegte Profile ohne Kontoinhaber", () => {
    expect(darfProfilZugreifen(arzt, arztPatient)).toBe(true);
    expect(darfProfilZugreifen(andererArzt, arztPatient)).toBe(false);
    expect(darfProfilZugreifen(arzt, eigenes)).toBe(false);
    expect(darfProfilZugreifen(arzt, kind)).toBe(false);
    expect(darfProfilZugreifen(arzt, { ...arztPatient, kontoinhaberId: "p9" })).toBe(false);
  });

  it("Arzt erhält keinen Zugriff über Sorgeberechtigung oder Kontoinhaberschaft", () => {
    expect(darfProfilZugreifen(arzt, { ...kind, sorgeberechtigteIds: ["a1"] })).toBe(false);
    expect(darfProfilZugreifen(arzt, { ...eigenes, kontoinhaberId: "a1", angelegtVonId: "a1" })).toBe(false);
  });

  it("leere Nutzer-ID oder unbekannte Rolle → kein Zugriff", () => {
    expect(darfProfilZugreifen({ id: "", rolle: "PATIENT" }, { ...eigenes, kontoinhaberId: "" })).toBe(false);
    expect(darfProfilZugreifen({ id: "p1", rolle: "ADMIN" as never }, eigenes)).toBe(false);
  });
});

describe("REQ-114 Arzt-Felder", () => {
  it("nur Rolle ARZT", () => {
    expect(darfArztFelderSehen("ARZT")).toBe(true);
    expect(darfArztFelderSehen("PATIENT")).toBe(false);
  });
});
