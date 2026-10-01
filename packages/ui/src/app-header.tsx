import type { ReactNode } from "react";
import { DemoHinweis } from "./demo-hinweis";

export interface AppHeaderProps {
  /** Ziel des Marken-Links. */
  href?: string;
  /** Zusätzliche Elemente rechts (z. B. Abmelden). */
  children?: ReactNode;
}

/** Kopfzeile mit Marke und Demo-Hinweis (REQ-001). */
export function AppHeader({ href = "/", children }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="container">
        <a className="brand" href={href}>
          <span className="brand-mark" aria-hidden="true" />
          MedAssist
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <DemoHinweis />
          {children}
        </div>
      </div>
    </header>
  );
}
