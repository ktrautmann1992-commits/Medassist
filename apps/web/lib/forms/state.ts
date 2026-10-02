/** Rückgabewert von Formular-Actions (siehe `useFormular`). */
export type FormState = {
  fehler?: string;
  feldFehler?: Record<string, string[] | undefined>;
  /** Prototyp: Bestätigungslink statt E-Mail-Versand (REQ-013). */
  verifizierungsLink?: string;
  erfolg?: string;
};

export const leererFormState: FormState = {};

/**
 * Fehlermeldungen je Feld. Der Schlüssel ist der vollständige Pfad mit Punkten,
 * z. B. `vorerkrankungen.1.icd10Code` – passend zu den Feldnamen der Formulare
 * (siehe `formDataZuObjekt`). Fehler ohne Pfad landen unter `_`.
 */
export function feldFehlerAus(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const fehler: Record<string, string[]> = {};
  for (const issue of issues) {
    const feld = issue.path.length ? issue.path.map(String).join(".") : "_";
    (fehler[feld] ??= []).push(issue.message);
  }
  return fehler;
}
