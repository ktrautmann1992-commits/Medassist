"use client";

import { NOTRUF, type Ansicht, type Bereich, type Rolle } from "@medassist/core";
import {
  AuswahlFrage,
  Button,
  CheckboxField,
  DauerFrage,
  KrisenKontakte,
  Field,
  Koerperkarte,
  SkalaFrage,
  TextareaField,
  UngeprueftKennzeichen,
} from "@medassist/ui";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { VORRANG_ZIEL_ID, type SchrittAnsicht } from "@/lib/eingrenzung/ansicht";
import { VorrangHinweise } from "@/app/regeln/pruefen/vorrang-hinweise";
import { useFormular } from "@/lib/forms/use-formular";
import { beantworteSchritt, type SchrittState } from "../actions";
import { BeschreibungFeld } from "./beschreibung-feld";

/**
 * REQ-305 – REQ-311: Formular des aktuellen Schritts. Hält keinen sicherheitsrelevanten
 * Zustand – nach dem Speichern bestimmt der Server den nächsten Schritt (REQ-315).
 */
interface Props {
  fallId: string;
  bereich: Bereich;
  rolle: Rolle;
  schrittId: string;
  ansicht: SchrittAnsicht;
  zurueckHref: string | null;
  /**
   * QA M5: Inhalt zwischen Formular und Schaltflächen (z. B. Sprachaufnahme und Fotos im
   * Beschreibungsschritt). Er steht **außerhalb** des Formulars (eigene Formulare darin), die
   * Schaltflächen sind über das `form`-Attribut verbunden.
   */
  nachFormular?: ReactNode;
}

const KRISE_OPTIONEN = [
  ["ja", "Ja"],
  ["nein", "Nein"],
  ["keine_angabe", "Möchte ich nicht beantworten"],
] as const;

function KoerperkarteAuswahl({ ansicht, fehler }: { ansicht: Extract<SchrittAnsicht, { art: "region" }>; fehler?: string }) {
  const [seite, setSeite] = useState<Ansicht>("vorne");
  const [gewaehlt, setGewaehlt] = useState<string | null>(ansicht.ausgewaehlt);
  return (
    <Koerperkarte
      regionen={ansicht.regionen}
      viewBox={ansicht.viewBox}
      ansicht={seite}
      ausgewaehlt={gewaehlt}
      name="region"
      onAnsicht={setSeite}
      onWaehlen={setGewaehlt}
      fehler={fehler}
    />
  );
}


/** QA R3-B3: Merker „letzte Angabe nicht gespeichert“ je Fall (sessionStorage, nur Komfort). */
const merkerSchluessel = (fallId: string) => `medassist:nicht-gespeichert:${fallId}`;
const MERKER_EREIGNIS = "medassist-merker";

function setzeMerker(fallId: string, wert: boolean) {
  try {
    if (wert) sessionStorage.setItem(merkerSchluessel(fallId), "1");
    else sessionStorage.removeItem(merkerSchluessel(fallId));
    window.dispatchEvent(new Event(MERKER_EREIGNIS));
  } catch {
    // Speicher nicht verfügbar (privater Modus) – Hinweis entfällt, Sicherheit unberührt.
  }
}

function leseMerker(fallId: string): boolean {
  try {
    return sessionStorage.getItem(merkerSchluessel(fallId)) === "1";
  } catch {
    return false;
  }
}

