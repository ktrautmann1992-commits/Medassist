"use client";

import { Krisenhinweis, Notfallhinweis } from "@medassist/ui";
import { useEffect, useRef } from "react";

/**
 * QA N2/REQ-220: Fehlerseite mit **statischem** Notfall- und Krisenhinweis – auch wenn eine
 * Seite oder Aktion unerwartet scheitert, bleibt der Weg zu Hilfe sichtbar. Die Nummern kommen
 * aus `packages/core` (über die Komponenten). Keine Fehlerdetails an Nutzer.
 */
export function FehlerAnsicht({ reset }: { reset?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <section className="stack" data-testid="fehlerseite">
      <div ref={ref} tabIndex={-1} className="stack">
        <Notfallhinweis stufe="NOTFALL" titel="Ein Fehler ist aufgetreten – im Notfall Notruf 112" id="notfallhinweis">
          <p>Ihre letzte Angabe wurde möglicherweise nicht gespeichert.</p>
        </Notfallhinweis>
        <Krisenhinweis id="krisenhinweis" />
      </div>
      <h1>Etwas ist schiefgelaufen</h1>
      <p>Bitte versuchen Sie es erneut. Wenn Sie in einer Krise sind oder es ein Notfall ist, nutzen Sie die oben genannten Nummern.</p>
      {reset && (
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={reset}>
            Erneut versuchen
          </button>
        </div>
      )}
    </section>
  );
}
