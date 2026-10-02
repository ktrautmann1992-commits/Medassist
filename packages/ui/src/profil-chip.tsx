import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Avatar } from "./avatar";

export interface ProfilChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  initialen: string;
  /** Sichtbarer Name, z. B. „Karsten M.“ oder „Lena, 4 Jahre“ (`name` bleibt das Formularfeld). */
  bezeichnung: string;
  /** Kinderprofil → blauer Avatar (CLAUDE.md §13, REQ-112). */
  kind?: boolean;
  /** Mit `href` wird der Chip ein Link (ohne `aria-pressed`). */
  href?: string;
  /** Nur für Schaltflächen: ausgewähltes Profil (`aria-pressed`). */
  ausgewaehlt?: boolean;
}

/**
 * Profil-Chip der Profil-Auswahl. Als Schaltfläche (`aria-pressed` = ausgewählt)
 * oder – mit `href` – als Link (z. B. „+ Kind hinzufügen“).
 */
export function ProfilChip({ initialen, bezeichnung, kind = false, href, ausgewaehlt, type = "submit", ...rest }: ProfilChipProps) {
  const inhalt = (
    <>
      <Avatar initialen={initialen} kind={kind} />
      {bezeichnung}
    </>
  );
  if (href !== undefined) {
    return (
      <a className="profile-chip" href={href}>
        {inhalt}
      </a>
    );
  }
  return (
    <button className="profile-chip" type={type} aria-pressed={ausgewaehlt ?? false} {...rest}>
      {inhalt}
    </button>
  );
}

export interface ProfilAuswahlProps {
  /** Zugängliche Beschriftung der Gruppe. */
  label: string;
  children?: ReactNode;
}

/** Gruppe von Profil-Chips („Für wen ist die Untersuchung?“). */
export function ProfilAuswahl({ label, children }: ProfilAuswahlProps) {
  return (
    <div className="profile-switch" role="group" aria-label={label}>
      {children}
    </div>
  );
}
