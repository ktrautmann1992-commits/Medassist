/** Rollen laut CLAUDE.md §2. Werte entsprechen dem Prisma-Enum `Rolle`. */
export const ROLLEN = ["PATIENT", "ARZT"] as const;
export type Rolle = (typeof ROLLEN)[number];

export const ROLLEN_BEZEICHNUNG: Record<Rolle, string> = {
  PATIENT: "Patient",
  ARZT: "Arzt",
};

export function istRolle(wert: unknown): wert is Rolle {
  return typeof wert === "string" && (ROLLEN as readonly string[]).includes(wert);
}
