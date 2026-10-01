import { requireRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/** REQ-018: Nur für die Arzt-Rolle – serverseitig geprüft, Patienten erhalten 403. */
export default async function PatientenListe() {
  await requireRole("ARZT");
  return (
    <section className="stack">
      <h1>Patienten</h1>
      <div className="panel">
        <p>Die Patientenliste folgt mit Meilenstein 2.</p>
      </div>
    </section>
  );
}
