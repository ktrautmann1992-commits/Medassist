import type { ReactNode } from "react";
import { DemoHinweis } from "./demo-hinweis";

export interface AppHeaderProps {
  /** Ziel des Marken-Links. */
  href?: string;
  /** Zusätzliche Elemente rechts neben dem Demo-Hinweis. */
  children?: ReactNode;
  /** Hauptnavigation (zweite Zeile), nur für angemeldete Nutzer (REQ-118). */
  navigation?: ReactNode;
}

/** Kopfzeile mit Marke, Demo-Hinweis (REQ-001) und optionaler Navigation. */
export function AppHeader({ href = "/", children, navigation }: AppHeaderProps) {
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
      {navigation && (
        <nav className="app-nav" aria-label="Hauptnavigation">
          <div className="container">{navigation}</div>
        </nav>
      )}
    </header>
  );
}
