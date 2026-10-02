import type { InputHTMLAttributes, ReactNode } from "react";
import { FeldMeldungen, feldBeschreibung } from "./feld-hilfen";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  /** Text oder Text mit Fachbegriff, z. B. `<>Vorerkrankungen (<span className="term">Anamnese</span>)</>`. */
  label: ReactNode;
  hinweis?: ReactNode;
  fehler?: string;
}

/** Formularfeld mit Label, Hinweis und zugänglicher Fehlermeldung (REQ-103, REQ-117). */
export function Field({ id, label, hinweis, fehler, ...input }: FieldProps) {
  return (
    <div className={fehler ? "field has-error" : "field"}>
      <label htmlFor={id}>{label}</label>
      <input id={id} {...feldBeschreibung(id, hinweis, fehler)} {...input} />
      <FeldMeldungen id={id} hinweis={hinweis} fehler={fehler} />
    </div>
  );
}
