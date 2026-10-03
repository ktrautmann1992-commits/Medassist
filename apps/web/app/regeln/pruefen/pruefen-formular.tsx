"use client";

import { ANLAUFSTELLE_TEXT, type Rolle } from "@medassist/core";
import {
  Avatar,
  Button,
  CheckboxField,
  Dringlichkeit,
  Field,
  Hinweis,
  Panel,
  UngeprueftKennzeichen,
} from "@medassist/ui";
import { useEffect, useRef } from "react";
import { useFormular } from "@/lib/forms/use-formular";
import { leererRegelPruefState } from "@/lib/regeln/form";
import { warnzeichenPruefen } from "./actions";
import { VorrangHinweise, hatVorrangHinweis } from "./vorrang-hinweise";

/** REQ-215: Hinweis auf jeder Ansicht der Demo-Seite. */
export function DemoBeratungsHinweis() {
  return (
    <Hinweis titel="Prototyp – keine medizinische Beratung.">
      Geprüft wird nur ein kleiner, fachlich ungeprüfter Demo-Regelsatz. Bitte nur Testdaten eingeben. Im Notfall
      immer den Notruf 112 wählen.
    </Hinweis>
  );
}

interface Props {
  rolle: Rolle;
  profil: { id: string; name: string; initialen: string; alter: string; istKinderprofil: boolean };
  symptome: { id: string; bezeichnung: string; fachbegriff: string | null }[];
  messwerte: { id: string; bezeichnung: string; einheit: string; min: number; max: number; status: string }[];
  fragen: { id: string; text: string }[];
  fragenUngeprueft: boolean;
  fragenHinweis: string;
  regelwerkVersion: string;
}

const ANTWORT_OPTIONEN = [
  ["ja", "Ja"],
  ["nein", "Nein"],
  ["keine_angabe", "Möchte ich nicht beantworten"],
] as const;

