import type { InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hinweis?: string;
  fehler?: string;
}

/** Formularfeld mit Label, Hinweis und zugänglicher Fehlermeldung. */
export function Field({ id, label, hinweis, fehler, ...input }: FieldProps) {
  const beschreibung = [hinweis && `${id}-hinweis`, fehler && `${id}-fehler`].filter(Boolean).join(" ");
  return (
    <div className={fehler ? "field has-error" : "field"}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={beschreibung || undefined}
        {...input}
      />
      {hinweis && (
        <span className="hint" id={`${id}-hinweis`}>
          {hinweis}
        </span>
      )}
      {fehler && (
        <span className="error" id={`${id}-fehler`} role="alert">
          {fehler}
        </span>
      )}
    </div>
  );
}
