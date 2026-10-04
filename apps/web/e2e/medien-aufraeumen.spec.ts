import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { testDb } from "./db";
import { minimalesEigenesProfil, neuesKonto } from "./helfer";

/**
 * QA M5 (REQ-409, REQ-411, REQ-414): Medien-Robustheit gegen einen manipulierten Client –
 * Server Actions werden direkt aufgerufen (wie ein Angreifer). Nutzt den Haupt-Server (Port 3000)
 * mit lokalem Speicher und Test-STT (playwright.config.ts).
 */

const BASIS = "http://localhost:3000";
const SPEICHER = process.env.STORAGE_LOKAL_PFAD!;

/** ID einer Server Action aus dem Build-Manifest (`next build`). */
function actionId(name: string): string {
  const manifest = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", ".next", "server", "server-reference-manifest.json"), "utf8")) as {
    node: Record<string, { exportedName: string }>;
  };
  const eintrag = Object.entries(manifest.node).find(([, v]) => v.exportedName === name);
  if (!eintrag) throw new Error(`Server Action ${name} nicht gefunden`);
  return eintrag[0];
}

/** Server Action direkt aufrufen und das Ergebnis (RSC-Zeile „1:“) lesen. */
async function action<T = Record<string, unknown>>(page: Page, name: string, arg: unknown): Promise<T> {
  const text = await page.evaluate(
    async ({ id, arg }) => {
      const r = await fetch(location.pathname, {
        method: "POST",
        headers: { "Next-Action": id, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify([arg]),
      });
      return r.text();
    },
    { id: actionId(name), arg },
  );
  const zeile = text.split("\n").find((z) => z.startsWith("1:"));
  if (!zeile) throw new Error(`Unerwartete Antwort: ${text.slice(0, 200)}`);
  return JSON.parse(zeile.slice(2)) as T;
}

type Vorbereitet = { ok: true; auftragId: string; upload: { url: string } } | { ok: false; fehler: string };

async function put(ctx: BrowserContext, url: string, body: Buffer, typ: string): Promise<number> {
  const r = await ctx.request.fetch(BASIS + url, { method: "PUT", headers: { "Content-Type": typ }, data: body, failOnStatusCode: false });
  return r.status();
}

async function canvasJpeg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#a33";
    ctx.fillRect(0, 0, 32, 32);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1]!;
  });
  return Buffer.from(b64, "base64");
}

async function freitextFall(page: Page, profilId: string, seelisch = false): Promise<string> {
  await page.goto(`/eingrenzung?profil=${profilId}&weg=freitext`);
  if (seelisch) await page.getByLabel(/seelische Beschwerden/).check();
  await page.getByRole("button", { name: "Beschreibung beginnen" }).click();
  await expect(page).toHaveURL(/\/eingrenzung\/[^/?]+$/);
  const fallId = new URL(page.url()).pathname.split("/")[2]!;
  if (seelisch) {
    for (const f of ["krise_gedanken_nicht_leben", "krise_gedanken_selbstverletzung", "krise_plaene"]) await page.locator(`#antwort-${f}-nein`).check();
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
  }
  await page.getByLabel("Nichts davon trifft zu").check();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.locator("#beschreibung-text")).toBeVisible();
  return fallId;
}

async function einwilligen(page: Page, testId: string) {
  const form = page.getByTestId(testId);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Einwilligen" }).click();
  await expect(page.getByTestId(`${testId}-erteilt`)).toBeVisible();
}

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200, 1)]);

