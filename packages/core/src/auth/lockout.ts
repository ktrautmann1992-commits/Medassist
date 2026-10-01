/** REQ-020: Kontosperre nach wiederholten Fehlversuchen. */
export const MAX_FEHLVERSUCHE = 5;
export const SPERRDAUER_MS = 15 * 60 * 1000;

export interface SperrStatus {
  fehlversuche: number;
  gesperrtBis: Date | null;
}

export function istGesperrt(status: SperrStatus, jetzt: Date = new Date()): boolean {
  return status.gesperrtBis !== null && status.gesperrtBis.getTime() > jetzt.getTime();
}

/** Neuer Status nach einem Fehlversuch. Ab dem 5. Fehlversuch wird gesperrt und der Zähler zurückgesetzt. */
export function nachFehlversuch(status: SperrStatus, jetzt: Date = new Date()): SperrStatus {
  const fehlversuche = status.fehlversuche + 1;
  if (fehlversuche >= MAX_FEHLVERSUCHE) {
    return { fehlversuche: 0, gesperrtBis: new Date(jetzt.getTime() + SPERRDAUER_MS) };
  }
  return { fehlversuche, gesperrtBis: status.gesperrtBis };
}

export function nachErfolg(): SperrStatus {
  return { fehlversuche: 0, gesperrtBis: null };
}
