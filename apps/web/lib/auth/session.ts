import "server-only";
import { cookies } from "next/headers";
import { db } from "../db";
import { hashToken, neuesToken } from "./tokens";

/** REQ-017: Sitzungsdauer nach vollständiger Anmeldung. */
export const SITZUNG_DAUER_MS = 12 * 60 * 60 * 1000;
/** Zwischen Passwort und TOTP-Code bleibt nur ein kurzes Fenster. */
export const TEILSITZUNG_DAUER_MS = 10 * 60 * 1000;

const COOKIE = "medassist_sitzung";

async function setzeCookie(token: string, laeuftAbAm: Date) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: laeuftAbAm,
  });
}

/** Legt nach erfolgreicher Passwortprüfung eine Teilsitzung an (zweiter Faktor ausstehend). */
export async function erstelleTeilsitzung(nutzerId: string): Promise<void> {
  const token = neuesToken();
  const laeuftAbAm = new Date(Date.now() + TEILSITZUNG_DAUER_MS);
  await db().sitzung.create({ data: { nutzerId, tokenHash: hashToken(token), laeuftAbAm } });
  await setzeCookie(token, laeuftAbAm);
}

/**
 * REQ-016: Nach bestätigtem TOTP-Code wird die Sitzung ersetzt (neues Token gegen
 * Session-Fixation) und als vollständig authentifiziert markiert.
 */
export async function bestaetigeZweitenFaktor(sitzungId: string, nutzerId: string): Promise<void> {
  const token = neuesToken();
  const jetzt = new Date();
  const laeuftAbAm = new Date(jetzt.getTime() + SITZUNG_DAUER_MS);
  await db().$transaction([
    db().sitzung.delete({ where: { id: sitzungId } }),
    db().sitzung.create({ data: { nutzerId, tokenHash: hashToken(token), zweiterFaktorAm: jetzt, laeuftAbAm } }),
  ]);
  await setzeCookie(token, laeuftAbAm);
}

export async function aktuelleSitzung() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const sitzung = await db().sitzung.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      nutzer: {
        select: {
          id: true,
          email: true,
          rolle: true,
          emailVerifiziertAm: true,
          totpAktiviertAm: true,
          totpSecretVerschl: true,
          totpLetzterZeitschritt: true,
          fehlversuche: true,
          gesperrtBis: true,
        },
      },
    },
  });
  if (!sitzung || sitzung.laeuftAbAm.getTime() <= Date.now()) return null;
  return sitzung;
}

export type AktuelleSitzung = NonNullable<Awaited<ReturnType<typeof aktuelleSitzung>>>;

export async function beendeSitzung(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db().sitzung.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(COOKIE);
}
