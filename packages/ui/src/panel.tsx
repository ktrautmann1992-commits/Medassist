import type { HTMLAttributes, ReactNode } from "react";

/** `standard` weiß, `rose` Marke (nie Warnung), `data` Messwerte/Befunde (Blau). */
export type PanelVariante = "standard" | "rose" | "data";

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  variante?: PanelVariante;
  titel?: ReactNode;
  /** Überschriftenebene des Titels (Standard: h2). */
  ebene?: 2 | 3;
  children?: ReactNode;
}

/** Karte/Abschnitt nach `docs/design-vorschau.html` (REQ-117). */
export function Panel({ variante = "standard", titel, ebene = 2, className, children, ...rest }: PanelProps) {
  const klassen = ["panel", variante !== "standard" && `panel-${variante}`, "stack", className].filter(Boolean).join(" ");
  const Ueberschrift = ebene === 2 ? "h2" : "h3";
  return (
    <section className={klassen} {...rest}>
      {titel && <Ueberschrift>{titel}</Ueberschrift>}
      {children}
    </section>
  );
}
