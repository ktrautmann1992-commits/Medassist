import { BEREITSCHAFTSDIENST, NOTRUF, TELEFONSEELSORGE } from "@medassist/core";
import type { ReactNode } from "react";
import { Dringlichkeit } from "./dringlichkeit";

/**
 * REQ-207, REQ-208, REQ-214: Notfall- und Krisenhinweise mit anrufbaren `tel:`-Links.
 * Die Nummern kommen ausschließlich aus `packages/core` (RISK-028).
 */

export interface NotfallhinweisProps {
  /** NOTFALL → Notruf 112; DRINGEND → ärztlicher Bereitschaftsdienst 116117. */
  stufe: "NOTFALL" | "DRINGEND";
  /**
   * S2: Zeitrahmen der ranghöchsten Regel – die Überschrift passt so zum Regeltext
   * (DRINGEND + SOFORT → „Sofort ärztlich abklären lassen“). Standard: SOFORT.
   */
  zeitrahmen?: "SOFORT" | "HEUTE";
  /** Abweichende Überschrift (z. B. Fallback bei einem internen Fehler). */
  titel?: ReactNode;
  children?: ReactNode;
  id?: string;
}

export function notfallTitel(stufe: "NOTFALL" | "DRINGEND", zeitrahmen: "SOFORT" | "HEUTE" = "SOFORT"): string {
  if (stufe === "NOTFALL") return `Sofort Notruf ${NOTRUF.nummer}`;
  return zeitrahmen === "SOFORT" ? "Sofort ärztlich abklären lassen" : "Heute ärztlich abklären lassen";
}

export function Notfallhinweis({ stufe, zeitrahmen = "SOFORT", titel, children, id }: NotfallhinweisProps) {
  const ueberschrift = titel ?? notfallTitel(stufe, zeitrahmen);
  if (stufe === "NOTFALL") {
    return (
      <Dringlichkeit stufe="NOTFALL" titel={ueberschrift} role="alert" id={id}>
        {children}
        <div className="actions urgency-actions">
          <a className="btn btn-emergency" href={NOTRUF.href}>
            Notruf {NOTRUF.nummer} anrufen
          </a>
        </div>
        <p>
          Wenn es kein Notfall ist: {BEREITSCHAFTSDIENST.bezeichnung}{" "}
          <a className="tel-link" href={BEREITSCHAFTSDIENST.href}>
            {BEREITSCHAFTSDIENST.nummer}
          </a>
        </p>
      </Dringlichkeit>
    );
  }
  return (
    <Dringlichkeit stufe="DRINGEND" titel={ueberschrift} role="alert" id={id}>
      {children}
      <p>
        {BEREITSCHAFTSDIENST.bezeichnung}:{" "}
        <a className="tel-link" href={BEREITSCHAFTSDIENST.href}>
          {BEREITSCHAFTSDIENST.nummer}
        </a>
      </p>
      <p>
        Bei Lebensgefahr: {NOTRUF.bezeichnung}{" "}
        <a className="tel-link" href={NOTRUF.href}>
          {NOTRUF.nummer}
        </a>
      </p>
    </Dringlichkeit>
  );
}

export interface KrisenhinweisProps {
  /** S6: `arzt` – an die behandelnde Ärztin bzw. den Arzt gerichtet (Fremdanamnese). */
  adressat?: "patient" | "arzt";
  children?: ReactNode;
  id?: string;
}

/** REQ-208: Krisenhinweis – 112, Telefonseelsorge (beide Nummern), Empfehlung ärztliche Akutvorstellung. */
export function Krisenhinweis({ adressat = "patient", children, id }: KrisenhinweisProps) {
  const arzt = adressat === "arzt";
  return (
    <Dringlichkeit
      stufe="NOTFALL"
      titel={arzt ? "Hinweis auf akute Krise – Akutvorstellung veranlassen" : "Bitte holen Sie sich jetzt Hilfe"}
      role="alert"
      id={id}
    >
      {children}
      <ul className="tel-list">
        <li>
          Akute Gefahr: {NOTRUF.bezeichnung}{" "}
          <a className="tel-link" href={NOTRUF.href}>
            {NOTRUF.nummer}
          </a>
        </li>
        <li>
          {TELEFONSEELSORGE[0]!.bezeichnung}:{" "}
          {TELEFONSEELSORGE.map((k, i) => (
            <span key={k.href}>
              {i > 0 && " oder "}
              <a className="tel-link" href={k.href}>
                {k.nummer}
              </a>
            </span>
          ))}
        </li>
      </ul>
      {arzt ? (
        <p>
          <strong>Empfehlung: ärztliche Akutvorstellung</strong> – Suizidalität klinisch abklären, Akutvorstellung bzw.
          Einweisung veranlassen und die Patientin bzw. den Patienten auf die oben genannten Nummern hinweisen.
        </p>
      ) : (
        <p>
          <strong>Empfehlung: ärztliche Akutvorstellung</strong> – lassen Sie sich umgehend ärztlich vorstellen, zum
          Beispiel in einer Notaufnahme.
        </p>
      )}
    </Dringlichkeit>
  );
}

/**
 * REQ-311: Neutraler, stets sichtbarer Hinweis „Hilfe in Krisen“ im seelischen Ablauf –
 * Information, keine Dringlichkeit (keine Warnfarbe, kein Rosé). Nummern aus `packages/core`.
 */
export function KrisenKontakte({ titel = "Hilfe in Krisen – jederzeit erreichbar:", id }: { titel?: string; id?: string } = {}) {
  return (
    <div className="panel note" role="note" data-testid="krisen-kontakte" id={id}>
      <span className="note-icon" aria-hidden="true">
        i
      </span>
      <div>
        <strong>{titel} </strong>
        {NOTRUF.bezeichnung}{" "}
        <a className="tel-link" href={NOTRUF.href}>
          {NOTRUF.nummer}
        </a>
        {" · "}
        {TELEFONSEELSORGE[0]!.bezeichnung}{" "}
        {TELEFONSEELSORGE.map((k, i) => (
          <span key={k.href}>
            {i > 0 && " oder "}
            <a className="tel-link" href={k.href}>
              {k.nummer}
            </a>
          </span>
        ))}
      </div>
    </div>
  );
}
