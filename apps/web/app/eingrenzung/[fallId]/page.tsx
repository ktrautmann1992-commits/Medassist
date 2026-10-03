import { fortschritt, naechsterSchritt, erlaubterSchritt, schrittId, vorherigerSchritt, type Schritt } from "@medassist/core";
import { KrisenKontakte, Panel, Schrittanzeige, UngeprueftKennzeichen } from "@medassist/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VorrangHinweise } from "@/app/regeln/pruefen/vorrang-hinweise";
import { requireUser } from "@/lib/auth/guards";
import { schrittAnsicht, VORRANG_ZIEL_ID } from "@/lib/eingrenzung/ansicht";
import { ladeFall } from "@/lib/eingrenzung/fall";
import { fallKontext } from "@/lib/eingrenzung/kontext";
import { FallZusammenfassung, ProfilZeile, UnvollstaendigHinweis } from "../fall-ansicht";
import { FokusRahmen } from "../fokus-rahmen";
import { NichtGespeichertHinweis, SchrittFormular } from "./schritt-formular";

export const dynamic = "force-dynamic";

/**
 * REQ-305 – REQ-312, REQ-315, REQ-316: Assistent der geführten Eingrenzung. Fremde oder
 * unbekannte Fall-IDs ⇒ 404. Der Schritt ergibt sich aus den gespeicherten Eingaben;
 * `?schritt=` wird nur für erlaubte (frühere, bearbeitbare) Schritte übernommen.
 */
export default async function Eingrenzung({
  params,
  searchParams,
}: {
  params: Promise<{ fallId: string }>;
  searchParams: Promise<{ schritt?: string | string[]; hinweis?: string | string[] }>;
}) {
  const { nutzer } = await requireUser();
  const { fallId } = await params;
  const { schritt: angefragt, hinweis } = await searchParams;
  const fall = await ladeFall(nutzer, fallId);
  if (!fall) notFound();

  const ctx = fallKontext(nutzer, fall);
  const { bewertung: b, kataloge } = ctx;
  let schritt: Schritt = naechsterSchritt(kataloge, b.stand);
  if (fall.abgeschlossenAm && schritt.art !== "beendet") schritt = { art: "zusammenfassung" };
  if (!fall.abgeschlossenAm && typeof angefragt === "string") schritt = erlaubterSchritt(kataloge, b.stand, angefragt) ?? schritt;

  const id = schrittId(schritt);
  const ansicht = schrittAnsicht(kataloge, ctx.regelwerk, fall.bereich, schritt, b.gesammelt, nutzer.rolle, fall.profil.istKinderprofil);
  const zurueck = vorherigerSchritt(kataloge, b.stand, id);
  const pos = fortschritt(kataloge, b.stand, id);
  const fertig = schritt.art === "zusammenfassung" || schritt.art === "beendet";

  return (
    <section className="stack">
      {/* REQ-307/REQ-210: Krisen- und Notfallhinweise vor allen anderen Inhalten */}
      <FokusRahmen fokus={hinweis === "neu"}>
        <VorrangHinweise state={b.state ?? {}} rolle={nutzer.rolle} />
        {b.unvollstaendig && <UnvollstaendigHinweis />}
      </FokusRahmen>
      {/* QA R3-B2: Ziel für Hinweise aus dem Formular (Speichern fehlgeschlagen) – vor der Überschrift */}
      <div id={VORRANG_ZIEL_ID} style={{ display: "contents" }} />
      {!fertig && <NichtGespeichertHinweis fallId={fall.id} />}

      <h1>{schritt.art === "beendet" ? "Ablauf beendet" : fertig ? "Zusammenfassung" : "Beschwerden eingrenzen"}</h1>
      <ProfilZeile profil={ctx.profilKopf} art={fall.bereich} />
      {!fertig && pos && <Schrittanzeige nummer={pos.nummer} gesamt={pos.gesamt} />}
      {!fertig && ctx.fragenUngeprueft && (
        <p className="text-soft" style={{ margin: 0 }}>
          <UngeprueftKennzeichen text="Fragen ungeprüft" /> Eigene Formulierungen des Prototyps – keine medizinische Beratung.
          Bitte nur Testdaten eingeben.
        </p>
      )}

      {schritt.art === "beendet" && (
        // REQ-208/REQ-311: kein weiterer Diagnose-Ablauf
        <Panel titel="Kein weiterer Ablauf" data-testid="ablauf-beendet">
          <p>
            Wegen des Krisenhinweises werden keine weiteren Fragen angeboten. Bitte nutzen Sie die oben genannten
            Hilfsangebote.
          </p>
          <Link className="btn btn-secondary" href="/faelle">
            Zur Fallübersicht
          </Link>
        </Panel>
      )}

      {schritt.art === "zusammenfassung" && (
        <>
          <FallZusammenfassung
            abschnitte={ctx.zusammenfassung}
            state={b.state}
            unvollstaendig={b.unvollstaendig}
            rolle={nutzer.rolle}
            katalogVersion={fall.katalogVersion ?? kataloge.version}
            fragenUngeprueft={ctx.fragenUngeprueft}
            abgeschlossen
            kopf={<p style={{ margin: 0 }}>Der Fall ist gespeichert.</p>}
          />
          <div className="actions">
            <Link className="btn btn-primary" href="/faelle">
              Zur Fallübersicht
            </Link>
          </div>
        </>
      )}

      {ansicht && (
        <SchrittFormular
          // Neuer Schritt bzw. neue Eingabe ⇒ frisches Formular
          // QA N5: nur vom Schritt abhängig – Fehlermeldungen bleiben nach refresh() erhalten
          key={id}
          fallId={fall.id}
          bereich={fall.bereich}
          rolle={nutzer.rolle}
          schrittId={id}
          ansicht={ansicht}
          zurueckHref={zurueck ? `/eingrenzung/${fall.id}?schritt=${encodeURIComponent(zurueck)}` : null}
        />
      )}

      {fall.bereich === "PSYCHISCH" && <KrisenKontakte />}
    </section>
  );
}
