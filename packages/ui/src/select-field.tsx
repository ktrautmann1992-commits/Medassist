import type { ReactNode, SelectHTMLAttributes } from "react";
import { FeldMeldungen, feldBeschreibung } from "./feld-hilfen";

export interface Option {
  wert: string;
  bezeichnung: string;
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: ReactNode;
  optionen: readonly Option[];
  /** Beschriftung einer leeren ersten Option (Wert ""), z. B. „Bitte wählen“. */
  leereOption?: string;
  hinweis?: ReactNode;
  fehler?: string;
}

/** Auswahlfeld mit Label und zugänglicher Fehlermeldung (REQ-117). */
export function SelectField({ id, label, optionen, leereOption, hinweis, fehler, ...select }: SelectFieldProps) {
  return (
    <div className={fehler ? "field has-error" : "field"}>
      <label htmlFor={id}>{label}</label>
      <select id={id} {...feldBeschreibung(id, hinweis, fehler)} {...select}>
        {leereOption !== undefined && <option value="">{leereOption}</option>}
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert}>
            {o.bezeichnung}
          </option>
        ))}
      </select>
      <FeldMeldungen id={id} hinweis={hinweis} fehler={fehler} />
    </div>
  );
}

/** Optionen aus einer Werteliste und einer Bezeichnungstabelle. */
export function optionenAus<T extends string>(werte: readonly T[], bezeichnung: Record<T, string>): Option[] {
  return werte.map((w) => ({ wert: w, bezeichnung: bezeichnung[w] }));
}
