import { redirect } from "next/navigation";
import { requireBerechtigung } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { legeEigenesProfilAn } from "../actions";
import { ProfilFormular } from "../profil-formular";

export const dynamic = "force-dynamic";

/** REQ-100: eigenes Profil anlegen (nur Patient, genau eines). */
export default async function EigenesProfilNeu() {
  const { nutzer } = await requireBerechtigung("profil:eigenes:verwalten");
  const vorhanden = await db().patientenprofil.findUnique({ where: { kontoinhaberId: nutzer.id }, select: { id: true } });
  if (vorhanden) redirect(`/profile/${vorhanden.id}/bearbeiten`);
  return (
    <section className="stack">
      <h1>Eigenes Profil anlegen</h1>
      <p>Diese Angaben helfen später bei der Einschätzung von Beschwerden. Bitte nur Testdaten eingeben.</p>
      <ProfilFormular action={legeEigenesProfilAn} modus="eigen-neu" istArzt={false} kind={false} abbrechenHref="/profile" />
    </section>
  );
}
