import type { GefilterteEntwicklung, Rolle } from "@medassist/core";
import { BereichErgebnis, EINSTUFUNG_DARSTELLUNG, Hinweis, KrisenKontakte, UngeprueftKennzeichen } from "@medassist/ui";
import Link from "next/link";
import { KRISENKONTAKTE_AB_MONATE, type EntwicklungAnzeige } from "@/lib/eingrenzung/kontext";

/**
 * REQ-325 – REQ-328: Ergebnis des Entwicklungs-Checks je Bereich. Die Daten sind bereits
 * serverseitig nach Rolle gefiltert (Whitelist); die Ansicht zeigt für Eltern Förderideen,
 * für Ärztinnen und Ärzte die strukturierte Übersicht. Immer: keine Diagnose, ersetzt keine
 * Vorsorgeuntersuchung (U-Untersuchung).
 */
export function EntwicklungErgebnis({ anzeige, rolle }: { anzeige: EntwicklungAnzeige; rolle: Rolle }) {
  if (anzeige.art === "offen") {
    return (
      <Hinweis titel="Ergebnis folgt.">
        Das Ergebnis des Entwicklungs-Checks erscheint, sobald alle Fragen beantwortet sind.
      </Hinweis>
    );
  }
  if (anzeige.art === "fehler") {
    return (
      <Hinweis titel="Auswertung fehlgeschlagen – bitte besprechen Sie die Entwicklung mit Ihrer Kinderarztpraxis.">
        <span data-testid="entwicklung-fehler">Die Angaben sind gespeichert, konnten aber nicht ausgewertet werden.</span>
      </Hinweis>
    );
  }
  const e: GefilterteEntwicklung = anzeige.ergebnis;
  return (
    <section className="stack" data-testid="entwicklung-ergebnis" aria-labelledby="entwicklung-ergebnis-titel">
      <h2 id="entwicklung-ergebnis-titel">Ergebnis des Entwicklungs-Checks</h2>
      <p style={{ margin: 0 }}>
        <strong>{e.hinweis}</strong>
      </p>
      <p className="text-soft" style={{ margin: 0 }}>
        <UngeprueftKennzeichen text="Fragen und Einstufungen ungeprüft" /> Demo-Katalog Version {e.katalogVersion}
        {e.korrigiert && " · Fragen nach dem korrigierten Alter (Frühgeburt)"}
      </p>
      {e.rolle === "ARZT" && (
        <Hinweis titel="Ärztlicher Hinweis:">
          <span data-testid="arzt-hinweis">{e.arztHinweis}</span>
        </Hinweis>
      )}
      {e.bereiche.length === 0 && <p>Es wurde kein Bereich ausgewählt.</p>}
      {e.bereiche.length > 1 && (
        // QA E7: Übersicht oben mit Sprungmarken (Symbol + Text)
        <nav aria-label="Ergebnis je Bereich" data-testid="entwicklung-uebersicht-oben">
          <ul className="anlaufstellen" style={{ listStyle: "none", paddingLeft: 0 }}>
            {e.bereiche.map((b) => {
              const d = EINSTUFUNG_DARSTELLUNG[b.einstufung];
              return (
                <li key={b.id}>
                  <a className="list-link" href={`#bereich-${b.id}-titel`}>
                    {b.bezeichnung}
                  </a>
                  {": "}
                  <span className={`urgency-tag ${d.klasse}`}>
                    <span aria-hidden="true">{d.symbol}</span> {d.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      {e.bereiche.map((b) =>
        e.rolle === "ARZT" && "uebersicht" in b ? (
          <BereichErgebnis
            key={b.id}
            id={b.id}
            bezeichnung={b.bezeichnung}
            einstufung={b.einstufung}
            titel={b.titel}
            text={b.textArzt}
            gruende={b.gruende}
            anlaufstellen={b.anlaufstellen}
            anlaufstellenQuelle={e.anlaufstellenQuelle}
            uebersicht={b.uebersicht}
          />
        ) : (
          <BereichErgebnis
            key={b.id}
            id={b.id}
            bezeichnung={b.bezeichnung}
            einstufung={b.einstufung}
            titel={b.titel}
            text={b.textPatient}
            gruende={b.gruende}
            anlaufstellen={b.anlaufstellen}
            anlaufstellenQuelle={e.anlaufstellenQuelle}
            foerderideen={rolle === "PATIENT" && "foerderideen" in b ? b.foerderideen : undefined}
          />
        ),
      )}
    </section>
  );
}

/** QA E1: „Ich bin mir nicht sicher“ bei der Regressionsfrage – zusätzlich zum Warnhinweis der Regel-Engine. */
export function RegressionUnsicherHinweis() {
  return (
    <Hinweis titel="Sie sind unsicher – bitte heute ärztlich abklären lassen.">
      <span data-testid="regression-unsicher">
        Sie sind unsicher, ob Ihr Kind Fähigkeiten wieder verlernt hat. Zur Sicherheit behandeln wir das wie ein Warnzeichen:
        Kinderarztpraxis, außerhalb der Sprechzeiten ärztlicher Bereitschaftsdienst 116117, im Notfall 112.
      </span>
    </Hinweis>
  );
}

/**
 * QA E4: Neutraler Block „Hilfe in Krisen“ im Entwicklungs-Check (Bereich Verhalten oder
 * Entwicklungsalter ab 120 Monaten – Grenze ungeprüft). Kein eigenes Screening; für seelische
 * Beschwerden der Weg 2 „Seelisch / psychisch“ mit Pflicht-Screening.
 */
export function EntwicklungKrisenKontakte({ profilId }: { profilId: string }) {
  return (
    <div className="stack" data-testid="entwicklung-krisen">
      <KrisenKontakte />
      <p className="text-soft" style={{ margin: 0 }}>
        Bei seelischen Beschwerden oder Gedanken, sich etwas anzutun:{" "}
        <Link href={`/eingrenzung?profil=${encodeURIComponent(profilId)}`}>Beschwerden eingrenzen → Seelisch / psychisch</Link> (mit
        Fragen zur Sicherheit). <UngeprueftKennzeichen text="Altersgrenze ungeprüft" /> Angezeigt beim Bereich Verhalten oder ab{" "}
        {KRISENKONTAKTE_AB_MONATE / 12} Jahren.
      </p>
    </div>
  );
}

/** QA E5: Profil ist inzwischen volljährig – der Fall wird mit dem festgehaltenen Alter fortgeführt. */
export function VolljaehrigHinweis() {
  return (
    <Hinweis titel="Profil nicht mehr im Altersbereich des Entwicklungs-Checks.">
      <span data-testid="entwicklung-volljaehrig">
        Das Profil ist inzwischen 18 Jahre oder älter. Der begonnene Fall wird mit dem festgehaltenen Entwicklungsalter
        abgeschlossen; ein neuer Entwicklungs-Check ist nicht möglich. Warnzeichen werden weiter geprüft.
      </span>
    </Hinweis>
  );
}
