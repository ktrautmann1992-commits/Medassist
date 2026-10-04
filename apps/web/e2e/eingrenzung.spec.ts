import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { testDb } from "./db";
import { minimalesEigenesProfil, neuesKonto, tagRelativ } from "./helfer";

/**
 * Meilenstein 4a – Weg 2 „Geführte Eingrenzung“ (REQ-300 – REQ-318). Läuft in beiden
 * 2FA-Modi; `neuesKonto` richtet die 2FA bei Bedarf ein.
 * Screenshots (390 px) nur mit `SCREENSHOT_DIR=<Ordner>`.
 */

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

async function foto(page: Page, name: string) {
  if (!SCREENSHOT_DIR) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const vorher = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  if (vorher) await page.setViewportSize(vorher);
}

const weiter = (page: Page) => page.getByRole("button", { name: "Weiter", exact: true }).click();

/** Der Hinweis steht vor der Seitenüberschrift (REQ-210, REQ-307). */
async function stehtGanzOben(page: Page, selektor: string) {
  const hinweis = await page.locator(selektor).boundingBox();
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(hinweis && h1 && hinweis.y < h1.y).toBe(true);
}

/** Startet einen Fall über die Startseite der Eingrenzung und gibt die Fall-ID zurück. */
async function starteFall(page: Page, profilId: string, art: "Körperlich" | "Seelisch / psychisch"): Promise<string> {
  await page.goto(`/eingrenzung?profil=${profilId}`);
  await page.getByRole("button", { name: new RegExp(`^${art.replace("/", "\\/")}`) }).click();
  await expect(page).toHaveURL(/\/eingrenzung\/[^/?]+$/);
  return new URL(page.url()).pathname.split("/")[2]!;
}

async function legeSaeuglingAn(page: Page, vorname: string, alterTage: number): Promise<string> {
  await page.goto("/profile/kind/neu");
  await page.getByLabel("Vorname").fill(vorname);
  await page.getByLabel("Nachname").fill("Test");
  await page.getByLabel("Geburtsdatum").fill(tagRelativ(-alterTage));
  await page.getByLabel("Geschlecht").selectOption({ label: "weiblich" });
  await page.getByLabel("Ich bin für dieses Kind sorgeberechtigt.").check();
  await page.getByRole("button", { name: "Profil speichern" }).click();
  await expect(page.getByRole("heading", { name: `${vorname} Test` })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2]!;
}

