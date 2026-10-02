import type { ReactNode, TextareaHTMLAttributes } from "react";
import { FeldMeldungen, feldBeschreibung } from "./feld-hilfen";

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
  label: ReactNode;
  hinweis?: ReactNode;
  fehler?: string;
}

/** Mehrzeiliges Textfeld mit Label und zugänglicher Fehlermeldung (REQ-117). */
export function TextareaField({ id, label, hinweis, fehler, rows = 3, ...textarea }: TextareaFieldProps) {
  return (
    <div className={fehler ? "field has-error" : "field"}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={rows} {...feldBeschreibung(id, hinweis, fehler)} {...textarea} />
      <FeldMeldungen id={id} hinweis={hinweis} fehler={fehler} />
    </div>
  );
}
