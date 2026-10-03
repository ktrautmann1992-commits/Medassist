import { ANLAUFSTELLE_TEXT, type Rolle, type ZusammenfassungAbschnitt } from "@medassist/core";
import { Avatar, Dringlichkeit, Hinweis, Panel, UngeprueftKennzeichen } from "@medassist/ui";
import type { ReactNode } from "react";
import type { RegelPruefState } from "@/lib/regeln/form";

/**
 * REQ-304, REQ-312: Gemeinsame Bausteine der Fallansicht (Assistent und Fallübersicht).
 * Rein darstellend (ohne Hooks).
 */

export const ART_TEXT = { KOERPERLICH: "Körperliche Beschwerden", PSYCHISCH: "Seelische Beschwerden", ENTWICKLUNG: "Entwicklungs-Check" } as const;


export interface ProfilKopf {
  name: string;
  initialen: string;
  alter: string;
  istKinderprofil: boolean;
  /** REQ-322: korrigiertes Entwicklungsalter (nur bei Frühgeborenen im Entwicklungs-Check). */
  entwicklungsalter?: string;
}

/** REQ-304, RISK-019: Für wen wird gerade eingegrenzt – Avatar, Name, Alter, „Kinderprofil“ als Text. */
export function ProfilZeile({ profil, art }: { profil: ProfilKopf; art?: keyof typeof ART_TEXT }) {
  return (
    <p className="profile-row" data-testid="profil" style={{ margin: 0 }}>
      <Avatar initialen={profil.initialen} kind={profil.istKinderprofil} />
      <span>
        Für <strong>{profil.name}</strong> · {profil.alter}
        {profil.entwicklungsalter && ` · Entwicklungsalter ${profil.entwicklungsalter}`}
        {profil.istKinderprofil && " · Kinderprofil"}
        {art && ` · ${ART_TEXT[art]}`}
      </span>
    </p>
  );
}

interface ZusammenfassungProps {
  abschnitte: ZusammenfassungAbschnitt[];
  state: RegelPruefState | null;
  unvollstaendig: boolean;
  rolle: Rolle;
  katalogVersion: string;
  fragenUngeprueft: boolean;
  abgeschlossen: boolean;
  kopf?: ReactNode;
  /** Weg 3: kein Hinweis auf die KI-Schicht – das Ergebnis steht im Entwicklungsergebnis (REQ-325). */
  entwicklung?: boolean;
}