test.describe("Beschwerden eingrenzen (Weg 2)", () => {
  test("REQ-304 – REQ-317 körperlich: Körperkarte, Fragen, Warnzeichen mitten im Ablauf, Fortsetzen, Fallliste, fremder Fall", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "eingrenzung");
    const profilId = await minimalesEigenesProfil(page, "Ina");

    // REQ-318: Navigation und Einstieg über /start
    await page.goto("/start");
    await page.getByRole("link", { name: "Beschwerden eingrenzen" }).last().click();
    await expect(page).toHaveURL(new RegExp(`/eingrenzung\\?profil=${profilId}$`));
    await expect(page.getByTestId("profil")).toContainText("Ina Test");
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("link", { name: "Beschwerden eingrenzen" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Meine Fälle" })).toBeVisible();
    const fallId = await starteFall(page, profilId, "Körperlich");
    const fall = () => db.fall.findUniqueOrThrow({ where: { id: fallId }, include: { eingaben: { orderBy: { erstelltAm: "asc" } } } });
    expect(await fall()).toMatchObject({ art: "KOERPERLICH", weg: "GEFUEHRT", status: "ENTWURF", katalogVersion: "0.2.0", regelVersion: "0.2.0" });

    // REQ-306: Schnellcheck zuerst – ohne Antwort abgewiesen
    await expect(page.getByTestId("schrittanzeige")).toContainText("Schritt 1 von");
    await expect(page.getByText("Fragen ungeprüft").first()).toBeVisible();
    await weiter(page);
    await expect(page.locator("#fehler-zusammenfassung")).toBeFocused();
    await expect(page.locator("#schnellcheck-fehler")).toContainText("„Nichts davon trifft zu“ bestätigen");
    await page.getByLabel("Nichts davon trifft zu").check();
    await weiter(page);

    // REQ-309: Körperkarte vorne/hinten, Tastatur, Listen-Alternative synchron
    const karte = page.getByTestId("koerperkarte");
    await expect(karte.getByRole("group", { name: "Körperkarte, Vorderseite" })).toBeVisible();
    await foto(page, "01-koerperkarte-vorne");
    const kopf = karte.getByRole("button", { name: "Kopf und Gesicht" });
    await kopf.focus();
    await page.keyboard.press("Enter");
    await expect(kopf).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("radio", { name: "Kopf und Gesicht" })).toBeChecked();
    await karte.getByRole("button", { name: "Rückseite" }).click();
    await expect(karte.getByRole("button", { name: "Rückseite" })).toHaveAttribute("aria-pressed", "true");
    await karte.getByRole("button", { name: "Unterer Rücken (Lumbalregion)" }).click();
    await expect(karte.getByRole("button", { name: "Unterer Rücken (Lumbalregion)" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("radio", { name: /^Unterer Rücken/ })).toBeChecked();
    await foto(page, "02-koerperkarte-hinten");
    await weiter(page);

    // REQ-310: geführte Fragen mit Bedingungen
    await expect(page.getByRole("group", { name: "Welche Art von Beschwerden haben Sie dort?" })).toBeVisible();
    await foto(page, "03-frage-schritt");
    await page.getByLabel("Schmerzen", { exact: true }).check();
    await weiter(page);
    await page.getByLabel("Ziehend").check();
    await weiter(page);
    await page.getByLabel("Beide Seiten oder mittig").check();
    await weiter(page);
    await page.getByLabel("Allmählich, über Tage oder länger").check();
    await weiter(page);
    await expect(page.getByRole("group", { name: "Seit wann haben Sie die Beschwerden?" })).toBeVisible();

    // REQ-315: unterbrechen und fortsetzen
    await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Meine Fälle" }).click();
    const eintrag = page.locator(`[data-fall-id="${fallId}"]`);
    await expect(eintrag).toContainText("Körperliche Beschwerden");
    await expect(eintrag.getByTestId("fall-status")).toHaveText("Status: In Bearbeitung");
    await eintrag.getByRole("link", { name: /^Fortsetzen/ }).click();
    await expect(page).toHaveURL(new RegExp(`/eingrenzung/${fallId}$`));
    await expect(page.getByRole("group", { name: "Seit wann haben Sie die Beschwerden?" })).toBeVisible();

    await page.getByLabel(/^Anzahl/).fill("3");
    await page.getByLabel("Einheit").selectOption("tage");
    await weiter(page);
    await page.getByLabel("Sie bleiben gleich").check();
    await weiter(page);
    await page.getByRole("radio", { name: "6", exact: true }).check();
    await weiter(page);
    await expect(page.locator("form[data-schritt]")).toHaveAttribute("data-schritt", "k_ausloeser");
    // „Zurück“ zeigt die frühere Antwort
    await page.getByRole("link", { name: "Zurück" }).click();
    await expect(page.locator("form[data-schritt]")).toHaveAttribute("data-schritt", "k_staerke");
    await expect(page.getByRole("radio", { name: "6", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "7", exact: true }).check();
    await weiter(page);
    await page.getByLabel("Kein Auslöser erkennbar").check();
    await weiter(page);

    // REQ-307: Warnzeichen mitten im Ablauf ⇒ Hinweis sofort oben (DRINGEND ⇒ Weitermachen möglich)
    await expect(page.locator("#notfallhinweis")).toHaveCount(0);
    await page.getByLabel(/^Atemnot/).check();
    await weiter(page);
    const hinweis = page.locator("#notfallhinweis");
    await expect(hinweis).toBeVisible();
    await expect(hinweis).toHaveAttribute("role", "alert");
    await expect(hinweis).toContainText("Dringlichkeit: Dringend");
    await expect(hinweis.locator('a[href="tel:116117"]')).toBeVisible();
    await expect(page.getByTestId("vorrang-hinweise")).toBeFocused();
    await stehtGanzOben(page, "#notfallhinweis");
    await foto(page, "04-hinweis-mitten-im-ablauf");
    expect((await fall()).status).toBe("NOTFALLHINWEIS");

    await expect(page.getByRole("group", { name: "Wurden die Beschwerden schon behandelt?" })).toBeVisible();
    await page.getByRole("button", { name: "Überspringen" }).click();
    await page.getByLabel(/Möchten Sie noch etwas ergänzen/).fill("Nach dem Umzug (Testdaten)");
    await weiter(page);

    // REQ-312: Zusammenfassung
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zusammenfassung");
    const z = page.getByTestId("zusammenfassung");
    await expect(z.locator('[data-eintrag="region"]')).toContainText("Unterer Rücken (Lumbalregion)");
    await expect(z.locator('[data-eintrag="region"] .term')).toHaveText("Lumbalregion");
    await expect(z.locator('[data-eintrag="k_staerke"]')).toHaveText("7 von 10");
    await expect(z.locator('[data-eintrag="k_dauer"]')).toHaveText("seit 3 Tagen");
    await expect(z.locator('[data-eintrag="k_vorbehandlung"]')).toHaveText("keine Angabe");
    await expect(z.locator('[data-eintrag="symptome"]')).toContainText("Atemnot (Dyspnoe)");
    await expect(z).toContainText("Mögliche Ursachen und Empfehlungen folgen in einem späteren Schritt (KI-Schicht, Meilenstein 6).");
    await expect(z.locator('[data-regel="RF-ALLG-002"]')).toContainText("Regel ungeprüft");
    await expect(z).not.toContainText("Ärztlicher Hinweis:");
    await expect(page.locator("#notfallhinweis")).toBeVisible();
    await stehtGanzOben(page, "#notfallhinweis");
    await foto(page, "05-zusammenfassung");
    const gespeichert = await fall();
    expect(gespeichert.status).toBe("NOTFALLHINWEIS");
    expect(gespeichert.dringlichkeit).toBe("DRINGEND");
    expect(gespeichert.abgeschlossenAm).not.toBeNull();
    expect(gespeichert.eingaben.find((e) => e.typ === "KOERPERREGION")?.koerperregion).toBe("unterer_ruecken");
    expect(gespeichert.eingaben.filter((e) => e.frageId === "k_staerke").map((e) => (e.strukturiert as { wert: unknown }).wert)).toEqual([
      { typ: "skala", wert: 6 },
      { typ: "skala", wert: 7 },
    ]);

    // REQ-317: Fallliste – Status und Dringlichkeit (Symbol + Text), kein „Fortsetzen“ mehr
    await page.goto("/faelle");
    await expect(eintrag.getByTestId("fall-status")).toHaveText("Status: Warnhinweis");
    await expect(eintrag.locator(".urgency-tag")).toHaveText("! Dringend");
    await expect(eintrag.getByRole("link", { name: /^Fortsetzen/ })).toHaveCount(0);
    await foto(page, "06-fallliste");
    await eintrag.getByRole("link", { name: /^Ansehen/ }).click();
    await expect(page).toHaveURL(new RegExp(`/faelle/${fallId}$`));
    await expect(page.getByTestId("zusammenfassung")).toContainText("Unterer Rücken");

    // Abgeschlossener Fall nimmt keine Antworten mehr an (auch nicht per manipuliertem Formular)
    await page.goto(`/eingrenzung/${fallId}?schritt=k_art`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zusammenfassung");
    await expect(page.getByRole("form", { name: "Schritt beantworten" })).toHaveCount(0);

    // REQ-316: fremder Fall ⇒ 404; manipulierte fallId in der Action ⇒ abgewiesen, nichts gespeichert
    const fremd = await neuesKonto(browser, "Patient", "eingrenzung-fremd");
    for (const pfad of [`/eingrenzung/${fallId}`, `/faelle/${fallId}`, "/eingrenzung/gibt-es-nicht", `/eingrenzung?profil=${profilId}`]) {
      expect((await fremd.page.goto(pfad))?.status(), pfad).toBe(404);
      await expect(fremd.page.getByText("Ina")).toHaveCount(0);
    }
    await fremd.page.goto("/faelle");
    await expect(fremd.page.locator(`[data-fall-id="${fallId}"]`)).toHaveCount(0);
    const fremdProfil = await minimalesEigenesProfil(fremd.page, "Fremd");
    const fremdFall = await starteFall(fremd.page, fremdProfil, "Körperlich");
    const anzahlVorher = (await fall()).eingaben.length;
    await fremd.page.locator("input[name=fallId]").evaluate((el, id) => {
      (el as HTMLInputElement).value = id;
    }, fallId);
    await fremd.page.getByLabel(/^Bewusstlos/).check();
    await weiter(fremd.page);
    await expect(fremd.page.locator("#fehler-zusammenfassung")).toHaveText("Fall nicht gefunden.");
    expect((await fall()).eingaben.length).toBe(anzahlVorher);
    expect(await db.eingabe.count({ where: { fallId: fremdFall } })).toBe(0);

    // REQ-305: Schritt überspringen per manipulierter Schritt-ID ⇒ abgewiesen
    await fremd.page.goto(`/eingrenzung/${fremdFall}`);
    await fremd.page.locator("input[name=schritt]").evaluate((el) => {
      (el as HTMLInputElement).value = "k_art";
    });
    await fremd.page.getByLabel("Nichts davon trifft zu").check();
    await weiter(fremd.page);
    await expect(fremd.page.locator("#fehler-zusammenfassung")).toContainText("Dieser Schritt ist nicht möglich");
    expect(await db.eingabe.count({ where: { fallId: fremdFall } })).toBe(0);

    const arzt = await neuesKonto(browser, "Arzt", "eingrenzung-fremd");
    expect((await arzt.page.goto(`/faelle/${fallId}`))?.status()).toBe(404);

    await Promise.all([fremd.context.close(), arzt.context.close(), context.close()]);
    await db.$disconnect();
  });

  test("REQ-311 seelisch: Krisen-Screening zuerst, Krisenfrage „ja“ ⇒ Krisenhinweis, Ablauf endet", async ({ browser }) => {
    test.setTimeout(150_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "eingrenzung-seele");
    const profilId = await minimalesEigenesProfil(page, "Sina");

    // Alle „nein“ ⇒ weiter zum Schnellcheck und zu den Fragen; Krisen-Kontakte stets sichtbar
    const ok = await starteFall(page, profilId, "Seelisch / psychisch");
    await expect(page.getByTestId("krisen-kontakte")).toContainText("0800 111 0 111");
    await expect(page.getByText("Hatten Sie in letzter Zeit Gedanken, nicht mehr leben zu wollen?")).toBeVisible();
    for (const id of ["krise_gedanken_nicht_leben", "krise_gedanken_selbstverletzung", "krise_plaene"]) await page.locator(`#antwort-${id}-nein`).check();
    await weiter(page);
    await expect(page.locator("#krisenhinweis")).toHaveCount(0);
    await page.getByLabel("Nichts davon trifft zu").check();
    await weiter(page);
    await expect(page.getByRole("group", { name: "Wie war Ihre Stimmung in letzter Zeit überwiegend?" })).toBeVisible();
    expect((await db.fall.findUniqueOrThrow({ where: { id: ok } })).status).toBe("IN_EINGRENZUNG");
    // QA B6: Freitext im seelischen Weg – Krisen-Nummern direkt am Feld
    for (let i = 0; i < 12 && (await page.locator("form[data-schritt]").getAttribute("data-schritt")) !== "s_ergaenzung"; i++) {
      const vorher = await page.locator("form[data-schritt]").getAttribute("data-schritt");
      await page.getByRole("button", { name: "Überspringen" }).click();
      await expect(page.locator("form[data-schritt]")).not.toHaveAttribute("data-schritt", vorher!);
    }
    const amFeld = page.locator("#frage-s_ergaenzung-krise");
    await expect(amFeld).toContainText("Wenn Sie an Suizid denken:");
    for (const href of ["tel:112", "tel:08001110111", "tel:08001110222"]) await expect(amFeld.locator(`a[href="${href}"]`)).toBeVisible();
    // QA B2: noch nicht bewerteter Fall zeigt nie „keine Warnzeichen“
    const entwurf = await starteFall(page, profilId, "Seelisch / psychisch");
    await page.goto("/faelle");
    await expect(page.locator(`[data-fall-id="${entwurf}"] .badge`)).toHaveText("Noch nicht geprüft");
    await expect(page.locator(`[data-fall-id="${ok}"] .badge`)).toHaveText("Keine Warnzeichen erkannt (Demo-Regelsatz)");

    // Krisenfrage „ja“ ⇒ Krisenhinweis oben, kein weiterer Ablauf, Status KRISENHINWEIS
    const fallId = await starteFall(page, profilId, "Seelisch / psychisch");
    await page.locator("#antwort-krise_gedanken_nicht_leben-ja").check();
    await page.locator("#antwort-krise_gedanken_selbstverletzung-nein").check();
    await page.locator("#antwort-krise_plaene-nein").check();
    await weiter(page);
    const krise = page.locator("#krisenhinweis");
    await expect(krise).toBeVisible();
    await expect(krise).toHaveAttribute("role", "alert");
    for (const href of ["tel:112", "tel:08001110111", "tel:08001110222"]) await expect(krise.locator(`a[href="${href}"]`)).toBeVisible();
    await expect(krise).toContainText("ärztliche Akutvorstellung");
    await expect(page.getByTestId("vorrang-hinweise")).toBeFocused();
    await stehtGanzOben(page, "#krisenhinweis");
    await expect(page.getByTestId("ablauf-beendet")).toBeVisible();
    await expect(page.getByRole("form", { name: "Schritt beantworten" })).toHaveCount(0);
    await foto(page, "07-krise");
    const gespeichert = await db.fall.findUniqueOrThrow({ where: { id: fallId } });
    expect(gespeichert.status).toBe("KRISENHINWEIS");
    expect(gespeichert.dringlichkeit).toBe("NOTFALL");
    expect(gespeichert.abgeschlossenAm).not.toBeNull();
    // Auch ein späterer Schritt per URL bleibt beendet
    await page.goto(`/eingrenzung/${fallId}?schritt=schnellcheck`);
    await expect(page.getByTestId("ablauf-beendet")).toBeVisible();
    await expect(page.locator("#krisenhinweis")).toBeVisible();

    await page.goto("/faelle");
    const eintrag = page.locator(`[data-fall-id="${fallId}"]`);
    await expect(eintrag.getByTestId("fall-status")).toHaveText("Status: Krisenhinweis – Ablauf beendet");
    await expect(eintrag.getByRole("link", { name: /^Fortsetzen/ })).toHaveCount(0);
    await eintrag.getByRole("link", { name: /^Ansehen/ }).click();
    await expect(page.locator("#krisenhinweis")).toBeVisible();
    await context.close();
    await db.$disconnect();
  });

  test("REQ-306/308 Kinderprofil (Säugling) + Fieber im Schnellcheck; Arzt: NOTFALL ⇒ zuerst 112", async ({ browser }) => {
    test.setTimeout(180_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "eingrenzung-kind");
    const kindId = await legeSaeuglingAn(page, "Mila", 42);

    await page.goto("/eingrenzung");
    const chip = page.getByRole("button", { name: /^Mila, / });
    await expect(chip.locator(".avatar")).toHaveClass("avatar child");
    await chip.click();
    await expect(page.getByTestId("profil")).toContainText("Kinderprofil");
    await expect(page.getByTestId("profil").locator(".avatar")).toHaveClass("avatar child");
    const fallId = await starteFall(page, kindId, "Körperlich");
    await expect(page.getByText("Trifft eines dieser Warnzeichen bei Ihrem Kind gerade zu?")).toBeVisible();
    await page.getByLabel(/^Fieber/).check();
    await page.getByLabel(/Körpertemperatur/).fill("38,4");
    await weiter(page);
    const hinweis = page.locator("#notfallhinweis");
    await expect(hinweis).toContainText("Dringlichkeit: Dringend");
    await expect(hinweis.locator("strong").first()).toHaveText("Sofort ärztlich abklären lassen");
    await expect(hinweis).toContainText("Fieber bei Säuglingen unter 3 Monaten");
    await stehtGanzOben(page, "#notfallhinweis");
    // DRINGEND ⇒ Weitermachen möglich (Körperregion)
    await expect(page.getByTestId("koerperkarte")).toBeVisible();
    const f = await db.fall.findUniqueOrThrow({ where: { id: fallId } });
    expect(f).toMatchObject({ status: "NOTFALLHINWEIS", dringlichkeit: "DRINGEND" });
    await context.close();

    // Arzt: Fremdanamnese, NOTFALL ⇒ eigener Schritt „Zuerst Notruf 112“
    const arzt = await neuesKonto(browser, "Arzt", "eingrenzung-arzt");
    await arzt.page.goto("/arzt/patienten/neu");
    await arzt.page.getByLabel("Vorname").fill("Theo");
    await arzt.page.getByLabel("Nachname").fill("Beispiel");
    await arzt.page.getByLabel("Geburtsdatum").fill("1950-05-05");
    await arzt.page.getByLabel("Geschlecht").selectOption({ label: "männlich" });
    await arzt.page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(arzt.page).toHaveURL(/\/profile\/[^/]+$/);
    const patientId = new URL(arzt.page.url()).pathname.split("/")[2]!;
    await arzt.page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Beschwerden eingrenzen" }).click();
    await arzt.page.getByRole("button", { name: "Theo Beispiel" }).click();
    const arztFall = await starteFall(arzt.page, patientId, "Körperlich");
    await expect(arzt.page.getByText("Liegt bei der Patientin bzw. dem Patienten eines dieser Warnzeichen vor?")).toBeVisible();
    await arzt.page.getByLabel(/^Bewusstlos/).check();
    await weiter(arzt.page);
    await expect(arzt.page.locator("#notfallhinweis")).toContainText("Sofort Notruf 112");
    await expect(arzt.page.getByRole("heading", { name: "Zuerst Notruf 112" })).toBeVisible();
    await expect(arzt.page.getByRole("link", { name: "Notruf 112 anrufen" }).first()).toHaveAttribute("href", "tel:112");
    await foto(arzt.page, "08-notfall-zuerst-112");
    await arzt.page.getByRole("button", { name: "Fragen trotzdem fortsetzen" }).click();
    await expect(arzt.page.locator("#bestaetigt-fehler")).toContainText("Bitte bestätigen");
    await arzt.page.getByLabel(/Mir ist bewusst/).check();
    await arzt.page.getByRole("button", { name: "Fragen trotzdem fortsetzen" }).click();
    await expect(arzt.page.getByTestId("koerperkarte")).toBeVisible();
    // Hinweis bleibt oben sichtbar
    await expect(arzt.page.locator("#notfallhinweis")).toContainText("Sofort Notruf 112");
    expect((await db.fall.findUniqueOrThrow({ where: { id: arztFall } })).dringlichkeit).toBe("NOTFALL");
    await arzt.page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Fälle", exact: true }).click();
    await expect(arzt.page.locator(`[data-fall-id="${arztFall}"] .urgency-tag`)).toHaveText("⚠ Notfall");
    // Arzt sieht den Fall des fremden Kindes nicht
    expect((await arzt.page.goto(`/eingrenzung/${fallId}`))?.status()).toBe(404);
    await arzt.context.close();
    await db.$disconnect();
  });
  test("QA B1 parallele Abgaben (zwei Tabs) stufen Krise/Notfall nie herab – 10× je Fall", async ({ browser }) => {
    test.setTimeout(300_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "eingrenzung-race");
    const profilId = await minimalesEigenesProfil(page, "Rana");
    const KRISE = ["krise_gedanken_nicht_leben", "krise_gedanken_selbstverletzung", "krise_plaene"];
    const tabs = async (fallId: string) => {
      const a = await context.newPage();
      const b = await context.newPage();
      await Promise.all([a.goto(`/eingrenzung/${fallId}`), b.goto(`/eingrenzung/${fallId}`)]);
      return [a, b] as const;
    };
    const absenden = (p: Page) => p.getByRole("button", { name: "Weiter", exact: true }).click();

    for (let i = 0; i < 10; i++) {
      // seelisch: Tab A „ja“, Tab B alle „nein“ – gleichzeitig
      const f = await starteFall(page, profilId, "Seelisch / psychisch");
      const [a, b] = await tabs(f);
      await a.locator("#antwort-krise_gedanken_nicht_leben-ja").check();
      for (const id of KRISE.slice(1)) await a.locator(`#antwort-${id}-nein`).check();
      for (const id of KRISE) await b.locator(`#antwort-${id}-nein`).check();
      await Promise.all((i % 2 ? [b, a] : [a, b]).map(absenden));
      await expect(a.locator("#krisenhinweis")).toBeVisible();
      await expect.poll(async () => (await db.fall.findUniqueOrThrow({ where: { id: f } })).status).toBe("KRISENHINWEIS");
      expect((await db.fall.findUniqueOrThrow({ where: { id: f } })).dringlichkeit, `seelisch #${i}`).toBe("NOTFALL");
      await b.goto(`/eingrenzung/${f}`);
      await expect(b.locator("#krisenhinweis")).toBeVisible();
      await expect(b.getByTestId("ablauf-beendet")).toBeVisible();
      await a.close();
      await b.close();

      // körperlich: Tab A „Bewusstlos“, Tab B „Nichts davon“ – gleichzeitig
      const k = await starteFall(page, profilId, "Körperlich");
      const [c, d] = await tabs(k);
      await c.getByLabel(/^Bewusstlos/).check();
      await d.getByLabel("Nichts davon trifft zu").check();
      await Promise.all((i % 2 ? [d, c] : [c, d]).map(absenden));
      await expect.poll(async () => (await db.fall.findUniqueOrThrow({ where: { id: k } })).dringlichkeit).toBe("NOTFALL");
      // Beide Abgaben werden nacheinander verarbeitet; der Stand bleibt NOTFALL.
      await c.waitForLoadState("networkidle");
      await d.waitForLoadState("networkidle");
      const fk = await db.fall.findUniqueOrThrow({ where: { id: k } });
      expect([fk.status, fk.dringlichkeit], `körperlich #${i}`).toEqual(["NOTFALLHINWEIS", "NOTFALL"]);
      await d.goto(`/eingrenzung/${k}`);
      await expect(d.locator("#notfallhinweis")).toContainText("Sofort Notruf 112");
      await c.close();
      await d.close();
    }
    await page.goto("/faelle");
    await expect(page.getByTestId("fall-status").filter({ hasText: "In Bearbeitung" })).toHaveCount(0);
    await context.close();
    await db.$disconnect();
  });
  test("QA N1/N2: 21 und 200 Messwerte verlieren kein Warnzeichen; gesperrte Fall-Zeile ⇒ Hinweis statt Fehlerseite", async ({ browser }) => {
    test.setTimeout(180_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "eingrenzung-robust");
    const profilId = await minimalesEigenesProfil(page, "Rob");
    const formular = page.getByRole("form", { name: "Schritt beantworten" });

    for (const anzahl of [21, 200]) {
      const f = await starteFall(page, profilId, "Körperlich");
      await page.getByLabel(/^Bewusstlos/).check();
      await formular.evaluate((form, n) => {
        for (let i = 0; i < n; i++) {
          const el = document.createElement("input");
          el.type = "hidden";
          el.name = "messwert.temperatur_c";
          el.value = "37,0";
          form.appendChild(el);
        }
      }, anzahl);
      await weiter(page);
      await expect(page.locator("#notfallhinweis"), `${anzahl}`).toContainText("Sofort Notruf 112");
      await expect(page.locator("#messwert-temperatur_c-fehler")).toContainText("Zu viele Werte");
      const fall = await db.fall.findUniqueOrThrow({ where: { id: f }, include: { eingaben: true } });
      expect([fall.status, fall.dringlichkeit]).toEqual(["NOTFALLHINWEIS", "NOTFALL"]);
      const werte = (fall.eingaben[0]!.strukturiert as { wert: { messwerte: { temperatur_c: number[] } } }).wert.messwerte.temperatur_c;
      expect(werte.length).toBeLessThanOrEqual(20);
      await page.goto(`/eingrenzung/${f}`);
      await expect(page.locator("#notfallhinweis")).toContainText("Sofort Notruf 112");
    }

    // N2: Fall-Zeile über eine zweite Verbindung sperren (länger als Sperr-Timeout × 2) ⇒ Hinweis aus dem Speicher
    for (const art of ["Seelisch / psychisch", "Körperlich"] as const) {
      const f = await starteFall(page, profilId, art);
      if (art === "Körperlich") await page.getByLabel(/^Bewusstlos/).check();
      else {
        await page.locator("#antwort-krise_gedanken_nicht_leben-ja").check();
        await page.locator("#antwort-krise_gedanken_selbstverletzung-nein").check();
        await page.locator("#antwort-krise_plaene-nein").check();
      }
      let freigeben!: () => void;
      const frei = new Promise<void>((r) => (freigeben = r));
      let gesperrt!: () => void;
      const istGesperrt = new Promise<void>((r) => (gesperrt = r));
      const sperre = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Fall" WHERE "id" = ${f} FOR UPDATE`;
          gesperrt();
          await frei;
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
      await istGesperrt;
      const seitenfehler: string[] = [];
      page.on("pageerror", (e) => seitenfehler.push(String(e)));
      await weiter(page);
      const hinweis = page.getByTestId("vorrang-hinweise-formular");
      await expect(hinweis).toBeVisible({ timeout: 20_000 });
      await expect(hinweis).toBeFocused();
      // QA R3-B2: ganz oben – vor der Seitenüberschrift
      await stehtGanzOben(page, '[data-testid="vorrang-hinweise-formular"]');
      await page.setViewportSize({ width: 390, height: 844 });
      await stehtGanzOben(page, '[data-testid="vorrang-hinweise-formular"]');
      await page.setViewportSize({ width: 1280, height: 720 });
      if (art === "Körperlich") await expect(hinweis.locator("#notfallhinweis")).toContainText("Sofort Notruf 112");
      else await expect(hinweis.locator("#krisenhinweis")).toContainText("0800 111 0 111");
      await expect(page.locator("#fehler-zusammenfassung")).toContainText("Ihre Angaben konnten nicht gespeichert werden");
      expect(await db.eingabe.count({ where: { fallId: f } })).toBe(0);
      expect(seitenfehler).toEqual([]);
      freigeben();
      await sperre;
      // QA R3-B3: beim nächsten Laden Hinweis „bitte erneut eingeben“
      await page.reload();
      await expect(page.getByTestId("nicht-gespeichert")).toContainText("Ihre letzte Angabe konnte nicht gespeichert werden – bitte erneut eingeben.");
      await page.getByRole("button", { name: "Verstanden" }).click();
      await expect(page.getByTestId("nicht-gespeichert")).toHaveCount(0);
    }

    // QA R3-B1: 37,2 im abgewiesenen Schnellcheck, dann erneut 37,2 ⇒ kein dauerhaftes „unvollständig“
    const t = await starteFall(page, profilId, "Körperlich");
    await page.getByLabel(/Körpertemperatur/).fill("37,2");
    await weiter(page);
    await expect(page.locator("#schnellcheck-fehler")).toContainText("bestätigen");
    await page.getByLabel("Nichts davon trifft zu").check();
    await weiter(page);
    await expect(page.getByTestId("koerperkarte")).toBeVisible();
    expect(await db.eingabe.count({ where: { fallId: t } })).toBe(2);
    await expect(page.getByTestId("unvollstaendig-oben")).toHaveCount(0);
    await context.close();
    await db.$disconnect();
  });
});
