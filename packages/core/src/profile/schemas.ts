import { z } from "zod";
import type { Rolle } from "../roles";
import { GEWICHT_KG, GROESSE_CM } from "./bmi";
import { ICD10_GM_FORMAT, normalisiereIcd10 } from "./icd";
import {
  AKTIVITAETEN,
  ALKOHOL_KONSUM,
  ALLERGIE_TYPEN,
  EINRICHTUNGEN,
  GESCHLECHTER,
  ORGAN_FUNKTIONEN,
  RAUCH_STATUS,
  SCHWANGERSCHAFT_STATUS,
  SPRACHSITUATIONEN,
  VORSORGE_TYPEN,
} from "./konstanten";

/**
 * REQ-100 – REQ-107, REQ-114: Validierung der Profileingaben (serverseitig).
 *
 * Eingabe ist ein „rohes“ Objekt aus Formularwerten (Strings, Listen von Objekten).
 * Leere Strings gelten als „nicht angegeben“, Zahlen dürfen ein Dezimalkomma haben.
 * Plausibilitätsgrenzen ohne fachliche Quelle sind als `ungeprüft` markiert
 * (CLAUDE.md §12) – sie fangen Tippfehler ab und sind keine klinische Bewertung.
 */
export const PLAUSIBILITAET = {
  /** REQ-103: Geburtsdatum höchstens so weit zurück. */
  alterMaxJahre: 130,
  /** REQ-033: aus bmi.ts. */
  groesseCm: GROESSE_CM,
  gewichtKg: GEWICHT_KG,
  /**
   * REQ-107: SSW bei Geburt. 22+0 als untere Grenze für Lebendgeburten im Profil
   * (ungeprüft); liegt innerhalb des Rechenbereichs von `gestationsTage` (20–44).
   */
  sswWochen: { min: 22, max: 44 },
  sswTage: { min: 0, max: 6 },
  /** ungeprüft – Plausibilitätsgrenze gegen Tippfehler (z. B. kg statt g). */
  geburtsgewichtG: { min: 300, max: 7000 },
  /** ungeprüft – Plausibilitätsgrenze. */
  kopfumfangCm: { min: 20, max: 70 },
  /** ungeprüft – Plausibilitätsgrenze. */
  packungsjahre: { min: 0, max: 200 },
  klassenstufe: { min: 1, max: 13 },
  impfDosis: { min: 1, max: 10 },
  /** Decimal(12, 4) in der Datenbank: höchstens 8 Vorkomma- und 4 Nachkommastellen. */
  laborBetragMax: 99_999_999.9999,
  /**
   * RISK-017: Nachkommastellen je Datenbankspalte (Prisma `@db.Decimal(p, s)`).
   * Mehr Stellen werden abgewiesen statt von der Datenbank still gerundet.
   */
  nachkommastellen: {
    groesseCm: 1, // Decimal(5, 1)
    gewichtKg: 3, // Decimal(6, 3)
    packungsjahre: 1, // Decimal(5, 1)
    kopfumfangCm: 1, // Decimal(4, 1)
    laborwert: 4, // Decimal(12, 4)
  },
  listeMax: 50,
  sprachenMax: 10,
} as const;

const TEXT = { name: 100, kurz: 200, lang: 2000 } as const;

// ---------------------------------------------------------------------------
// Datum: „heute“ in Europe/Berlin, damit eine Eingabe kurz nach Mitternacht
// nicht als „Zukunft“ gilt.
// ---------------------------------------------------------------------------

/** Kalendertag (YYYY-MM-DD) von `zeitpunkt` in Europe/Berlin. */
export function heuteIso(zeitpunkt: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(zeitpunkt);
}

/** Kalendertag eines als UTC-Mitternacht gespeicherten Datums. */
export function isoTag(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function zuDatum(v: unknown): unknown {
  if (v instanceof Date) return v;
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(`${s}T00:00:00Z`);
  // Ungültige Tage (z. B. 2026-02-30) werden von Date normalisiert – das fangen wir ab.
  return Number.isNaN(d.getTime()) || isoTag(d) !== s ? s : d;
}

const leerZuUndefined = (v: unknown) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v);

