import { BERECHTIGUNGEN, ROLLEN_BEZEICHNUNG, hatBerechtigung, type Berechtigung } from "@medassist/core";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { abmelden } from "../(auth)/anmelden/actions";

export const dynamic = "force-dynamic";

const FUNKTIONEN: Partial<Record<Berechtigung, string>> = {
  "profil:eigenes:verwalten": "Eigenes Profil verwalten",
  "profil:kinder:verwalten": "Kinderprofile anlegen",
  "fall:teilen": "Fall mit Ärztin oder Arzt teilen",
  "diagnose:verdacht": "Mögliche Ursachen („Verdacht – ärztlich abzuklären“)",
  "patienten:verwalten": "Patienten verwalten",
  "fall:geteilte:einsehen": "Geteilte Fälle einsehen",
  "diagnose:differential": "Differentialdiagnosen mit ICD-10-GM",
  "therapieplan:voll": "Vollständiger Therapieplan",
  "medikation:empfehlen": "Medikationsplan mit Sicherheitsprüfungen",
};

export default async function Uebersicht() {
  // REQ-018: Rolle kommt aus der serverseitigen Sitzung, nicht aus dem Client.
  const { nutzer } = await requireUser();
  const approbation =
    nutzer.rolle === "ARZT"
      ? await db().approbationsnachweis.findUnique({ where: { nutzerId: nutzer.id }, select: { status: true } })
      : null;

  const funktionen = (Object.keys(BERECHTIGUNGEN) as Berechtigung[]).filter(
    (b) => FUNKTIONEN[b] && hatBerechtigung(nutzer.rolle, b),
  );

  return (
    <section className="stack">
      <h1>Übersicht</h1>
      <p>
        Angemeldet als <strong>{nutzer.email}</strong> · Rolle: <strong>{ROLLEN_BEZEICHNUNG[nutzer.rolle]}</strong>
      </p>
      {approbation?.status === "SIMULIERT" && (
        <div className="panel panel-rose" role="note">
          Approbationsnachweis: <strong>simuliert</strong> (Prototyp – keine echte Prüfung).
        </div>
      )}
      <div className="panel stack">
        <h2>Ihre Funktionen</h2>
        <p className="text-soft">Folgen in den nächsten Meilensteinen.</p>
        <ul>
          {funktionen.map((b) => (
            <li key={b}>{FUNKTIONEN[b]}</li>
          ))}
        </ul>
        {nutzer.rolle === "ARZT" && <Link href="/arzt/patienten">Zur Patientenliste</Link>}
      </div>
      <form action={abmelden}>
        <button type="submit" className="btn btn-secondary">
          Abmelden
        </button>
      </form>
    </section>
  );
}
