/**
 * REQ-409 (RISK-045): Serverseitige **Neu-Schreibung** eines JPEG – kleine eigene Segmentlogik
 * ohne Bildbibliothek. Statt Segmente nur zu prüfen und die Bytes 1:1 zu übernehmen (QA M5:
 * Exif/GPS ließ sich in erlaubten APP0-/APP2-/APP14-Segmenten verstecken), wird ein neues
 * Byte-Abbild aufgebaut, das **nur** die zum Dekodieren nötigen Teile enthält:
 *
 *   SOI · kanonisches 16-Byte-JFIF-APP0 (ohne Thumbnail) · DQT · DHT · SOFn · DRI · SOS + Scan-Daten · EOI
 *
 * Alle APPn-Segmente (Exif, XMP, JFIF/JFXX-Thumbnails, ICC-Profil, Adobe, IPTC …) und
 * Kommentare (COM) werden verworfen; Füllbytes und Null-Bytes nach EOI ebenfalls. Alles
 * Unerwartete (unbekannte Marker, DNL, hierarchische JPEG, mehrere Bildköpfe, Daten nach EOI,
 * Längenfehler) ⇒ Ablehnung („im Zweifel ablehnen“).
 *
 * Grenze (dokumentiert in RISK-045): Die entropie-kodierten Scan-Daten werden nicht dekodiert.
 * Ein manipulierter Client kann dort beliebige Bytes ablegen; sie sind aber kein Metadaten-
 * Segment und werden von keinem Bildbetrachter als Exif/GPS gelesen.
 */

export type JpegFehlergrund = "kein_jpeg" | "defekt" | "anhang" | "nicht_unterstuetzt" | "abmessungen";

export type JpegBereinigung =
  | { ok: true; daten: Uint8Array; /** Verworfene Segmente, z. B. „APP1“, „COM“ (ohne Inhalt). */ entfernt: string[]; breite: number; hoehe: number }
  | { ok: false; grund: JpegFehlergrund; segment?: string };

/** Größte zulässige Kante (Schutz vor Dekompressionsbomben; der Browser liefert ≤ 2048 px). */
export const MAX_JPEG_KANTE = 4096;

/** Kanonisches JFIF-APP0: Version 1.01, keine Einheit, Pixel-Seitenverhältnis 1:1, kein Thumbnail. */
export const KANONISCHES_APP0: readonly number[] = [
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
];

function hex(marker: number): string {
  return `FF${marker.toString(16).toUpperCase().padStart(2, "0")}`;
}

function name(marker: number): string {
  if (marker >= 0xe0 && marker <= 0xef) return `APP${marker - 0xe0}`;
  if (marker === 0xfe) return "COM";
  return hex(marker);
}

/** SOF0–SOF15 ohne DHT (C4), JPG (C8) und DAC (CC). Hierarchische Varianten (C5–C7, CD–CF) brauchen DHP/EXP ⇒ nicht unterstützt. */
function istSof(m: number): boolean {
  return [0xc0, 0xc1, 0xc2, 0xc3, 0xc9, 0xca, 0xcb].includes(m);
}

/** Tabellen/Steuersegmente, die unverändert übernommen werden: DQT, DHT, DRI. */
const UEBERNEHMEN = new Set([0xdb, 0xc4, 0xdd]);

