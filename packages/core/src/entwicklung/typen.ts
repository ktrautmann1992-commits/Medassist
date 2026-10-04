import type { MonatsBereich } from "../eingrenzung/schema";
import type { Einstufung, FrageRolle } from "./schema";

/** REQ-320: Aufgelöster Entwicklungskatalog (ergänzt den Katalog `ENTWICKLUNG` des Ablaufs). */

export interface EntwicklungsAnlaufstelle {
  id: string;
  bezeichnung: string;
  hinweis: string | null;
}

export interface EntwicklungsFrageMeta {
  id: string;
  /** Bereich oder `null` für die Pflichtfrage. */
  bereich: string | null;
  rolle: FrageRolle | "pflicht";
  alter: MonatsBereich | null;
  /** Einstufung je Options-ID (bei der Pflichtfrage auch Symptom-IDs). */
  einstufung: ReadonlyMap<string, Einstufung>;
}

export interface EntwicklungsBereich {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  alter: MonatsBereich;
  /** Kinderärztin/Kinderarzt immer zuerst (Selbsttest). */
  anlaufstellen: readonly EntwicklungsAnlaufstelle[];
  foerderideen: readonly string[];
  /** Frage-IDs in Katalogreihenfolge. */
  fragen: readonly string[];
}

export interface ErgebnisText {
  titel: string;
  textPatient: string;
  textArzt: string;
}

export interface EntwicklungsKatalog {
  version: string;
  alter: MonatsBereich;
  regressionSymptom: string;
  pflichtfrageId: string;
  /** ID der Option „Ich bin mir nicht sicher“ der Pflichtfrage (falls vorhanden). */
  pflichtUnsicher: string | null;
  bereiche: readonly EntwicklungsBereich[];
  bereicheById: ReadonlyMap<string, EntwicklungsBereich>;
  meta: ReadonlyMap<string, EntwicklungsFrageMeta>;
  anlaufstellenQuelle: string;
  ergebnisse: Readonly<Record<Einstufung, ErgebnisText>>;
}
