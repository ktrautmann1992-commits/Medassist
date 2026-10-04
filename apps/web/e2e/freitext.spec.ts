import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { bereinigeJpeg, jpegSegmente } from "@medassist/core";
import { signiereToken } from "../lib/medien/signatur";
import { TEST_TRANSKRIPT } from "../lib/medien/stt-adapter";
import { testDb } from "./db";
import { minimalesEigenesProfil, neuesKonto } from "./helfer";

/**
 * Meilenstein 5 – Weg 1 „Freie Beschreibung“ (REQ-400 – REQ-413). Läuft in beiden 2FA-Modi.
 * Der Haupt-Server (Port 3000) nutzt die Test-Adapter (STORAGE_ANBIETER=lokal, STT_ANBIETER=test,
 * siehe playwright.config.ts); der zweite Server (Port 3001) den Standardmodus (beides „aus“).
 * Screenshots (390 px) nur mit `SCREENSHOT_DIR=<Ordner>`.
 */

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;
const STANDARD_URL = "http://localhost:3001";
const SPEICHER = process.env.STORAGE_LOKAL_PFAD!;

async function foto(page: Page, name: string) {
  if (!SCREENSHOT_DIR) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const vorher = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  if (vorher) await page.setViewportSize(vorher);
}

const weiter = (page: Page) => page.getByRole("button", { name: "Weiter", exact: true }).click();

async function stehtGanzOben(page: Page, selektor: string) {
  const hinweis = await page.locator(selektor).boundingBox();
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(hinweis && h1 && hinweis.y < h1.y).toBe(true);
}

/** Startet einen Fall von Weg 1 und gibt die Fall-ID zurück. */
async function starteFreitext(page: Page, profilId: string, seelisch = false): Promise<string> {
  await page.goto(`/eingrenzung?profil=${profilId}&weg=freitext`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Beschwerden beschreiben");
  if (seelisch) await page.getByLabel(/seelische Beschwerden/).check();
  await page.getByRole("button", { name: "Beschreibung beginnen" }).click();
  await expect(page).toHaveURL(/\/eingrenzung\/[^/?]+$/);
  return new URL(page.url()).pathname.split("/")[2]!;
}

async function schnellcheckNichts(page: Page) {
  await page.getByLabel("Nichts davon trifft zu").check();
  await weiter(page);
  await expect(page.locator("#beschreibung-text")).toBeVisible();
}

/** Ein kleines, im Browser erzeugtes JPEG (Canvas). */
async function canvasJpeg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 48;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(0, 0, 64, 48);
    ctx.fillStyle = "#f5cba7";
    ctx.fillRect(16, 12, 32, 24);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1]!;
  });
  return Buffer.from(b64, "base64");
}

/** Verrauschtes JPEG (256 × 256) – lange Scan-Daten, damit ein Test Bytes darin ersetzen kann. */
async function rauschJpeg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const bild = ctx.createImageData(256, 256);
    for (let i = 0; i < bild.data.length; i++) bild.data[i] = i % 4 === 3 ? 255 : (i * 7919) % 251;
    ctx.putImageData(bild, 0, 0);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1]!;
  });
  return Buffer.from(b64, "base64");
}

/** APP1-Exif-Segment mit „GPS“-Kennung (wie eine Kamera-Datei). */
function exifSegment(): Buffer {
  const inhalt = Buffer.concat([Buffer.from("Exif\0\0", "binary"), Buffer.from("MM\0*GPSLatitude=52.5200;GPSLongitude=13.4050;Anna Test", "binary")]);
  const laenge = inhalt.length + 2;
  return Buffer.concat([Buffer.from([0xff, 0xe1, laenge >> 8, laenge & 0xff]), inhalt]);
}

/** QA M5: Exif/GPS-Nutzlast in einem ICC_PROFILE-APP2-Segment (früher durchgelassen). */
function iccMitGps(): Buffer {
  const inhalt = Buffer.concat([Buffer.from("ICC_PROFILE\0\x01\x01", "binary"), Buffer.from("Exif\0\0MM\0*GPSLatitude=52.5200;GPSLongitude=13.4050", "binary")]);
  const laenge = inhalt.length + 2;
  return Buffer.concat([Buffer.from([0xff, 0xe2, laenge >> 8, laenge & 0xff]), inhalt]);
}