/** QA R3-B3: Nach endgültigem Speicherfehler beim nächsten Laden: „bitte erneut eingeben“. */
export function NichtGespeichertHinweis({ fallId }: { fallId: string }) {
  const sichtbar = useSyncExternalStore(
    (melden) => {
      window.addEventListener(MERKER_EREIGNIS, melden);
      return () => window.removeEventListener(MERKER_EREIGNIS, melden);
    },
    () => leseMerker(fallId),
    () => false,
  );
  if (!sichtbar) return null;
  return (
    <div className="panel note" role="note" data-testid="nicht-gespeichert">
      <span className="note-icon" aria-hidden="true">
        i
      </span>
      <div className="stack">
        <strong>Ihre letzte Angabe konnte nicht gespeichert werden – bitte erneut eingeben.</strong>
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={() => setzeMerker(fallId, false)}>
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
}

export function SchrittFormular({ fallId, bereich, rolle, schrittId, ansicht, zurueckHref, nachFormular }: Props) {
  const formId = useId();
  const { state, onSubmit: absenden, laeuft } = useFormular<SchrittState>(beantworteSchritt, {});
  // Neuer Versuch ⇒ Merker zurücksetzen; scheitert er erneut, wird er wieder gesetzt.
  const onSubmit: typeof absenden = (e) => {
    setzeMerker(fallId, false);
    absenden(e);
  };
  const fehlerRef = useRef<HTMLParagraphElement>(null);
  const vorrangRef = useRef<HTMLDivElement>(null);
  const f = (feld: string) => state.feldFehler?.[feld]?.join(" ");

  // Fehlerzusammenfassung erhält den Fokus (wie M3, S3).
  // QA N2: Hinweise aus der Bewertung im Speicher (Speichern fehlgeschlagen) erhalten den Fokus.
  useEffect(() => {
    if (state.vorrang) {
      setzeMerker(fallId, true);
      vorrangRef.current?.focus();
    } else if (state.fehler) fehlerRef.current?.focus();
  }, [state, fallId]);

  // QA R3-B2: Hinweise ganz oben (vor der Überschrift) per Portal; ohne Ziel an Ort und Stelle.
  const vorrang = state.vorrang ? (
    <div ref={vorrangRef} tabIndex={-1} className="stack" data-testid="vorrang-hinweise-formular">
      <VorrangHinweise state={state.vorrang} rolle={rolle} />
    </div>
  ) : null;
  const ziel = vorrang && typeof document !== "undefined" ? document.getElementById(VORRANG_ZIEL_ID) : null;

  const ueberspringbar = ansicht.art === "frage" && !ansicht.pflicht;
  // Ohne `nachFormular` stehen die Schaltflächen im Formular; mit wird `form` gesetzt (Zuordnung außerhalb).
  const zuForm = nachFormular === undefined ? undefined : formId;

  const aktionen = (
    <div className="actions" data-testid="schritt-aktionen">
      {/* REQ-308: Bei NOTFALL ist „Fortsetzen“ bewusst nur sekundär – vorrangig ist der Notruf. */}
      <Button form={zuForm} type="submit" variante={ansicht.art === "notfall_weiter" ? "secondary" : "primary"} disabled={laeuft}>
        {laeuft ? "Wird gespeichert …" : ansicht.art === "notfall_weiter" ? "Fragen trotzdem fortsetzen" : "Weiter"}
      </Button>
      {ansicht.art === "bereiche" && (
        <Button form={zuForm} type="submit" variante="secondary" name="aktion" value="alle" disabled={laeuft}>
          Alle Bereiche prüfen
        </Button>
      )}
      {ueberspringbar && (
        <Button form={zuForm} type="submit" variante="secondary" name="aktion" value="ueberspringen" disabled={laeuft}>
          Überspringen
        </Button>
      )}
      {zurueckHref && (
        <Link className="btn btn-secondary" href={zurueckHref}>
          Zurück
        </Link>
      )}
    </div>
  );

  const formular = (
    <form id={formId} className="panel stack" onSubmit={onSubmit} noValidate={ansicht.art !== "krise"} aria-label="Schritt beantworten" data-schritt={schrittId}>
      <input type="hidden" name="fallId" value={fallId} />
      <input type="hidden" name="schritt" value={schrittId} />
      {vorrang && (ziel ? createPortal(vorrang, ziel) : vorrang)}
      {state.fehler && (
        <p className="form-error" role="alert" id="fehler-zusammenfassung" tabIndex={-1} ref={fehlerRef}>
          {state.fehler}
        </p>
      )}

      {ansicht.art === "krise" && (
        <fieldset className="form-section stack">
          <legend>Zuerst einige Fragen zu Ihrer Sicherheit</legend>
          <p className="text-soft" style={{ margin: 0 }}>
            Diese Fragen sind Pflicht. Eine fehlende oder nicht gegebene Antwort werten wir zu Ihrer Sicherheit wie einen
            Hinweis auf eine Krise. {ansicht.ungeprueft && <UngeprueftKennzeichen text="Fragen ungeprüft" />}
          </p>
          <p className="text-soft" style={{ margin: 0 }}>
            {ansicht.fragenHinweis}
          </p>
          {ansicht.fragen.map((q) => (
            <fieldset key={q.id} className="list-row" role="radiogroup" aria-labelledby={`antwort-${q.id}-frage`}>
              <legend id={`antwort-${q.id}-frage`}>{q.text}</legend>
              {KRISE_OPTIONEN.map(([wert, text]) => (
                <label key={wert} className="check-row" htmlFor={`antwort-${q.id}-${wert}`}>
                  <input type="radio" id={`antwort-${q.id}-${wert}`} name={`antwort.${q.id}`} value={wert} required />
                  <span>{text}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </fieldset>
      )}

      {ansicht.art === "schnellcheck" && (
        <>
          <AuswahlFrage
            id="schnellcheck"
            name="symptom"
            typ="mehrfach"
            legende={ansicht.text}
            hilfe={ansicht.hilfe}
            optionen={ansicht.symptome}
            keineOption={{ name: "keine", bezeichnung: ansicht.keineText }}
            fehler={[f("symptome"), f("keine")].filter(Boolean).join(" ") || undefined}
          />
          {ansicht.messwerte.map((m) => (
            <Field
              key={m.id}
              id={`messwert-${m.id}`}
              name={`messwert.${m.id}`}
              inputMode="decimal"
              autoComplete="off"
              label={`${m.bezeichnung} in ${m.einheit}, falls gemessen (optional)`}
              hinweis={`Zum Beispiel 38,5. Zulässig ${m.min}–${m.max} ${m.einheit} (Tippfehlerschutz${m.ungeprueft ? ", ungeprüft" : ""}).`}
              fehler={f(`messwert.${m.id}`)}
            />
          ))}
        </>
      )}

      {ansicht.art === "notfall_weiter" && (
        <div className="stack">
          <h2>Zuerst Notruf {NOTRUF.nummer}</h2>
          <p>
            Ihre Angaben weisen auf einen Notfall hin. Bitte wählen Sie zuerst den Notruf. Die weiteren Fragen ersetzen
            keine Hilfe und können warten.
          </p>
          <div className="actions">
            <a className="btn btn-emergency" href={NOTRUF.href}>
              Notruf {NOTRUF.nummer} anrufen
            </a>
          </div>
          <CheckboxField
            id="bestaetigt"
            name="bestaetigt"
            label="Mir ist bewusst: Bei einem Notfall zuerst 112 – die Fragen ersetzen keine Hilfe."
            fehler={f("bestaetigt")}
          />
        </div>
      )}

      {ansicht.art === "beschreibung" && (
        // REQ-402/REQ-403: freie Beschreibung – Zähler, keine stille Kürzung, Krisen-Kontakte am Feld.
        <BeschreibungFeld maxLaenge={ansicht.maxLaenge} fehler={f} />
      )}

      {ansicht.art === "region" && (
        <div className="stack">
          <h2>Wo sind die Beschwerden?</h2>
          <p className="text-soft" style={{ margin: 0 }}>
            Tippen Sie auf die Stelle in der Körperkarte oder wählen Sie sie aus der Liste. Die Vorderseite zeigt die Person
            von vorne – ihre rechte Seite ist links im Bild.
          </p>
          <KoerperkarteAuswahl ansicht={ansicht} fehler={f("region")} />
        </div>
      )}

      {ansicht.art === "bereiche" && (
        // REQ-323: Bereichsauswahl – einzelne Bereiche oder alle; Prüfung serverseitig.
        <fieldset className="form-section stack bereich-wahl" aria-describedby={f("bereiche") ? "bereiche-fehler" : "bereiche-hilfe"}>
          <legend>Welche Bereiche möchten Sie prüfen?</legend>
          <p className="text-soft" id="bereiche-hilfe" style={{ margin: 0 }}>
            Angeboten werden nur Bereiche mit Demo-Fragen für das Alter Ihres Kindes. Sie können einzelne Bereiche ankreuzen
            oder alle prüfen.
          </p>
          <div className="choice-list">
            {ansicht.bereiche.map((b) => {
              const gesperrt = ansicht.gesperrt.includes(b.id);
              return (
                <label key={b.id} className="check-row" htmlFor={`bereich-${b.id}`}>
                  <input
                    type="checkbox"
                    id={`bereich-${b.id}`}
                    name="bereich"
                    value={b.id}
                    defaultChecked={gesperrt || ansicht.gewaehlt.includes(b.id)}
                    disabled={gesperrt}
                  />
                  {/* QA E3: deaktivierte Felder werden nicht gesendet – der Server ergänzt beantwortete Bereiche ohnehin. */}
                  {gesperrt && <input type="hidden" name="bereich" value={b.id} />}
                  <span>
                    <strong>{b.bezeichnung}</strong>
                    <br />
                    <span className="text-soft">
                      {b.beschreibung}
                      {gesperrt && " · Bereits beantwortet – bleibt im Ergebnis."}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {f("bereiche") && (
            <p className="error" id="bereiche-fehler" style={{ margin: 0 }}>
              {f("bereiche")}
            </p>
          )}
        </fieldset>
      )}

      {ansicht.art === "frage" && ansicht.gruppe && (
        <p className="text-soft" style={{ margin: 0 }} data-testid="bereich-name">
          Bereich: <strong>{ansicht.gruppe}</strong>
        </p>
      )}

      {ansicht.art === "frage" && (
        <>
          {(ansicht.typ === "einfach" || ansicht.typ === "mehrfach") && (
            <AuswahlFrage
              id={`frage-${ansicht.id}`}
              name="wert"
              typ={ansicht.typ}
              legende={ansicht.text}
              hilfe={ansicht.hilfe ?? undefined}
              optionen={ansicht.optionen}
              keineOption={ansicht.keineOption ? { name: "keine", bezeichnung: ansicht.keineOption } : null}
              gewaehlt={
                ansicht.vorher?.typ === "einfach" ? [ansicht.vorher.option] : ansicht.vorher?.typ === "mehrfach" ? ansicht.vorher.optionen : []
              }
              keineGewaehlt={ansicht.vorher?.typ === "mehrfach" && ansicht.vorher.keine}
              fehler={f("wert")}
            />
          )}
          {ansicht.typ === "skala" && ansicht.skala && (
            <SkalaFrage
              id={`frage-${ansicht.id}`}
              name="wert"
              legende={ansicht.text}
              {...ansicht.skala}
              wert={ansicht.vorher?.typ === "skala" ? ansicht.vorher.wert : null}
              hilfe={ansicht.hilfe ?? undefined}
              fehler={f("wert")}
            />
          )}
          {ansicht.typ === "freitext" && (
            <TextareaField
              id={`frage-${ansicht.id}`}
              name="wert"
              label={ansicht.text}
              maxLength={ansicht.maxLaenge ?? undefined}
              rows={3}
              defaultValue={ansicht.vorher?.typ === "freitext" ? ansicht.vorher.text : ""}
              hinweis={`Höchstens ${ansicht.maxLaenge} Zeichen. Bitte nur Testdaten, keine Namen.`}
              fehler={f("wert")}
            />
          )}
          {/* QA B6/RISK-030: Freitext wird nicht auf Krisen ausgewertet – Hilfe daher direkt am Feld. */}
          {ansicht.typ === "freitext" && bereich === "PSYCHISCH" && (
            <KrisenKontakte titel="Wenn Sie an Suizid denken:" id={`frage-${ansicht.id}-krise`} />
          )}
          {ansicht.typ === "dauer" && (
            <DauerFrage
              id={`frage-${ansicht.id}`}
              legende={ansicht.text}
              anzahlName="anzahl"
              einheitName="einheit"
              einheiten={ansicht.einheiten}
              maxAnzahl={ansicht.maxAnzahl ?? 99}
              anzahl={ansicht.vorher?.typ === "dauer" ? ansicht.vorher.anzahl : null}
              einheit={ansicht.vorher?.typ === "dauer" ? ansicht.vorher.einheit : null}
              hilfe={ansicht.hilfe ?? undefined}
              fehler={f("wert")}
            />
          )}
        </>
      )}

      {nachFormular === undefined && aktionen}
    </form>
  );
  if (nachFormular === undefined) return formular;
  return (
    <>
      {formular}
      {nachFormular}
      {aktionen}
    </>
  );
}
