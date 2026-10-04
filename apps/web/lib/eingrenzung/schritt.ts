import { createHash } from "node:crypto";
import {
  MAX_BESCHREIBUNG,
  MAX_SYMPTOME,
  normalisiereBeschreibung,
  pruefeBeschreibung,
  antwortText,
  begrenzeMesswerte,
  gespeicherteEingabeSchema,
  type Gesammelt,
  pruefeAntwort,
  pruefeBereiche,
  pruefeKrise,
  pruefeRegion,
  pruefeSchnellcheck,
  type Bereich,
  type Fragenkataloge,
  type GespeicherteEingabe,
  type Regelwerk,
  type Schritt,
} from "@medassist/core";

/**
 * REQ-306, REQ-310, REQ-311, REQ-313: Formulardaten eines Schritts → zu speichernde Eingabe.
 * Rein und testbar. Teilauswertung: Bei einer ungültigen Antwort werden sicherheitsrelevante
 * gültige Teile (Symptome, Messwerte) trotzdem als Teil-Eingabe gespeichert.
 */
export interface NeueEingabe {
  frageId: string;
  typ: "ANTWORT" | "KOERPERREGION" | "TEXT" | "SPRACH_TRANSKRIPT";
  inhalt: string;
  koerperregion: string | null;
  /** REQ-407: Transkript vor dem Absenden geändert (vom Server ermittelt). */
  korrigiert?: boolean;
  strukturiert: GespeicherteEingabe;
}

/**
 * REQ-407: Roh-Transkript einer Sprachaufnahme (serverseitig, aus dem Hochladeauftrag) – nur
 * der SHA-256-Wert; damit setzt der Server `korrigiert`, nicht der Client.
 */
export interface SprachTranskript {
  transkriptHash: string;
}

/** SHA-256 (hex) des normalisierten Texts (CRLF → LF, ohne Rand-Leerzeichen). */
export function transkriptHash(text: string): string {
  return createHash("sha256").update(normalisiereBeschreibung(text), "utf8").digest("hex");
}

export const SPRACHE_NICHT_GEFUNDEN = "Die Sprachaufnahme wurde nicht gefunden oder ist abgelaufen – bitte erneut aufnehmen oder den Text eintippen.";
export const TRANSKRIPT_PRUEFEN = "Bitte bestätigen Sie, dass Sie das Transkript geprüft (und bei Bedarf korrigiert) haben.";

export interface EntwicklungsAlterWert {
  monate: number;
  korrigiert: boolean;
}

export interface SchrittVerarbeitung {
  /** Zu speichernde Eingaben in dieser Reihenfolge (leer = nichts zu speichern). */
  eingaben: NeueEingabe[];
  fehler?: string;
  feldFehler?: Record<string, string[]>;
}

const PRUEFEN = "Bitte die markierten Angaben prüfen.";

function texte(werte: FormDataEntryValue[]): unknown[] {
  return werte.map((w) => (typeof w === "string" ? w : null));
}

interface EinzelVerarbeitung {
  eingabe: NeueEingabe | null;
  fehler?: string;
  feldFehler?: Record<string, string[]>;
}

function huelleFuer(k: Fragenkataloge, s: string, teilweise: boolean, wert: GespeicherteEingabe["wert"]): GespeicherteEingabe {
  return { v: 1, katalogVersion: k.version, schritt: s, teilweise, wert };
}

/** Paare (Krisenfrage-ID, Wert) aller übermittelten Felder `antwort.<krisenfrage>`. */
export function krisenPaare(regelwerk: Regelwerk, formData: FormData): [string, unknown][] {
  const paare: [string, unknown][] = [];
  for (const [schluessel, wert] of formData.entries()) {
    if (!schluessel.startsWith("antwort.")) continue;
    const id = schluessel.slice(8);
    if (regelwerk.fragenIds.has(id)) paare.push([id, typeof wert === "string" ? wert : null]);
  }
  return paare;
}

function kriseEingabe(k: Fragenkataloge, regelwerk: Regelwerk, paare: ReadonlyArray<readonly [string, unknown]>): NeueEingabe {
  const wert = pruefeKrise(regelwerk, paare);
  const alleNein = Object.values(wert.antworten).every((a) => a === "nein");
  return {
    frageId: "krise",
    typ: "ANTWORT",
    inhalt: alleNein ? "Krisen-Screening: alle Fragen mit „Nein“ beantwortet" : "Krisen-Screening: nicht alle Fragen mit „Nein“ beantwortet",
    koerperregion: null,
    strukturiert: huelleFuer(k, "krise", false, wert),
  };
}

