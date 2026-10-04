import type { GefiltertesErgebnis, RegelEingabeRoh } from "@medassist/core";

/**
 * REQ-220 (S5): Statischer Ersatz-Hinweis, falls nach der Regelprüfung (oder davor) ein
 * interner Fehler auftritt. Krisen- und Notfallhinweise werden dann trotzdem angezeigt.
 */
export interface NotfallFallback {
  krise: boolean;
  notfall: { dringlichkeit: "NOTFALL" | "DRINGEND"; zeitrahmen: "SOFORT" | "HEUTE"; titel?: string } | null;
}

/** REQ-215: Rückgabe der Server Action „Warnzeichen prüfen“. */
export type RegelPruefState = {
  fehler?: string;
  feldFehler?: Record<string, string[] | undefined>;
  /** Bereits serverseitig nach Rolle gefiltert (REQ-213). */
  ergebnis?: GefiltertesErgebnis;
  fallback?: NotfallFallback;
  /** S-1: Mindestens eine Angabe wurde verworfen – nie „keine Warnzeichen“ melden. */
  unvollstaendig?: boolean;
  /** H-1: Profil nicht zugänglich/unbekannt – ohne Alter geprüft. */
  profilUnbekannt?: boolean;
};

export const leererRegelPruefState: RegelPruefState = {};

/**
 * Formulardaten → Rohdaten für `pruefeRegelEingabe` (core). Rein und testbar.
 * B2: Alle Werte werden übernommen – auch mehrfach übermittelte Felder und eingeschleuste
 * unbekannte IDs –, damit die Prüfung sie konservativ zusammenführt bzw. meldet statt
 * still den letzten Wert zu nehmen. Das Alter ist bewusst kein Formularfeld (REQ-204).
 */
export function regelEingabeAusFormData(formData: FormData): RegelEingabeRoh {
  const messwerte: [string, unknown][] = [];
  const antworten: [string, unknown][] = [];
  for (const [schluessel, wert] of formData.entries()) {
    const text = typeof wert === "string" ? wert : null;
    if (schluessel.startsWith("messwert.")) messwerte.push([schluessel.slice(9), text]);
    if (schluessel.startsWith("antwort.")) antworten.push([schluessel.slice(8), text]);
  }
  // S4: jeder nicht leere Wert gilt als „seelische Beschwerden“ (konservativ).
  const psychisch = formData.getAll("psychisch").some((v) => typeof v !== "string" || v.trim() !== "");
  return { symptome: formData.getAll("symptom"), messwerte, antworten, psychisch };
}

/** Grober Krisenverdacht aus den Rohdaten – nur für den Fallback (S5), konservativ. */
export function krisenVerdacht(roh: RegelEingabeRoh): boolean {
  return Boolean(roh.psychisch) || roh.antworten.length > 0;
}

/**
 * S-2: Krisenverdacht direkt aus FormData – auch wenn die Aufbereitung selbst scheitert.
 * Jede Krisenantwort oder ein nicht leeres Feld „psychisch“ zählt. Wirft nie.
 */
export function krisenVerdachtAusFormData(formData: FormData): boolean {
  try {
    for (const [schluessel, wert] of formData.entries()) {
      if (schluessel.startsWith("antwort.")) return true;
      if (schluessel === "psychisch" && !(typeof wert === "string" && wert.trim() === "")) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** S-2/REQ-220: Zustand, wenn die Prüfung nicht durchgeführt werden konnte. */
export function fehlgeschlagenState(krise: boolean): RegelPruefState {
  return {
    fehler: "Die Prüfung ist fehlgeschlagen. Bitte bei Beschwerden ärztlichen Rat einholen.",
    fallback: {
      krise,
      notfall: { dringlichkeit: "NOTFALL", zeitrahmen: "SOFORT", titel: "Prüfung fehlgeschlagen – im Notfall Notruf 112" },
    },
  };
}
