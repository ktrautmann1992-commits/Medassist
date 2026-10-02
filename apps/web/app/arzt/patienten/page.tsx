import { Button, Field } from "@medassist/ui";
import Link from "next/link";
import { requireBerechtigung } from "@/lib/auth/guards";
import { ladeZugaenglicheProfile } from "@/lib/profile/zugriff";
import { ProfilListe } from "../../profile/profil-liste";

export const dynamic = "force-dynamic";

/** REQ-113: Patientenliste des Arztes – nur selbst angelegte Profile (REQ-115). Patienten erhalten 403. */
export default async function PatientenListe({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { nutzer } = await requireBerechtigung("patienten:verwalten");
  const q = (await searchParams).q;
  const suche = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const profile = await ladeZugaenglicheProfile(nutzer, suche);
  return (
    <section className="stack">
      <h1>Patienten</h1>
      <div className="actions">
        <Link className="btn btn-primary" href="/arzt/patienten/neu">
          Patient anlegen
        </Link>
      </div>
      <form method="get" className="panel stack" role="search" aria-label="Patienten suchen">
        <Field id="q" name="q" type="search" label="Suche nach Vor- oder Nachname" defaultValue={suche} autoComplete="off" />
        <div className="actions">
          <Button type="submit" variante="secondary">
            Suchen
          </Button>
          {suche && <Link href="/arzt/patienten">Suche zurücksetzen</Link>}
        </div>
      </form>
      <ProfilListe
        profile={profile}
        leer={suche ? `Keine Patienten zu „${suche}“ gefunden.` : "Noch keine Patienten angelegt."}
      />
      <p className="text-soft">Von Patienten geteilte Fälle erscheinen hier, sobald das Teilen umgesetzt ist (Meilenstein 10).</p>
    </section>
  );
}
