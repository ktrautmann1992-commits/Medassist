import {
  BERECHTIGUNGEN,
  ROLLEN_BEZEICHNUNG,
  hatBerechtigung,
  initialen,
  profilKurzname,
  sicheresAlter,
  type Berechtigung,
} from "@medassist/core";
import { Panel, ProfilAuswahl, ProfilChip } from "@medassist/ui";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { zweiFaAktiv } from "@/lib/env";
import { stichtagHeute } from "@/lib/profile/format";
import { profilFilter } from "@/lib/profile/filter";
import { ladeZugaenglicheProfile } from "@/lib/profile/zugriff";

export const dynamic = "force-dynamic";

const FUNKTIONEN: Partial<Record<Berechtigung, string>> = {
  "fall:teilen": "Fall mit Ärztin oder Arzt teilen",
  "diagnose:verdacht": "Mögliche Ursachen („Verdacht – ärztlich abzuklären“)",
  "fall:geteilte:einsehen": "Geteilte Fälle einsehen",
  "diagnose:differential": "Differentialdiagnosen mit ICD-10-GM",
  "therapieplan:voll": "Vollständiger Therapieplan",
  "medikation:empfehlen": "Medikationsplan mit Sicherheitsprüfungen",
};

export default async function Uebersicht({ searchParams }: { searchParams: Promise<{ profil?: string | string[] }> }) {
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
      {!zweiFaAktiv() && (
        // Neutrales Panel: Rosé ist Markenfarbe, nie Warn-/Sicherheitshinweis (CLAUDE.md §13).
        <div className="panel" role="note">
          <strong>Testphase: Zwei-Faktor-Anmeldung deaktiviert.</strong> Vor der Verarbeitung echter Daten wird sie
          wieder verpflichtend (REQ-021).
        </div>
      )}
      {approbation?.status === "SIMULIERT" && (
        <div className="panel panel-rose" role="note">
          Approbationsnachweis: <strong>simuliert</strong> (Prototyp – keine echte Prüfung).
        </div>
      )}

      {nutzer.rolle === "PATIENT" ? (
        <ProfilWahl nutzer={nutzer} gewaehlt={(await searchParams).profil} />
      ) : (
        <ArztEinstieg nutzer={nutzer} />
      )}

      <Panel titel="Weitere Funktionen">
        <p className="text-soft">Folgen in den nächsten Meilensteinen.</p>
        <ul>
          {funktionen.map((b) => (
            <li key={b}>{FUNKTIONEN[b]}</li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}

type Nutzer = Awaited<ReturnType<typeof requireUser>>["nutzer"];

/** REQ-112: „Für wen ist die Untersuchung?“ – Auswahl nur aus zugänglichen Profilen. */
async function ProfilWahl({ nutzer, gewaehlt }: { nutzer: Nutzer; gewaehlt: string | string[] | undefined }) {
  const profile = await ladeZugaenglicheProfile(nutzer);
  const stichtag = stichtagHeute();
  const eigenes = profile.find((p) => p.istEigenesProfil);
  // Die ID aus der URL wird nur übernommen, wenn sie zu einem zugänglichen Profil gehört.
  const auswahl = profile.find((p) => p.id === gewaehlt) ?? eigenes ?? profile[0] ?? null;

  return (
    <Panel titel="Für wen ist die Untersuchung?">
      <form method="get" action="/start">
        <ProfilAuswahl label="Profil wählen">
          {profile.map((p) => (
            <ProfilChip
              key={p.id}
              name="profil"
              value={p.id}
              initialen={initialen(p.vorname, p.nachname)}
              kind={p.istKinderprofil}
              ausgewaehlt={auswahl?.id === p.id}
              bezeichnung={profilKurzname(p, stichtag)}
            />
          ))}
          {!eigenes && <ProfilChip href="/profile/neu" initialen="+" bezeichnung="Eigenes Profil anlegen" />}
          <ProfilChip href="/profile/kind/neu" initialen="+" bezeichnung="Kind hinzufügen" kind />
        </ProfilAuswahl>
      </form>
      {auswahl ? (
        <div className="stack" aria-live="polite">
          <p style={{ margin: 0 }} data-testid="auswahl">
            Ausgewählt: <strong>{`${auswahl.vorname} ${auswahl.nachname}`}</strong>
            {" · "}
            {sicheresAlter(auswahl.geburtsdatum, stichtag)?.anzeige ?? "Alter unbekannt"}
            {" · "}
            {auswahl.istKinderprofil ? "Kinderprofil" : auswahl.istEigenesProfil ? "Eigenes Profil" : "Profil"}
          </p>
          <div className="actions">
            {/* REQ-318: Einstieg in die geführte Eingrenzung mit dem ausgewählten Profil */}
            <Link className="btn btn-primary" href={`/eingrenzung?profil=${encodeURIComponent(auswahl.id)}`}>
              Beschwerden eingrenzen
            </Link>
            <Link className="btn btn-secondary" href={`/profile/${auswahl.id}`}>
              Profil ansehen
            </Link>
          </div>
          {auswahl.istKinderprofil && (
            // REQ-329: Entwicklungs-Check nur beim Kinderprofil (wie docs/design-vorschau.html)
            <div className="grid">
              <Link className="entry-option" href={`/eingrenzung?profil=${encodeURIComponent(auswahl.id)}&weg=entwicklung`}>
                <strong className="entry-title">Entwicklung prüfen</strong>
                <span className="text-soft">
                  Sprache, Bewegung, Verhalten: kurze Beobachtungsfragen für {auswahl.vorname} und wann eine Abklärung in der
                  Kinderarztpraxis sinnvoll ist.
                </span>
                <span className="methods">
                  <span className="method-tag">Sprache</span>
                  <span className="method-tag">Motorik</span>
                  <span className="method-tag">Verhalten</span>
                </span>
              </Link>
            </div>
          )}
          <p className="text-soft">Freie Beschreibung (Text, Sprache, Foto) folgt in einem nächsten Meilenstein.</p>
        </div>
      ) : (
        <p className="text-soft">Legen Sie zuerst Ihr eigenes Profil oder ein Kinderprofil an.</p>
      )}
    </Panel>
  );
}

async function ArztEinstieg({ nutzer }: { nutzer: Nutzer }) {
  const anzahl = await db().patientenprofil.count({ where: profilFilter(nutzer) });
  return (
    <Panel titel="Patienten">
      <p>
        {anzahl === 1 ? "1 Patientenprofil" : `${anzahl} Patientenprofile`} angelegt.
      </p>
      <div className="actions">
        <Link className="btn btn-primary" href="/arzt/patienten">
          Zur Patientenliste
        </Link>
        <Link className="btn btn-secondary" href="/arzt/patienten/neu">
          Patient anlegen
        </Link>
        <Link className="btn btn-secondary" href="/eingrenzung">
          Beschwerden eingrenzen
        </Link>
      </div>
    </Panel>
  );
}
