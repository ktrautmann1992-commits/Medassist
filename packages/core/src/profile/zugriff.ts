import type { Rolle } from "../roles";

/**
 * REQ-115: Zentrale Zugriffsregel für Patientenprofile. Rein (ohne Datenbank),
 * damit sie getestet und vom Loader in `apps/web/lib/profile/zugriff.ts` nach
 * dem gefilterten Laden zusätzlich angewendet werden kann.
 */
export interface ProfilNutzer {
  id: string;
  rolle: Rolle;
}

export interface ProfilZugriffsDaten {
  kontoinhaberId: string | null;
  angelegtVonId: string;
  istKinderprofil: boolean;
  /** Nutzer-IDs aus `Sorgeberechtigung`. */
  sorgeberechtigteIds: readonly string[];
}

/**
 * - Patient: eigenes Profil (Kontoinhaber) und Kinderprofile, für die er als
 *   Sorgeberechtigter eingetragen ist. Nur „angelegt von“ genügt nicht.
 * - Arzt: nur selbst angelegte Profile ohne Kontoinhaber. Fälle, die Patienten
 *   teilen, folgen mit Meilenstein 10 (reservierter Bereich REQ-900 …) über `Freigabe`.
 */
export function darfProfilZugreifen(nutzer: ProfilNutzer, profil: ProfilZugriffsDaten): boolean {
  if (!nutzer.id) return false;
  switch (nutzer.rolle) {
    case "PATIENT":
      if (profil.kontoinhaberId === nutzer.id) return true;
      return profil.istKinderprofil && profil.sorgeberechtigteIds.includes(nutzer.id);
    case "ARZT":
      return profil.kontoinhaberId === null && profil.angelegtVonId === nutzer.id;
    default:
      return false;
  }
}

/** REQ-114: Nieren-/Leberfunktion und Laborwerte sind nur für Ärzte sichtbar und änderbar. */
export function darfArztFelderSehen(rolle: Rolle): boolean {
  return rolle === "ARZT";
}