/** REQ-312: Zusammenfassung – Angaben, Dringlichkeit aus der Regel-Engine, keine Diagnosen. */
export function FallZusammenfassung({ abschnitte, state, unvollstaendig, rolle, katalogVersion, fragenUngeprueft, abgeschlossen, kopf, entwicklung = false }: ZusammenfassungProps) {
  const e = state?.ergebnis;
  return (
    <Panel titel={entwicklung ? "Angaben im Überblick" : abgeschlossen ? "Überblick über den Fall" : "Bisherige Angaben"} data-testid="zusammenfassung">
      {kopf}
      {e && e.status === "KEINE_WARNZEICHEN" && unvollstaendig && (
        <Hinweis titel="Prüfung unvollständig – bitte Angaben prüfen.">
          <span data-testid="pruefung-unvollstaendig">
            Mindestens eine Angabe war ungültig oder nicht lesbar und konnte nicht geprüft werden. Bei Verschlechterung oder
            Unsicherheit: ärztlicher Bereitschaftsdienst 116117, im Notfall Notruf 112.
          </span>
        </Hinweis>
      )}
      {e && e.status === "KEINE_WARNZEICHEN" && !unvollstaendig && (
        <Hinweis titel={entwicklung ? "Keine akuten Warnzeichen aus dem Demo-Regelsatz erkannt." : "Keine Warnzeichen aus dem Demo-Regelsatz erkannt."}>
          <span data-testid="keine-warnzeichen">
            {entwicklung &&
              "Das betrifft nur akute Warnzeichen (z. B. Atemnot, Verlust erworbener Fähigkeiten) – das Ergebnis des Entwicklungs-Checks oben gilt unabhängig davon. "}
            Das ist keine Entwarnung: Geprüft wurde nur ein kleiner, ungeprüfter Regelsatz. Bei Verschlechterung oder
            Unsicherheit holen Sie ärztlichen Rat ein (ärztlicher Bereitschaftsdienst 116117), im Notfall wählen Sie 112.
          </span>
        </Hinweis>
      )}
      {e?.dringlichkeit && e.status !== "KRISE" && <Dringlichkeit stufe={e.dringlichkeit} />}

      {abschnitte.map((a) => (
        <section key={a.id} className="stack" data-abschnitt={a.id}>
          <h3>{a.titel}</h3>
          <dl className="summary-list">
            {a.eintraege.map((x) => (
              <div key={x.id} style={{ display: "contents" }}>
                <dt>
                  {x.bezeichnung}
                  {x.hinweis === "ungeprüft" && (
                    <>
                      {" "}
                      <UngeprueftKennzeichen text="ungeprüft" />
                    </>
                  )}
                </dt>
                <dd data-eintrag={x.id}>
                  {x.werte.map((w, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      {w.text}
                      {w.fachbegriff && (
                        <>
                          {" "}
                          (<span className="term">{w.fachbegriff}</span>)
                        </>
                      )}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {e && e.ausgeloesteRegeln.length > 0 && (
        <section className="stack">
          <h3>Ausgelöste Regeln</h3>
          <ul className="rule-list" data-testid="regeln">
            {e.ausgeloesteRegeln.map((r) => (
              <li key={r.id} data-regel={r.id}>
                <div className="rule-head">
                  <strong>{r.titel}</strong>
                  {r.status !== "geprüft" && <UngeprueftKennzeichen />}
                </div>
                <p className="text-soft" style={{ margin: 0 }}>
                  Regel {r.id}, Version {r.version} · Anlaufstelle: {ANLAUFSTELLE_TEXT[r.anlaufstelle]}
                </p>
                <p style={{ margin: 0 }}>{r.hinweisPatient}</p>
                {rolle === "ARZT" && "hinweisArzt" in r && (
                  <p style={{ margin: 0 }}>
                    <span className="term">Ärztlicher Hinweis:</span> {r.hinweisArzt}
                  </p>
                )}
                <p className="text-soft" style={{ margin: 0 }}>
                  Quelle: {r.quelle ? `${r.quelle.titel}, ${r.quelle.version}` : `fehlt – ${r.quelleHinweis ?? "vor klinischer Nutzung ergänzen"}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entwicklung ? (
        <Hinweis titel="Keine Diagnose.">
          Diese Übersicht enthält die Angaben und die Prüfung auf Warnzeichen. Die Software stellt keine
          Entwicklungsstörung fest und ersetzt keine Vorsorgeuntersuchung (U-Untersuchung).
        </Hinweis>
      ) : (
        <Hinweis titel="Mögliche Ursachen und Empfehlungen folgen in einem späteren Schritt (KI-Schicht, Meilenstein 6).">
          Diese Zusammenfassung enthält nur Ihre Angaben und die Prüfung auf Warnzeichen – keine Diagnose und keine
          Empfehlung einer Fachrichtung.
        </Hinweis>
      )}
      <p className="text-soft" style={{ margin: 0 }} data-testid="versionen">
        {fragenUngeprueft && (
          <>
            <UngeprueftKennzeichen text="Fragen ungeprüft" />{" "}
          </>
        )}
        Fragenkatalog-Version {katalogVersion}
        {e && ` · Regelwerk-Version ${e.regelwerkVersion} (Demo-Regelsatz, ungeprüft)`}
      </p>
    </Panel>
  );
}

/** QA N1: Oben auf jeder Fallseite, wenn Angaben verworfen wurden oder nicht lesbar waren. */
export function UnvollstaendigHinweis() {
  return (
    <Hinweis titel="Prüfung unvollständig – im Notfall Notruf 112.">
      <span data-testid="unvollstaendig-oben">
        Mindestens eine Angabe war ungültig oder nicht lesbar und konnte nicht vollständig geprüft werden. Bei
        Verschlechterung oder Unsicherheit: ärztlicher Bereitschaftsdienst 116117.
      </span>
    </Hinweis>
  );
}
