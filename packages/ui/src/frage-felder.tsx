import type { DringlichkeitStufe } from "@medassist/core";
import type { ReactNode } from "react";
import { DRINGLICHKEIT_DARSTELLUNG } from "./dringlichkeit";

/**
 * REQ-310: Eingabefelder für die Schritte der geführten Eingrenzung. Reine Darstellung
 * (Formularfelder mit `name`), Prüfung ausschließlich serverseitig. Alle Bedienelemente
 * mind. 48 px hoch, Fehlermeldung per `aria-describedby`, Fachbegriff kursiv (`.term`).
 */

export interface AuswahlOption {
  wert: string;
  bezeichnung: string;
  fachbegriff?: string | null;
  /** Für Warnzeichen: zusätzliche Kennzeichnung als Text (nie nur Farbe). */
  zusatz?: string;
}

function Bezeichnung({ o }: { o: AuswahlOption }) {
  return (
    <span>
      {o.bezeichnung}
      {o.fachbegriff && (
        <>
          {" "}
          (<span className="term">{o.fachbegriff}</span>)
        </>
      )}
      {o.zusatz && <span className="text-soft"> · {o.zusatz}</span>}
    </span>
  );
}

function Meldungen({ id, hilfe, fehler }: { id: string; hilfe?: ReactNode; fehler?: string }) {
  return (
    <>
      {hilfe && (
        <p className="text-soft" id={`${id}-hilfe`} style={{ margin: 0 }}>
          {hilfe}
        </p>
      )}
      {fehler && (
        <p className="error" id={`${id}-fehler`} style={{ margin: 0 }}>
          {fehler}
        </p>
      )}
    </>
  );
}

function beschreibung(id: string, hilfe?: ReactNode, fehler?: string): string | undefined {
  return [hilfe && `${id}-hilfe`, fehler && `${id}-fehler`].filter(Boolean).join(" ") || undefined;
}

export interface AuswahlFrageProps {
  id: string;
  /** Formularfeld der Optionen. */
  name: string;
  typ: "einfach" | "mehrfach";
  legende: ReactNode;
  optionen: readonly AuswahlOption[];
  /** Ausschließende Option „Nichts davon“ (nur Mehrfachauswahl). */
  keineOption?: { name: string; bezeichnung: string } | null;
  gewaehlt?: readonly string[];
  keineGewaehlt?: boolean;
  hilfe?: ReactNode;
  fehler?: string;
  /** Pflichtangabe im Browser (zusätzlich zur Serverprüfung), nur Einfachauswahl. */
  required?: boolean;
}

export function AuswahlFrage({ id, name, typ, legende, optionen, keineOption, gewaehlt = [], keineGewaehlt, hilfe, fehler, required }: AuswahlFrageProps) {
  const art = typ === "einfach" ? "radio" : "checkbox";
  return (
    <fieldset className="form-section stack" id={id} aria-describedby={beschreibung(id, hilfe, fehler)} aria-invalid={fehler ? true : undefined}>
      <legend>{legende}</legend>
      <Meldungen id={id} hilfe={hilfe} fehler={fehler} />
      <div className="choice-list">
        {optionen.map((o) => (
          <label key={o.wert} className="check-row" htmlFor={`${id}-${o.wert}`}>
            <input type={art} id={`${id}-${o.wert}`} name={name} value={o.wert} defaultChecked={gewaehlt.includes(o.wert)} required={required} />
            <Bezeichnung o={o} />
          </label>
        ))}
      </div>
      {keineOption && (
        <label className="check-row check-row-keine" htmlFor={`${id}-keine`}>
          <input type="checkbox" id={`${id}-keine`} name={keineOption.name} defaultChecked={keineGewaehlt} />
          <span>{keineOption.bezeichnung}</span>
        </label>
      )}
    </fieldset>
  );
}

export interface SkalaFrageProps {
  id: string;
  name: string;
  legende: ReactNode;
  min: number;
  max: number;
  minText: string;
  maxText: string;
  wert?: number | null;
  hilfe?: ReactNode;
  fehler?: string;
}

