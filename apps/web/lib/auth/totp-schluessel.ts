import "server-only";
import { env } from "../env";
import { entschluessele, verschluessele } from "./verschluesselung";

const schluessel = () => Buffer.from(env().TOTP_ENCRYPTION_KEY, "base64");

export const verschluesseleTotpSecret = (secret: string) => verschluessele(secret, schluessel());
export const entschluesseleTotpSecret = (wert: string) => entschluessele(wert, schluessel());