function zuZahl(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v !== "string") return v;
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return undefined;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

const fmt = (n: number) => String(n).replace(".", ",");

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

const pflichtText = (meldung: string, max: number = TEXT.kurz) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string({ error: () => meldung }).min(1, meldung).max(max, `Höchstens ${max} Zeichen.`),
  );

const optText = (max: number = TEXT.kurz) =>
  z.preprocess(
    (v) => (typeof v === "string" ? leerZuUndefined(v.trim()) : leerZuUndefined(v)),
    z.string().max(max, `Höchstens ${max} Zeichen.`).optional(),
  );

/**
 * Hat `n` höchstens `stellen` Nachkommastellen? Gezählt wird an der kürzesten
 * Dezimaldarstellung (`String(n)`), die für aus Eingabetext geparste Zahlen exakt
 * dem eingegebenen Wert entspricht – ohne Gleitkomma-Toleranz, die bei großen
 * Beträgen (z. B. Laborwert 12345678,1234) versagt.
 */
export function hatHoechstensNachkommastellen(n: number, stellen: number): boolean {
  if (!Number.isFinite(n)) return false;
  const teile = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(Math.abs(n)));
  if (!teile) return false;
  const nachkomma = (teile[2]?.length ?? 0) - Number(teile[3] ?? 0);
  return Math.max(0, nachkomma) <= stellen;
}

const nachkommaMeldung = (stellen: number) =>
  stellen === 0 ? "Bitte eine ganze Zahl angeben." : `Höchstens ${stellen} ${stellen === 1 ? "Nachkommastelle" : "Nachkommastellen"}.`;

const zahl = (meldung: string, grenzen?: { min: number; max: number }, einheit = "", nachkomma?: number) => {
  let s = z.number({ error: () => meldung });
  if (nachkomma !== undefined) {
    s = s.refine((n) => hatHoechstensNachkommastellen(n, nachkomma), nachkommaMeldung(nachkomma));
  }
  if (grenzen) {
    const bereich = `Bitte einen Wert zwischen ${fmt(grenzen.min)} und ${fmt(grenzen.max)}${einheit} angeben.`;
    s = s.min(grenzen.min, bereich).max(grenzen.max, bereich);
  }
  return s;
};

const optZahl = (meldung: string, grenzen: { min: number; max: number } | undefined, einheit: string, nachkomma: number) =>
  z.preprocess(zuZahl, zahl(meldung, grenzen, einheit, nachkomma).optional());

const optGanzzahl = (meldung: string, grenzen: { min: number; max: number }, einheit = "") =>
  z.preprocess(zuZahl, zahl(meldung, grenzen, einheit).int("Bitte eine ganze Zahl angeben.").optional());

const enumMitStandard = <const T extends readonly [string, ...string[]]>(werte: T, standard: T[number], meldung: string) =>
  z.preprocess(leerZuUndefined, z.enum(werte, { error: () => meldung }).default(standard as never));

const optEnum = <const T extends readonly [string, ...string[]]>(werte: T, meldung: string) =>
  z.preprocess(leerZuUndefined, z.enum(werte, { error: () => meldung }).optional());

function datumsSchemas(heute: string) {
  const NICHT_ZUKUNFT = "Das Datum darf nicht in der Zukunft liegen.";
  const basis = (meldung: string) =>
    z.preprocess(zuDatum, z.date({ error: () => meldung }).refine((d) => isoTag(d) <= heute, NICHT_ZUKUNFT));
  return {
    pflicht: (meldung: string) => basis(meldung),
    optional: (meldung = "Bitte ein gültiges Datum angeben.") =>
      z.preprocess((v) => zuDatum(leerZuUndefined(v)), basis(meldung).optional()),
  };
}

