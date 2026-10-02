import "server-only";
import { env } from "../env";
import { entschluessele, verschluessele } from "./verschluesselung";

/**
 * REQ-015, REQ-021: Der Schlüssel ist nur bei aktiver 2FA Pflicht (`lib/env.ts`).
 * Bei abgeschalteter 2FA leiten die 2FA-Seiten vorher um (`requireTeilsitzung`),
 * dieser Fehler sollte also nie erreicht werden – falls doch, mit klarer Meldung.
 */
function schluessel(): Buffer {
  const wert = env().TOTP_ENCRYPTION_KEY;
  if (!wert) {
    throw new Error(
      "TOTP_ENCRYPTION_KEY fehlt: Zwei-Faktor-Anmeldung kann nicht verwendet werden. Schlüssel setzen (32 Byte, Base64) oder ZWEI_FA_AKTIV=false.",
    );
  }
  return Buffer.from(wert, "base64");
}

export const verschluesseleTotpSecret = (secret: string) => verschluessele(secret, schluessel());
export const entschluesseleTotpSecret = (wert: string) => entschluessele(wert, schluessel());
