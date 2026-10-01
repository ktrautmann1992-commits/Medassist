import { redirect } from "next/navigation";
import { requireTeilsitzung } from "@/lib/auth/guards";
import { CodeFormular } from "../code-formular";

export const dynamic = "force-dynamic";

/** REQ-016: Zweiter Schritt der Anmeldung. */
export default async function ZweiFaBestaetigen() {
  const { nutzer } = await requireTeilsitzung();
  if (!nutzer.totpAktiviertAm) redirect("/2fa/einrichten");

  return (
    <section className="stack">
      <h1>Code eingeben</h1>
      <div className="panel stack">
        <p>Geben Sie den aktuellen Code aus Ihrer Authenticator-App ein.</p>
        <CodeFormular knopf="Anmelden" />
      </div>
    </section>
  );
}
