import Link from "next/link";
import { RegistrierungsFormular } from "./formular";

export default function RegistrierenSeite() {
  return (
    <section className="stack">
      <h1>Registrieren</h1>
      <RegistrierungsFormular />
      <p>
        Schon registriert? <Link href="/anmelden">Anmelden</Link>
      </p>
    </section>
  );
}