/** Skala (z. B. 0–10) als Optionsfelder – Zahl plus Endbeschriftung als Text. */
export function SkalaFrage({ id, name, legende, min, max, minText, maxText, wert, hilfe, fehler }: SkalaFrageProps) {
  const werte = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <fieldset className="form-section stack" id={id} aria-describedby={beschreibung(id, hilfe, fehler)} aria-invalid={fehler ? true : undefined}>
      <legend>{legende}</legend>
      <Meldungen id={id} hilfe={hilfe} fehler={fehler} />
      <div className="scale-row">
        {werte.map((w) => (
          <label key={w} htmlFor={`${id}-${w}`}>
            <input type="radio" id={`${id}-${w}`} name={name} value={String(w)} defaultChecked={wert === w} />
            <span>
              {w}
              {w === min && <span className="visually-hidden"> – {minText}</span>}
              {w === max && <span className="visually-hidden"> – {maxText}</span>}
            </span>
          </label>
        ))}
      </div>
      <p className="scale-ends text-soft">
        <span>{minText}</span>
        <span>{maxText}</span>
      </p>
    </fieldset>
  );
}

export interface DauerFrageProps {
  id: string;
  legende: ReactNode;
  anzahlName: string;
  einheitName: string;
  einheiten: readonly { wert: string; bezeichnung: string }[];
  maxAnzahl: number;
  anzahl?: number | null;
  einheit?: string | null;
  hilfe?: ReactNode;
  fehler?: string;
}

export function DauerFrage({ id, legende, anzahlName, einheitName, einheiten, maxAnzahl, anzahl, einheit, hilfe, fehler }: DauerFrageProps) {
  const desc = beschreibung(id, hilfe, fehler);
  return (
    <fieldset className="form-section stack" id={id} aria-describedby={desc}>
      <legend>{legende}</legend>
      <Meldungen id={id} hilfe={hilfe} fehler={fehler} />
      <div className="dauer-row">
        <div className={fehler ? "field has-error" : "field"}>
          <label htmlFor={`${id}-anzahl`}>Anzahl (1–{maxAnzahl})</label>
          <input
            id={`${id}-anzahl`}
            name={anzahlName}
            inputMode="numeric"
            autoComplete="off"
            defaultValue={anzahl ?? ""}
            aria-invalid={fehler ? true : undefined}
            aria-describedby={desc}
          />
        </div>
        <div className={fehler ? "field has-error" : "field"}>
          <label htmlFor={`${id}-einheit`}>Einheit</label>
          <select id={`${id}-einheit`} name={einheitName} defaultValue={einheit ?? ""} aria-invalid={fehler ? true : undefined} aria-describedby={desc}>
            <option value="">Bitte wählen</option>
            {einheiten.map((e) => (
              <option key={e.wert} value={e.wert}>
                {e.bezeichnung}
              </option>
            ))}
          </select>
        </div>
      </div>
    </fieldset>
  );
}

export interface SchrittanzeigeProps {
  nummer: number;
  gesamt: number;
}

/** Fortschritt „Schritt x von y“ (Text plus Balken in der Markenfarbe – keine Warnung). */
export function Schrittanzeige({ nummer, gesamt }: SchrittanzeigeProps) {
  const prozent = Math.round((Math.min(nummer, gesamt) / Math.max(gesamt, 1)) * 100);
  return (
    <div className="steps" data-testid="schrittanzeige">
      <span className="text-soft">
        Schritt {nummer} von {gesamt}
      </span>
      <div className="steps-bar" role="progressbar" aria-label="Fortschritt" aria-valuemin={1} aria-valuemax={gesamt} aria-valuenow={nummer}>
        <span style={{ width: `${prozent}%` }} />
      </div>
    </div>
  );
}

/** REQ-317: Kompakte Dringlichkeit für Listen – Farbe + Symbol + Text, nie nur Farbe. */
export function DringlichkeitKurz({ stufe, ohneStufe = "Noch nicht geprüft" }: { stufe: DringlichkeitStufe | null; ohneStufe?: string }) {
  // Ohne Dringlichkeit: neutraler Text vom Aufrufer (z. B. „Noch nicht geprüft“) – nie pauschal „keine Warnzeichen“.
  if (!stufe) return <span className="badge">{ohneStufe}</span>;
  const d = DRINGLICHKEIT_DARSTELLUNG[stufe];
  return (
    <span className={`urgency-tag ${d.klasse}`} data-dringlichkeit={stufe}>
      <span aria-hidden="true">{d.symbol}</span> {d.stufe}
    </span>
  );
}
