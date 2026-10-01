/** Rückgabewert von Formular-Actions (siehe `useFormular`). */
export type FormState = {
  fehler?: string;
  feldFehler?: Record<string, string[] | undefined>;
  /** Prototyp: Bestätigungslink statt E-Mail-Versand (REQ-013). */
  verifizierungsLink?: string;
  erfolg?: string;
};

export const leererFormState: FormState = {};

export function feldFehlerAus(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const fehler: Record<string, string[]> = {};
  for (const issue of issues) {
    const feld = String(issue.path[0] ?? "_");
    (fehler[feld] ??= []).push(issue.message);
  }
  return fehler;
}
