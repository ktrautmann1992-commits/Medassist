import { initialen, korrigiertesAlterAnzeige, sicheresAlter } from "@medassist/core";
import { Avatar } from "@medassist/ui";
import { datumAus, datumDe, stichtagHeute } from "@/lib/profile/format";

export interface ProfilKopfProps {
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  istKinderprofil: boolean;
  istEigenesProfil?: boolean;
  sswWochen?: number | null;
  sswTage?: number | null;
  /** Überschrift (Standard: Name). */
  titel?: string;
}

/**
 * Kopf einer Profilseite: Avatar (Kind blau), Name, Profilart als Text (nicht nur
 * Farbe), berechnetes Alter und ggf. korrigiertes Alter (REQ-105, REQ-108, RISK-019).
 */
export function ProfilKopf(p: ProfilKopfProps) {
  const stichtag = stichtagHeute();
  const geburt = datumAus(p.geburtsdatum);
  const alter = sicheresAlter(geburt, stichtag);
  const korrigiert = p.istKinderprofil ? korrigiertesAlterAnzeige(geburt, p.sswWochen ?? null, p.sswTage ?? null, stichtag) : null;
  return (
    <div className="stack">
      <div className="profile-row">
        <Avatar initialen={initialen(p.vorname, p.nachname)} kind={p.istKinderprofil} />
        <h1 className="profile-name" style={{ margin: 0 }}>
          {p.titel ?? `${p.vorname} ${p.nachname}`}
        </h1>
        {p.istKinderprofil ? <span className="badge">Kinderprofil</span> : p.istEigenesProfil ? <span className="badge">Eigenes Profil</span> : null}
      </div>
      <p style={{ margin: 0 }}>
        Geboren am <span className="num">{datumDe(p.geburtsdatum)}</span> · Alter:{" "}
        <strong data-testid="alter">{alter ? alter.anzeige : "unbekannt"}</strong>
      </p>
      {korrigiert && korrigiert.art !== "keine" && (
        <p style={{ margin: 0 }} data-testid="korrigiertes-alter">
          {korrigiert.text}
        </p>
      )}
    </div>
  );
}
