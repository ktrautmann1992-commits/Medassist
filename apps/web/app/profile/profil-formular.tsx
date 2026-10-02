"use client";

import {
  AKTIVITAET_BEZEICHNUNG,
  AKTIVITAETEN,
  ALKOHOL_BEZEICHNUNG,
  ALKOHOL_KONSUM,
  ALLERGIE_TYP_BEZEICHNUNG,
  ALLERGIE_TYPEN,
  EINRICHTUNG_BEZEICHNUNG,
  EINRICHTUNGEN,
  GESCHLECHT_BEZEICHNUNG,
  GESCHLECHTER,
  ORGAN_FUNKTION_BEZEICHNUNG,
  ORGAN_FUNKTIONEN,
  PLAUSIBILITAET,
  RAUCH_BEZEICHNUNG,
  RAUCH_STATUS,
  SCHWANGERSCHAFT_BEZEICHNUNG,
  SCHWANGERSCHAFT_STATUS,
  SPRACHSITUATION_BEZEICHNUNG,
  SPRACHSITUATIONEN,
  VORSORGE_BEZEICHNUNG,
  VORSORGE_TYPEN,
  type Geschlecht,
} from "@medassist/core";
import { Button, CheckboxField, Field, Hinweis, Panel, SelectField, TextareaField, optionenAus } from "@medassist/ui";
import Link from "next/link";
import { useState } from "react";
import type { FormState } from "@/lib/forms/state";
import { useFormular } from "@/lib/forms/use-formular";
import type { ProfilAnsicht } from "@/lib/profile/ansicht";
import { eingabeZahl } from "@/lib/profile/format";
import { ListenEditor } from "./listen-editor";

/**
 * Profilformular für alle Fälle (REQ-100, REQ-106, REQ-107, REQ-113, REQ-114).
 * Welche Felder angezeigt werden, steuert die Seite (Server) über `istArzt`/`kind`;
 * die maßgebliche Prüfung erfolgt in der Server Action (REQ-116).
 */
export type FormularModus = "eigen-neu" | "kind-neu" | "patient-neu" | "bearbeiten";

export interface ProfilFormularProps {
  action: (vorher: FormState, formData: FormData) => Promise<FormState>;
  modus: FormularModus;
  /** Rolle ARZT – nur dann werden Arzt-Felder angezeigt (REQ-114). */
  istArzt: boolean;
  /** Kinderprofil (beim Bearbeiten fest; bei „patient-neu“ Startwert der Auswahl). */
  kind: boolean;
  werte?: ProfilAnsicht;
  abbrechenHref: string;
}

const term = (text: string) => <span className="term">{text}</span>;
const zeigtPackungsjahre = (r: string) => r === "EHEMALIG" || r === "AKTUELL";

