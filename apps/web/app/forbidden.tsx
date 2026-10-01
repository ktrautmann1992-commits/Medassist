import Link from "next/link";

export default function KeinZugriff() {
  return (
    <section className="stack">
      <h1>Kein Zugriff</h1>
      <p>Diese Seite ist für Ihre Rolle nicht freigegeben.</p>
      <Link href="/start">Zur Übersicht</Link>
    </section>
  );
}
