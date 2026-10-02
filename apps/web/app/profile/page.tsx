import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { ladeZugaenglicheProfile } from "@/lib/profile/zugriff";
import { ProfilListe } from "./profil-liste";

export const dynamic = "force-dynamic";

/** „Meine Profile“ (Patient): eigenes Profil und Kinderprofile (REQ-100, REQ-106). */
export default async function MeineProfile() {
  const { nutzer } = await requireUser();
  if (nutzer.rolle === "ARZT") redirect("/arzt/patienten");
  const profile = await ladeZugaenglicheProfile(nutzer);
  const hatEigenes = profile.some((p) => p.istEigenesProfil);
  return (
    <section className="stack">
      <h1>Meine Profile</h1>
      <p>Ihr eigenes Profil und die Profile Ihrer Kinder. Kinderprofile sind mit einem blauen Symbol gekennzeichnet.</p>
      <ProfilListe profile={profile} leer="Noch keine Profile angelegt." />
      <div className="actions">
        {!hatEigenes && (
          <Link className="btn btn-primary" href="/profile/neu">
            Eigenes Profil anlegen
          </Link>
        )}
        <Link className={hatEigenes ? "btn btn-primary" : "btn btn-secondary"} href="/profile/kind/neu">
          + Kind hinzufügen
        </Link>
      </div>
    </section>
  );
}