export function ProfilFormular({ action, modus, istArzt, kind: kindStart, werte, abbrechenHref }: ProfilFormularProps) {
  const { state, onSubmit, laeuft } = useFormular(action);
  const f = (feld: string) => state.feldFehler?.[feld]?.[0];

  const [kind, setKind] = useState(kindStart);
  const [geschlecht, setGeschlecht] = useState<Geschlecht | "">(werte?.geschlecht ?? "");
  const [rauchen, setRauchen] = useState<string>(werte?.rauchen ?? "UNBEKANNT");
  const [einrichtung, setEinrichtung] = useState<string>(werte?.kind?.einrichtung ?? "");

  const k = werte?.kind;
  const listenProps = { fehler: f, fehlerStand: state };

  return (
    <form onSubmit={onSubmit} className="stack" noValidate>
      {werte && <input type="hidden" name="profilId" value={werte.id} />}
      {state.fehler && (
        <p className="form-error" role="alert">
          {state.fehler}
        </p>
      )}

      {modus === "patient-neu" && (
        <Panel titel="Art des Profils">
          <SelectField
            id="profilart"
            name="profilart"
            label="Profil für"
            value={kind ? "KIND" : "ERWACHSEN"}
            onChange={(e) => setKind(e.target.value === "KIND")}
            optionen={[
              { wert: "ERWACHSEN", bezeichnung: "Erwachsene Person" },
              { wert: "KIND", bezeichnung: "Kind oder Jugendliche/r (mit Kinderdaten)" },
            ]}
          />
        </Panel>
      )}

      <Panel titel="Stammdaten">
        <div className="grid">
          <Field id="vorname" name="vorname" label="Vorname" autoComplete="off" defaultValue={werte?.vorname} fehler={f("vorname")} />
          <Field id="nachname" name="nachname" label="Nachname" autoComplete="off" defaultValue={werte?.nachname} fehler={f("nachname")} />
          <Field
            id="geburtsdatum"
            name="geburtsdatum"
            type="date"
            label="Geburtsdatum"
            defaultValue={werte?.geburtsdatum}
            hinweis="Das Alter wird daraus berechnet."
            fehler={f("geburtsdatum")}
          />
          <SelectField
            id="geschlecht"
            name="geschlecht"
            label="Geschlecht"
            leereOption="Bitte wählen"
            optionen={optionenAus(GESCHLECHTER, GESCHLECHT_BEZEICHNUNG)}
            value={geschlecht}
            onChange={(e) => setGeschlecht(e.target.value as Geschlecht | "")}
            fehler={f("geschlecht")}
          />
          <Field
            id="groesseCm"
            name="groesseCm"
            inputMode="decimal"
            label="Größe in cm"
            defaultValue={eingabeZahl(werte?.groesseCm)}
            hinweis="Optional, z. B. 172 oder 61,5"
            fehler={f("groesseCm")}
          />
          <Field
            id="gewichtKg"
            name="gewichtKg"
            inputMode="decimal"
            label="Gewicht in kg"
            defaultValue={eingabeZahl(werte?.gewichtKg)}
            hinweis={kind ? "Optional; wichtig für Dosierungen bei Kindern." : "Optional; BMI wird berechnet."}
            fehler={f("gewichtKg")}
          />
          {/* REQ-104: bei „männlich“ und bei Kinderprofilen nicht angezeigt; der Server weist
              unpassende Werte ab bzw. speichert bei Kinderprofilen „unbekannt“. */}
          {!kind && geschlecht !== "MAENNLICH" && (
            <SelectField
              id="schwangerschaft"
              name="schwangerschaft"
              label="Schwangerschaft / Stillzeit"
              optionen={optionenAus(SCHWANGERSCHAFT_STATUS, SCHWANGERSCHAFT_BEZEICHNUNG)}
              defaultValue={werte?.schwangerschaft ?? "UNBEKANNT"}
              fehler={f("schwangerschaft")}
            />
          )}
        </div>
        {/* REQ-104: ausgeblendeter, aber gespeicherter Wert wird sichtbar gemacht statt still verworfen. */}
        {/* aria-live: Der Hinweis erscheint dynamisch beim Umschalten und wird so angesagt. */}
        <div aria-live="polite">
          {!kind && geschlecht === "MAENNLICH" && (werte?.schwangerschaft === "SCHWANGER" || werte?.schwangerschaft === "STILLEND") && (
            <Hinweis titel="Schwangerschaft/Stillzeit:">
              Gespeichert ist „{SCHWANGERSCHAFT_BEZEICHNUNG[werte.schwangerschaft]}“. Das passt nicht zum Geschlecht
              „männlich“ – beim Speichern wird die Angabe auf „keine Angabe“ zurückgesetzt. Bitte das Geschlecht prüfen.
            </Hinweis>
          )}
        </div>
        {geschlecht === "MAENNLICH" && f("schwangerschaft") && (
          <p className="form-error" role="alert">
            {f("schwangerschaft")}
          </p>
        )}
      </Panel>

      {kind && (
        <Panel titel="Geburt, Betreuung und Sprache">
          <div className="grid">
            <Field
              id="sswWochen"
              name="sswWochen"
              inputMode="numeric"
              label={<>Schwangerschaftswoche bei Geburt (Wochen, {term("SSW")})</>}
              defaultValue={k?.sswWochen ?? ""}
              hinweis={`${PLAUSIBILITAET.sswWochen.min}–${PLAUSIBILITAET.sswWochen.max}. Unter 37 Wochen wird das korrigierte Alter berechnet.`}
              fehler={f("sswWochen")}
            />
            <Field
              id="sswTage"
              name="sswTage"
              inputMode="numeric"
              label="Zusätzliche Tage (0–6)"
              defaultValue={k?.sswTage ?? ""}
              hinweis="Beispiel 32+4: Wochen 32, Tage 4"
              fehler={f("sswTage")}
            />
            <Field
              id="geburtsgewichtG"
              name="geburtsgewichtG"
              inputMode="numeric"
              label="Geburtsgewicht in g"
              defaultValue={k?.geburtsgewichtG ?? ""}
              fehler={f("geburtsgewichtG")}
            />
            <SelectField
              id="einrichtung"
              name="einrichtung"
              label="Betreuung / Kita / Schule"
              leereOption="keine Angabe"
              optionen={optionenAus(EINRICHTUNGEN, EINRICHTUNG_BEZEICHNUNG)}
              value={einrichtung}
              onChange={(e) => setEinrichtung(e.target.value)}
              fehler={f("einrichtung")}
            />
            <Field
              id="einrichtungName"
              name="einrichtungName"
              label="Name der Einrichtung"
              defaultValue={k?.einrichtungName ?? ""}
              hinweis="Optional"
              fehler={f("einrichtungName")}
            />
            {einrichtung === "SCHULE" && (
              <Field
                id="klassenstufe"
                name="klassenstufe"
                inputMode="numeric"
                label="Klassenstufe"
                defaultValue={k?.klassenstufe ?? ""}
                fehler={f("klassenstufe")}
              />
            )}
            <SelectField
              id="sprachsituation"
              name="sprachsituation"
              label="Ein- oder Mehrsprachigkeit"
              leereOption="keine Angabe"
              optionen={optionenAus(SPRACHSITUATIONEN, SPRACHSITUATION_BEZEICHNUNG)}
              defaultValue={k?.sprachsituation ?? ""}
              hinweis="Wichtig für die Einschätzung der Sprachentwicklung."
              fehler={f("sprachsituation")}
            />
            <Field
              id="sprachen"
              name="sprachen"
              label="Gesprochene Sprachen"
              defaultValue={k?.sprachen.join(", ") ?? ""}
              hinweis="Mit Komma trennen, z. B. Deutsch, Türkisch"
              fehler={f("sprachen")}
            />
          </div>
        </Panel>
      )}

      <Panel titel={<>Vorerkrankungen ({term("Anamnese")})</>}>
        <ListenEditor
          name="vorerkrankungen"
          einzeln="Vorerkrankung"
          spalten={[
            { name: "bezeichnung", label: "Erkrankung" },
            {
              name: "icd10Code",
              label: <>Code ({term("ICD-10-GM")})</>,
              hinweis: "Optional. Nur Formatprüfung (z. B. J45.0) – im Prototyp kein Abgleich mit dem ICD-Katalog.",
            },
          ]}
          anfang={(werte?.vorerkrankungen ?? []).map((v) => ({ bezeichnung: v.bezeichnung, icd10Code: v.icd10Code ?? "" }))}
          {...listenProps}
        />
      </Panel>

      <Panel titel="Operationen">
        <ListenEditor
          name="operationen"
          einzeln="Operation"
          spalten={[
            { name: "bezeichnung", label: "Operation" },
            { name: "datum", label: "Datum", typ: "date", hinweis: "Optional" },
          ]}
          anfang={(werte?.operationen ?? []).map((o) => ({ bezeichnung: o.bezeichnung, datum: o.datum ?? "" }))}
          {...listenProps}
        />
      </Panel>

      <Panel titel="Allergien und Unverträglichkeiten">
        <ListenEditor
          name="allergien"
          einzeln="Allergie/Unverträglichkeit"
          spalten={[
            { name: "typ", label: "Art", typ: "select", optionen: optionenAus(ALLERGIE_TYPEN, ALLERGIE_TYP_BEZEICHNUNG) },
            { name: "ausloeser", label: "Auslöser", hinweis: "z. B. Wirkstoff, Nahrungsmittel" },
            { name: "reaktion", label: "Reaktion", hinweis: "Optional, z. B. Hautausschlag" },
          ]}
          anfang={(werte?.allergien ?? []).map((a) => ({ typ: a.typ, ausloeser: a.ausloeser, reaktion: a.reaktion ?? "" }))}
          {...listenProps}
        />
      </Panel>

      <Panel titel={<>Dauermedikation</>}>
        <ListenEditor
          name="dauermedikation"
          einzeln="Medikament"
          spalten={[
            { name: "wirkstoff", label: "Wirkstoff" },
            { name: "staerke", label: "Stärke", hinweis: "Optional, z. B. 5 mg" },
            { name: "dosierung", label: "Dosierung", hinweis: "Optional, z. B. 1-0-0-0" },
          ]}
          anfang={(werte?.dauermedikation ?? []).map((m) => ({
            wirkstoff: m.wirkstoff,
            staerke: m.staerke ?? "",
            dosierung: m.dosierung ?? "",
          }))}
          {...listenProps}
        />
      </Panel>

      <Panel titel="Familie und Lebensstil">
        <TextareaField
          id="familienanamnese"
          name="familienanamnese"
          label={<>Erkrankungen in der Familie ({term("Familienanamnese")})</>}
          defaultValue={werte?.familienanamnese ?? ""}
          hinweis="Optional"
          fehler={f("familienanamnese")}
        />
        <div className="grid">
          <SelectField
            id="rauchen"
            name="rauchen"
            label="Rauchen"
            optionen={optionenAus(RAUCH_STATUS, RAUCH_BEZEICHNUNG)}
            value={rauchen}
            onChange={(e) => setRauchen(e.target.value)}
            fehler={f("rauchen")}
          />
          {zeigtPackungsjahre(rauchen) && (
            <Field
              id="packungsjahre"
              name="packungsjahre"
              inputMode="decimal"
              label={<>Packungsjahre ({term("pack years")})</>}
              defaultValue={eingabeZahl(werte?.packungsjahre)}
              hinweis="Optional: Päckchen pro Tag × Raucherjahre"
              fehler={f("packungsjahre")}
            />
          )}
          <SelectField
            id="alkohol"
            name="alkohol"
            label="Alkohol"
            optionen={optionenAus(ALKOHOL_KONSUM, ALKOHOL_BEZEICHNUNG)}
            defaultValue={werte?.alkohol ?? "UNBEKANNT"}
            fehler={f("alkohol")}
          />
          <SelectField
            id="sport"
            name="sport"
            label="Sport / Bewegung"
            optionen={optionenAus(AKTIVITAETEN, AKTIVITAET_BEZEICHNUNG)}
            defaultValue={werte?.sport ?? "UNBEKANNT"}
            fehler={f("sport")}
          />
        </div>
      </Panel>

      <Panel titel="Impfungen">
        <TextareaField
          id="impfstatusNotiz"
          name="impfstatusNotiz"
          label="Impfstatus (Notiz)"
          defaultValue={werte?.impfstatusNotiz ?? ""}
          hinweis="Optional, z. B. „laut Impfpass vollständig“"
          fehler={f("impfstatusNotiz")}
        />
        <ListenEditor
          name="impfungen"
          einzeln="Impfung"
          spalten={[
            { name: "gegen", label: "Impfung gegen" },
            { name: "impfstoff", label: "Impfstoff", hinweis: "Optional" },
            { name: "datum", label: "Datum", typ: "date", hinweis: "Optional" },
            { name: "dosisNr", label: "Dosis Nr.", typ: "ganzzahl", hinweis: "Optional" },
          ]}
          anfang={(werte?.impfungen ?? []).map((i) => ({
            gegen: i.gegen,
            impfstoff: i.impfstoff ?? "",
            datum: i.datum ?? "",
            dosisNr: i.dosisNr != null ? String(i.dosisNr) : "",
          }))}
          {...listenProps}
        />
      </Panel>

      {kind && (
        <Panel titel="Vorsorgeuntersuchungen (U1–U9, J1)">
          <p className="text-soft">Nur ausfüllen, was bekannt ist (z. B. aus dem gelben Heft).</p>
          <div className="grid">
            {VORSORGE_TYPEN.map((typ, i) => {
              const v = k?.vorsorge.find((x) => x.typ === typ);
              return (
                <fieldset key={typ} className="list-row stack">
                  <legend>{VORSORGE_BEZEICHNUNG[typ]}</legend>
                  <input type="hidden" name={`vorsorge.${i}.typ`} value={typ} />
                  <Field
                    id={`vorsorge-${i}-datum`}
                    name={`vorsorge.${i}.datum`}
                    type="date"
                    label={`${VORSORGE_BEZEICHNUNG[typ]}: Datum`}
                    defaultValue={v?.datum ?? ""}
                    fehler={f(`vorsorge.${i}.datum`) ?? f(`vorsorge.${i}.typ`)}
                  />
                  <SelectField
                    id={`vorsorge-${i}-ergebnis`}
                    name={`vorsorge.${i}.ergebnis`}
                    label={`${VORSORGE_BEZEICHNUNG[typ]}: Ergebnis`}
                    leereOption="nicht erfasst"
                    optionen={[
                      { wert: "UNAUFFAELLIG", bezeichnung: "unauffällig" },
                      { wert: "AUFFAELLIG", bezeichnung: "auffällig" },
                    ]}
                    defaultValue={v && v.ergebnis !== "UNBEKANNT" ? v.ergebnis : ""}
                    fehler={f(`vorsorge.${i}.ergebnis`)}
                  />
                </fieldset>
              );
            })}
          </div>
        </Panel>
      )}

      {kind && (
        <Panel titel="Größe und Gewicht im Verlauf">
          <ListenEditor
            name="wachstum"
            einzeln="Messung"
            spalten={[
              { name: "gemessenAm", label: "Messdatum", typ: "date" },
              { name: "groesseCm", label: "Größe in cm", typ: "zahl" },
              { name: "gewichtKg", label: "Gewicht in kg", typ: "zahl" },
              { name: "kopfumfangCm", label: "Kopfumfang in cm", typ: "zahl", hinweis: "Optional" },
            ]}
            anfang={(k?.wachstum ?? []).map((w) => ({
              gemessenAm: w.gemessenAm,
              groesseCm: eingabeZahl(w.groesseCm),
              gewichtKg: eingabeZahl(w.gewichtKg),
              kopfumfangCm: eingabeZahl(w.kopfumfangCm),
            }))}
            {...listenProps}
          />
        </Panel>
      )}

      {/* REQ-114: nur für Ärzte – der Server prüft zusätzlich die Rolle. */}
      {istArzt && (
        <Panel variante="data" titel="Organfunktion und Laborwerte (nur ärztlich)">
          <div className="grid">
            <SelectField
              id="nierenfunktion"
              name="nierenfunktion"
              label="Nierenfunktion"
              optionen={optionenAus(ORGAN_FUNKTIONEN, ORGAN_FUNKTION_BEZEICHNUNG)}
              defaultValue={werte?.arzt?.nierenfunktion ?? "UNBEKANNT"}
              fehler={f("nierenfunktion")}
            />
            <SelectField
              id="leberfunktion"
              name="leberfunktion"
              label="Leberfunktion"
              optionen={optionenAus(ORGAN_FUNKTIONEN, ORGAN_FUNKTION_BEZEICHNUNG)}
              defaultValue={werte?.arzt?.leberfunktion ?? "UNBEKANNT"}
              fehler={f("leberfunktion")}
            />
          </div>
          <h3>Laborwerte</h3>
          <ListenEditor
            name="laborwerte"
            einzeln="Laborwert"
            spalten={[
              { name: "parameter", label: "Parameter", hinweis: "z. B. Kreatinin, eGFR" },
              { name: "wert", label: "Wert", typ: "zahl" },
              { name: "einheit", label: "Einheit", hinweis: "z. B. mg/dl" },
              { name: "gemessenAm", label: "Datum der Messung", typ: "date" },
            ]}
            anfang={(werte?.arzt?.laborwerte ?? []).map((l) => ({
              parameter: l.parameter,
              wert: eingabeZahl(l.wert),
              einheit: l.einheit,
              gemessenAm: l.gemessenAm,
            }))}
            {...listenProps}
          />
        </Panel>
      )}

      {modus === "kind-neu" && (
        <Panel titel="Sorgerecht">
          <CheckboxField
            id="sorgerechtBestaetigt"
            name="sorgerechtBestaetigt"
            label="Ich bin für dieses Kind sorgeberechtigt."
            hinweis="Prototyp: Bestätigung per Häkchen. Ein Nachweis wird vor echtem Einsatz rechtlich geklärt."
            fehler={f("sorgerechtBestaetigt")}
          />
        </Panel>
      )}

      {state.feldFehler && <p className="form-error">Es gibt Eingabefehler – bitte die markierten Felder oben prüfen.</p>}
      <div className="actions">
        <Button type="submit" disabled={laeuft}>
          {laeuft ? "Wird gespeichert …" : "Profil speichern"}
        </Button>
        <Link className="btn btn-secondary" href={abbrechenHref}>
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
