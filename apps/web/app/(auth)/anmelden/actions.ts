"use server";

import { istGesperrt, loginSchema, nachFehlversuch } from "@medassist/core";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { dummyPasswortHash, pruefePasswort } from "@/lib/auth/password";
import { beendeSitzung, erstelleTeilsitzung } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/state";

/** REQ-019: Gleiche Meldung für unbekannte E-Mail, falsches Passwort und Sperre. */
const ANMELDUNG_FEHLGESCHLAGEN =
  "Anmeldung fehlgeschlagen. Nach mehreren Fehlversuchen wird das Konto für 15 Minuten gesperrt.";

export async function anmelden(_vorher: FormState, formData: FormData): Promise<FormState> {
  const eingabe = loginSchema.safeParse({ email: formData.get("email"), passwort: formData.get("passwort") });
  if (!eingabe.success) return { fehler: "Bitte E-Mail-Adresse und Passwort eingeben." };
  const { email, passwort } = eingabe.data;

  const nutzer = await db().nutzer.findUnique({ where: { email } });
  if (!nutzer) {
    await pruefePasswort(await dummyPasswortHash(), passwort); // gleiche Laufzeit
    return { fehler: ANMELDUNG_FEHLGESCHLAGEN };
  }

  const jetzt = new Date();
  if (istGesperrt(nutzer, jetzt)) return { fehler: ANMELDUNG_FEHLGESCHLAGEN };

  if (!(await pruefePasswort(nutzer.passwortHash, passwort))) {
    // REQ-020: Fehlversuch zählen. Zurückgesetzt wird erst nach bestätigtem zweitem Faktor.
    await db().nutzer.update({ where: { id: nutzer.id }, data: nachFehlversuch(nutzer, jetzt) });
    return { fehler: ANMELDUNG_FEHLGESCHLAGEN };
  }

  // Ab hier ist das Passwort korrekt – die folgenden Hinweise verraten nichts Neues.
  if (!nutzer.emailVerifiziertAm) {
    return { fehler: "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse über den Bestätigungslink." };
  }

  await erstelleTeilsitzung(nutzer.id);
  redirect(nutzer.totpAktiviertAm ? "/2fa/bestaetigen" : "/2fa/einrichten");
}

export async function abmelden(): Promise<void> {
  await beendeSitzung();
  redirect("/anmelden");
}