export function bereinigeJpeg(daten: Uint8Array): JpegBereinigung {
  if (daten.length < 4 || daten[0] !== 0xff || daten[1] !== 0xd8) return { ok: false, grund: "kein_jpeg" };
  const teile: Uint8Array[] = [new Uint8Array([0xff, 0xd8]), new Uint8Array(KANONISCHES_APP0)];
  const entfernt: string[] = [];
  let i = 2;
  let sof: { breite: number; hoehe: number; komponenten: number } | null = null;
  let sos = false;
  while (i < daten.length) {
    if (daten[i] !== 0xff) return { ok: false, grund: "defekt" };
    // Füllbytes 0xFF vor einem Marker sind zulässig (werden nicht übernommen).
    while (i < daten.length && daten[i] === 0xff) i++;
    if (i >= daten.length) return { ok: false, grund: "defekt" };
    const marker = daten[i]!;
    i++;
    if (marker === 0xd9) {
      // EOI: danach höchstens Null-Bytes (werden verworfen), sonst angehängte Daten ⇒ ablehnen.
      for (let j = i; j < daten.length; j++) if (daten[j] !== 0) return { ok: false, grund: "anhang" };
      if (!sof || !sos) return { ok: false, grund: "defekt" };
      teile.push(new Uint8Array([0xff, 0xd9]));
      return { ok: true, daten: verbinde(teile), entfernt, breite: sof.breite, hoehe: sof.hoehe };
    }
    if (marker === 0xd8 || marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      // Zweites SOI, Stuffing, TEM oder RST außerhalb der Bilddaten ⇒ ungültig.
      return { ok: false, grund: "defekt", segment: hex(marker) };
    }
    if (i + 2 > daten.length) return { ok: false, grund: "defekt" };
    const laenge = (daten[i]! << 8) | daten[i + 1]!;
    if (laenge < 2 || i + laenge > daten.length) return { ok: false, grund: "defekt" };
    const segmentStart = i - 2; // inkl. FF und Marker
    const inhalt = i + 2;
    const ende = i + laenge;
    const kopie = () => {
      const s = new Uint8Array(ende - segmentStart);
      s.set(daten.subarray(segmentStart, ende));
      s[0] = 0xff; // Füllbytes davor sind schon übersprungen
      return s;
    };

    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      // Alle APPn und COM verwerfen – auch JFIF/JFXX (Thumbnail), ICC_PROFILE und Adobe.
      entfernt.push(name(marker));
    } else if (UEBERNEHMEN.has(marker)) {
      if (marker === 0xdd && laenge !== 4) return { ok: false, grund: "defekt", segment: "DRI" };
      teile.push(kopie());
    } else if (istSof(marker)) {
      if (sof || sos) return { ok: false, grund: "nicht_unterstuetzt", segment: "SOF" };
      if (laenge < 8) return { ok: false, grund: "defekt", segment: "SOF" };
      const hoehe = (daten[inhalt + 1]! << 8) | daten[inhalt + 2]!;
      const breite = (daten[inhalt + 3]! << 8) | daten[inhalt + 4]!;
      const komponenten = daten[inhalt + 5]!;
      if (komponenten < 1 || komponenten > 4 || laenge !== 8 + 3 * komponenten) return { ok: false, grund: "defekt", segment: "SOF" };
      // Höhe 0 hieße „Höhe folgt im DNL-Segment“ – nicht unterstützt.
      if (breite < 1 || hoehe < 1) return { ok: false, grund: "nicht_unterstuetzt", segment: "SOF" };
      if (breite > MAX_JPEG_KANTE || hoehe > MAX_JPEG_KANTE) return { ok: false, grund: "abmessungen" };
      sof = { breite, hoehe, komponenten };
      teile.push(kopie());
    } else if (marker === 0xda) {
      if (!sof) return { ok: false, grund: "defekt", segment: "SOS" };
      const ns = laenge >= 3 ? daten[inhalt]! : 0;
      if (ns < 1 || ns > 4 || laenge !== 6 + 2 * ns) return { ok: false, grund: "defekt", segment: "SOS" };
      sos = true;
      teile.push(kopie());
      // Entropie-kodierte Daten bis zum nächsten echten Marker (FF00 = Stuffing, FFD0–FFD7 = RST).
      const j = scanEnde(daten, ende);
      if (j >= daten.length) return { ok: false, grund: "defekt", segment: "SOS" };
      teile.push(daten.slice(ende, j));
      i = j;
      continue;
    } else {
      // DNL, DHP, EXP, DAC, JPG, JPGn und alles Unbekannte ⇒ im Zweifel ablehnen.
      return { ok: false, grund: "nicht_unterstuetzt", segment: hex(marker) };
    }
    i = ende;
  }
  return { ok: false, grund: "defekt" };
}

/** Index des nächsten echten Markers nach entropie-kodierten Daten (FF00 = Stuffing, FFD0–FFD7 = RST); sonst `daten.length`. */
function scanEnde(daten: Uint8Array, start: number): number {
  let j = start;
  while (j < daten.length) {
    if (daten[j] === 0xff && j + 1 < daten.length) {
      const n = daten[j + 1]!;
      if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) {
        j += 2;
        continue;
      }
      return j;
    }
    j++;
  }
  return daten.length;
}

