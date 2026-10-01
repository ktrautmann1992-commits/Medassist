import Link from "next/link";
import { aktuelleSitzung } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function Startseite() {
  const sitzung = await aktuelleSitzung();
  if (sitzung?.zweiterFaktorAm) redirect("/start");

  return (
    <section className="stack">
      <h1>Willkommen bei MedAssist</h1>
      <p>
        MedAssist unterstützt bei der Einschätzung von Beschwerden – es ersetzt keine ärztliche Untersuchung. Alle
        Ergebnisse sind Vorschläge mit Begründung und Quellenangabe.
      </p>
      <div className="panel panel-rose stack">
        <p>
          <strong>Dies ist ein Prototyp.</strong> Bitte geben Sie ausschließlich Testdaten ein – keine echten
          Gesundheitsdaten.
        </p>
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <Link className="btn btn-primary" href="/registrieren">
          Registrieren
        </Link>
        <Link className="btn btn-secondary" href="/anmelden">
          Anmelden
        </Link>
      </div>
    </section>
  );
}
