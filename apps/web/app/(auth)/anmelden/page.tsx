import Link from "next/link";
import { zweiFaAktiv } from "@/lib/env";
import { AnmeldeFormular } from "./formular";

const HINWEISE: Record<string, string> = {
  bestaetigt: "Ihre E-Mail-Adresse ist bestätigt. Sie können sich jetzt anmelden.",
  email: "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.",
};

export default async function AnmeldenSeite({ searchParams }: { searchParams: Promise<{ hinweis?: string }> }) {
  const { hinweis } = await searchParams;
  const text = hinweis ? HINWEISE[hinweis] : undefined;
  return (
    <section className="stack">
      <h1>Anmelden</h1>
      {text && (
        <div className="panel panel-data" role="status">
          {text}
        </div>
      )}
      <AnmeldeFormular zweiFaAktiv={zweiFaAktiv()} />
      <p>
        Noch kein Konto? <Link href="/registrieren">Registrieren</Link>
      </p>
    </section>
  );
}
