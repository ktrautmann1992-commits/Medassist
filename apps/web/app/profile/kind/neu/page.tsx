import { requireBerechtigung } from "@/lib/auth/guards";
import { legeKinderprofilAn } from "../../actions";
import { ProfilFormular } from "../../profil-formular";

export const dynamic = "force-dynamic";

/** REQ-106/REQ-107: Kinderprofil anlegen (nur Patient, mit Sorgerechtsbestätigung). */
export default async function KinderprofilNeu() {
  await requireBerechtigung("profil:kinder:verwalten");
  return (
    <section className="stack">
      <h1>Kind hinzufügen</h1>
      <p>Legen Sie ein Profil für Ihr Kind an – ab Geburt möglich. Bitte nur Testdaten eingeben.</p>
      <ProfilFormular action={legeKinderprofilAn} modus="kind-neu" istArzt={false} kind abbrechenHref="/profile" />
    </section>
  );
}
