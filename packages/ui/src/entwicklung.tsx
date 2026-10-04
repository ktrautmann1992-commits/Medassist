import type { Einstufung } from "@medassist/core";
import type { ReactNode } from "react";
import { UngeprueftKennzeichen } from "./dringlichkeit";

/**
 * REQ-326/REQ-327: Darstellung des Entwicklungs-Checks. Status immer mit **Symbol und Text**
 * (nie nur Farbe); vorhandene Klassen aus `style.css`: „Abklärung empfohlen“ Routine-Blau,
 * „Beobachten“ Grün, „Keine Auffälligkeit“ neutral. Rosé ist nie Warn- oder Statusfarbe.
 */
export const EINSTUFUNG_DARSTELLUNG: Record<Einstufung, { klasse: string; symbol: string; text: string; kurz: string }> = {
  ABKLAERUNG: { klasse: "urgency-routine", symbol: "→", text: "Abklärung empfohlen", kurz: "Abklärung" },
  BEOBACHTEN: { klasse: "urgency-ok", symbol: "◐", text: "Beobachten", kurz: "Beobachten" },
  ALTERSGERECHT: { klasse: "urgency-neutral", symbol: "–", text: "Keine Auffälligkeit in den Demo-Fragen", kurz: "Unauffällig" },
};

/** Kurzform (z. B. in Listen): Symbol + Text; `kurz` für Tabellen (Mobilbreite). */
export function EntwicklungsStatus({ einstufung, kurz = false }: { einstufung: Einstufung; kurz?: boolean }) {
  const d = EINSTUFUNG_DARSTELLUNG[einstufung];
  return (
    <span className={`urgency-tag ${d.klasse}`} data-einstufung={einstufung}>
      <span aria-hidden="true">{d.symbol}</span> {kurz ? d.kurz : d.text}
    </span>
  );
}

export interface AnlaufstelleAnsicht {
  id: string;
  bezeichnung: string;
  hinweis: string | null;
}

/** REQ-326: Anlaufstellen in fester Reihenfolge – die Kinderarztpraxis steht immer zuerst. */
export function Anlaufstellen({ anlaufstellen, titel, quelle }: { anlaufstellen: readonly AnlaufstelleAnsicht[]; titel: ReactNode; quelle?: string }) {
  return (
    <div className="stack" data-testid="anlaufstellen">
      <h4 style={{ margin: 0 }}>{titel}</h4>
      <ol className="anlaufstellen">
        {anlaufstellen.map((a, i) => (
          <li key={a.id} data-anlaufstelle={a.id}>
            <strong>
              {i === 0 ? "Zuerst: " : ""}
              {a.bezeichnung}
            </strong>
            {a.hinweis && <span className="text-soft"> – {a.hinweis}</span>}
          </li>
        ))}
      </ol>
      {quelle && (
        <p className="text-soft" style={{ margin: 0 }}>
          <UngeprueftKennzeichen text="Zuordnung ungeprüft" /> Quelle: {quelle}
        </p>
      )}
    </div>
  );
}

export interface UebersichtZeile {
  frageId: string;
  frage: string;
  antwort: string;
  einstufung: Einstufung;
}

export interface BereichErgebnisProps {
  id: string;
  bezeichnung: string;
  einstufung: Einstufung;
  titel: string;
  text: string;
  gruende: readonly string[];
  anlaufstellen: readonly AnlaufstelleAnsicht[];
  anlaufstellenQuelle?: string;
  /** Nur Patient (Eltern): allgemeine Förderideen – kein Therapieersatz. */
  foerderideen?: readonly string[];
  /** Nur Arzt: strukturierte Übersicht aller gestellten Fragen. */
  uebersicht?: readonly UebersichtZeile[];
}

export function BereichErgebnis({ id, bezeichnung, einstufung, titel, text, gruende, anlaufstellen, anlaufstellenQuelle, foerderideen, uebersicht }: BereichErgebnisProps) {
  const d = EINSTUFUNG_DARSTELLUNG[einstufung];
  const arzt = uebersicht !== undefined;
  return (
    <section className="panel stack" data-bereich={id} data-einstufung={einstufung} aria-labelledby={`bereich-${id}-titel`}>
      <h3 id={`bereich-${id}-titel`}>{bezeichnung}</h3>
      <div className={`urgency ${d.klasse}`} data-testid="bereich-status">
        <span className="icon" aria-hidden="true">
          {d.symbol}
        </span>
        <div>
          <span className="urgency-stufe">Ergebnis: {d.text}</span>
          <strong>{titel}</strong>
          <p>{text}</p>
        </div>
      </div>
      {gruende.length > 0 && (
        <div className="stack">
          <h4 style={{ margin: 0 }}>{arzt ? "Auffällige Angaben" : "Was dazu geführt hat"}</h4>
          <ul style={{ margin: 0 }}>
            {gruende.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {uebersicht && (
        <div className="table-scroll">
          <table className="table" data-testid="entwicklung-uebersicht">
            <caption>Entwicklungsübersicht {bezeichnung}</caption>
            <thead>
              <tr>
                <th scope="col">Beobachtung</th>
                <th scope="col">Angabe</th>
                <th scope="col">Einstufung</th>
              </tr>
            </thead>
            <tbody>
              {uebersicht.map((z) => (
                <tr key={z.frageId} data-frage={z.frageId}>
                  <td>{z.frage}</td>
                  <td>{z.antwort}</td>
                  <td>
                    <EntwicklungsStatus einstufung={z.einstufung} kurz />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Anlaufstellen
        anlaufstellen={anlaufstellen}
        titel={arzt ? "Mögliche Anlaufstellen (Überweisung nach ärztlicher Beurteilung)" : einstufung === "ALTERSGERECHT" ? "Bei Fragen" : "Anlaufstellen"}
        quelle={anlaufstellenQuelle}
      />
      {foerderideen && foerderideen.length > 0 && (
        <div className="stack" data-testid="foerderideen">
          <h4 style={{ margin: 0 }}>Ideen für den Alltag – kein Therapieersatz</h4>
          <ul style={{ margin: 0 }}>
            {foerderideen.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="text-soft" style={{ margin: 0 }}>
            <UngeprueftKennzeichen text="ungeprüft" /> Allgemeine Anregungen, keine Therapie und kein Ersatz für eine ärztliche
            Abklärung.
          </p>
        </div>
      )}
    </section>
  );
}
