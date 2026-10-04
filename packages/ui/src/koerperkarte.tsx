import type { Ansicht, Form } from "@medassist/core";
import type { KeyboardEvent } from "react";

/**
 * REQ-309: Interaktive Körperkarte (SVG, vorne/hinten) mit gleichwertiger Listen-Alternative.
 * Gesteuerte Komponente ohne eigenen Zustand – Auswahl und Ansicht kommen von außen.
 * Barrierefreiheit: jede Region ist ein benanntes Bedienelement (`role="button"`,
 * `aria-label`, `aria-pressed`, Enter/Leertaste, sichtbarer Fokus); die Liste besteht aus
 * Optionsfeldern (≥ 48 px) und funktioniert auch ohne JavaScript. Ausgewählt = Rosé
 * (Auswahl, nie Warnung); nur Klassen/Variablen aus `style.css`.
 */
export interface KoerperkarteRegion {
  id: string;
  bezeichnung: string;
  fachbegriff: string | null;
  formen: Readonly<Record<Ansicht, readonly Form[]>>;
}

export interface KoerperkarteProps {
  regionen: readonly KoerperkarteRegion[];
  viewBox: { breite: number; hoehe: number };
  ansicht: Ansicht;
  ausgewaehlt: string | null;
  /** Formularfeld der Listen-Alternative (Optionsfelder). */
  name: string;
  onAnsicht?: (ansicht: Ansicht) => void;
  onWaehlen?: (regionId: string) => void;
  /** Fehlermeldung (z. B. „Bitte eine Körperregion wählen“). */
  fehler?: string;
}

const ANSICHT_TEXT: Record<Ansicht, string> = { vorne: "Vorderseite", hinten: "Rückseite" };

function FormElement({ form }: { form: Form }) {
  if ("ellipse" in form) return <ellipse cx={form.ellipse.cx} cy={form.ellipse.cy} rx={form.ellipse.rx} ry={form.ellipse.ry} />;
  if ("rechteck" in form) {
    const r = form.rechteck;
    return <rect x={r.x} y={r.y} width={r.breite} height={r.hoehe} rx={r.radius} />;
  }
  return <polygon points={form.polygon.map(([x, y]) => `${x},${y}`).join(" ")} />;
}

export function regionName(r: { bezeichnung: string; fachbegriff: string | null }): string {
  return r.fachbegriff ? `${r.bezeichnung} (${r.fachbegriff})` : r.bezeichnung;
}

export function Koerperkarte({ regionen, viewBox, ansicht, ausgewaehlt, name, onAnsicht, onWaehlen, fehler }: KoerperkarteProps) {
  const sichtbar = regionen.filter((r) => r.formen[ansicht].length > 0);
  const tastatur = (id: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onWaehlen?.(id);
    }
  };
  // Vorderansicht: Blick auf die Person – ihre rechte Seite ist links im Bild.
  const [links, rechts] = ansicht === "vorne" ? ["rechts", "links"] : ["links", "rechts"];
  const fehlerId = `${name}-fehler`;
  return (
    <div className="body-map stack" data-testid="koerperkarte">
      <div className="view-switch" role="group" aria-label="Ansicht der Körperkarte">
        {(["vorne", "hinten"] as const).map((a) => (
          <button key={a} type="button" className="btn btn-secondary" aria-pressed={ansicht === a} onClick={() => onAnsicht?.(a)}>
            {ANSICHT_TEXT[a]}
          </button>
        ))}
      </div>
      <div className="body-map-figure">
        <svg
          className="body-map-svg"
          viewBox={`0 0 ${viewBox.breite} ${viewBox.hoehe}`}
          role="group"
          aria-label={`Körperkarte, ${ANSICHT_TEXT[ansicht]}`}
          data-ansicht={ansicht}
        >
          <text className="body-map-seite" x={4} y={14} aria-hidden="true">
            {links}
          </text>
          <text className="body-map-seite" x={viewBox.breite - 4} y={14} textAnchor="end" aria-hidden="true">
            {rechts}
          </text>
          {sichtbar.map((r) => (
            <g
              key={r.id}
              className="body-region"
              role="button"
              tabIndex={0}
              aria-label={regionName(r)}
              aria-pressed={ausgewaehlt === r.id}
              data-region={r.id}
              onClick={() => onWaehlen?.(r.id)}
              onKeyDown={tastatur(r.id)}
            >
              {r.formen[ansicht].map((f, i) => (
                <FormElement key={i} form={f} />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <fieldset className="form-section stack" aria-describedby={fehler ? fehlerId : undefined}>
        <legend>Oder aus der Liste wählen</legend>
        {fehler && (
          <p className="error" id={fehlerId}>
            {fehler}
          </p>
        )}
        <div className="choice-list" data-testid="regionen-liste">
          {regionen.map((r) => (
            <label key={r.id} className="check-row" htmlFor={`${name}-${r.id}`}>
              <input
                type="radio"
                id={`${name}-${r.id}`}
                name={name}
                value={r.id}
                checked={ausgewaehlt === r.id}
                onChange={() => onWaehlen?.(r.id)}
                aria-invalid={fehler ? true : undefined}
              />
              <span>
                {r.bezeichnung}
                {r.fachbegriff && (
                  <>
                    {" "}
                    (<span className="term">{r.fachbegriff}</span>)
                  </>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
