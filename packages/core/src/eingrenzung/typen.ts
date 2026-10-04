import type { Quelle, RegelStatus } from "../regeln/schema";
import type { EntwicklungsKatalog } from "../entwicklung/typen";
import type { MonatsBereich, Ansicht, Bereich, DauerEinheit, Form, FrageBedingung } from "./schema";

/**
 * Aufgelöste (geladene und geprüfte) Fragenkataloge und Körperkarte (REQ-300 – REQ-303).
 * Optionen mit Symptom-Verweis tragen Bezeichnung, Fachbegriff und Warnzeichen-Kennzeichen
 * aus dem Engine-Vokabular.
 */

export interface Option {
  id: string;
  bezeichnung: string;
  fachbegriff: string | null;
  /** Symptom-ID des Engine-Vokabulars oder `null` (eigene Option). */
  symptom: string | null;
  warnzeichen: boolean;
}

interface FrageKopf {
  id: string;
  kurz: string;
  text: string;
  textKind: string;
  textFremd: string;
  hilfe: string | null;
  pflicht: boolean;
  bedingung: FrageBedingung | null;
  /** REQ-323: Bereich des Entwicklungs-Checks (z. B. `sprache`) oder `null` (Weg 2, Pflichtfrage). */
  gruppe: string | null;
  /** REQ-322: Altersbereich (Entwicklungsalter) oder `null` = jedes Alter. */
  alter: MonatsBereich | null;
}

export type Frage =
  | (FrageKopf & { typ: "einfach"; optionen: readonly Option[] })
  | (FrageKopf & { typ: "mehrfach"; optionen: readonly Option[]; keineOption: string | null })
  | (FrageKopf & { typ: "skala"; min: number; max: number; minText: string; maxText: string })
  | (FrageKopf & { typ: "freitext"; maxLaenge: number })
  | (FrageKopf & { typ: "dauer"; einheiten: readonly DauerEinheit[]; maxAnzahl: number });

export interface SchnellcheckMesswert {
  id: string;
  bezeichnung: string;
  einheit: string;
  min: number;
  max: number;
  status: RegelStatus;
}

export interface Schnellcheck {
  titel: string;
  text: string;
  textKind: string;
  textFremd: string;
  hilfe: string;
  keineText: string;
  symptome: readonly Option[];
  messwerte: readonly SchnellcheckMesswert[];
}

export interface Pruefstatus {
  status: RegelStatus;
  quelle: Quelle | null;
  quelleHinweis: string | null;
  geprueftVon: string | null;
}

export interface Katalog extends Pruefstatus {
  bereich: Bereich;
  version: string;
  stand: string;
  hinweis: string;
  schnellcheck: Schnellcheck;
  fragen: readonly Frage[];
  fragenById: ReadonlyMap<string, Frage>;
}

export interface Organsystem {
  id: string;
  bezeichnung: string;
  fachbegriff: string | null;
}

export interface Region {
  id: string;
  bezeichnung: string;
  fachbegriff: string | null;
  organsysteme: readonly string[];
  formen: Readonly<Record<Ansicht, readonly Form[]>>;
}

export interface Koerperkarte extends Pruefstatus {
  version: string;
  hinweis: string;
  viewBox: { breite: number; hoehe: number };
  organsysteme: ReadonlyMap<string, Organsystem>;
  regionen: readonly Region[];
  regionenById: ReadonlyMap<string, Region>;
}

export interface Fragenkataloge {
  version: string;
  koerperkarte: Koerperkarte;
  kataloge: Readonly<Record<Bereich, Katalog>>;
  /** REQ-320: Zusatzdaten des Entwicklungs-Checks (Bereiche, Einstufungen, Anlaufstellen). */
  entwicklung: EntwicklungsKatalog;
}
