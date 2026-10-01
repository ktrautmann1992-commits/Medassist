"use server";

import { registrierungSchema } from "@medassist/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPasswort } from "@/lib/auth/password";
import { EMAIL_TOKEN_GUELTIG_MS, hashToken, neuesToken } from "@/lib/auth/tokens";
import { feldFehlerAus, type FormState } from "@/lib/forms/state";

/** Version der Einwilligungstexte (REQ-038). */
const EINWILLIGUNG_VERSION = "demo-2026-10";

export async function registrieren(_vorher: FormState, formData: FormData): Promise<FormState> {
  const eingabe = registrierungSchema.safeParse({
    rolle: formData.get("rolle"),
    email: formData.get("email"),
    passwort: formData.get("passwort"),
    einwilligungDatenschutz: formData.get("einwilligungDatenschutz") === "on",
    nurTestdaten: formData.get("nurTestdaten") === "on",
    approbationsbehoerde: formData.get("approbationsbehoerde") ?? undefined,
    approbationsdatum: formData.get("approbationsdatum") || undefined,
  });
  if (!eingabe.success) {
    return { fehler: "Bitte die markierten Felder prüfen.", feldFehler: feldFehlerAus(eingabe.error.issues) };
  }
  const daten = eingabe.data;

  const vorhanden = await db().nutzer.findUnique({ where: { email: daten.email }, select: { id: true } });
  if (vorhanden) {
    return { fehler: "Mit dieser E-Mail-Adresse besteht bereits ein Konto. Bitte melden Sie sich an." };
  }

  const token = neuesToken();
  const passwortHash = await hashPasswort(daten.passwort);

  await db().nutzer.create({
    data: {
      email: daten.email,
      passwortHash,
      rolle: daten.rolle,
      einwilligungen: {
        create: [
          { zweck: "NUTZUNGSBEDINGUNGEN", textVersion: EINWILLIGUNG_VERSION },
          { zweck: "GESUNDHEITSDATEN", textVersion: EINWILLIGUNG_VERSION },
        ],
      },
      emailVerifizierungen: {
        create: { tokenHash: hashToken(token), laeuftAbAm: new Date(Date.now() + EMAIL_TOKEN_GUELTIG_MS) },
      },
      // REQ-014: Prüfung im Prototyp simuliert.
      ...(daten.rolle === "ARZT"
        ? {
            approbationsnachweis: {
              create: {
                behoerde: daten.approbationsbehoerde,
                datum: daten.approbationsdatum,
                status: "SIMULIERT",
                geprueftAm: new Date(),
              },
            },
          }
        : {}),
    },
  });

  // REQ-013 (Prototyp): Link anzeigen statt E-Mail versenden.
  const link = `${env().APP_URL}/verifizieren?token=${encodeURIComponent(token)}`;
  return { erfolg: "Konto angelegt. Bitte bestätigen Sie Ihre E-Mail-Adresse.", verifizierungsLink: link };
}