/**
 * REQ-209/REQ-311 (QA B5): Krisenantworten, die **außerhalb** des Krisen-Schritts übermittelt
 * werden (z. B. eingeschleust oder aus einem veralteten Tab), sind trotzdem ein Signal: Ist
 * nicht jede Antwort exakt „nein“, wird eine Krisen-Eingabe gespeichert (⇒ KRISE). Auch für
 * abgewiesene Schritte und abgeschlossene Fälle – ein Krisensignal geht nie verloren.
 */
export function kriseSignal(k: Fragenkataloge, regelwerk: Regelwerk, formData: FormData): NeueEingabe | null {
  const paare = krisenPaare(regelwerk, formData);
  if (!paare.length) return null;
  const e = kriseEingabe(k, regelwerk, paare);
  const wert = e.strukturiert.wert;
  return wert.typ === "krise" && Object.values(wert.antworten).every((a) => a === "nein") ? null : e;
}

export function verarbeiteSchritt(
  k: Fragenkataloge,
  regelwerk: Regelwerk,
  bereich: Bereich,
  schritt: Schritt,
  formData: FormData,
  /** Entwicklungsalter für die Bereichsauswahl (bereits festgehalten oder aktuell, QA E2). */
  entwicklungsAlter: EntwicklungsAlterWert | null = null,
  /** REQ-407: Roh-Transkript (Hash) der Sprachaufnahme dieses Nutzers/Falls oder `null`. */
  sprache: SprachTranskript | null = null,
): SchrittVerarbeitung {
  if (schritt.art === "krise") return { eingaben: [kriseEingabe(k, regelwerk, krisenPaare(regelwerk, formData))] };
  const einzel = verarbeiteEinzeln(k, regelwerk, bereich, schritt, formData, entwicklungsAlter, sprache);
  // Jede in einem anderen Schritt übermittelte Krisenantwort wird gespeichert und ausgewertet.
  const paare = krisenPaare(regelwerk, formData);
  const eingaben = [...(paare.length ? [kriseEingabe(k, regelwerk, paare)] : []), ...(einzel.eingabe ? [einzel.eingabe] : [])];
  return { eingaben, ...(einzel.fehler ? { fehler: einzel.fehler } : {}), ...(einzel.feldFehler ? { feldFehler: einzel.feldFehler } : {}) };
}

