import type { ProfilNutzer } from "@medassist/core";
import type { Prisma } from "@/generated/prisma/client";

/**
 * REQ-115: Datenbankfilter für zugängliche Profile – das Gegenstück zur Regel
 * `darfProfilZugreifen` (core). Rein und ohne `server-only`, damit testbar.
 * Fälle, die Patienten teilen, folgen mit Meilenstein 10 (reservierter Bereich REQ-900 …).
 */
export function profilFilter(nutzer: ProfilNutzer): Prisma.PatientenprofilWhereInput {
  // Ohne Nutzer-ID nichts laden (sonst würde z. B. `kontoinhaberId: ""` verglichen).
  if (!nutzer.id) return { id: { in: [] } };
  switch (nutzer.rolle) {
    case "PATIENT":
      return {
        OR: [
          { kontoinhaberId: nutzer.id },
          { istKinderprofil: true, sorgeberechtigte: { some: { nutzerId: nutzer.id } } },
        ],
      };
    case "ARZT":
      return { angelegtVonId: nutzer.id, kontoinhaberId: null };
    default:
      // Unbekannte Rolle: nichts laden.
      return { id: { in: [] } };
  }
}
