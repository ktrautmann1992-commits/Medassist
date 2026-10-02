import { darfProfilZugreifen, type ProfilZugriffsDaten } from "@medassist/core";
import { describe, expect, it } from "vitest";
import { profilFilter } from "./filter";

describe("REQ-115 profilFilter", () => {
  it("Patient: eigenes Profil oder Kinderprofil mit eigener Sorgeberechtigung", () => {
    expect(profilFilter({ id: "p1", rolle: "PATIENT" })).toEqual({
      OR: [{ kontoinhaberId: "p1" }, { istKinderprofil: true, sorgeberechtigte: { some: { nutzerId: "p1" } } }],
    });
  });

  it("Arzt: nur selbst angelegte Profile ohne Kontoinhaber (kein Zugriff auf Patientenkonten)", () => {
    expect(profilFilter({ id: "a1", rolle: "ARZT" })).toEqual({ angelegtVonId: "a1", kontoinhaberId: null });
  });

  it("unbekannte Rolle oder leere ID: leere Menge", () => {
    expect(profilFilter({ id: "x", rolle: "ADMIN" as never })).toEqual({ id: { in: [] } });
    expect(profilFilter({ id: "", rolle: "PATIENT" })).toEqual({ id: { in: [] } });
  });

  // Der Filter muss dieselben Profile auswählen wie die Regel aus core – hier mit einer
  // kleinen Auswertung des Filters auf Beispieldaten.
  it("stimmt mit darfProfilZugreifen überein", () => {
    type P = ProfilZugriffsDaten & { id: string };
    const profile: P[] = [
      { id: "eigen", kontoinhaberId: "p1", angelegtVonId: "p1", istKinderprofil: false, sorgeberechtigteIds: [] },
      { id: "kind", kontoinhaberId: null, angelegtVonId: "p1", istKinderprofil: true, sorgeberechtigteIds: ["p1"] },
      { id: "kind-ohne", kontoinhaberId: null, angelegtVonId: "p1", istKinderprofil: true, sorgeberechtigteIds: [] },
      { id: "arzt-pat", kontoinhaberId: null, angelegtVonId: "a1", istKinderprofil: false, sorgeberechtigteIds: [] },
      { id: "arzt-pat-sorge", kontoinhaberId: null, angelegtVonId: "a1", istKinderprofil: false, sorgeberechtigteIds: ["p1"] },
      { id: "konto-von-arzt", kontoinhaberId: "p2", angelegtVonId: "a1", istKinderprofil: false, sorgeberechtigteIds: [] },
    ];
    const erfuellt = (w: Record<string, unknown>, p: P): boolean => {
      if (Array.isArray(w.OR)) return (w.OR as Record<string, unknown>[]).some((t) => erfuellt(t, p));
      return Object.entries(w).every(([k, v]) => {
        if (k === "id") return (v as { in: string[] }).in.includes(p.id);
        if (k === "sorgeberechtigte") return p.sorgeberechtigteIds.includes((v as { some: { nutzerId: string } }).some.nutzerId);
        return (p as unknown as Record<string, unknown>)[k] === v;
      });
    };
    for (const nutzer of [
      { id: "p1", rolle: "PATIENT" as const },
      { id: "p2", rolle: "PATIENT" as const },
      { id: "a1", rolle: "ARZT" as const },
      { id: "a2", rolle: "ARZT" as const },
    ]) {
      const f = profilFilter(nutzer) as Record<string, unknown>;
      for (const p of profile) expect(erfuellt(f, p), `${nutzer.id} → ${p.id}`).toBe(darfProfilZugreifen(nutzer, p));
    }
  });
});