test("QA M5: Eingänge werden immer gelöscht (Krise, fremder Fall, Ablauf), kein PUT-Replay, Foto-Limit bei der Registrierung", async ({ browser }) => {
  test.setTimeout(240_000);
  const db = testDb();
  const { page, context } = await neuesKonto(browser, "Patient", "medien-qa");
  const profilId = await minimalesEigenesProfil(page, "Quirin");
  const fall = await freitextFall(page, profilId);
  await einwilligen(page, "einwilligung-foto_verarbeitung");
  await einwilligen(page, "einwilligung-sprach_verarbeitung");
  // „Weiter“ steht hinter Sprachaufnahme und Fotos (QA M5, Hinweis 13)
  const fotoBox = (await page.getByTestId("foto-bereich").boundingBox())!;
  const weiterBox = (await page.getByRole("button", { name: "Weiter", exact: true }).boundingBox())!;
  expect(weiterBox.y).toBeGreaterThan(fotoBox.y + fotoBox.height - 1);

  // 1. Audio hochgeladen, Transkription mit fremdem/falschem Fall ⇒ abgewiesen, Audio trotzdem gelöscht
  const anderer = await freitextFall(page, profilId);
  const a1 = await action<Vorbereitet>(page, "bereiteAudioVor", { fallId: anderer, groesseBytes: WEBM.length, mimeType: "audio/webm" });
  if (!a1.ok) throw new Error(a1.fehler);
  expect(await put(context, a1.upload.url, WEBM, "audio/webm")).toBe(204);
  const auftrag1 = await db.hochladeauftrag.findUniqueOrThrow({ where: { id: a1.auftragId } });
  expect(existsSync(path.join(SPEICHER, auftrag1.eingangsSchluessel))).toBe(true);
  expect(await action(page, "transkribiere", { fallId: fall, auftragId: a1.auftragId })).toMatchObject({ ok: false });
  expect(existsSync(path.join(SPEICHER, auftrag1.eingangsSchluessel))).toBe(false);
  expect((await db.hochladeauftrag.findUniqueOrThrow({ where: { id: a1.auftragId } })).ergebnis).toBe("abgelehnt:fall");

  // 2. Audio hochgeladen, danach Krise ⇒ Transkription abgewiesen, Audio gelöscht
  const krisenFall = await freitextFall(page, profilId, true);
  const a2 = await action<Vorbereitet>(page, "bereiteAudioVor", { fallId: krisenFall, groesseBytes: WEBM.length, mimeType: "audio/webm" });
  if (!a2.ok) throw new Error(a2.fehler);
  expect(await put(context, a2.upload.url, WEBM, "audio/webm")).toBe(204);
  const auftrag2 = await db.hochladeauftrag.findUniqueOrThrow({ where: { id: a2.auftragId } });
  // Krisenantwort im Beschreibungsschritt (REQ-311: Krisenantworten werden in jedem Schritt ausgewertet)
  await page.locator("#beschreibung-text").fill("Ich kann nicht mehr.");
  await page.locator('form[aria-label="Schritt beantworten"]').evaluate((f) => {
    const i = document.createElement("input");
    i.type = "hidden";
    i.name = "antwort.krise_plaene";
    i.value = "ja";
    f.appendChild(i);
  });
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.locator("#krisenhinweis")).toBeVisible();
  expect((await db.fall.findUniqueOrThrow({ where: { id: krisenFall } })).status).toBe("KRISENHINWEIS");
  const t2 = await action<{ ok: boolean; fehler?: string }>(page, "transkribiere", { fallId: krisenFall, auftragId: a2.auftragId });
  expect(t2.ok).toBe(false);
  expect(existsSync(path.join(SPEICHER, auftrag2.eingangsSchluessel))).toBe(false);
  expect((await db.hochladeauftrag.findUniqueOrThrow({ where: { id: a2.auftragId } })).ergebnis).toBe("abgelehnt:ablauf");

  // 3. Abgelaufener Auftrag (nie registriert) ⇒ beim nächsten neuen Auftrag aufgeräumt
  await page.goto(`/eingrenzung/${fall}`);
  const jpeg = await canvasJpeg(page);
  const f3 = await action<Vorbereitet>(page, "bereiteFotoVor", { fallId: fall, groesseBytes: jpeg.length });
  if (!f3.ok) throw new Error(f3.fehler);
  expect(await put(context, f3.upload.url, jpeg, "image/jpeg")).toBe(204);
  const auftrag3 = await db.hochladeauftrag.update({ where: { id: f3.auftragId }, data: { laeuftAbAm: new Date(Date.now() - 1000) } });
  expect(existsSync(path.join(SPEICHER, auftrag3.eingangsSchluessel))).toBe(true);
  expect((await action<Vorbereitet>(page, "bereiteFotoVor", { fallId: fall, groesseBytes: jpeg.length })).ok).toBe(true);
  expect(existsSync(path.join(SPEICHER, auftrag3.eingangsSchluessel))).toBe(false);
  expect(await db.hochladeauftrag.findUniqueOrThrow({ where: { id: f3.auftragId } })).toMatchObject({ ergebnis: "abgelaufen" });
  // Registrierung des abgelaufenen Auftrags ⇒ abgewiesen
  expect(await action(page, "registriereFoto", { fallId: fall, auftragId: f3.auftragId, koerperregion: null })).toMatchObject({ ok: false });

  // 4. PUT-Replay nach der Registrierung ⇒ 409, kein neues Eingangsobjekt
  const f4 = await action<Vorbereitet>(page, "bereiteFotoVor", { fallId: fall, groesseBytes: jpeg.length });
  if (!f4.ok) throw new Error(f4.fehler);
  expect(await put(context, f4.upload.url, jpeg, "image/jpeg")).toBe(204);
  expect(await action(page, "registriereFoto", { fallId: fall, auftragId: f4.auftragId, koerperregion: null })).toMatchObject({ ok: true });
  const auftrag4 = await db.hochladeauftrag.findUniqueOrThrow({ where: { id: f4.auftragId } });
  expect(await put(context, f4.upload.url, jpeg, "image/jpeg")).toBe(409);
  expect(existsSync(path.join(SPEICHER, auftrag4.eingangsSchluessel))).toBe(false);

  // 5. Foto-Limit 20 je Fall auch bei vorab vorbereiteten Aufträgen (Zählung bei der Registrierung)
  const limitFall = await freitextFall(page, profilId);
  const nutzerId = auftrag4.nutzerId;
  await db.foto.createMany({
    data: Array.from({ length: 18 }, (_, i) => ({
      fallId: limitFall,
      hochgeladenVonId: nutzerId,
      speicherSchluessel: `fotos/${"0".repeat(24)}${String(i).padStart(2, "0")}${Date.now().toString(16).slice(-6)}.jpg`,
      mimeType: "image/jpeg",
      groesseBytes: 1,
    })),
  });
  const vorbereitet: { auftragId: string; upload: { url: string } }[] = [];
  for (let i = 0; i < 4; i++) {
    const v = await action<Vorbereitet>(page, "bereiteFotoVor", { fallId: limitFall, groesseBytes: jpeg.length });
    if (!v.ok) throw new Error(v.fehler);
    vorbereitet.push(v);
    expect(await put(context, v.upload.url, jpeg, "image/jpeg")).toBe(204);
  }
  const ergebnisse = await Promise.all(
    vorbereitet.map((v) => action<{ ok: boolean; fehler?: string }>(page, "registriereFoto", { fallId: limitFall, auftragId: v.auftragId, koerperregion: null })),
  );
  expect(ergebnisse.filter((r) => r.ok)).toHaveLength(2);
  expect(ergebnisse.filter((r) => !r.ok).map((r) => r.fehler)).toEqual(["Höchstens 20 Fotos je Fall.", "Höchstens 20 Fotos je Fall."]);
  expect(await db.foto.count({ where: { fallId: limitFall } })).toBe(20);
  // keine verwaisten Objekte: alle Eingänge gelöscht, nur Fotos mit Datensatz im Speicher
  for (const v of vorbereitet) {
    const a = await db.hochladeauftrag.findUniqueOrThrow({ where: { id: v.auftragId } });
    expect(existsSync(path.join(SPEICHER, a.eingangsSchluessel))).toBe(false);
  }
  await db.foto.deleteMany({ where: { fallId: limitFall } });

  await context.close();
  await db.$disconnect();
});
