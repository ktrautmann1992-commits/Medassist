import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireTeilsitzung } from "@/lib/auth/guards";
import { neuesTotpSecret, totpUri } from "@/lib/auth/totp";
import { entschluesseleTotpSecret, verschluesseleTotpSecret } from "@/lib/auth/totp-schluessel";
import { CodeFormular } from "../code-formular";

export const dynamic = "force-dynamic";

/** REQ-015: Pflicht-Einrichtung der 2FA vor dem ersten Zugriff. */
export default async function ZweiFaEinrichten() {
  const { nutzer } = await requireTeilsitzung();
  if (nutzer.totpAktiviertAm) redirect("/2fa/bestaetigen");

  // Secret einmalig erzeugen; solange die Einrichtung nicht bestätigt ist, bleibt es gleich.
  // `updateMany` mit Bedingung verhindert, dass parallele Aufrufe es überschreiben.
  if (!nutzer.totpSecretVerschl) {
    await db().nutzer.updateMany({
      where: { id: nutzer.id, totpSecretVerschl: null },
      data: { totpSecretVerschl: verschluesseleTotpSecret(neuesTotpSecret()) },
    });
  }
  const { totpSecretVerschl } = await db().nutzer.findUniqueOrThrow({
    where: { id: nutzer.id },
    select: { totpSecretVerschl: true },
  });
  const secret = entschluesseleTotpSecret(totpSecretVerschl!);
  const qr = await QRCode.toDataURL(totpUri(secret, nutzer.email), { margin: 1, width: 220 });

  return (
    <section className="stack">
      <h1>Zwei-Faktor-Anmeldung einrichten</h1>
      <p>
        Zum Schutz der Gesundheitsdaten ist die Zwei-Faktor-Anmeldung Pflicht. Scannen Sie den QR-Code mit einer
        Authenticator-App (z.&nbsp;B. eine App auf Ihrem Smartphone) und geben Sie anschließend den angezeigten Code
        ein.
      </p>
      <div className="panel stack">
        {/* eslint-disable-next-line @next/next/no-img-element -- Data-URL, keine Optimierung nötig */}
        <img src={qr} alt="QR-Code für die Authenticator-App" width={220} height={220} />
        <p className="text-soft">
          Manuelle Eingabe: <code className="num">{secret.match(/.{1,4}/g)?.join(" ")}</code>
        </p>
        <CodeFormular knopf="Einrichtung abschließen" />
      </div>
    </section>
  );
}
