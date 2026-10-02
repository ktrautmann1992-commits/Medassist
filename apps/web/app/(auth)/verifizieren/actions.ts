"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth/tokens";
import type { FormState } from "@/lib/forms/state";

/** REQ-013: Einmal-Token prüfen und E-Mail als bestätigt markieren. */
export async function emailBestaetigen(_vorher: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { fehler: "Der Bestätigungslink ist unvollständig." };

  const jetzt = new Date();
  const eintrag = await db().emailVerifizierung.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!eintrag || eintrag.verwendetAm || eintrag.laeuftAbAm <= jetzt) {
    return { fehler: "Der Bestätigungslink ist ungültig oder abgelaufen." };
  }

  await db().$transaction([
    db().emailVerifizierung.update({ where: { id: eintrag.id }, data: { verwendetAm: jetzt } }),
    db().nutzer.update({ where: { id: eintrag.nutzerId }, data: { emailVerifiziertAm: jetzt } }),
  ]);
  redirect("/anmelden?hinweis=bestaetigt");
}
