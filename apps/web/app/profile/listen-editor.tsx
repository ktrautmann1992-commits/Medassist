"use client";

import { Button, Field, SelectField, type Option } from "@medassist/ui";
import { useEffect, useState, type ReactNode } from "react";

/**
 * REQ-101: Liste im Formular – Zeilen hinzufügen und entfernen.
 *
 * Felder sind unkontrolliert (Werte bleiben im DOM, auch nach Validierungsfehlern,
 * siehe `useFormular`). Namen folgen dem Muster `liste.<index>.<feld>`, passend zu
 * `formDataZuObjekt` und den Fehlerpfaden aus zod.
 */
export interface Spalte {
  name: string;
  label: ReactNode;
  typ?: "text" | "date" | "zahl" | "ganzzahl" | "select";
  optionen?: readonly Option[];
  leereOption?: string;
  hinweis?: ReactNode;
}

interface Zeile {
  key: number;
  werte: Record<string, string>;
}

export interface ListenEditorProps {
  name: string;
  /** Bezeichnung einer Zeile, z. B. „Vorerkrankung“. */
  einzeln: string;
  spalten: readonly Spalte[];
  anfang: readonly Record<string, string>[];
  /** Fehlermeldung zum Pfad `name.index.feld`. */
  fehler: (pfad: string) => string | undefined;
  /** Bezug für Fehlermeldungen: nach Entfernen einer Zeile werden alte Meldungen ausgeblendet. */
  fehlerStand: unknown;
}

export function ListenEditor({ name, einzeln, spalten, anfang, fehler, fehlerStand }: ListenEditorProps) {
  const [zeilen, setZeilen] = useState<Zeile[]>(() => anfang.map((werte, i) => ({ key: i, werte })));
  const [fokusIndex, setFokusIndex] = useState<number | null>(null);
  const [ausgeblendet, setAusgeblendet] = useState<unknown>(null);
  const zeigeFehler = ausgeblendet !== fehlerStand;

  useEffect(() => {
    if (fokusIndex === null) return;
    document.getElementById(`${name}-${fokusIndex}-${spalten[0]?.name}`)?.focus();
  }, [fokusIndex, name, spalten]);

  const hinzufuegen = () => {
    setZeilen((z) => [...z, { key: Math.max(-1, ...z.map((x) => x.key)) + 1, werte: {} }]);
    setFokusIndex(zeilen.length);
  };
  const entfernen = (key: number) => {
    setZeilen((z) => z.filter((x) => x.key !== key));
    // Indizes verschieben sich – alte Fehlermeldungen passen nicht mehr zur Zeile.
    setAusgeblendet(fehlerStand);
    setFokusIndex(null);
  };

  const listenFehler = zeigeFehler ? fehler(name) : undefined;

  return (
    <div className="stack">
      {zeilen.length === 0 && <p className="text-soft">Noch keine Einträge.</p>}
      {zeilen.map((zeile, i) => (
        <fieldset key={zeile.key} className="list-row stack">
          <legend>
            {einzeln} {i + 1}
          </legend>
          <div className="grid">
            {spalten.map((s) => {
              const id = `${name}-${i}-${s.name}`;
              const feldName = `${name}.${i}.${s.name}`;
              const meldung = zeigeFehler ? fehler(feldName) : undefined;
              const wert = zeile.werte[s.name] ?? "";
              if (s.typ === "select") {
                return (
                  <SelectField
                    key={s.name}
                    id={id}
                    name={feldName}
                    label={s.label}
                    optionen={s.optionen ?? []}
                    leereOption={s.leereOption}
                    defaultValue={wert}
                    hinweis={s.hinweis}
                    fehler={meldung}
                  />
                );
              }
              return (
                <Field
                  key={s.name}
                  id={id}
                  name={feldName}
                  label={s.label}
                  type={s.typ === "date" ? "date" : "text"}
                  inputMode={s.typ === "zahl" ? "decimal" : s.typ === "ganzzahl" ? "numeric" : undefined}
                  defaultValue={wert}
                  hinweis={s.hinweis}
                  fehler={meldung}
                />
              );
            })}
          </div>
          <div>
            <Button variante="secondary" onClick={() => entfernen(zeile.key)} aria-label={`${einzeln} ${i + 1} entfernen`}>
              Entfernen
            </Button>
          </div>
        </fieldset>
      ))}
      {listenFehler && (
        <p className="form-error" role="alert">
          {listenFehler}
        </p>
      )}
      <div>
        <Button variante="secondary" onClick={hinzufuegen}>
          + {einzeln} hinzufügen
        </Button>
      </div>
    </div>
  );
}
