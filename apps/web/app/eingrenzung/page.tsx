import { initialen, profilKurzname, sicheresAlter } from "@medassist/core";
import { Hinweis, Panel, ProfilAuswahl, ProfilChip } from "@medassist/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { stichtagHeute } from "@/lib/profile/format";
import { ladeProfilFuerRegeln, ladeZugaenglicheProfile } from "@/lib/profile/zugriff";
import { starteFall } from "./actions";
import { ProfilZeile } from "./fall-ansicht";

export const dynamic = "force-dynamic";

/**
 * REQ-304: Start der geführten Eingrenzung – Profil wählen (nur zugängliche Profile,
 * REQ-115; fremde/unbekannte ID ⇒ 404), dann „körperlich“ oder „seelisch/psychisch“.
 */
export default async function EingrenzungStart({ searchParams }: { searchParams: Promise<{ profil?: string | string[] }> }) {
  const { nutzer } = await requireUser();
  const { profil: profilParam } = await searchParams;
  const stichtag = stichtagHeute();

  if (profilParam !== undefined) {
    const p = typeof profilParam === "string" ? await ladeProfilFuerRegeln(nutzer, profilParam) : null;
    if (!p) notFound();
    return (
      <section className="stack">
        <h1>Beschwerden eingrenzen</h1>
        <ProfilZeile
          profil={{
            name: `${p.vorname} ${p.nachname}`,
            initialen: initialen(p.vorname, p.nachname),
            alter: sicheresAlter(p.geburtsdatum, stichtag)?.anzeige ?? "Alter unbekannt",
            istKinderprofil: p.istKinderprofil,
          }}
        />
        <form action={starteFall} className="stack">
          <input type="hidden" name="profilId" value={p.id} />
          <h2>Worum geht es?</h2>
          <div className="grid">
            <button className="entry-option" type="submit" name="art" value="KOERPERLICH">
              <strong className="entry-title">Körperlich</strong>
              <span className="text-soft">Schmerzen, Haut, Fieber oder andere körperliche Beschwerden. Sie wählen die Körperstelle, dann folgen kurze Fragen.</span>
              <span className="methods">
                <span className="method-tag">Warnzeichen</span>
                <span className="method-tag">Körperkarte</span>
                <span className="method-tag">Fragen</span>
              </span>
            </button>
            <button className="entry-option" type="submit" name="art" value="PSYCHISCH">
              <strong className="entry-title">Seelisch / psychisch</strong>
              <span className="text-soft">Stimmung, Antrieb, Schlaf, Ängste oder Belastung. Zuerst kommen einige Fragen zu Ihrer Sicherheit.</span>
              <span className="methods">
                <span className="method-tag">Sicherheit</span>
                <span className="method-tag">Fragen</span>
              </span>
            </button>
          </div>
        </form>
        <Hinweis titel="Prototyp – keine medizinische Beratung.">
          Die Fragen sind eigene, fachlich ungeprüfte Formulierungen. Bitte nur Testdaten eingeben. Im Notfall immer den
          Notruf 112 wählen.
        </Hinweis>
        <p>
          <Link href="/eingrenzung">Anderes Profil wählen</Link>
        </p>
      </section>
    );
  }

  const profile = await ladeZugaenglicheProfile(nutzer);
  return (
    <section className="stack">
      <h1>Beschwerden eingrenzen</h1>
      <Panel titel="Für wen ist die Untersuchung?">
        {profile.length ? (
          <form method="get" action="/eingrenzung">
            <ProfilAuswahl label="Profil wählen">
              {profile.map((p) => (
                <ProfilChip
                  key={p.id}
                  name="profil"
                  value={p.id}
                  initialen={initialen(p.vorname, p.nachname)}
                  kind={p.istKinderprofil}
                  bezeichnung={nutzer.rolle === "ARZT" ? `${p.vorname} ${p.nachname}` : profilKurzname(p, stichtag)}
                />
              ))}
            </ProfilAuswahl>
          </form>
        ) : (
          <Hinweis>
            Noch kein Profil vorhanden.{" "}
            <Link href={nutzer.rolle === "ARZT" ? "/arzt/patienten/neu" : "/profile"}>Zuerst ein Profil anlegen</Link>.
          </Hinweis>
        )}
      </Panel>
      <p>
        <Link href="/faelle">{nutzer.rolle === "ARZT" ? "Bisherige Fälle" : "Meine bisherigen Fälle"}</Link>
      </p>
    </section>
  );
}