/** Erwartete Segmentfolge eines serverseitig neu geschriebenen Canvas-JPEG (nur kanonisches APP0). */
function nurKanonischesApp0(daten: Buffer) {
  const segmente = jpegSegmente(new Uint8Array(daten))!;
  expect(segmente.slice(0, 2)).toEqual(["SOI", "APP0"]);
  expect(segmente.filter((x) => x.startsWith("APP") || x === "COM")).toEqual(["APP0"]);
  expect(daten.subarray(2, 20).equals(Buffer.from([0xff, 0xe0, 0, 16, ...Buffer.from("JFIF\0", "binary"), 1, 1, 0, 0, 1, 0, 1, 0, 0]))).toBe(true);
}

/** JPEG mit EXIF direkt nach SOI. */
function mitExif(jpeg: Buffer): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), exifSegment(), jpeg.subarray(2)]);
}

async function erteileEinwilligung(page: Page, testId: "einwilligung-foto_verarbeitung" | "einwilligung-sprach_verarbeitung") {
  const form = page.getByTestId(testId);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Einwilligen" }).click();
  await expect(page.getByTestId(`${testId}-erteilt`)).toBeVisible();
}

async function ladeFotoHoch(page: Page, datei: Buffer, region?: string) {
  await page.locator("#foto-datei").setInputFiles({ name: "hautausschlag.jpg", mimeType: "image/jpeg", buffer: datei });
  if (region) await page.locator("#foto-region").selectOption({ label: region });
  await page.getByRole("button", { name: "Foto hochladen" }).click();
}

async function fotoBytes(context: BrowserContext, src: string): Promise<{ status: number; daten: Buffer }> {
  const r = await context.request.get(new URL(src, "http://localhost:3000").toString());
  return { status: r.status(), daten: Buffer.from(await r.body()) };
}

