import type { DringlichkeitStufe } from "@medassist/core";
import type { ReactNode } from "react";

/**
 * REQ-214: Dringlichkeit nach `docs/design-vorschau.html` – Farbe (`.urgency-*`)
 * **plus** Symbol **plus** Text, nie nur Farbe (CLAUDE.md §13). Rosé ist nie Warnfarbe.
 */
export const DRINGLICHKEIT_DARSTELLUNG: Record<
  DringlichkeitStufe,
  { klasse: string; symbol: string; stufe: string; titel: string }
> = {
  NOTFALL: { klasse: "urgency-emergency", symbol: "⚠", stufe: "Notfall", titel: "Sofort Notruf 112" },
  DRINGEND: { klasse: "urgency-urgent", symbol: "!", stufe: "Dringend", titel: "Heute ärztlich abklären" },
  ROUTINE: { klasse: "urgency-routine", symbol: "i", stufe: "Routine", titel: "In den nächsten Tagen" },
  BEOBACHTEN: { klasse: "urgency-ok", symbol: "✓", stufe: "Beobachten", titel: "Beobachten" },
};

export interface DringlichkeitProps {
  stufe: DringlichkeitStufe;
  /** Überschrift; Standard je Stufe (z. B. „Sofort Notruf 112“). */
  titel?: ReactNode;
  /** `alert` für Notfall-/Krisenhinweise, die sofort angesagt werden sollen. */
  role?: "alert" | "status";
  id?: string;
  children?: ReactNode;
}

export function Dringlichkeit({ stufe, titel, role, id, children }: DringlichkeitProps) {
  const d = DRINGLICHKEIT_DARSTELLUNG[stufe];
  return (
    <div className={`urgency ${d.klasse}`} role={role} id={id} data-dringlichkeit={stufe}>
      <span className="icon" aria-hidden="true">
        {d.symbol}
      </span>
      <div>
        <span className="urgency-stufe">Dringlichkeit: {d.stufe}</span>
        <strong>{titel ?? d.titel}</strong>
        {children}
      </div>
    </div>
  );
}

export interface UngeprueftKennzeichenProps {
  /** Standard: „Regel ungeprüft“. */
  text?: string;
}

/** REQ-214, RISK-025: Kennzeichnung ungeprüfter Inhalte – Symbol und Text, neutral (keine Warn- oder Markenfarbe). */
export function UngeprueftKennzeichen({ text = "Regel ungeprüft" }: UngeprueftKennzeichenProps) {
  return (
    <span className="badge badge-ungeprueft">
      <span aria-hidden="true">?</span> {text}
    </span>
  );
}