export function PruefenFormular(props: Props) {
  const { profil } = props;
  const { state, onSubmit, laeuft } = useFormular(warnzeichenPruefen, leererRegelPruefState);
  const e = state.ergebnis;
  const fb = state.fallback;
  const obenRef = useRef<HTMLDivElement>(null);
  const fehlerRef = useRef<HTMLParagraphElement>(null);
  const fehler = (feld: string) => state.feldFehler?.[feld]?.join(" ");

  const hatVorrang = hatVorrangHinweis(state);

  // REQ-210: Nach der Prüfung zuerst zu Krisen-/Notfallhinweis (ganz oben) springen;
  // sonst zur Fehlerzusammenfassung (S3), sonst zum Ergebnis.
  useEffect(() => {
    if (hatVorrang) obenRef.current?.focus();
    else if (state.fehler) fehlerRef.current?.focus();
    else if (e) obenRef.current?.focus();
  }, [state, e, hatVorrang]);

  return (
    <section className="stack">
      {/* REQ-210: Krisen- und Notfallhinweise vor allen anderen Inhalten */}
      <div ref={obenRef} tabIndex={-1} className="stack" data-testid="vorrang-hinweise">
        <VorrangHinweise state={state} rolle={props.rolle} />
      </div>

      <h1>Warnzeichen prüfen (Demo)</h1>
      <DemoBeratungsHinweis />
      <p className="profile-row" data-testid="profil">
        <Avatar initialen={profil.initialen} kind={profil.istKinderprofil} />
        <span>
          {state.profilUnbekannt ? (
            // H-1: Die Auswertung bezog sich nicht auf dieses Profil.
            <strong>Profil unbekannt – ohne Alter geprüft</strong>
          ) : (
            <>
              Prüfung für <strong>{profil.name}</strong> · {profil.alter}
              {profil.istKinderprofil && " · Kinderprofil"}
            </>
          )}
        </span>
      </p>

      {/* S3: Fehlerzusammenfassung außerhalb des Formulars – auch im Krisenfall sichtbar */}
      {state.fehler && (
        <p className="form-error" role="alert" id="fehler-zusammenfassung" tabIndex={-1} ref={fehlerRef}>
          {state.fehler}
        </p>
      )}

      {e && (
        <Panel titel="Ergebnis der Regelprüfung" data-testid="ergebnis">
          {e.status === "KEINE_WARNZEICHEN" && state.unvollstaendig && (
            // S-1: Verworfene Angaben – nie „keine Warnzeichen“ melden.
            <Hinweis titel="Prüfung unvollständig – bitte Wert korrigieren.">
              <span data-testid="pruefung-unvollstaendig">
                Mindestens eine Angabe war ungültig und konnte nicht geprüft werden. Bitte korrigieren Sie den Wert und
                prüfen Sie erneut. Bei Verschlechterung oder Unsicherheit: ärztlicher Bereitschaftsdienst 116117, im
                Notfall Notruf 112.
              </span>
            </Hinweis>
          )}
          {e.status === "KEINE_WARNZEICHEN" && !state.unvollstaendig && (
            // REQ-211: keine Entwarnung
            <Hinweis titel="Keine Warnzeichen aus dem Demo-Regelsatz erkannt.">
              <span data-testid="keine-warnzeichen">
                Das ist keine Entwarnung: Geprüft wurde nur ein kleiner, ungeprüfter Regelsatz. Bei Verschlechterung oder
                Unsicherheit holen Sie ärztlichen Rat ein (ärztlicher Bereitschaftsdienst 116117), im Notfall wählen Sie 112.
              </span>
            </Hinweis>
          )}
          {e.dringlichkeit && e.status !== "KRISE" && !e.notfallhinweis && <Dringlichkeit stufe={e.dringlichkeit} />}
          {e.ausgeloesteRegeln.length > 0 && (
            <>
              <h3>Ausgelöste Regeln</h3>
              <ul className="rule-list" data-testid="regeln">
                {e.ausgeloesteRegeln.map((r) => (
                  <li key={r.id} data-regel={r.id}>
                    <div className="rule-head">
                      <strong>{r.titel}</strong>
                      {r.status !== "geprüft" && <UngeprueftKennzeichen />}
                    </div>
                    <p className="text-soft" style={{ margin: 0 }}>
                      Regel {r.id}, Version {r.version} · Dringlichkeit: {r.dringlichkeit.toLowerCase()} · Anlaufstelle:{" "}
                      {ANLAUFSTELLE_TEXT[r.anlaufstelle]}
                    </p>
                    <p style={{ margin: 0 }}>{r.hinweisPatient}</p>
                    {r.regelwerk === "sicherheitsnetz" && (
                      <p className="text-soft" style={{ margin: 0 }}>
                        Sicherheitsnetz: Das angegebene Warnzeichen wird nie als „unauffällig“ gewertet.
                      </p>
                    )}
                    {e.rolle === "ARZT" && "hinweisArzt" in r && (
                      <p style={{ margin: 0 }}>
                        <span className="term">Ärztlicher Hinweis:</span> {r.hinweisArzt}
                      </p>
                    )}
                    <p className="text-soft" style={{ margin: 0 }}>
                      Quelle:{" "}
                      {r.quelle ? `${r.quelle.titel}, ${r.quelle.version}` : `fehlt – ${r.quelleHinweis ?? "vor klinischer Nutzung ergänzen"}`}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-soft" data-testid="regelwerk-version" style={{ margin: 0 }}>
            Regelwerk-Version {e.regelwerkVersion} (Demo-Regelsatz, ungeprüft)
          </p>
        </Panel>
      )}

      {(e?.ablaufBeenden || fb?.krise) ? (
        // REQ-208: kein weiterer Diagnose-Ablauf
        <Panel titel="Kein weiterer Ablauf" data-testid="ablauf-beendet">
          <p>
            Wegen des Krisenhinweises werden hier keine weiteren Fragen oder Schritte angeboten. Bitte nutzen Sie die oben
            genannten Hilfsangebote.
          </p>
          <a className="btn btn-secondary" href={`/regeln/pruefen?profil=${encodeURIComponent(profil.id)}`}>
            Neue Prüfung starten (Demo)
          </a>
        </Panel>
      ) : (
        <>
          {e && (
            <Panel titel="Weitere Schritte" data-testid="weitere-schritte">
              <p className="text-soft" style={{ margin: 0 }}>
                Geführte Eingrenzung und Diagnose folgen in späteren Meilensteinen.
              </p>
            </Panel>
          )}
          <form className="panel stack" onSubmit={onSubmit} noValidate aria-label="Warnzeichen angeben">
            <input type="hidden" name="profilId" value={profil.id} />
            <fieldset className="form-section stack" aria-describedby={fehler("symptome") ? "symptome-fehler" : undefined}>
              <legend>Welche Beschwerden liegen vor?</legend>
              {fehler("symptome") && (
                <p className="error" id="symptome-fehler">
                  {fehler("symptome")}
                </p>
              )}
              {props.symptome.map((s) => (
                <CheckboxField
                  key={s.id}
                  id={`symptom-${s.id}`}
                  name="symptom"
                  value={s.id}
                  label={
                    <>
                      {s.bezeichnung}
                      {s.fachbegriff && (
                        <>
                          {" "}
                          (<span className="term">{s.fachbegriff}</span>)
                        </>
                      )}
                    </>
                  }
                />
              ))}
              {props.messwerte.map((m) => (
                <Field
                  key={m.id}
                  id={`messwert-${m.id}`}
                  name={`messwert.${m.id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  label={`${m.bezeichnung} in ${m.einheit} (optional)`}
                  hinweis={`Zulässig ${m.min}–${m.max} ${m.einheit} (Tippfehlerschutz${m.status === "ungeprüft" ? ", ungeprüft" : ""}).`}
                  fehler={fehler(`messwert.${m.id}`)}
                />
              ))}
            </fieldset>

            <fieldset className="form-section stack">
              <legend>Seelische Beschwerden</legend>
              <CheckboxField id="psychisch" name="psychisch" label="Es geht (auch) um seelische Beschwerden." />
              <p className="text-soft" style={{ margin: 0 }}>
                Bei seelischen Beschwerden sind die folgenden Fragen Pflicht. Eine fehlende oder nicht gegebene Antwort
                werten wir zu Ihrer Sicherheit wie einen Hinweis auf eine Krise.{" "}
                {props.fragenUngeprueft && <UngeprueftKennzeichen text="Fragen ungeprüft" />}
              </p>
              <p className="text-soft" style={{ margin: 0 }}>
                {props.fragenHinweis}
              </p>
              {props.fragen.map((f) => (
                <fieldset
                  key={f.id}
                  className="list-row"
                  role="radiogroup"
                  aria-labelledby={`antwort-${f.id}-frage`}
                  aria-invalid={fehler(`antwort.${f.id}`) ? true : undefined}
                  aria-describedby={fehler(`antwort.${f.id}`) ? `antwort-${f.id}-fehler` : undefined}>
                  <legend id={`antwort-${f.id}-frage`}>{f.text}</legend>
                  {ANTWORT_OPTIONEN.map(([wert, beschriftung]) => (
                    <label key={wert} className="check-row" htmlFor={`antwort-${f.id}-${wert}`}>
                      <input
                        type="radio"
                        id={`antwort-${f.id}-${wert}`}
                        name={`antwort.${f.id}`}
                        value={wert}
                        aria-describedby={fehler(`antwort.${f.id}`) ? `antwort-${f.id}-fehler` : undefined}
                      />
                      <span>{beschriftung}</span>
                    </label>
                  ))}
                  {fehler(`antwort.${f.id}`) && (
                    <span className="error" id={`antwort-${f.id}-fehler`}>
                      {fehler(`antwort.${f.id}`)}
                    </span>
                  )}
                </fieldset>
              ))}
            </fieldset>

            <div className="actions">
              <Button type="submit" disabled={laeuft}>
                {laeuft ? "Wird geprüft …" : "Warnzeichen prüfen"}
              </Button>
            </div>
            <p className="text-soft" style={{ margin: 0 }}>
              Regelwerk-Version {props.regelwerkVersion}. Das Alter wird aus dem Profil berechnet.
            </p>
          </form>
        </>
      )}
    </section>
  );
}
