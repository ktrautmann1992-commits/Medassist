import { mkdirSync } from "node:fs";
import path from "node:path";
import { heuteIso } from "@medassist/core";
import { expect, test, type Page } from "@playwright/test";
import { testDb } from "./db";
import { minimalesEigenesProfil, neuesKonto } from "./helfer";

/**
 * Meilenstein 4b – Weg 3 „Entwicklungs-Check“ (REQ-320 – REQ-330). Läuft in beiden
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
const schritt = (page: Page) => page.locator("form[data-schritt]");

/** Geburtsdatum vor `jahre` Jahren und `tage` Tagen (Europe/Berlin wie der Server). */
function geburtVor(jahre: number, tage = 0): string {
  const [j, m, t] = heuteIso().split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(j - jahre, m - 1, Math.min(t, 28)));
  return new Date(d.getTime() - tage * 86_400_000).toISOString().slice(0, 10);
}

async function legeKindAn(page: Page, vorname: string, geburt: string): Promise<string> {
  await page.goto("/profile/kind/neu");
  await page.getByLabel("Vorname").fill(vorname);
  await page.getByLabel("Nachname").fill("Test");
  await page.getByLabel("Geburtsdatum").fill(geburt);
  await page.getByLabel("Geschlecht").selectOption({ label: "weiblich" });
  await page.getByLabel("Ich bin für dieses Kind sorgeberechtigt.").check();
  await page.getByRole("button", { name: "Profil speichern" }).click();
  await expect(page.getByRole("heading", { name: `${vorname} Test` })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2]!;
}

/** Startet den Entwicklungs-Check über die Einstiegsseite und gibt die Fall-ID zurück. */
async function starteEntwicklung(page: Page, profilId: string): Promise<string> {
  await page.goto(`/eingrenzung?profil=${profilId}&weg=entwicklung`);
  await page.getByRole("button", { name: "Entwicklungs-Check starten" }).click();
  await expect(page).toHaveURL(/\/eingrenzung\/[^/?]+$/);
  return new URL(page.url()).pathname.split("/")[2]!;
}

/** Schnellcheck „Nichts davon“ und Pflichtfrage „Nein“. */
async function ohneWarnzeichen(page: Page) {
  await expect(schritt(page)).toHaveAttribute("data-schritt", "schnellcheck");
  await page.getByLabel("Nichts davon trifft zu").check();
  await weiter(page);
  await expect(schritt(page)).toHaveAttribute("data-schritt", "e_regression");
  await page.getByLabel("Nein, das ist mir nicht aufgefallen").check();
  await weiter(page);
  await expect(schritt(page)).toHaveAttribute("data-schritt", "bereiche");
}

async function antworte(page: Page, frageId: string, antwort: string) {
  await expect(schritt(page)).toHaveAttribute("data-schritt", frageId);
  await page.getByLabel(antwort, { exact: true }).check();
  await weiter(page);
}

