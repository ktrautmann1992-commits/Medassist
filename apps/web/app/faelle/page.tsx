import { initialen, sicheresAlter } from "@medassist/core";
import { Avatar, DringlichkeitKurz, EntwicklungsStatus, Hinweis, Panel } from "@medassist/ui";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { ladeFaelle } from "@/lib/eingrenzung/fall";
import { fallKontext } from "@/lib/eingrenzung/kontext";
import { stichtagHeute } from "@/lib/profile/format";
import { ART_TEXT } from "../eingrenzung/fall-ansicht";

export const dynamic = "force-dynamic";

const ZEIT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

/**
 * REQ-317: Fallübersicht – Patient: „Meine Fälle“ je Profil (eigenes Profil, Kinder);
 * Arzt: Fälle der eigenen Patienten. Nur Fälle zugänglicher Profile (REQ-316).
 */
export default async function Faelle() {
  const { nutzer } = await requireUser();
  const faelle = await ladeFaelle(nutzer);
  const stichtag = stichtagHeute();

  const gruppen = new Map<string, typeof faelle>();
  for (const f of faelle) gruppen.set(f.profil.id, [...(gruppen.get(f.profil.id) ?? []), f]);

  return (
    <section className="stack">
      <h1>{nutzer.rolle === "ARZT" ? "Fälle" : "Meine Fälle"}</h1>
      <div className="actions">
        <Link className="btn btn-primary" href="/eingrenzung">
          Neue Eingrenzung starten
        </Link>
      </div>
      {faelle.length === 0 && <Hinweis>Noch keine Fälle vorhanden.</Hinweis>}
      {[...gruppen.values()].map((liste) => {
        const p = liste[0]!.profil;
        return (
          <Panel
            key={p.id}
            data-testid="fall-gruppe"
            titel={
              <span className="profile-row">
                <Avatar initialen={initialen(p.vorname, p.nachname)} kind={p.istKinderprofil} />
                <span>
                  {p.vorname} {p.nachname}
                  <span className="text-soft">
                    {" "}
                    · {sicheresAlter(p.geburtsdatum, stichtag)?.anzeige ?? "Alter unbekannt"}
                    {p.istKinderprofil && " · Kinderprofil"}
                  </span>
                </span>
              </span>
            }
          >
            <ul className="fall-list">
              {liste.map((f) => {
                const { anzeige, entwicklung } = fallKontext(nutzer, f);
                const offen = anzeige.offen;
                const art = ART_TEXT[f.bereich];
                const datum = ZEIT.format(f.erstelltAm);
                return (
                  <li key={f.id} data-fall-id={f.id}>
                    <strong>{art}</strong>
                    <div className="fall-meta">
                      <span className="text-soft">{datum}</span>
                      <span data-testid="fall-status">Status: {anzeige.text}</span>
                      <DringlichkeitKurz stufe={anzeige.dringlichkeit} ohneStufe={anzeige.ohneDringlichkeit} />
                    </div>
                    {entwicklung?.art === "ergebnis" && (
                      // REQ-329: Kurzergebnis je Bereich (Symbol + Text)
                      <ul className="fall-meta" style={{ listStyle: "none", margin: 0, padding: 0 }} data-testid="entwicklung-kurz">
                        {entwicklung.ergebnis.bereiche.map((b) => (
                          <li key={b.id}>
                            {b.bezeichnung}: <EntwicklungsStatus einstufung={b.einstufung} />
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="actions">
                      <Link className="list-link" href={`/faelle/${f.id}`}>
                        Ansehen<span className="visually-hidden">: {art}, {datum}</span>
                      </Link>
                      {offen && (
                        <Link className="list-link" href={`/eingrenzung/${f.id}`}>
                          Fortsetzen<span className="visually-hidden">: {art}, {datum}</span>
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </section>
  );
}