/** Eine Listenzeile gilt als leer, wenn alle Felder (außer `ignoriert`) leer sind. */
export function istLeereZeile(v: unknown, ignoriert: readonly string[] = []): boolean {
  if (v == null) return true;
  if (typeof v !== "object") return false;
  return Object.entries(v).every(
    ([k, w]) => ignoriert.includes(k) || w == null || (typeof w === "string" && w.trim() === ""),
  );
}

/**
 * REQ-101: Liste mit Zeilen. Vollständig leere Zeilen werden ignoriert, ohne die
 * Indizes zu verschieben – Fehlermeldungen passen so zur Zeile im Formular.
 */
function liste<T extends z.ZodType>(zeile: T, ignoriert: readonly string[] = []) {
  return z
    .preprocess(
      (v) => (v == null ? [] : v),
      z
        .array(z.preprocess((v) => (istLeereZeile(v, ignoriert) ? undefined : v), zeile.optional()))
        .max(PLAUSIBILITAET.listeMax, `Höchstens ${PLAUSIBILITAET.listeMax} Einträge.`),
    )
    .transform((zeilen) => zeilen.filter((x): x is z.output<T> => x !== undefined));
}

// ---------------------------------------------------------------------------
// Feldgruppen
// ---------------------------------------------------------------------------

function basisFelder(heute: string) {
  const datum = datumsSchemas(heute);
  const P = PLAUSIBILITAET;
  const icd = z.preprocess(
    (v) => (typeof v === "string" ? leerZuUndefined(normalisiereIcd10(v)) : leerZuUndefined(v)),
    z
      .string()
      .regex(ICD10_GM_FORMAT, "Kein gültiges ICD-10-GM-Format (Beispiel: J45.0). Das Feld kann leer bleiben.")
      .optional(),
  );
  return {
    vorname: pflichtText("Bitte den Vornamen angeben.", TEXT.name),
    nachname: pflichtText("Bitte den Nachnamen angeben.", TEXT.name),
    geburtsdatum: datum.pflicht("Bitte ein gültiges Geburtsdatum angeben.").refine((d) => {
      const [j, m, t] = heute.split("-").map(Number) as [number, number, number];
      const grenze = new Date(Date.UTC(j - P.alterMaxJahre, m - 1, t));
      return d.getTime() >= grenze.getTime();
    }, `Das Geburtsdatum darf höchstens ${P.alterMaxJahre} Jahre zurückliegen.`),
    geschlecht: z.enum(GESCHLECHTER, { error: () => "Bitte das Geschlecht wählen." }),
    groesseCm: optZahl("Bitte die Größe als Zahl in cm angeben.", P.groesseCm, " cm", P.nachkommastellen.groesseCm),
    gewichtKg: optZahl("Bitte das Gewicht als Zahl in kg angeben.", P.gewichtKg, " kg", P.nachkommastellen.gewichtKg),
    schwangerschaft: enumMitStandard(SCHWANGERSCHAFT_STATUS, "UNBEKANNT", "Ungültige Auswahl."),
    familienanamnese: optText(TEXT.lang),
    rauchen: enumMitStandard(RAUCH_STATUS, "UNBEKANNT", "Ungültige Auswahl."),
    packungsjahre: optZahl("Bitte die Packungsjahre als Zahl angeben.", P.packungsjahre, "", P.nachkommastellen.packungsjahre),
    alkohol: enumMitStandard(ALKOHOL_KONSUM, "UNBEKANNT", "Ungültige Auswahl."),
    sport: enumMitStandard(AKTIVITAETEN, "UNBEKANNT", "Ungültige Auswahl."),
    impfstatusNotiz: optText(TEXT.lang),
    vorerkrankungen: liste(
      z.object({
        bezeichnung: pflichtText("Bitte die Erkrankung benennen."),
        icd10Code: icd,
      }),
    ),
    operationen: liste(
      z.object({
        bezeichnung: pflichtText("Bitte die Operation benennen."),
        datum: datum.optional(),
      }),
    ),
    allergien: liste(
      z.object({
        typ: enumMitStandard(ALLERGIE_TYPEN, "ALLERGIE", "Ungültige Auswahl."),
        ausloeser: pflichtText("Bitte den Auslöser angeben."),
        reaktion: optText(),
      }),
      ["typ"],
    ),
    dauermedikation: liste(
      z.object({
        wirkstoff: pflichtText("Bitte den Wirkstoff angeben."),
        staerke: optText(TEXT.name),
        dosierung: optText(),
      }),
    ),
    impfungen: liste(
      z.object({
        gegen: pflichtText("Bitte angeben, wogegen geimpft wurde."),
        impfstoff: optText(),
        datum: datum.optional(),
        dosisNr: optGanzzahl("Bitte die Dosis als Zahl angeben.", P.impfDosis),
      }),
    ),
  };
}

