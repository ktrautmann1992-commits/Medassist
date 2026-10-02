import type { ReactNode } from "react";

export interface HinweisProps {
  titel?: ReactNode;
  /** `neutral` für Informationen, `data` für Hinweise zu Messwerten. Keine Warnfarben, kein Rosé. */
  variante?: "neutral" | "data";
  children?: ReactNode;
}

/**
 * Informationshinweis (z. B. „Perzentilen folgen …“). Mit Symbol und Text,
 * nicht nur über Farbe (CLAUDE.md §13). Für Dringlichkeit gibt es eigene
 * Komponenten (`.urgency`, Meilenstein 3).
 */
export function Hinweis({ titel, variante = "neutral", children }: HinweisProps) {
  return (
    <div className={variante === "data" ? "panel panel-data note" : "panel note"} role="note">
      <span className="note-icon" aria-hidden="true">
        i
      </span>
      <div>
        {titel && <strong>{titel} </strong>}
        {children}
      </div>
    </div>
  );
}
