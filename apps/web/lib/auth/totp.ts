import { generateSecret, generateURI, verify } from "otplib";

/** REQ-015: TOTP nach RFC 6238 – 6 Ziffern, 30 s, SHA-1 (kompatibel mit gängigen Authenticator-Apps). */
export const TOTP_PERIODE_S = 30;
/** Toleranz für Uhrabweichung: ein Zeitschritt vor/zurück. */
const TOLERANZ_S = TOTP_PERIODE_S;

export function neuesTotpSecret(): string {
  return generateSecret();
}

export function totpUri(secret: string, email: string): string {
  return generateURI({ issuer: "MedAssist (Demo)", label: email, secret });
}

export type TotpErgebnis = { gueltig: true; zeitschritt: number } | { gueltig: false };

/**
 * Prüft einen Code. `letzterZeitschritt` verhindert die Wiederverwendung eines
 * bereits akzeptierten Codes (Replay-Schutz).
 */
export async function pruefeTotp(
  secret: string,
  code: string,
  letzterZeitschritt: number | null,
  jetzt: Date = new Date(),
): Promise<TotpErgebnis> {
  const epoch = Math.floor(jetzt.getTime() / 1000);
  try {
    const ergebnis = await verify({
      secret,
      token: code,
      epoch,
      epochTolerance: TOLERANZ_S,
      ...(letzterZeitschritt !== null ? { afterTimeStep: letzterZeitschritt } : {}),
    });
    if (!ergebnis.valid) return { gueltig: false };
    return { gueltig: true, zeitschritt: Math.floor(epoch / TOTP_PERIODE_S) + ergebnis.delta };
  } catch {
    return { gueltig: false };
  }
}