test.describe("Beschwerden beschreiben (Weg 1)", () => {
  test("REQ-400 – REQ-403: Schnellcheck zuerst, Freitext mit Zähler, zu lang ⇒ Fehler, Übergang in Weg 2, Fall in Liste", async ({ browser }) => {
    test.setTimeout(180_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "freitext");
    const profilId = await minimalesEigenesProfil(page, "Frieda");

    // REQ-400: Einstieg auf /start wie design-vorschau.html
    await page.goto("/start");
    const einstieg = page.getByRole("link", { name: /^Beschwerden beschreiben/ });
    await expect(einstieg).toContainText("Sprachaufnahme");
    await einstieg.click();
    await expect(page).toHaveURL(new RegExp(`/eingrenzung\\?profil=${profilId}&weg=freitext$`));
    await foto(page, "01-einstieg");
    await page.getByRole("button", { name: "Beschreibung beginnen" }).click();
    await expect(page).toHaveURL(/\/eingrenzung\/[^/?]+$/);
    const fallId = new URL(page.url()).pathname.split("/")[2]!;
    expect(await db.fall.findUniqueOrThrow({ where: { id: fallId } })).toMatchObject({ weg: "FREITEXT", art: "KOERPERLICH", status: "ENTWURF" });

    // REQ-401: Warnzeichen-Schnellcheck vor der Beschreibung – kein Textfeld, keine Fotos
    await expect(page.getByTestId("schrittanzeige")).toContainText("Schritt 1 von");
    await expect(page.locator("#beschreibung-text")).toHaveCount(0);
    await expect(page.getByTestId("foto-bereich")).toHaveCount(0);
    await page.goto(`/eingrenzung/${fallId}?schritt=beschreibung`);
    await expect(page.locator("#beschreibung-text")).toHaveCount(0);
    await schnellcheckNichts(page);
    await expect(page.getByTestId("schrittanzeige")).toContainText("Schritt 2 von");

    // REQ-402/REQ-403: Zähler, Hinweise, Krisen-Kontakte am Feld; kein maxlength
    const feld = page.locator("#beschreibung-text");
    await expect(feld).not.toHaveAttribute("maxlength");
    await expect(page.getByTestId("zeichen-zaehler")).toHaveText("0 von 2000 Zeichen");
    await expect(page.getByText("Automatische Auswertung des Textes folgt (KI, Meilenstein 6).")).toBeVisible();
    const amFeld = page.locator("#beschreibung-krise");
    await expect(amFeld).toContainText("Wenn Sie an Suizid denken:");
    for (const href of ["tel:112", "tel:08001110111", "tel:08001110222"]) await expect(amFeld.locator(`a[href="${href}"]`)).toBeVisible();

    // zu lang ⇒ Fehler, Text bleibt vollständig erhalten, nichts gespeichert
    const zuLang = "Halsschmerzen ".repeat(150).slice(0, 2001);
    await feld.fill(zuLang);
    await expect(page.getByTestId("zeichen-zaehler")).toContainText("2001 von 2000 Zeichen – 1 zu viel");
    await weiter(page);
    await expect(page.locator("#beschreibung-text-fehler")).toContainText("zu lang (2001 von höchstens 2000 Zeichen)");
    await expect(page.locator("#fehler-zusammenfassung")).toBeFocused();
    expect((await feld.inputValue()).length).toBe(2001);
    expect(await db.eingabe.count({ where: { fallId, frageId: "beschreibung" } })).toBe(0);
    await foto(page, "02-zu-lang");

    // gültig (mit Zeilenumbruch) ⇒ gespeichert, weiter zur Körperregion (Weg 2)
    await feld.fill("Seit gestern Halsschmerzen beim Schlucken.\nKein Fieber gemessen.");
    await expect(page.getByTestId("zeichen-zaehler")).toHaveText("64 von 2000 Zeichen");
    await weiter(page);
    await expect(page.getByRole("heading", { name: "Wo sind die Beschwerden?" })).toBeVisible();
    const eingabe = await db.eingabe.findFirstOrThrow({ where: { fallId, frageId: "beschreibung" } });
    expect(eingabe).toMatchObject({ typ: "TEXT", korrigiert: false, inhalt: "Seit gestern Halsschmerzen beim Schlucken.\nKein Fieber gemessen." });

    // Zurück ⇒ Beschreibung bearbeitbar (vorheriger Text), Schnellcheck nicht
    await page.getByRole("link", { name: "Zurück" }).click();
    await expect(feld).toHaveValue("Seit gestern Halsschmerzen beim Schlucken.\nKein Fieber gemessen.");
    await weiter(page);
    await page.getByRole("radio", { name: /^Hals \(vorne\)/ }).check();
    await weiter(page);
    await expect(page.getByRole("form", { name: "Schritt beantworten" })).toHaveAttribute("data-schritt", "k_art");

    // REQ-317/REQ-400: Fall in der Liste mit „Freie Beschreibung“; Zusammenfassung zeigt den Text
    await page.goto("/faelle");
    const eintrag = page.locator(`[data-fall-id="${fallId}"]`);
    await expect(eintrag).toContainText("Körperliche Beschwerden · Freie Beschreibung");
    await expect(eintrag.getByRole("link", { name: /^Fortsetzen/ })).toBeVisible();
    await eintrag.getByRole("link", { name: /^Ansehen/ }).click();
    await expect(page.getByTestId("profil")).toContainText("Freie Beschreibung");
    await expect(page.locator('[data-abschnitt="beschreibung"]')).toContainText("Kein Fieber gemessen.");
    await context.close();
    await db.$disconnect();
  });

  test("REQ-401: Warnzeichen im Schnellcheck ⇒ Hinweis oben vor der Beschreibung; seelisch ⇒ Krisen-Screening zuerst", async ({ browser }) => {
    test.setTimeout(120_000);
    const { page, context } = await neuesKonto(browser, "Patient", "freitext-warn");
    const profilId = await minimalesEigenesProfil(page, "Wanda");

    await starteFreitext(page, profilId);
    await page.getByLabel(/^Bewusstlos/).check();
    await weiter(page);
    await expect(page.locator("#notfallhinweis")).toContainText("Sofort Notruf 112");
    await expect(page.getByTestId("vorrang-hinweise")).toBeFocused();
    await stehtGanzOben(page, "#notfallhinweis");
    // NOTFALL ⇒ zuerst die Bestätigung, weder Textfeld noch Fotos/Sprache
    await expect(page.getByRole("heading", { name: "Zuerst Notruf 112" })).toBeVisible();
    await expect(page.locator("#beschreibung-text")).toHaveCount(0);
    await expect(page.getByTestId("foto-bereich")).toHaveCount(0);
    await foto(page, "03-warnzeichen");
    await page.getByLabel(/Mir ist bewusst/).check();
    await page.getByRole("button", { name: "Fragen trotzdem fortsetzen" }).click();
    await expect(page.locator("#beschreibung-text")).toBeVisible();
    await expect(page.locator("#notfallhinweis")).toBeVisible();

    // seelisch: Pflicht-Krisen-Screening zuerst, danach Schnellcheck, dann Beschreibung
    await starteFreitext(page, profilId, true);
    await expect(page.locator("#antwort-krise_plaene-nein")).toBeVisible();
    await expect(page.locator("#beschreibung-text")).toHaveCount(0);
    for (const f of ["krise_gedanken_nicht_leben", "krise_gedanken_selbstverletzung", "krise_plaene"]) await page.locator(`#antwort-${f}-nein`).check();
    await weiter(page);
    await schnellcheckNichts(page);
    await expect(page.locator("#beschreibung-krise")).toBeVisible();
    await expect(page.getByTestId("krisen-kontakte").last()).toContainText("Hilfe in Krisen");
    await page.locator("#beschreibung-text").fill("Ich schlafe seit Wochen schlecht.");
    await weiter(page);
    await expect(page.getByRole("form", { name: "Schritt beantworten" })).toHaveAttribute("data-schritt", "s_stimmung");
    await context.close();
  });

  test("REQ-405 – REQ-411: Foto – Einwilligung, EXIF im Browser bereinigt, manipulierter Upload serverseitig neu geschrieben, kaputtes JPEG abgelehnt, Zugriff, Ablauf, Löschen", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = testDb();
    const a = await neuesKonto(browser, "Patient", "foto-a");
    const page = a.page;
    const profilId = await minimalesEigenesProfil(page, "Fanny");
    const fallId = await starteFreitext(page, profilId);
    await schnellcheckNichts(page);

    // ohne Einwilligung: kein Upload angeboten
    const bereich = page.getByTestId("foto-bereich");
    await expect(bereich.getByTestId("einwilligung-foto_verarbeitung")).toBeVisible();
    await expect(page.locator("#foto-datei")).toHaveCount(0);
    await erteileEinwilligung(page, "einwilligung-foto_verarbeitung");
    const nutzer = await db.nutzer.findUniqueOrThrow({ where: { email: a.email } });
    expect(await db.einwilligung.count({ where: { nutzerId: nutzer.id, zweck: "FOTO_VERARBEITUNG", widerrufenAm: null, textVersion: "foto-0.1" } })).toBe(1);
    await expect(page.getByTestId("aufnahmehinweise")).toContainText("Lineal oder eine Münze");

    // Bild MIT EXIF/GPS ⇒ im Browser neu kodiert, Server prüft, Foto ohne Metadaten gespeichert
    const original = mitExif(await canvasJpeg(page));
    expect(jpegSegmente(new Uint8Array(original))).toContain("APP1");
    // Text bleibt beim Hochladen erhalten (Zustand im Client)
    await page.locator("#beschreibung-text").fill("Roter Fleck am Unterarm.");
    await ladeFotoHoch(page, original, "Linker Arm und Schulter");
    await expect(page.getByTestId("foto-status")).toHaveText("Foto gespeichert (ohne Metadaten).");
    await expect(page.getByTestId("foto-liste").locator("li")).toHaveCount(1);
    await expect(page.locator("#beschreibung-text")).toHaveValue("Roter Fleck am Unterarm.");
    const gespeichert = await db.foto.findFirstOrThrow({ where: { fallId } });
    expect(gespeichert).toMatchObject({ mimeType: "image/jpeg", koerperregion: "arm_links" });
    expect(gespeichert.metadatenEntferntAm).not.toBeNull();
    expect(gespeichert.speicherSchluessel).toMatch(/^fotos\/[a-f0-9]{32}\.jpg$/);
    expect(gespeichert.speicherSchluessel).not.toContain(fallId);
    const src = (await page.getByTestId("foto-liste").locator("img").getAttribute("src"))!;
    const bild = await fotoBytes(a.context, src);
    expect(bild.status).toBe(200);
    nurKanonischesApp0(bild.daten);
    expect(bild.daten.includes(Buffer.from("GPS"))).toBe(false);
    expect(bild.daten.includes(Buffer.from("Exif"))).toBe(false);
    // Eingangsobjekt gelöscht, Auftrag einmalig verwendet
    const auftrag = await db.hochladeauftrag.findFirstOrThrow({ where: { fallId, zweck: "FOTO" } });
    expect(auftrag).toMatchObject({ ergebnis: "angenommen" });
    expect(auftrag.erledigtAm).not.toBeNull();
    expect(existsSync(path.join(SPEICHER, auftrag.eingangsSchluessel))).toBe(false);
    await foto(page, "04-foto");

    // QA M5 – manipulierter Client: Upload MIT EXIF in APP1 **und** GPS im ICC-Segment (gleiche Länge)
    // ⇒ der Server schreibt das JPEG neu: gespeichert wird ein Abbild ohne jedes APPn außer dem kanonischen APP0.
    let manipuliert: Buffer | null = null;
    await page.route("**/api/dateien/**", async (route) => {
      const req = route.request();
      if (req.method() !== "PUT") return route.continue();
      const sauber = req.postDataBuffer()!;
      const zusatz = Buffer.concat([exifSegment(), iccMitGps()]);
      // Ende der Scan-Daten kürzen (FFD9 bleibt) – Länge wie angekündigt
      const scanEnde = sauber.length - 2;
      manipuliert = Buffer.concat([sauber.subarray(0, 2), zusatz, sauber.subarray(2, scanEnde - zusatz.length), sauber.subarray(scanEnde)]);
      expect(manipuliert.length).toBe(sauber.length);
      await route.continue({ postData: manipuliert });
    });
    await ladeFotoHoch(page, await rauschJpeg(page));
    await expect(page.getByTestId("foto-status")).toHaveText("Foto gespeichert (ohne Metadaten).");
    expect(await db.foto.count({ where: { fallId } })).toBe(2);
    const zweites = await db.foto.findFirstOrThrow({ where: { fallId }, orderBy: { erstelltAm: "desc" } });
    const gespeichertZwei = readFileSync(path.join(SPEICHER, zweites.speicherSchluessel));
    expect(gespeichertZwei.includes(Buffer.from("GPS"))).toBe(false);
    expect(gespeichertZwei.includes(Buffer.from("Exif"))).toBe(false);
    expect(gespeichertZwei.includes(Buffer.from("ICC_PROFILE"))).toBe(false);
    nurKanonischesApp0(gespeichertZwei);
    // genau das serverseitig neu geschriebene Abbild des Uploads
    const erwartet = bereinigeJpeg(new Uint8Array(manipuliert!));
    expect(erwartet.ok && Buffer.from(erwartet.daten).equals(gespeichertZwei)).toBe(true);
    expect(zweites.groesseBytes).toBe(gespeichertZwei.length);
    const zweiterAuftrag = await db.hochladeauftrag.findFirstOrThrow({ where: { fallId, zweck: "FOTO" }, orderBy: { erstelltAm: "desc" } });
    expect(zweiterAuftrag.ergebnis).toBe("angenommen");
    expect(existsSync(path.join(SPEICHER, zweiterAuftrag.eingangsSchluessel))).toBe(false);
    await page.unroute("**/api/dateien/**");

    // Kaputtes JPEG (Daten nach dem Bildende) ⇒ abgelehnt und gelöscht, kein Foto
    await page.route("**/api/dateien/**", async (route) => {
      const req = route.request();
      if (req.method() !== "PUT") return route.continue();
      const sauber = req.postDataBuffer()!;
      await route.continue({ postData: Buffer.concat([sauber.subarray(0, sauber.length - 4), Buffer.from([0xff, 0xd9, 0x41, 0x42])]) });
    });
    await ladeFotoHoch(page, await canvasJpeg(page));
    await expect(page.getByTestId("foto-status")).toContainText("abgelehnt und gelöscht");
    await page.unroute("**/api/dateien/**");
    expect(await db.foto.count({ where: { fallId } })).toBe(2);
    const abgelehnt = await db.hochladeauftrag.findFirstOrThrow({ where: { fallId, zweck: "FOTO", ergebnis: { startsWith: "abgelehnt" } } });
    expect(abgelehnt.ergebnis).toBe("abgelehnt:anhang");
    expect(existsSync(path.join(SPEICHER, abgelehnt.eingangsSchluessel))).toBe(false);

    // Einwilligung (z. B. in anderem Tab) widerrufen ⇒ Server lehnt Upload ab
    await db.einwilligung.updateMany({ where: { nutzerId: nutzer.id, zweck: "FOTO_VERARBEITUNG" }, data: { widerrufenAm: new Date() } });
    await ladeFotoHoch(page, await canvasJpeg(page));
    await expect(page.getByTestId("foto-status")).toContainText("Einwilligung");
    expect(await db.foto.count({ where: { fallId } })).toBe(2);
    await page.reload();
    await expect(page.locator("#foto-datei")).toHaveCount(0);
    await expect(page.getByTestId("einwilligung-foto_verarbeitung")).toBeVisible();

    // Abgelaufene (korrekt signierte) URL ⇒ 403; manipulierte Signatur ⇒ 403
    const schluessel = Buffer.from(process.env.STORAGE_LOKAL_SCHLUESSEL!, "base64");
    const abgelaufen = signiereToken({ m: "GET", k: gespeichert.speicherSchluessel, u: nutzer.id, e: Math.floor(Date.now() / 1000) - 5, t: "image/jpeg", n: 0 }, schluessel);
    expect((await fotoBytes(a.context, `/api/dateien/${abgelaufen}`)).status).toBe(403);
    const kaputt = src.slice(0, -3) + (src.endsWith("AAA") ? "BBB" : "AAA");
    expect((await fotoBytes(a.context, kaputt)).status).toBe(403);
    // Fallansicht zeigt das Foto (frische URL)
    await page.goto(`/faelle/${fallId}`);
    await expect(page.getByTestId("foto-liste").locator("img")).toHaveCount(2);

    // Fremdes Konto: signierte URL ⇒ 404, Fall ⇒ 404, Löschen fremder Foto-ID ⇒ abgewiesen
    const b = await neuesKonto(browser, "Patient", "foto-b");
    expect((await fotoBytes(b.context, src)).status).toBe(404);
    const antwort = await b.page.goto(`/faelle/${fallId}`);
    expect(antwort?.status()).toBe(404);
    const profilB = await minimalesEigenesProfil(b.page, "Bruno");
    const fallB = await starteFreitext(b.page, profilB);
    await schnellcheckNichts(b.page);
    await erteileEinwilligung(b.page, "einwilligung-foto_verarbeitung");
    await ladeFotoHoch(b.page, await canvasJpeg(b.page));
    await expect(b.page.getByTestId("foto-status")).toHaveText("Foto gespeichert (ohne Metadaten).");
    const eigenesB = b.page.getByTestId("foto-liste").locator("li").first();
    await eigenesB.locator("input[name=fotoId]").evaluate((el, id) => ((el as HTMLInputElement).value = id), gespeichert.id);
    await eigenesB.getByRole("button", { name: /^Foto löschen/ }).click();
    await expect(eigenesB.getByRole("alert")).toHaveText("Foto nicht gefunden.");
    expect(await db.foto.count({ where: { id: gespeichert.id } })).toBe(1);
    // eigenes Foto löschen ⇒ Datensatz und Datei weg
    await b.page.reload();
    const fotoB = await db.foto.findFirstOrThrow({ where: { fallId: fallB } });
    await b.page.getByTestId("foto-liste").getByRole("button", { name: /^Foto löschen/ }).click();
    await expect(b.page.getByTestId("foto-liste")).toHaveCount(0);
    expect(await db.foto.count({ where: { id: fotoB.id } })).toBe(0);
    expect(existsSync(path.join(SPEICHER, fotoB.speicherSchluessel))).toBe(false);

    await a.context.close();
    await b.context.close();
    await db.$disconnect();
  });

  test("REQ-406/REQ-407: Sprachaufnahme mit Test-STT ⇒ Transkript korrigierbar ⇒ gespeichert mit korrigiert=true, Audio gelöscht", async ({ browser }) => {
    test.setTimeout(180_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "sprache");
    const profilId = await minimalesEigenesProfil(page, "Sven");
    const fallId = await starteFreitext(page, profilId);
    await schnellcheckNichts(page);

    const bereich = page.getByTestId("sprach-bereich");
    await expect(bereich.getByRole("button", { name: "Aufnahme starten" })).toHaveCount(0);
    await erteileEinwilligung(page, "einwilligung-sprach_verarbeitung");
    await bereich.getByRole("button", { name: "Aufnahme starten" }).click();
    await expect(page.getByTestId("sprach-status")).toContainText("Aufnahme läuft");
    await page.waitForTimeout(1500);
    await bereich.getByRole("button", { name: "Aufnahme beenden" }).click();
    await expect(page.getByTestId("sprach-status")).toContainText("Transkript eingefügt", { timeout: 20_000 });
    const feld = page.locator("#beschreibung-text");
    await expect(feld).toHaveValue(TEST_TRANSKRIPT);
    await expect(page.getByTestId("transkript-hinweis")).toBeVisible();
    // Audio sofort gelöscht, nur Hash gespeichert
    const auftrag = await db.hochladeauftrag.findFirstOrThrow({ where: { fallId, zweck: "AUDIO" } });
    expect(auftrag).toMatchObject({ ergebnis: "transkribiert", sttAnbieter: "test" });
    expect(auftrag.transkriptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(path.join(SPEICHER, auftrag.eingangsSchluessel))).toBe(false);
    await foto(page, "05-transkript");

    // ohne Prüfbestätigung ⇒ abgewiesen
    await weiter(page);
    await expect(page.locator("#transkriptGeprueft-fehler")).toContainText("Transkript geprüft");
    expect(await db.eingabe.count({ where: { fallId, frageId: "beschreibung" } })).toBe(0);

    // korrigieren, bestätigen ⇒ SPRACH_TRANSKRIPT mit korrigiert=true
    await feld.fill(TEST_TRANSKRIPT.replace("abends leichtes Fieber", "kein Fieber"));
    await page.getByLabel("Ich habe das Transkript geprüft und bei Bedarf korrigiert.").check();
    await weiter(page);
    await expect(page.getByRole("heading", { name: "Wo sind die Beschwerden?" })).toBeVisible();
    const eingabe = await db.eingabe.findFirstOrThrow({ where: { fallId, frageId: "beschreibung" } });
    expect(eingabe).toMatchObject({ typ: "SPRACH_TRANSKRIPT", korrigiert: true });
    expect(eingabe.inhalt).toContain("kein Fieber");
    await page.goto(`/faelle/${fallId}`);
    await expect(page.locator('[data-abschnitt="beschreibung"]')).toContainText("Per Sprachaufnahme (Transkript korrigiert)");
    await context.close();
    await db.$disconnect();
  });

  test("REQ-406/REQ-408 Standardmodus (Speicher und STT aus): Hinweise statt Upload und Aufnahme", async ({ browser }) => {
    test.setTimeout(120_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "standard");
    const profilId = await minimalesEigenesProfil(page, "Stella");
    const fallId = await starteFreitext(page, profilId);
    await schnellcheckNichts(page);

    // Gleiche Sitzung (Cookie gilt für localhost), Server im Standardmodus
    await page.goto(`${STANDARD_URL}/eingrenzung/${fallId}`);
    await expect(page.locator("#beschreibung-text")).toBeVisible();
    await expect(page.getByTestId("sprache-aus")).toBeVisible();
    await expect(page.getByText("Sprachaufnahme in dieser Demo nicht aktiviert.")).toBeVisible();
    await expect(page.getByTestId("foto-aus")).toBeVisible();
    await expect(page.getByText("Foto-Upload in dieser Demo nicht aktiviert.")).toBeVisible();
    await expect(page.locator("#foto-datei")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aufnahme starten" })).toHaveCount(0);
    await expect(page.getByTestId("einwilligung-foto_verarbeitung")).toHaveCount(0);
    // Die Datei-Route existiert im Standardmodus nicht
    expect((await context.request.get(`${STANDARD_URL}/api/dateien/abc.def`)).status()).toBe(404);
    await foto(page, "06-standardmodus");
    // Freitext funktioniert unverändert
    await page.locator("#beschreibung-text").fill("Rückenschmerzen nach dem Umzug.");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Wo sind die Beschwerden?" })).toBeVisible();
    expect(await db.eingabe.count({ where: { fallId, frageId: "beschreibung", typ: "TEXT" } })).toBe(1);
    await context.close();
    await db.$disconnect();
  });
});
