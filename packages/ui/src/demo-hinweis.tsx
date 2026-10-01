/** REQ-001: Pflichthinweis in jeder Ansicht. Text ist verbindlich (CLAUDE.md §1). */
export const DEMO_HINWEIS_TEXT = "Demo – nicht für den klinischen Einsatz";

export function DemoHinweis() {
  return (
    <span className="demo-flag" role="note">
      {DEMO_HINWEIS_TEXT}
    </span>
  );
}
