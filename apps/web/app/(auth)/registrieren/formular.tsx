"use client";

import { useState } from "react";
import { Button, Field } from "@medassist/ui";
import { PASSWORT_MIN_LAENGE, ROLLEN_BEZEICHNUNG, type Rolle } from "@medassist/core";
import { useFormular } from "@/lib/forms/use-formular";
import { registrieren } from "./actions";

const checkbox = { width: "24px", minHeight: "24px", flex: "none", margin: 0 } as const;
const checkboxZeile = { display: "flex", gap: "var(--space-3)", alignItems: "center", minHeight: "48px" } as const;

export function RegistrierungsFormular() {
  const { state, onSubmit, laeuft } = useFormular(registrieren);
  const [rolle, setRolle] = useState<Rolle>("PATIENT");
  const f = (feld: string) => state.feldFehler?.[feld]?.[0];

  if (state.verifizierungsLink) {
    return (
      <div className="panel stack" role="status">
        <h2>Fast geschafft</h2>
        <p>{state.erfolg}</p>
        <div className="panel panel-data stack">
          <p>
            <strong>Prototyp:</strong> Es wird keine E-Mail versendet. Öffnen Sie diesen Bestätigungslink:
          </p>
          <a href={state.verifizierungsLink}>E-Mail-Adresse bestätigen</a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel stack" noValidate>
      {state.fehler && (
        <p className="error" role="alert" style={{ color: "var(--emergency)" }}>
          {state.fehler}
        </p>
      )}

      {/* REQ-010: Rollenwahl */}
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: "var(--space-2)" }}>Ich registriere mich als</legend>
        <div className="grid">
          {(["PATIENT", "ARZT"] as const).map((r) => (
            <label key={r} className="entry-option" aria-pressed={rolle === r}>
              <span style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
                <input
                  type="radio"
                  name="rolle"
                  value={r}
                  checked={rolle === r}
                  onChange={() => setRolle(r)}
                  style={checkbox}
                />
                <strong>{ROLLEN_BEZEICHNUNG[r]}</strong>
              </span>
              <span className="text-soft">
                {r === "PATIENT"
                  ? "Für mich und meine Kinder. Ergebnisse als „Verdacht – ärztlich abzuklären“."
                  : "Für meine Patienten. Differentialdiagnosen, Therapie- und Medikationsplan."}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field id="email" name="email" type="email" label="E-Mail-Adresse" autoComplete="email" required fehler={f("email")} />
      <Field
        id="passwort"
        name="passwort"
        type="password"
        label="Passwort"
        autoComplete="new-password"
        required
        hinweis={`Mindestens ${PASSWORT_MIN_LAENGE} Zeichen, Buchstaben mit Ziffern oder Sonderzeichen.`}
        fehler={f("passwort")}
      />

      {rolle === "ARZT" && (
        <div className="panel panel-rose stack">
          <h3>Nachweis der Approbation</h3>
          <p className="text-soft">
            Prototyp: Die Prüfung wird simuliert und im Konto als „simuliert“ gekennzeichnet.
          </p>
          <Field
            id="approbationsbehoerde"
            name="approbationsbehoerde"
            label="Ausstellende Behörde"
            required
            fehler={f("approbationsbehoerde")}
          />
          <Field
            id="approbationsdatum"
            name="approbationsdatum"
            type="date"
            label="Datum der Approbation"
            required
            fehler={f("approbationsdatum")}
          />
        </div>
      )}

      <label style={checkboxZeile}>
        <input type="checkbox" name="nurTestdaten" style={checkbox} />
        <span>Ich gebe ausschließlich Testdaten ein, keine echten Gesundheitsdaten.</span>
      </label>
      {f("nurTestdaten") && <span className="error" style={{ color: "var(--emergency)" }}>{f("nurTestdaten")}</span>}

      <label style={checkboxZeile}>
        <input type="checkbox" name="einwilligungDatenschutz" style={checkbox} />
        <span>
          Ich willige in die Verarbeitung meiner Gesundheitsdaten gemäß Art. 9 DSGVO ein und akzeptiere die
          Nutzungsbedingungen.
        </span>
      </label>
      {f("einwilligungDatenschutz") && (
        <span className="error" style={{ color: "var(--emergency)" }}>{f("einwilligungDatenschutz")}</span>
      )}

      <div>
        <Button type="submit" disabled={laeuft}>
          {laeuft ? "Wird angelegt …" : "Konto anlegen"}
        </Button>
      </div>
    </form>
  );
}
