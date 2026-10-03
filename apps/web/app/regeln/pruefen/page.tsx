import { initialen, profilKurzname, sicheresAlter, standardRegelwerk } from "@medassist/core";
import { Hinweis, Panel, ProfilAuswahl, ProfilChip } from "@medassist/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { stichtagHeute } from "@/lib/profile/format";
import { ladeProfilFuerRegeln, ladeZugaenglicheProfile } from "@/lib/profile/zugriff";
import { DemoBeratungsHinweis, PruefenFormular } from "./pruefen-formular";

export const dynamic = "force-dynamic";

/**
 * REQ-215: Demo-Seite „Warnzeichen prüfen“. Profilwahl nur aus zugänglichen Profilen
 * (REQ-115); eine fremde oder unbekannte Profil-ID ergibt 404.
 */
export default async function WarnzeichenPruefen({ searchParams }: { searchParams: Promise<{ profil?: string | string[] }> }) {
  const { nutzer } = await requireUser();
  const { profil: profilParam } = await searchParams;
  const stichtag = stichtagHeute();

  if (profilParam !== undefined) {
    const profil = typeof profilParam === "string" ? await ladeProfilFuerRegeln(nutzer, profilParam) : null;
    if (!profil) notFound();
    const w = standardRegelwerk();
    return (
      <PruefenFormular
        rolle={nutzer.rolle}
        profil={{
          id: profil.id,
          name: `${profil.vorname} ${profil.nachname}`,
          initialen: initialen(profil.vorname, profil.nachname),
          alter: sicheresAlter(profil.geburtsdatum, stichtag)?.anzeige ?? "Alter unbekannt",
          istKinderprofil: profil.istKinderprofil,
        }}
        symptome={[...w.symptome.values()]}
        messwerte={[...w.messwerte.values()].map((m) => ({ id: m.id, bezeichnung: m.bezeichnung, einheit: m.einheit, min: m.plausibel.min, max: m.plausibel.max, status: m.plausibelStatus }))}
        // Arzt: Fremdanamnese (S6); Kinderprofile: Sorgeberechtigte beantworten die Fragen über das Kind.
        fragen={w.fragen.map((f) => ({
          id: f.id,
          text: nutzer.rolle === "ARZT" ? f.textFremd : profil.istKinderprofil ? f.textKind : f.text,
        }))}
        fragenUngeprueft={w.fragenStatus !== "geprüft"}
        fragenHinweis={w.fragenHinweis}
        regelwerkVersion={w.version}
      />
    );
  }

  const profile = await ladeZugaenglicheProfile(nutzer);
  return (
    <section className="stack">
      <h1>Warnzeichen prüfen (Demo)</h1>
      <DemoBeratungsHinweis />
      <Panel titel="Für wen wird geprüft?">
        {profile.length ? (
          <form method="get" action="/regeln/pruefen">
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
    </section>
  );
}
