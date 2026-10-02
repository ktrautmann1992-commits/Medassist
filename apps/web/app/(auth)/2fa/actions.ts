"use server";

import { istGesperrt, nachErfolg, nachFehlversuch, totpCodeSchema } from "@medassist/core";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireTeilsitzung } from "@/lib/auth/guards";
import { bestaetigeZweitenFaktor } from "@/lib/auth/session";
import { pruefeTotp } from "@/lib/auth/totp";
import { entschluesseleTotpSecret } from "@/lib/auth/totp-schluessel";
import type { FormState } from "@/lib/forms/state";

const CODE_FALSCH = "Der Code ist nicht gültig. Bitte den aktuellen Code aus der Authenticator-App eingeben.";

/**
 * REQ-015, REQ-016: Prüft den TOTP-Code der Teilsitzung. Beim ersten Mal wird
 * die 2FA damit aktiviert; danach wird die Sitzung vollständig authentifiziert.
 */
export async function zweitenFaktorPruefen(_vorher: FormState, formData: FormData): Promise<FormState> {
  const sitzung = await requireTeilsitzung();
  const { nutzer } = sitzung;

  const code = totpCodeSchema.safeParse(formData.get("code") ?? "");
  if (!code.success) return { fehler: code.error.issues[0]?.message ?? CODE_FALSCH };

  const jetzt = new Date();
  if (istGesperrt(nutzer, jetzt)) return { fehler: "Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen." };
  if (!nutzer.totpSecretVerschl) redirect("/2fa/einrichten");

  const ergebnis = await pruefeTotp(
    entschluesseleTotpSecret(nutzer.totpSecretVerschl),
    code.data,
    nutzer.totpLetzterZeitschritt,
    jetzt,
  );
  if (!ergebnis.gueltig) {
    await db().nutzer.update({ where: { id: nutzer.id }, data: nachFehlversuch(nutzer, jetzt) });
    return { fehler: CODE_FALSCH };
  }

  await db().nutzer.update({
    where: { id: nutzer.id },
    data: {
      ...nachErfolg(),
      totpLetzterZeitschritt: ergebnis.zeitschritt,
      ...(nutzer.totpAktiviertAm ? {} : { totpAktiviertAm: jetzt }),
    },
  });
  await bestaetigeZweitenFaktor(sitzung.id, nutzer.id);
  redirect("/start");
}
