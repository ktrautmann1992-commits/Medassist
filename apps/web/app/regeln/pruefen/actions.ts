"use server";

import { requireUser } from "@/lib/auth/guards";
import type { RegelPruefState } from "@/lib/regeln/form";
import { pruefeWarnzeichen } from "@/lib/regeln/pruefen";

/** REQ-215: Sitzung und Rolle kommen aus dem Server, nie aus dem Formular (REQ-116). */
export async function warnzeichenPruefen(_vorher: RegelPruefState, formData: FormData): Promise<RegelPruefState> {
  const { nutzer } = await requireUser();
  return pruefeWarnzeichen(nutzer, formData);
}
