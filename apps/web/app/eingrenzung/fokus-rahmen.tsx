"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * REQ-307: Rahmen für Krisen-/Notfallhinweise ganz oben. Ist ein Hinweis neu oder höher
 * eingestuft, erhält er beim Laden den Fokus (Screenreader, Tastatur).
 */
export function FokusRahmen({ fokus, children }: { fokus: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fokus) ref.current?.focus();
  }, [fokus]);
  return (
    <div ref={ref} tabIndex={-1} className="stack" data-testid="vorrang-hinweise">
      {children}
    </div>
  );
}