function kindFelder(heute: string) {
  const datum = datumsSchemas(heute);
  const P = PLAUSIBILITAET;
  return {
    sswWochen: optGanzzahl("Bitte die Schwangerschaftswoche als Zahl angeben.", P.sswWochen),
    sswTage: optGanzzahl("Bitte die Tage (0–6) als Zahl angeben.", P.sswTage),
    geburtsgewichtG: optGanzzahl("Bitte das Geburtsgewicht in Gramm angeben.", P.geburtsgewichtG, " g"),
    einrichtung: optEnum(EINRICHTUNGEN, "Ungültige Auswahl."),
    einrichtungName: optText(),
    klassenstufe: optGanzzahl("Bitte die Klassenstufe als Zahl angeben.", P.klassenstufe),
    sprachsituation: optEnum(SPRACHSITUATIONEN, "Ungültige Auswahl."),
    sprachen: z.preprocess(
      (v) =>
        typeof v === "string"
          ? v
              .split(/[,;]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : (v ?? []),
      z
        .array(z.string().max(50, "Höchstens 50 Zeichen je Sprache."))
        .max(P.sprachenMax, `Höchstens ${P.sprachenMax} Sprachen.`),
    ),
    vorsorge: liste(
      z.object({
        typ: z.enum(VORSORGE_TYPEN, { error: () => "Unbekannte Vorsorgeuntersuchung." }),
        datum: datum.optional(),
        ergebnis: optEnum(["UNAUFFAELLIG", "AUFFAELLIG"] as const, "Ungültige Auswahl."),
      }),
      ["typ"],
    ),
    wachstum: liste(
      z
        .object({
          gemessenAm: datum.pflicht("Bitte das Messdatum angeben."),
          groesseCm: optZahl("Bitte die Größe als Zahl in cm angeben.", P.groesseCm, " cm", P.nachkommastellen.groesseCm),
          gewichtKg: optZahl("Bitte das Gewicht als Zahl in kg angeben.", P.gewichtKg, " kg", P.nachkommastellen.gewichtKg),
          kopfumfangCm: optZahl("Bitte den Kopfumfang als Zahl in cm angeben.", P.kopfumfangCm, " cm", P.nachkommastellen.kopfumfangCm),
        })
        .refine((m) => m.groesseCm != null || m.gewichtKg != null || m.kopfumfangCm != null, {
          message: "Bitte mindestens einen Messwert eintragen.",
          path: ["groesseCm"],
        }),
    ),
  };
}

function arztFelder(heute: string) {
  const datum = datumsSchemas(heute);
  const max = PLAUSIBILITAET.laborBetragMax;
  const nk = PLAUSIBILITAET.nachkommastellen.laborwert;
  return {
    nierenfunktion: enumMitStandard(ORGAN_FUNKTIONEN, "UNBEKANNT", "Ungültige Auswahl."),
    leberfunktion: enumMitStandard(ORGAN_FUNKTIONEN, "UNBEKANNT", "Ungültige Auswahl."),
    laborwerte: liste(
      z.object({
        parameter: pflichtText("Bitte den Laborparameter angeben.", TEXT.name),
        wert: z.preprocess(zuZahl, zahl("Bitte einen Zahlenwert angeben.", { min: -max, max }, "", nk)),
        einheit: pflichtText("Bitte die Einheit angeben.", 50),
        gemessenAm: datum.pflicht("Bitte das Datum der Messung angeben."),
      }),
    ),
  };
}

const sorgerechtFelder = {
  /** REQ-106: Pflichtbestätigung beim Anlegen eines Kinderprofils durch Patienten. */
  sorgerechtBestaetigt: z.literal(true, { error: () => "Bitte bestätigen Sie, dass Sie sorgeberechtigt sind." }),
};

// Typen der Feldgruppen
export type ProfilBasisDaten = z.output<z.ZodObject<ReturnType<typeof basisFelder>>>;
export type ProfilKindDaten = z.output<z.ZodObject<ReturnType<typeof kindFelder>>>;
export type ProfilArztDaten = z.output<z.ZodObject<ReturnType<typeof arztFelder>>>;

export interface ProfilSchemaOptionen {
  /** Rolle aus der serverseitigen Sitzung (REQ-116). */
  rolle: Rolle;
  /** Kinderprofil (Zusatzfelder §3a). */
  kind: boolean;
  /** Neuanlage (Patient + Kind → Sorgerechtsbestätigung Pflicht). */
  neu: boolean;
  /** Bezugszeitpunkt für „nicht in der Zukunft“ (Tests). */
  heute?: Date;
}

/**
 * Baut das Schema passend zu Rolle und Profilart. Für Patienten fehlen die
 * Arzt-Felder vollständig – eingeschleuste Werte werden von zod verworfen (REQ-114).
 */
export function profilSchema(opt: ProfilSchemaOptionen) {
  const heute = heuteIso(opt.heute);
  const shape = {
    ...basisFelder(heute),
    ...(opt.kind ? kindFelder(heute) : {}),
    // REQ-104: Kinderprofile führen Schwangerschaft/Stillzeit im Prototyp nicht (Feld
    // wird nicht angezeigt). Eingaben werden verworfen, gespeichert wird „UNBEKANNT“.
    // Keine Altersgrenze – Jugendliche folgen mit der rechtlichen Klärung (CLAUDE.md §3a).
    ...(opt.kind ? { schwangerschaft: z.unknown().optional().transform(() => "UNBEKANNT" as const) } : {}),
    ...(opt.rolle === "ARZT" ? arztFelder(heute) : {}),
    ...(opt.kind && opt.neu && opt.rolle === "PATIENT" ? sorgerechtFelder : {}),
  };
  return z.object(shape).superRefine((wert, ctx) => kreuzpruefung(wert as unknown as Kreuz, ctx));
}

/** Für die Kreuzprüfung relevante Felder (alle optional, je nach Feldgruppe). */
interface Kreuz {
  geburtsdatum: Date;
  geschlecht: string;
  schwangerschaft: string;
  rauchen: string;
  packungsjahre?: number;
  sswWochen?: number;
  sswTage?: number;
  einrichtung?: string;
  klassenstufe?: number;
  sprachsituation?: string;
  sprachen?: string[];
  operationen: { datum?: Date }[];
  impfungen: { datum?: Date }[];
  vorsorge?: { typ: string; datum?: Date }[];
  wachstum?: { gemessenAm: Date }[];
  laborwerte?: { gemessenAm: Date }[];
}

function kreuzpruefung(w: Kreuz, ctx: z.RefinementCtx) {
  // REQ-104: nicht stillschweigend falsch speichern – Feldmeldung statt Korrektur.
  if (w.geschlecht === "MAENNLICH" && (w.schwangerschaft === "SCHWANGER" || w.schwangerschaft === "STILLEND")) {
    ctx.addIssue({
      code: "custom",
      path: ["schwangerschaft"],
      message: "Schwangerschaft/Stillzeit passt nicht zum Geschlecht „männlich“. Bitte Angaben prüfen.",
    });
  }
  if (w.rauchen === "NIE" && w.packungsjahre != null && w.packungsjahre > 0) {
    ctx.addIssue({ code: "custom", path: ["packungsjahre"], message: "Bei „nie geraucht“ bitte keine Packungsjahre angeben." });
  }
  if (w.sswTage != null && w.sswWochen == null) {
    ctx.addIssue({ code: "custom", path: ["sswWochen"], message: "Bitte auch die Schwangerschaftswoche angeben." });
  }
  if (w.klassenstufe != null && w.einrichtung !== "SCHULE") {
    ctx.addIssue({ code: "custom", path: ["klassenstufe"], message: "Die Klassenstufe nur bei Einrichtung „Schule“ angeben." });
  }
  if (w.sprachsituation === "EINSPRACHIG" && (w.sprachen?.length ?? 0) > 1) {
    ctx.addIssue({ code: "custom", path: ["sprachen"], message: "Bei „einsprachig“ bitte nur eine Sprache angeben." });
  }

  // REQ-103: Datumsangaben nicht vor der Geburt.
  const geburt = isoTag(w.geburtsdatum);
  const VOR_GEBURT = "Das Datum liegt vor dem Geburtsdatum.";
  const pruefe = (liste: readonly Record<string, unknown>[] | undefined, name: string, feld: string) =>
    liste?.forEach((zeile, i) => {
      const d = zeile[feld];
      if (d instanceof Date && isoTag(d) < geburt) ctx.addIssue({ code: "custom", path: [name, i, feld], message: VOR_GEBURT });
    });
  pruefe(w.operationen, "operationen", "datum");
  pruefe(w.impfungen, "impfungen", "datum");
  pruefe(w.vorsorge, "vorsorge", "datum");
  pruefe(w.wachstum, "wachstum", "gemessenAm");
  pruefe(w.laborwerte, "laborwerte", "gemessenAm");

  const gesehen = new Set<string>();
  w.vorsorge?.forEach((v, i) => {
    if (gesehen.has(v.typ)) ctx.addIssue({ code: "custom", path: ["vorsorge", i, "typ"], message: "Doppelte Vorsorgeuntersuchung." });
    gesehen.add(v.typ);
  });
}

export interface GeprueftesProfil {
  basis: ProfilBasisDaten;
  /** Nur bei Kinderprofilen. */
  kind: ProfilKindDaten | null;
  /** Nur bei Rolle ARZT (REQ-114). */
  arzt: ProfilArztDaten | null;
  sorgerechtBestaetigt: boolean;
}

export type ProfilPruefung =
  | { success: true; daten: GeprueftesProfil }
  | { success: false; issues: z.core.$ZodIssue[] };

function waehle<T>(quelle: Record<string, unknown>, felder: Record<string, unknown>): T {
  return Object.fromEntries(Object.keys(felder).map((k) => [k, quelle[k]])) as T;
}

/** Prüft rohe Formularwerte und teilt das Ergebnis in Feldgruppen. */
export function pruefeProfil(opt: ProfilSchemaOptionen, roh: unknown): ProfilPruefung {
  const ergebnis = profilSchema(opt).safeParse(roh);
  if (!ergebnis.success) return { success: false, issues: ergebnis.error.issues };
  const d = ergebnis.data as Record<string, unknown>;
  const heute = heuteIso(opt.heute);
  return {
    success: true,
    daten: {
      basis: waehle<ProfilBasisDaten>(d, basisFelder(heute)),
      kind: opt.kind ? waehle<ProfilKindDaten>(d, kindFelder(heute)) : null,
      arzt: opt.rolle === "ARZT" ? waehle<ProfilArztDaten>(d, arztFelder(heute)) : null,
      sorgerechtBestaetigt: d.sorgerechtBestaetigt === true,
    },
  };
}
