import { initialen, sicheresAlter } from "@medassist/core";
import { Avatar } from "@medassist/ui";
import Link from "next/link";
import { datumDe, isoDatum, stichtagHeute } from "@/lib/profile/format";
import type { ProfilUebersicht } from "@/lib/profile/zugriff";

/** Liste von Profilen mit Avatar (Kinder blau), Name, Alter und Profilart als Text (REQ-112, REQ-113). */
export function ProfilListe({ profile, leer }: { profile: readonly ProfilUebersicht[]; leer: string }) {
  if (profile.length === 0) return <p className="text-soft">{leer}</p>;
  const stichtag = stichtagHeute();
  return (
    <ul className="profile-list">
      {profile.map((p) => {
        const alter = sicheresAlter(p.geburtsdatum, stichtag);
        return (
          <li key={p.id} className="panel profile-row">
            <Avatar initialen={initialen(p.vorname, p.nachname)} kind={p.istKinderprofil} />
            <div className="profile-name">
              <Link className="list-link" href={`/profile/${p.id}`}>
                <strong>
                  {p.vorname} {p.nachname}
                </strong>
              </Link>
              <div className="text-soft">
                geb. {datumDe(isoDatum(p.geburtsdatum))} · {alter?.anzeige ?? "Alter unbekannt"}
                {p.istKinderprofil ? " · Kinderprofil" : p.istEigenesProfil ? " · Eigenes Profil" : ""}
              </div>
            </div>
            <Link className="btn btn-secondary" href={`/profile/${p.id}/bearbeiten`} aria-label={`${p.vorname} ${p.nachname} bearbeiten`}>
              Bearbeiten
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