function verarbeiteEinzeln(
  k: Fragenkataloge,
  regelwerk: Regelwerk,
  bereich: Bereich,
  schritt: Schritt,
  formData: FormData,
  entwicklungsAlter: EntwicklungsAlterWert | null = null,
  sprache: SprachTranskript | null = null,
): EinzelVerarbeitung {
  const katalog = k.kataloge[bereich];
  const huelle = (s: string, teilweise: boolean, wert: GespeicherteEingabe["wert"]) => huelleFuer(k, s, teilweise, wert);
  const symptomText = (ids: readonly string[]) => ids.map((s) => regelwerk.symptome.get(s)?.bezeichnung ?? s).join(", ");

  switch (schritt.art) {
    case "schnellcheck": {
      const messwerte: [string, unknown][] = [];
      for (const [schluessel, wert] of formData.entries()) {
        if (schluessel.startsWith("messwert.")) messwerte.push([schluessel.slice(9), typeof wert === "string" ? wert : null]);
      }
      const e = pruefeSchnellcheck(katalog, regelwerk, { symptome: texte(formData.getAll("symptom")), keine: formData.get("keine"), messwerte });
      const wert = e.ok ? e.wert : e.teil;
      const inhalt = wert.symptome.length ? `Warnzeichen-Schnellcheck: ${symptomText(wert.symptome)}` : wert.keine ? "Warnzeichen-Schnellcheck: nichts davon" : "Warnzeichen-Schnellcheck";
      const sicherheitsrelevant = wert.symptome.length > 0 || Object.keys(wert.messwerte).length > 0;
      const eingabe: NeueEingabe = { frageId: "schnellcheck", typ: "ANTWORT", inhalt, koerperregion: null, strukturiert: huelle("schnellcheck", !e.ok, wert) };
      if (e.ok) return { eingabe };
      return { eingabe: sicherheitsrelevant ? eingabe : null, fehler: PRUEFEN, feldFehler: e.feldFehler };
    }
    case "notfall_weiter": {
      if (formData.get("bestaetigt") !== "on") {
        return { eingabe: null, fehler: PRUEFEN, feldFehler: { bestaetigt: ["Bitte bestätigen Sie den Hinweis, um fortzufahren – oder wählen Sie jetzt den Notruf 112."] } };
      }
      return {
        eingabe: {
          frageId: "notfall_weiter",
          typ: "ANTWORT",
          inhalt: "Hinweis „Zuerst Notruf 112“ bestätigt, Fragen fortgesetzt",
          koerperregion: null,
          strukturiert: huelle("notfall_weiter", false, { typ: "notfall_bestaetigung" }),
        },
      };
    }
    case "beschreibung": {
      // REQ-402: nie still kürzen – zu lang/leer/Steuerzeichen ⇒ Ablehnung mit Meldung.
      const quelle = formData.get("quelle") === "sprache" ? "sprache" : "text";
      const p = pruefeBeschreibung(formData.get("text"));
      if (!p.ok) return { eingabe: null, fehler: PRUEFEN, feldFehler: { text: [p.fehler] } };
      // REQ-407: Transkript nur mit serverseitig bekannter Aufnahme und ausdrücklicher Prüfbestätigung.
      if (quelle === "sprache" && !sprache) return { eingabe: null, fehler: PRUEFEN, feldFehler: { text: [SPRACHE_NICHT_GEFUNDEN] } };
      if (quelle === "sprache" && formData.get("transkriptGeprueft") !== "on") {
        return { eingabe: null, fehler: PRUEFEN, feldFehler: { transkriptGeprueft: [TRANSKRIPT_PRUEFEN] } };
      }
      const korrigiert = quelle === "sprache" && sprache !== null && transkriptHash(p.text) !== sprache.transkriptHash;
      return {
        eingabe: {
          frageId: "beschreibung",
          typ: quelle === "sprache" ? "SPRACH_TRANSKRIPT" : "TEXT",
          inhalt: p.text,
          koerperregion: null,
          korrigiert,
          strukturiert: huelle("beschreibung", false, { typ: "beschreibung", quelle, text: p.text, korrigiert }),
        },
      };
    }
    case "region": {
      const r = pruefeRegion(k.koerperkarte, texte(formData.getAll("region")));
      if (!r.ok) return { eingabe: null, fehler: PRUEFEN, feldFehler: { region: [r.fehler] } };
      const region = k.koerperkarte.regionenById.get(r.region)!;
      return {
        eingabe: { frageId: "region", typ: "KOERPERREGION", inhalt: region.bezeichnung, koerperregion: region.id, strukturiert: huelle("region", false, { typ: "region", region: region.id }) },
      };
    }
    case "bereiche": {
      // REQ-323: nur im Entwicklungs-Check; nur angebotene Bereiche (serverseitig aus dem Entwicklungsalter).
      if (bereich !== "ENTWICKLUNG") return { eingabe: null, fehler: "Dieser Schritt nimmt keine Antworten an." };
      // QA E2: Ohne bekanntes Entwicklungsalter keine Bereichsauswahl (das Alter wird mit ihr festgehalten).
      if (!entwicklungsAlter) return { eingabe: null, fehler: "Das Alter ist unbekannt – bitte das Geburtsdatum im Profil prüfen." };
      const r = pruefeBereiche(k.entwicklung, entwicklungsAlter.monate, texte(formData.getAll("bereich")), formData.get("aktion") === "alle");
      if (!r.ok) return { eingabe: null, fehler: PRUEFEN, feldFehler: { bereiche: [r.fehler] } };
      return {
        eingabe: {
          frageId: "bereiche",
          typ: "ANTWORT",
          inhalt: `Bereiche: ${r.bereiche.map((b) => k.entwicklung.bereicheById.get(b)?.bezeichnung ?? b).join(", ")}`,
          koerperregion: null,
          strukturiert: huelle("bereiche", false, { typ: "bereiche", bereiche: r.bereiche, alterMonate: entwicklungsAlter.monate, korrigiert: entwicklungsAlter.korrigiert }),
        },
      };
    }
    case "frage": {
      const f = schritt.frage;
      const e = pruefeAntwort(f, {
        werte: texte(formData.getAll("wert")),
        keine: formData.get("keine"),
        anzahl: formData.get("anzahl"),
        einheit: formData.get("einheit"),
        ueberspringen: formData.get("aktion") === "ueberspringen",
      });
      if (e.ok) {
        const inhalt = `${f.kurz}: ${antwortText(f, e.wert).map((w) => w.text).join(", ")}`;
        return { eingabe: { frageId: f.id, typ: "ANTWORT", inhalt, koerperregion: null, strukturiert: huelle(f.id, false, e.wert) } };
      }
      const teil: NeueEingabe | null = e.symptome.length
        ? {
            frageId: f.id,
            typ: "ANTWORT",
            inhalt: `${f.kurz} (unvollständig): ${symptomText(e.symptome)}`,
            koerperregion: null,
            strukturiert: huelle(f.id, true, { typ: "mehrfach", optionen: e.symptome, keine: false, symptome: e.symptome }),
          }
        : null;
      return { eingabe: teil, fehler: PRUEFEN, feldFehler: { wert: [e.fehler] } };
    }
    default:
      return { eingabe: null, fehler: "Dieser Schritt nimmt keine Antworten an." };
  }
}

