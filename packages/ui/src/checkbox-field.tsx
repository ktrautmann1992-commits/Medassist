import type { InputHTMLAttributes, ReactNode } from "react";
import { FeldMeldungen, feldBeschreibung } from "./feld-hilfen";

export interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  id: string;
  label: ReactNode;
  hinweis?: ReactNode;
  fehler?: string;
}

/** Checkbox in einer mind. 48 px hohen, vollständig anklickbaren Zeile (REQ-117). */
export function CheckboxField({ id, label, hinweis, fehler, ...input }: CheckboxFieldProps) {
  return (
    <div className={fehler ? "field has-error" : "field"}>
      <label className="check-row" htmlFor={id}>
        <input id={id} type="checkbox" {...feldBeschreibung(id, hinweis, fehler)} {...input} />
        <span>{label}</span>
      </label>
      <FeldMeldungen id={id} hinweis={hinweis} fehler={fehler} />
    </div>
  );
}