function verbinde(teile: Uint8Array[]): Uint8Array {
  const laenge = teile.reduce((s, t) => s + t.length, 0);
  const out = new Uint8Array(laenge);
  let i = 0;
  for (const t of teile) {
    out.set(t, i);
    i += t.length;
  }
  return out;
}

/**
 * Marker-Folge eines JPEG bis EOI (für Tests/Prüfungen), z. B. ["SOI", "APP0", "DQT", …].
 * Scan-Daten werden übersprungen. Bei defekter Struktur `null`.
 */
export function jpegSegmente(daten: Uint8Array): string[] | null {
  if (daten.length < 2 || daten[0] !== 0xff || daten[1] !== 0xd8) return null;
  const namen: string[] = ["SOI"];
  const bez: Record<number, string> = { 0xdb: "DQT", 0xc4: "DHT", 0xdd: "DRI", 0xda: "SOS", 0xd9: "EOI" };
  let i = 2;
  while (i < daten.length) {
    if (daten[i] !== 0xff) return null;
    while (i < daten.length && daten[i] === 0xff) i++;
    const m = daten[i++];
    if (m === undefined) return null;
    if (m === 0xd9) return [...namen, "EOI"];
    if (i + 2 > daten.length) return null;
    const l = (daten[i]! << 8) | daten[i + 1]!;
    if (l < 2 || i + l > daten.length) return null;
    namen.push(bez[m] ?? (m >= 0xc0 && m <= 0xcf ? `SOF${m - 0xc0}` : name(m)));
    i += l;
    if (m === 0xda) i = scanEnde(daten, i);
  }
  return null;
}

/** Lesbare Meldung zum Ablehnungsgrund (ohne Bildinhalt). */
export function jpegFehlerText(p: Extract<JpegBereinigung, { ok: false }>): string {
  switch (p.grund) {
    case "anhang":
      return "Das Foto enthält zusätzliche Daten nach dem Bildende und wurde abgelehnt und gelöscht.";
    case "kein_jpeg":
      return "Die Datei ist kein JPEG-Bild und wurde abgelehnt und gelöscht.";
    case "abmessungen":
      return `Das Foto ist zu groß (höchstens ${MAX_JPEG_KANTE} Pixel Kantenlänge) und wurde abgelehnt und gelöscht.`;
    case "nicht_unterstuetzt":
      return "Dieses JPEG-Format wird nicht unterstützt; das Foto wurde abgelehnt und gelöscht. Bitte erneut über die App hochladen.";
    case "defekt":
      return "Das Foto ist beschädigt oder unvollständig und wurde abgelehnt und gelöscht.";
  }
}

function beginntMit(daten: Uint8Array, start: number, ende: number, text: string): boolean {
  if (start + text.length > ende) return false;
  for (let i = 0; i < text.length; i++) if (daten[start + i] !== text.charCodeAt(i)) return false;
  return true;
}

/** REQ-407: Dateisignatur einer Sprachaufnahme – nur WebM, Ogg und MP4/M4A. */
export type AudioTyp = "audio/webm" | "audio/ogg" | "audio/mp4";
export const AUDIO_TYPEN: readonly AudioTyp[] = ["audio/webm", "audio/ogg", "audio/mp4"];

export function erkenneAudioTyp(daten: Uint8Array): AudioTyp | null {
  if (daten.length >= 4 && daten[0] === 0x1a && daten[1] === 0x45 && daten[2] === 0xdf && daten[3] === 0xa3) return "audio/webm";
  if (beginntMit(daten, 0, daten.length, "OggS")) return "audio/ogg";
  if (beginntMit(daten, 4, daten.length, "ftyp")) return "audio/mp4";
  return null;
}

/** Basistyp ohne Parameter, z. B. „audio/webm;codecs=opus“ → „audio/webm“. */
export function basisMimeTyp(mime: string): string {
  return mime.split(";")[0]!.trim().toLowerCase();
}