/**
 * QA B1/RISK-029: Sicherheitsrelevante Angaben eines **abgewiesenen** Schritts (veralteter Tab,
 * parallele Abgabe, abgeschlossener Fall): Angekreuzte Symptome und gültige Messwerte des
 * Schnellchecks bzw. einer Mehrfachauswahl mit Symptomen werden als Teil-Eingabe gespeichert
 * (`teilweise: true` – ändert den Ablauf nicht, zählt aber für die Regel-Engine). Ein
 * angekreuztes Warnzeichen geht so nie verloren.
 */
export function warnSignal(k: Fragenkataloge, regelwerk: Regelwerk, bereich: Bereich, schrittId: unknown, formData: FormData): NeueEingabe | null {
  if (schrittId === "schnellcheck") {
    const v = verarbeiteEinzeln(k, regelwerk, bereich, { art: "schnellcheck" }, formData);
    const w = v.eingabe?.strukturiert.wert;
    if (!v.eingabe || w?.typ !== "schnellcheck" || (w.symptome.length === 0 && Object.keys(w.messwerte).length === 0)) return null;
    return { ...v.eingabe, strukturiert: { ...v.eingabe.strukturiert, teilweise: true } };
  }
  const frage = typeof schrittId === "string" ? k.kataloge[bereich].fragenById.get(schrittId) : undefined;
  if (!frage || frage.typ !== "mehrfach" || !frage.optionen.some((o) => o.symptom)) return null;
  const v = verarbeiteEinzeln(k, regelwerk, bereich, { art: "frage", frage }, formData);
  const w = v.eingabe?.strukturiert.wert;
  if (!v.eingabe || w?.typ !== "mehrfach" || w.symptome.length === 0) return null;
  return { ...v.eingabe, strukturiert: { ...v.eingabe.strukturiert, teilweise: true } };
}

/** REQ-314/REQ-402: Obergrenze für `inhalt` – passend zur längsten zulässigen Eingabe (Beschreibung). */
const MAX_INHALT = MAX_BESCHREIBUNG;

/**
 * QA N1: Jede Eingabe wird **vor dem Speichern** gegen `gespeicherteEingabeSchema` geprüft –
 * gespeichert wird nur, was später auch wieder lesbar ist. Ist sie ungültig, wird eine
 * gekürzte, sichere Variante gespeichert, die angekreuzte Symptome **immer** behält
 * (Teil-Eingabe); ist auch das nicht möglich, `null`.
 */
export function absichern(e: NeueEingabe): NeueEingabe | null {
  const basis = { ...e, inhalt: e.inhalt.slice(0, MAX_INHALT) };
  if (gespeicherteEingabeSchema.safeParse(basis.strukturiert).success) return basis;
  const w = basis.strukturiert.wert as { typ?: string; symptome?: unknown; messwerte?: unknown };
  const symptome = Array.isArray(w.symptome) ? [...new Set(w.symptome.filter((x): x is string => typeof x === "string"))].slice(0, MAX_SYMPTOME) : [];
  const messwerte: Record<string, number[]> = {};
  if (w.messwerte && typeof w.messwerte === "object") {
    for (const [mid, werte] of Object.entries(w.messwerte as Record<string, unknown>)) {
      if (Array.isArray(werte)) messwerte[mid] = begrenzeMesswerte(werte.filter((x): x is number => typeof x === "number" && Number.isFinite(x)));
    }
  }
  const wert =
    w.typ === "schnellcheck"
      ? { typ: "schnellcheck" as const, symptome, keine: false, messwerte }
      : w.typ === "mehrfach" && symptome.length
        ? { typ: "mehrfach" as const, optionen: symptome, keine: false, symptome }
        : null;
  if (!wert) return null;
  const sicher: NeueEingabe = { ...basis, strukturiert: { ...basis.strukturiert, teilweise: true, wert } };
  return gespeicherteEingabeSchema.safeParse(sicher.strukturiert).success ? sicher : null;
}

/** QA N4: Ein Warnsignal nur speichern, wenn es neue Symptome oder Messwerte enthält. */
export function signalIstNeu(e: NeueEingabe, g: Gesammelt): boolean {
  const w = e.strukturiert.wert;
  if (w.typ !== "schnellcheck" && w.typ !== "mehrfach") return true;
  if (w.symptome.some((s) => !g.symptome.includes(s))) return true;
  if (w.typ === "schnellcheck") {
    for (const [mid, werte] of Object.entries(w.messwerte)) if (werte.some((x) => !(g.messwerte[mid] ?? []).includes(x))) return true;
  }
  return false;
}
