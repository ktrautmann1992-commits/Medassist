import Link from "next/link";

export default function NichtGefunden() {
  return (
    <section className="stack">
      <h1>Seite nicht gefunden</h1>
      <Link href="/">Zur Startseite</Link>
    </section>
  );
}
