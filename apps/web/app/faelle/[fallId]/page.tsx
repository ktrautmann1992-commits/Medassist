import { DringlichkeitKurz, KrisenKontakte } from "@medassist/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VorrangHinweise } from "@/app/regeln/pruefen/vorrang-hinweise";
import { requireUser } from "@/lib/auth/guards";
import { ladeFall } from "@/lib/eingrenzung/fall";
import { fallKontext } from "@/lib/eingrenzung/kontext";
import { FallZusammenfassung, ProfilZeile, UnvollstaendigHinweis } from "../../eingrenzung/fall-ansicht";
import { FokusRahmen } from "../../eingrenzung/fokus-rahmen";

export const dynamic = "force-dynamic";

/** REQ-317: Fall öffnen – Zusammenfassung, Krisen-/Notfallhinweis oben. Fremd/unbekannt ⇒ 404 (REQ-316). */
export default async function FallAnsicht({ params }: { params: Promise<{ fallId: string }> }) {
  const { nutzer } = await requireUser();
  const { fallId } = await params;
  const fall = await ladeFall(nutzer, fallId);
  if (!fall) notFound();
  const ctx = fallKontext(nutzer, fall);
  const b = ctx.bewertung;
  const offen = ctx.anzeige.offen;

  return (
    <section className="stack">
      <FokusRahmen fokus={false}>
        <VorrangHinweise state={b.state ?? {}} rolle={nutzer.rolle} />
        {b.unvollstaendig && <UnvollstaendigHinweis />}
      </FokusRahmen>
      <h1>Fall</h1>
      <ProfilZeile profil={ctx.profilKopf} art={fall.bereich} />
      <p className="fall-meta" style={{ margin: 0 }}>
        <span data-testid="fall-status">Status: {ctx.anzeige.text}</span>
        <DringlichkeitKurz stufe={ctx.anzeige.dringlichkeit} ohneStufe={ctx.anzeige.ohneDringlichkeit} />
      </p>
      {offen && (
        <div className="actions">
          <Link className="btn btn-primary" href={`/eingrenzung/${fall.id}`}>
            Fortsetzen
          </Link>
        </div>
      )}
      <FallZusammenfassung
        abschnitte={ctx.zusammenfassung}
        state={b.state}
        unvollstaendig={b.unvollstaendig}
        rolle={nutzer.rolle}
        katalogVersion={fall.katalogVersion ?? ctx.kataloge.version}
        fragenUngeprueft={ctx.fragenUngeprueft}
        abgeschlossen={Boolean(fall.abgeschlossenAm)}
      />
      {fall.bereich === "PSYCHISCH" && <KrisenKontakte />}
      <p>
        <Link href="/faelle">Zur Fallübersicht</Link>
      </p>
    </section>
  );
}
