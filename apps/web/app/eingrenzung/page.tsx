import {
  altersbereichText,
  initialen,
  profilKurzname,
  pruefeEntwicklungsZulaessigkeit,
  sicheresAlter,
  standardFragenkataloge,
  verfuegbareBereiche,
} from "@medassist/core";
import { Hinweis, Panel, ProfilAuswahl, ProfilChip } from "@medassist/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { stichtagHeute } from "@/lib/profile/format";
import { ladeProfilFuerRegeln, ladeZugaenglicheProfile } from "@/lib/profile/zugriff";
import { starteFall } from "./actions";
import { ProfilZeile } from "./fall-ansicht";

export const dynamic = "force-dynamic";

type Profil = NonNullable<Awaited<ReturnType<typeof ladeProfilFuerRegeln>>>;

function profilKopf(p: Profil, stichtag: Date, entwicklungsalter?: string) {
  return {
    name: `${p.vorname} ${p.nachname}`,
    initialen: initialen(p.vorname, p.nachname),
    alter: sicheresAlter(p.geburtsdatum, stichtag)?.anzeige ?? "Alter unbekannt",
    istKinderprofil: p.istKinderprofil,
    ...(entwicklungsalter ? { entwicklungsalter } : {}),
  };
}

/**
 * REQ-322, REQ-329: Einstieg in den Entwicklungs-Check – nur für Kinderprofile (sonst 404).
 * Nennt (korrigiertes) Entwicklungsalter und den Altersbereich des Demo-Katalogs; außerhalb
 * freundlicher Hinweis ohne Start (der Server lehnt den Start ebenfalls ab).
 */
function EntwicklungEinstieg({ p, stichtag }: { p: Profil; stichtag: Date }) {
  const katalog = standardFragenkataloge().entwicklung;
  const z = pruefeEntwicklungsZulaessigkeit(p, katalog, stichtag);
  if (!z.ok && z.grund === "kein_kinderprofil") notFound();
  const bereiche = z.ok ? verfuegbareBereiche(katalog, z.alter.monate) : [];
  return (
    <section className="stack">
      <h1>Entwicklung prüfen</h1>
      <ProfilZeile profil={profilKopf(p, stichtag, z.alter?.korrigiert ? z.alter.anzeige : undefined)} art="ENTWICKLUNG" />
      <Hinweis titel="Was der Entwicklungs-Check kann – und was nicht.">
        Sie beantworten kurze Beobachtungsfragen zu den Bereichen, die Sie auswählen. Das Ergebnis zeigt je Bereich, ob eine
        Abklärung in der Kinderarztpraxis sinnvoll ist. Kinder entwickeln sich unterschiedlich schnell – die normale Bandbreite
        ist groß. Die Software stellt keine Entwicklungsstörung fest und ersetzt keine Vorsorgeuntersuchung (U-Untersuchung).
      </Hinweis>
      <p className="text-soft" style={{ margin: 0 }} data-testid="katalog-alter">
        Demo-Katalog mit eigenen, fachlich ungeprüften Fragen für ein Alter von {altersbereichText(katalog.alter)}
        {z.alter?.korrigiert && " (bei Frühgeborenen bis 24 Monate nach dem korrigierten Alter)"}.
      </p>
      {z.ok ? (
        <form action={starteFall} className="stack">
          <input type="hidden" name="profilId" value={p.id} />
          <Panel titel="Bereiche für dieses Alter">
            <ul style={{ margin: 0 }}>
              {bereiche.map((b) => (
                <li key={b.id}>
                  <strong>{b.bezeichnung}</strong> – <span className="text-soft">{b.beschreibung}</span>
                </li>
              ))}
            </ul>
            <p className="text-soft" style={{ margin: 0 }}>
              Zuerst kommen Fragen zu Warnzeichen. Danach wählen Sie die Bereiche.
            </p>
          </Panel>
          <div className="actions">
            <button className="btn btn-primary" type="submit" name="art" value="ENTWICKLUNG">
              Entwicklungs-Check starten
            </button>
          </div>
        </form>
      ) : (
        <Hinweis titel={z.grund === "volljaehrig" ? "Der Entwicklungs-Check ist für Kinder und Jugendliche unter 18 Jahren." : "Für dieses Alter gibt es noch keine Demo-Fragen."}>
          <span data-testid="entwicklung-nicht-verfuegbar">
            Bitte wenden Sie sich mit Fragen zur Entwicklung an Ihre Kinderarztpraxis – zum Beispiel bei der nächsten
            Vorsorgeuntersuchung (U-Untersuchung). Bei Warnzeichen nutzen Sie „Beschwerden eingrenzen“, im Notfall den Notruf 112.
          </span>
        </Hinweis>
      )}
      <p>
        <Link href={`/eingrenzung?profil=${encodeURIComponent(p.id)}`}>Zurück zur Auswahl</Link>
      </p>
    </section>
  );
}

/**
 * REQ-304, REQ-329: Start – Profil wählen (nur zugängliche Profile, REQ-115; fremde/unbekannte
 * ID ⇒ 404), dann „körperlich“, „seelisch/psychisch“ oder – bei Kinderprofilen – „Entwicklung prüfen“.
 */
export default async function EingrenzungStart({ searchParams }: { searchParams: Promise<{ profil?: string | string[]; weg?: string | string[] }> }) {
  const { nutzer } = await requireUser();
  const { profil: profilParam, weg } = await searchParams;
  const stichtag = stichtagHeute();

  if (profilParam !== undefined) {
    const p = typeof profilParam === "string" ? await ladeProfilFuerRegeln(nutzer, profilParam) : null;
    if (!p) notFound();
    if (weg === "entwicklung") return <EntwicklungEinstieg p={p} stichtag={stichtag} />;
    return (
      <section className="stack">
        <h1>Beschwerden eingrenzen</h1>
        <ProfilZeile profil={profilKopf(p, stichtag)} />
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
            {p.istKinderprofil && (
              // REQ-329: Weg 3 nur für Kinderprofile (Zulässigkeit prüft die Einstiegsseite und der Server).
              <Link className="entry-option" href={`/eingrenzung?profil=${encodeURIComponent(p.id)}&weg=entwicklung`}>
                <strong className="entry-title">Entwicklung prüfen</strong>
                <span className="text-soft">Sprache, Bewegung, Verhalten: kurze Beobachtungsfragen und wann eine Abklärung sinnvoll ist.</span>
                <span className="methods">
                  <span className="method-tag">Warnzeichen</span>
                  <span className="method-tag">Bereiche</span>
                  <span className="method-tag">Fragen</span>
                </span>
              </Link>
            )}
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
