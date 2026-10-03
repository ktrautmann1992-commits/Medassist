"use client";

import { FehlerAnsicht } from "../../fehler-ansicht";

/** QA N2: Fehlergrenze mit statischem Notfall- und Krisenhinweis (REQ-220). */
export default function Fehler({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <FehlerAnsicht reset={reset} />;
}
