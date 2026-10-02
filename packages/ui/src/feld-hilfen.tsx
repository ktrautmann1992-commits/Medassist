import type { ReactNode } from "react";

/** IDs für Hinweis und Fehlermeldung eines Feldes (für `aria-describedby`). */
export function feldBeschreibung(id: string, hinweis?: ReactNode, fehler?: string) {
  const ids = [hinweis ? `${id}-hinweis` : null, fehler ? `${id}-fehler` : null].filter(Boolean).join(" ");
  return {
    "aria-invalid": fehler ? (true as const) : undefined,
    "aria-describedby": ids || undefined,
  };
}

/** Hinweis- und Fehlerzeile unter einem Feld. */
export function FeldMeldungen({ id, hinweis, fehler }: { id: string; hinweis?: ReactNode; fehler?: string }) {
  return (
    <>
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
    </>
  );
}
