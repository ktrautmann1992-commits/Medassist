import { requireBerechtigung } from "@/lib/auth/guards";
import { legePatientenprofilAn } from "../../../profile/actions";
import { ProfilFormular } from "../../../profile/profil-formular";

export const dynamic = "force-dynamic";

/** REQ-113/REQ-114: Arzt legt ein Patientenprofil an (inkl. Nieren-/Leberfunktion und Laborwerte). */
export default async function PatientNeu() {
  await requireBerechtigung("patienten:verwalten");
  return (
    <section className="stack">
      <h1>Patient anlegen</h1>
      <p>Bitte nur Testdaten eingeben.</p>
      <ProfilFormular action={legePatientenprofilAn} modus="patient-neu" istArzt kind={false} abbrechenHref="/arzt/patienten" />
    </section>
  );
}
