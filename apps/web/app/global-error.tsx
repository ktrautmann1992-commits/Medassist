"use client";

// REQ-004: auch die globale Fehlerseite nutzt die gemeinsamen Styles.
import "../../../styles/style.css";
import { AppHeader } from "@medassist/ui";
import { FehlerAnsicht } from "./fehler-ansicht";

/** QA N2: Globale Fehlergrenze (ersetzt das Root-Layout) – statischer Notfall- und Krisenhinweis. */
export default function GlobalerFehler({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body>
        {/* REQ-001: Demo-Hinweis auch hier */}
        <AppHeader />
        <main className="container stack" style={{ paddingBlock: "var(--space-6)" }}>
          <FehlerAnsicht reset={reset} />
        </main>
      </body>
    </html>
  );
}