test.describe("Entwicklungs-Check (Weg 3)", () => {
  test("REQ-320 – REQ-330 Patient: Kind 3 Jahre, Sprache mit Sorge ⇒ Abklärung empfohlen, Kinderarzt zuerst; Fortsetzen; Zugriff", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "entwicklung");
    const eigenId = await minimalesEigenesProfil(page, "Eva");
    const kindId = await legeKindAn(page, "Lena", geburtVor(3, 10));

    // REQ-329: Einstieg auf /start beim Kinderprofil (blauer Avatar)
    await page.goto(`/start?profil=${kindId}`);
    const chip = page.getByRole("button", { name: /^Lena, / });
    await expect(chip.locator(".avatar")).toHaveClass("avatar child");
    const einstieg = page.getByRole("link", { name: /^Entwicklung prüfen/ });
    await expect(einstieg).toBeVisible();
    await foto(page, "01-einstieg-kind");
    // Beim Erwachsenenprofil wird der Entwicklungs-Check nicht angeboten
    await page.goto(`/start?profil=${eigenId}`);
    await expect(page.getByRole("link", { name: /^Entwicklung prüfen/ })).toHaveCount(0);
    await page.goto(`/eingrenzung?profil=${eigenId}`);
    await expect(page.getByRole("link", { name: /^Entwicklung prüfen/ })).toHaveCount(0);
    // REQ-322: Erwachsenenprofil ⇒ 404 (Seite und Server Action, kein Fall angelegt)
    expect((await page.goto(`/eingrenzung?profil=${eigenId}&weg=entwicklung`))?.status()).toBe(404);
    await page.goto(`/eingrenzung?profil=${eigenId}`);
    await page.getByRole("button", { name: /^Körperlich/ }).evaluate((el) => {
      (el as HTMLButtonElement).value = "ENTWICKLUNG";
    });
    await page.getByRole("button", { name: /^Körperlich/ }).click();
    await expect(page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
    expect(await db.fall.count({ where: { profilId: eigenId } })).toBe(0);

    // Einstiegsseite: Profil, Altersbereich des Demo-Katalogs, Hinweise
    await page.goto(`/start?profil=${kindId}`);
    await page.getByRole("link", { name: /^Entwicklung prüfen/ }).click();
    await expect(page).toHaveURL(new RegExp(`/eingrenzung\\?profil=${kindId}&weg=entwicklung$`));
    await expect(page.getByTestId("profil")).toContainText("Lena Test");
    await expect(page.getByTestId("profil")).toContainText("Kinderprofil");
    await expect(page.getByTestId("katalog-alter")).toContainText("12 Monaten bis unter 18 Jahren");
    await expect(page.getByText(/ersetzt keine Vorsorgeuntersuchung \(U-Untersuchung\)/)).toBeVisible();
    await page.getByRole("button", { name: "Entwicklungs-Check starten" }).click();
    await expect(page).toHaveURL(/\/eingrenzung\/[^/?]+$/);
    const fallId = new URL(page.url()).pathname.split("/")[2]!;
    const fall = () => db.fall.findUniqueOrThrow({ where: { id: fallId }, include: { eingaben: true } });
    expect(await fall()).toMatchObject({ art: "ENTWICKLUNG", weg: "ENTWICKLUNG", status: "ENTWURF", katalogVersion: "0.2.0" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Entwicklung prüfen");
    await expect(page.getByText("Fragen ungeprüft").first()).toBeVisible();

    // REQ-323: Schnellcheck → Pflichtfrage → Bereichsauswahl
    await ohneWarnzeichen(page);
    const bereiche = page.getByRole("group", { name: "Welche Bereiche möchten Sie prüfen?" });
    await expect(bereiche.getByRole("checkbox")).toHaveCount(5);
    await expect(bereiche.getByLabel(/^Lernen/)).toHaveCount(0); // erst ab Schulalter
    await foto(page, "02-bereichsauswahl");
    await weiter(page);
    await expect(page.locator("#bereiche-fehler")).toContainText("mindestens einen Bereich");
    await bereiche.getByLabel(/^Sprache und Sprechen/).check();
    await weiter(page);

    await expect(page.getByTestId("bereich-name")).toHaveText("Bereich: Sprache und Sprechen");
    await expect(page.getByRole("group", { name: /^Reagiert Ihr Kind, wenn Sie es ohne Blickkontakt ansprechen/ })).toBeVisible();
    await foto(page, "03-frage");
    // Alle Fragen sind Pflicht – kein „Überspringen“
    await expect(page.getByRole("button", { name: "Überspringen" })).toHaveCount(0);
    await antworte(page, "s_hoeren", "Ja");
    await antworte(page, "s_verstehen", "Ja");

    // REQ-315/REQ-329: unterbrechen und aus „Meine Fälle“ fortsetzen
    await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Meine Fälle" }).click();
    const eintrag = page.locator(`[data-fall-id="${fallId}"]`);
    await expect(eintrag).toContainText("Entwicklungs-Check");
    await expect(eintrag.getByTestId("fall-status")).toHaveText("Status: In Bearbeitung");
    await eintrag.getByRole("link", { name: /^Fortsetzen/ }).click();
    await expect(page).toHaveURL(new RegExp(`/eingrenzung/${fallId}$`));
    await antworte(page, "s_mitteilen", "Ja");
    await antworte(page, "s_saetze", "Ja");
    await antworte(page, "s_redefluss", "Nein");
    await antworte(page, "s_sorge", "Ja, ich mache mir Sorgen");

    // REQ-325/REQ-326: Ergebnis Patient
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ergebnis: Entwicklungs-Check");
    const sprache = page.locator('[data-bereich="sprache"]');
    await expect(sprache).toHaveAttribute("data-einstufung", "ABKLAERUNG");
    await expect(sprache.getByTestId("bereich-status")).toContainText("Abklärung empfohlen");
    await expect(sprache.getByTestId("bereich-status")).toHaveClass(/urgency-routine/);
    await expect(sprache).toContainText("Sorge der Eltern: Ja, ich mache mir Sorgen");
    const stellen = sprache.getByTestId("anlaufstellen").locator("li");
    await expect(stellen).toHaveCount(3);
    await expect(stellen.nth(0)).toHaveAttribute("data-anlaufstelle", "kinderarzt");
    await expect(stellen.nth(0)).toContainText("Zuerst: Kinderärztin oder Kinderarzt");
    await expect(stellen.nth(0)).toContainText("ärztliche Verordnung");
    await expect(stellen.nth(1)).toContainText("Logopädie");
    await expect(stellen.nth(2)).toContainText("Pädaudiologie");
    await expect(sprache.getByTestId("foerderideen")).toContainText("kein Therapieersatz");
    await expect(page.getByTestId("entwicklung-ergebnis")).toContainText("ersetzt keine Vorsorgeuntersuchung (U-Untersuchung)");
    await expect(page.getByTestId("entwicklung-ergebnis")).toContainText("stellt keine Entwicklungsstörung fest");
    // Patient ohne Arzt-Felder
    await expect(page.getByTestId("entwicklung-uebersicht")).toHaveCount(0);
    await expect(page.getByTestId("arzt-hinweis")).toHaveCount(0);
    await expect(page.getByText("Heilmittelverordnung")).toHaveCount(0);
    await expect(page.locator("#notfallhinweis")).toHaveCount(0);
    await foto(page, "04-ergebnis-patient");
    expect(await fall()).toMatchObject({ status: "ABGESCHLOSSEN" });

    // Fallliste und Fallansicht
    await page.goto("/faelle");
    await expect(eintrag.getByTestId("entwicklung-kurz")).toContainText("Sprache und Sprechen: → Abklärung empfohlen");
    await eintrag.getByRole("link", { name: /^Ansehen/ }).click();
    await expect(page.locator('[data-bereich="sprache"]')).toHaveAttribute("data-einstufung", "ABKLAERUNG");

    // REQ-316/REQ-329: fremdes Kinderprofil und fremder Fall ⇒ 404; manipulierte IDs abgewiesen
    const fremd = await neuesKonto(browser, "Patient", "entwicklung-fremd");
    for (const pfad of [`/eingrenzung?profil=${kindId}&weg=entwicklung`, `/eingrenzung/${fallId}`, `/faelle/${fallId}`]) {
      expect((await fremd.page.goto(pfad))?.status(), pfad).toBe(404);
      await expect(fremd.page.getByText("Lena")).toHaveCount(0);
    }
    const fremdKind = await legeKindAn(fremd.page, "Mo", geburtVor(5));
    // manipulierte profilId beim Start ⇒ 404, kein Fall für das fremde Kind
    const faelleVorher = await db.fall.count({ where: { profilId: kindId } });
    await fremd.page.goto(`/eingrenzung?profil=${fremdKind}&weg=entwicklung`);
    await fremd.page.locator("main form input[name=profilId]").evaluate((el, id) => {
      (el as HTMLInputElement).value = id;
    }, kindId);
    await fremd.page.getByRole("button", { name: "Entwicklungs-Check starten" }).click();
    await expect(fremd.page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
    expect(await db.fall.count({ where: { profilId: kindId } })).toBe(faelleVorher);
    // manipulierte fallId in der Server Action ⇒ „Fall nicht gefunden.“, nichts gespeichert
    const fremdFall = await starteEntwicklung(fremd.page, fremdKind);
    const anzahlVorher = (await fall()).eingaben.length;
    await fremd.page.locator("input[name=fallId]").evaluate((el, id) => {
      (el as HTMLInputElement).value = id;
    }, fallId);
    await fremd.page.getByLabel(/^Verlernt Fähigkeiten/).check();
    await weiter(fremd.page);
    await expect(fremd.page.locator("#fehler-zusammenfassung")).toHaveText("Fall nicht gefunden.");
    expect((await fall()).eingaben.length).toBe(anzahlVorher);
    expect(await db.eingabe.count({ where: { fallId: fremdFall } })).toBe(0);

    await Promise.all([fremd.context.close(), context.close()]);
    await db.$disconnect();
  });

  test("REQ-324 Regression angekreuzt ⇒ Warnhinweis oben (Fokus), Status hochgestuft; alle Bereiche ⇒ Abklärung", async ({ browser }) => {
    test.setTimeout(180_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "entwicklung-regr");
    const kindId = await legeKindAn(page, "Ole", geburtVor(2, 5));
    const fallId = await starteEntwicklung(page, kindId);
    await page.getByLabel("Nichts davon trifft zu").check();
    await weiter(page);
    await expect(page.locator("#notfallhinweis")).toHaveCount(0);
    await expect(schritt(page)).toHaveAttribute("data-schritt", "e_regression");
    await expect(page.getByText(/Diese Frage wird immer gestellt/)).toBeVisible();
    await page.getByLabel(/^Verlernt Fähigkeiten, die schon sicher da waren/).check();
    await weiter(page);

    const hinweis = page.locator("#notfallhinweis");
    await expect(hinweis).toContainText("Dringlichkeit: Dringend");
    await expect(hinweis).toContainText("Fähigkeiten verliert");
    await expect(page.getByTestId("vorrang-hinweise")).toBeFocused();
    const h = await hinweis.boundingBox();
    const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(h && h1 && h.y < h1.y).toBe(true);
    expect(await db.fall.findUniqueOrThrow({ where: { id: fallId } })).toMatchObject({ status: "NOTFALLHINWEIS", dringlichkeit: "DRINGEND" });
    // DRINGEND ⇒ weiter zur Bereichsauswahl, Hinweis bleibt oben
    await expect(schritt(page)).toHaveAttribute("data-schritt", "bereiche");
    await foto(page, "06-regression-hinweis");

    // „Alle Bereiche prüfen“, dann alles unauffällig ⇒ trotzdem jeder Bereich „Abklärung empfohlen“
    await page.getByRole("button", { name: "Alle Bereiche prüfen" }).click();
    await expect(page.locator('form[data-schritt="bereiche"]')).toHaveCount(0);
    // Unauffällige Antwort: „Nein“ bei Sorge und bei negativ formulierten Beobachtungen, sonst „Ja“
    const neinUnauffaellig = ["s_redefluss", "w_sehen", "w_hoeren_alltag", "w_reize", "v_gefuehle", "v_aufmerksamkeit", "a_schlaf", "a_essen", "a_sauberkeit"];
    for (let i = 0; i < 40 && (await schritt(page).count()) > 0; i++) {
      const id = (await schritt(page).getAttribute("data-schritt"))!;
      await antworte(page, id, id.endsWith("_sorge") || neinUnauffaellig.includes(id) ? "Nein" : "Ja");
      await expect(page.locator(`form[data-schritt="${id}"]`)).toHaveCount(0);
      await expect(hinweis).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ergebnis: Entwicklungs-Check");
    const ergebnisse = page.locator("[data-bereich]");
    await expect(ergebnisse).toHaveCount(5);
    for (const einstufung of await ergebnisse.evaluateAll((els) => els.map((el) => el.getAttribute("data-einstufung")))) {
      expect(einstufung).toBe("ABKLAERUNG");
    }
    await expect(page.getByTestId("entwicklung-ergebnis")).toContainText("Verlust bereits erworbener Fähigkeiten angegeben");
    await expect(hinweis).toContainText("Dringlichkeit: Dringend");
    // Status bleibt hochgestuft (nie herabgestuft)
    expect(await db.fall.findUniqueOrThrow({ where: { id: fallId } })).toMatchObject({ status: "NOTFALLHINWEIS", dringlichkeit: "DRINGEND" });
    await context.close();
    await db.$disconnect();
  });

  test("REQ-327 Arzt: Kinderpatient 4 Jahre – Übersicht und ärztlicher Hinweis, keine Förderideen", async ({ browser }) => {
    test.setTimeout(180_000);
    const db = testDb();
    const arzt = await neuesKonto(browser, "Arzt", "entwicklung-arzt");
    const page = arzt.page;
    await page.goto("/arzt/patienten/neu");
    await page.getByLabel("Profil für").selectOption("KIND");
    await page.getByLabel("Vorname").fill("Pia");
    await page.getByLabel("Nachname").fill("Beispiel");
    await page.getByLabel("Geburtsdatum").fill(geburtVor(4));
    await page.getByLabel("Geschlecht").selectOption({ label: "weiblich" });
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page).toHaveURL(/\/profile\/[^/]+$/);
    const patientId = new URL(page.url()).pathname.split("/")[2]!;

    await page.goto(`/eingrenzung?profil=${patientId}`);
    await page.getByRole("link", { name: /^Entwicklung prüfen/ }).click();
    await page.getByRole("button", { name: "Entwicklungs-Check starten" }).click();
    await expect(page).toHaveURL(/\/eingrenzung\/[^/?]+$/);
    const fallId = new URL(page.url()).pathname.split("/")[2]!;
    await expect(page.getByText("Liegt bei der Patientin bzw. dem Patienten eines dieser Warnzeichen vor?")).toBeVisible();
    await page.getByLabel("Nichts davon trifft zu").check();
    await weiter(page);
    await expect(page.getByRole("group", { name: /^Hat das Kind bereits sicher erworbene Fähigkeiten wieder verloren/ })).toBeVisible();
    await page.getByLabel("Nein, das ist mir nicht aufgefallen").check();
    await weiter(page);
    await page.getByLabel(/^Grob- und Feinmotorik/).check();
    await weiter(page);
    await expect(page.getByRole("group", { name: "Werden beide Körperseiten (Arme, Beine) etwa seitengleich eingesetzt?" })).toBeVisible();
    await antworte(page, "m_koerperseiten", "Ja");
    await antworte(page, "m_laufen", "Ja");
    await antworte(page, "m_bewegung", "Nein");
    await antworte(page, "m_stift", "Ja");
    await antworte(page, "m_sorge", "Nein");

    const motorik = page.locator('[data-bereich="motorik"]');
    await expect(motorik).toHaveAttribute("data-einstufung", "BEOBACHTEN");
    await expect(motorik.getByTestId("bereich-status")).toContainText("Beobachten");
    await expect(motorik.getByTestId("bereich-status")).toHaveClass(/urgency-ok/);
    const tabelle = motorik.getByTestId("entwicklung-uebersicht");
    await expect(tabelle).toBeVisible();
    await expect(tabelle.locator('[data-frage="m_bewegung"]')).toContainText("Nein");
    await expect(tabelle.locator('[data-frage="m_greifen"]')).toHaveCount(0); // nicht im Altersbereich (bis unter 48 Monate)
    await expect(page.getByTestId("arzt-hinweis")).toContainText("Heilmittelverordnung nach ärztlicher Beurteilung");
    await expect(page.getByTestId("arzt-hinweis")).toContainText("Diagnosegruppen nach Heilmittelkatalog sind im Prototyp nicht hinterlegt");
    await expect(motorik.getByTestId("anlaufstellen")).toContainText("Überweisung nach ärztlicher Beurteilung");
    await expect(motorik.getByTestId("foerderideen")).toHaveCount(0);
    await foto(page, "05-ergebnis-arzt");
    expect(await db.fall.findUniqueOrThrow({ where: { id: fallId } })).toMatchObject({ status: "ABGESCHLOSSEN", weg: "ENTWICKLUNG" });

    // Arzt: Kind unter 12 Monaten ⇒ freundlicher Hinweis, kein Start (Server lehnt ab)
    await page.goto("/arzt/patienten/neu");
    await page.getByLabel("Profil für").selectOption("KIND");
    await page.getByLabel("Vorname").fill("Ben");
    await page.getByLabel("Nachname").fill("Klein");
    await page.getByLabel("Geburtsdatum").fill(geburtVor(0, 100));
    await page.getByLabel("Geschlecht").selectOption({ label: "männlich" });
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page).toHaveURL(/\/profile\/[^/]+$/);
    const babyId = new URL(page.url()).pathname.split("/")[2]!;
    await page.goto(`/eingrenzung?profil=${babyId}&weg=entwicklung`);
    await expect(page.getByTestId("entwicklung-nicht-verfuegbar")).toContainText("Kinderarztpraxis");
    await expect(page.getByText("Für dieses Alter gibt es noch keine Demo-Fragen.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entwicklungs-Check starten" })).toHaveCount(0);
    await arzt.context.close();
    await db.$disconnect();
  });
  test("QA E1 – E4: „unsicher“ ⇒ Warnhinweis, nicht änderbar; Alter festgehalten; Bereich nicht abwählbar; Hilfe in Krisen", async ({ browser }) => {
    test.setTimeout(240_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient", "entwicklung-qa");
    const kindId = await legeKindAn(page, "Uma", geburtVor(3, 10));
    const fallId = await starteEntwicklung(page, kindId);
    await page.getByLabel("Nichts davon trifft zu").check();
    await weiter(page);
    await page.getByLabel("Ich bin mir nicht sicher").check();
    await weiter(page);
    // E1: „unsicher“ ⇒ Warnhinweis der Regel-Engine (DRINGEND) oben mit Fokus + eigener Hinweis
    await expect(page.locator("#notfallhinweis")).toContainText("Dringlichkeit: Dringend");
    await expect(page.getByTestId("regression-unsicher")).toBeVisible();
    await expect(page.getByText("Sie sind unsicher – bitte heute ärztlich abklären lassen.")).toBeVisible();
    await expect(page.getByTestId("vorrang-hinweise")).toBeFocused();
    expect(await db.fall.findUniqueOrThrow({ where: { id: fallId } })).toMatchObject({ status: "NOTFALLHINWEIS", dringlichkeit: "DRINGEND" });
    await expect(schritt(page)).toHaveAttribute("data-schritt", "bereiche");
    // Schrittanzeige erst nach der Bereichsauswahl
    await expect(page.getByTestId("schrittanzeige")).toHaveCount(0);
    // E1: Pflichtfrage nicht erneut bearbeitbar (kein Zurück, ?schritt= ignoriert, manipulierte Abgabe abgewiesen)
    await expect(page.getByRole("link", { name: "Zurück" })).toHaveCount(0);
    await page.goto(`/eingrenzung/${fallId}?schritt=e_regression`);
    await expect(schritt(page)).toHaveAttribute("data-schritt", "bereiche");
    await page.locator("input[name=schritt]").evaluate((el) => ((el as HTMLInputElement).value = "e_regression"));
    await page.locator("form[data-schritt]").evaluate((f) => {
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = "keine";
      i.value = "on";
      f.appendChild(i);
    });
    await weiter(page);
    await expect(page.locator("#fehler-zusammenfassung")).toContainText("Dieser Schritt ist nicht möglich");
    await page.goto(`/eingrenzung/${fallId}`);

    // E3/E4: Sprache und Verhalten wählen; Hilfe in Krisen beim Bereich Verhalten
    await page.getByLabel(/^Sprache und Sprechen/).check();
    await page.getByLabel(/^Sozial-emotionale Entwicklung/).check();
    await weiter(page);
    await expect(page.getByTestId("entwicklung-krisen")).toContainText("0800 111 0 111");
    await expect(page.getByTestId("entwicklung-krisen").getByRole("link", { name: /Seelisch \/ psychisch/ })).toBeVisible();
    await antworte(page, "s_hoeren", "Nein");
    await expect(schritt(page)).toHaveAttribute("data-schritt", "s_verstehen");
    // E3: Sprache (beantwortet) kann nicht abgewählt werden
    await page.goto(`/eingrenzung/${fallId}?schritt=bereiche`);
    await expect(page.getByLabel(/^Sprache und Sprechen/)).toBeDisabled();
    await expect(page.getByLabel(/^Sprache und Sprechen/)).toBeChecked();
    await page.getByLabel(/^Sozial-emotionale Entwicklung/).uncheck();
    await page.getByLabel(/^Schlaf, Essen, Sauberkeit/).check();
    await weiter(page);
    await expect(page.locator('form[data-schritt="bereiche"]')).toHaveCount(0);
    const neinUnauffaellig = ["s_redefluss", "a_schlaf", "a_essen", "a_sauberkeit"];
    for (let i = 0; i < 30 && (await schritt(page).count()) > 0; i++) {
      const id = (await schritt(page).getAttribute("data-schritt"))!;
      await antworte(page, id, id.endsWith("_sorge") || neinUnauffaellig.includes(id) ? "Nein" : "Ja");
      await expect(page.locator(`form[data-schritt="${id}"]`)).toHaveCount(0);
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ergebnis: Entwicklungs-Check");
    const stufen = () => page.locator("[data-testid=entwicklung-ergebnis] section[data-bereich]").evaluateAll((els) => els.map((el) => `${el.getAttribute("data-bereich")}:${el.getAttribute("data-einstufung")}`));
    // Abgewählter, aber beantworteter Bereich Verhalten (noch keine Antwort) entfällt; Sprache bleibt; alles Abklärung wegen „unsicher“
    expect(await stufen()).toEqual(["sprache:ABKLAERUNG", "alltag:ABKLAERUNG"]);
    await expect(page.getByTestId("entwicklung-ergebnis")).toContainText("Sie sind unsicher, ob Ihr Kind Fähigkeiten wieder verlernt hat");
    await expect(page.getByTestId("entwicklung-uebersicht-oben")).toBeVisible();
    // E8: kein „Keine Warnzeichen erkannt“ neben „Abklärung empfohlen“ (Warnhinweis besteht)
    await expect(page.getByTestId("keine-warnzeichen")).toHaveCount(0);
    expect(await db.fall.findUniqueOrThrow({ where: { id: fallId } })).toMatchObject({ status: "NOTFALLHINWEIS", dringlichkeit: "DRINGEND" });

    // E2: Altersverschiebung (+1 Jahr) ändert das Ergebnis nicht
    const vorher = await stufen();
    await db.patientenprofil.update({ where: { id: kindId }, data: { geburtsdatum: new Date(`${geburtVor(4, 10)}T00:00:00Z`) } });
    await page.goto(`/faelle/${fallId}`);
    expect(await stufen()).toEqual(vorher);
    await context.close();
    await db.$disconnect();
  });
});
