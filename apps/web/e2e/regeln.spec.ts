import { expect, test, type Page } from "@playwright/test";
import { minimalesEigenesProfil, neuesKonto, tagRelativ } from "./helfer";

/**
 * Meilenstein 3 – Regel-Engine in der Oberfläche (REQ-206 – REQ-216).
 * Läuft in beiden 2FA-Modi; `neuesKonto` richtet die 2FA bei Bedarf ein.
 */

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

const pruefen = (page: Page) => page.getByRole("button", { name: "Warnzeichen prüfen" });

/** Der Hinweis steht vor der Seitenüberschrift (REQ-210). */
async function stehtGanzOben(page: Page, selektor: string) {
  const hinweis = await page.locator(selektor).boundingBox();
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(hinweis && h1 && hinweis.y < h1.y).toBe(true);
}

test.describe("Warnzeichen prüfen (Demo)", () => {
  test("REQ-206/207/210/211/213/215/216 Säugling mit Fieber, Krisenpfad, fremdes Profil", async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, context } = await neuesKonto(browser, "Patient", "regeln");

    // REQ-216: Navigation
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await nav.getByRole("link", { name: "Warnzeichen prüfen (Demo)" }).click();
    await expect(page).toHaveURL(/\/regeln\/pruefen$/);
    await expect(page.getByText("Prototyp – keine medizinische Beratung.")).toBeVisible();
    await expect(page.getByText("Noch kein Profil vorhanden.")).toBeVisible();

    // Säugling, 6 Wochen
    const kindId = await legeSaeuglingAn(page, "Mia", 42);
    await page.goto("/regeln/pruefen");
    const chip = page.getByRole("button", { name: /^Mia, / });
    await expect(chip.locator(".avatar")).toHaveClass("avatar child");
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/regeln/pruefen\\?profil=${kindId}$`));
    await expect(page.getByTestId("profil")).toContainText("Mia Test");
    await expect(page.getByTestId("profil")).toContainText("Kinderprofil");

    // Fieber ankreuzen → Notfall-/Dringlichkeitshinweis ganz oben, Regel als ungeprüft markiert
    await page.getByLabel(/^Fieber/).check();
    await pruefen(page).click();
    const hinweis = page.locator("#notfallhinweis");
    await expect(hinweis).toBeVisible();
    await expect(hinweis).toHaveAttribute("role", "alert");
    await expect(hinweis).toContainText("Dringlichkeit: Dringend");
    // S2: Überschrift passt zum Regeltext („sofort“)
    await expect(hinweis.locator("strong").first()).toHaveText("Sofort ärztlich abklären lassen");
    await expect(hinweis).toContainText("Fieber bei Säuglingen unter 3 Monaten");
    await expect(hinweis.locator('a[href="tel:116117"]')).toBeVisible();
    await expect(hinweis.locator('a[href="tel:112"]')).toBeVisible();
    await stehtGanzOben(page, "#notfallhinweis");
    const regel = page.locator('[data-regel="RF-KIND-001"]');
    await expect(regel).toContainText("Regel ungeprüft");
    await expect(regel).toContainText("Quelle: fehlt");
    await expect(regel).toContainText("Version 0.2.0");
    await expect(page.getByTestId("regelwerk-version")).toContainText("Regelwerk-Version 0.2.0");
    // REQ-213: Patient sieht keinen ärztlichen Hinweistext
    await expect(page.getByText("Ärztlicher Hinweis:")).toHaveCount(0);
    await expect(page.getByTestId("weitere-schritte")).toBeVisible();
    // Eingaben bleiben erhalten
    await expect(page.getByLabel(/^Fieber/)).toBeChecked();

    // Ohne Fieber, Temperatur unauffällig → keine Warnzeichen, aber keine Entwarnung (REQ-211)
    await page.getByLabel(/^Fieber/).uncheck();
    await page.getByLabel(/Körpertemperatur/).fill("37,5");
    await pruefen(page).click();
    await expect(page.getByTestId("keine-warnzeichen")).toContainText("Das ist keine Entwarnung");
    await expect(page.locator("#notfallhinweis")).toHaveCount(0);

    // Temperatur ≥ 38,0 °C löst die Regel ebenfalls aus; Tippfehler wird abgewiesen
    await page.getByLabel(/Körpertemperatur/).fill("385");
    await pruefen(page).click();
    await expect(page.locator("#messwert-temperatur_c-fehler")).toContainText("zwischen 30 und 45");
    await expect(page.getByLabel(/Körpertemperatur/)).toHaveAttribute("aria-invalid", "true");
    // S3: Fokus auf der Fehlerzusammenfassung
    await expect(page.locator("#fehler-zusammenfassung")).toBeFocused();
    await page.getByLabel(/Körpertemperatur/).fill("38,0");
    await pruefen(page).click();
    await expect(page.locator("#notfallhinweis")).toContainText("Dringlichkeit: Dringend");

    // S-1: „38,5 ºC“ (Ordinalzeichen) beim Säugling, 60 Tage ⇒ 38,5 ⇒ Red Flag
    const lia = await legeSaeuglingAn(page, "Lia", 60);
    await page.goto(`/regeln/pruefen?profil=${lia}`);
    await page.getByLabel(/Körpertemperatur/).fill("38,5 ºC");
    await pruefen(page).click();
    await expect(page.locator("#notfallhinweis")).toContainText("Sofort ärztlich abklären lassen");
    await expect(page.locator("#fehler-zusammenfassung")).toHaveCount(0);
    // S-1: wirklich ungültiger Wert ⇒ „Prüfung unvollständig“, nie „keine Warnzeichen“
    await page.getByLabel(/Körpertemperatur/).fill("achtunddreißig");
    await pruefen(page).click();
    await expect(page.getByTestId("pruefung-unvollstaendig")).toContainText("116117");
    await expect(page.getByText("Prüfung unvollständig – bitte Wert korrigieren.")).toBeVisible();
    await expect(page.getByTestId("keine-warnzeichen")).toHaveCount(0);

    // N-1: mehrdeutige Eingaben ⇒ abgelehnt ⇒ „Prüfung unvollständig“, nie „keine Warnzeichen“
    for (const text of ["37, 39", "36, 39", "37 . 39", "39 ,5", "38 ,5", "37\u200B,\u200B39"]) {
      await page.getByLabel(/Körpertemperatur/).fill(text);
      await pruefen(page).click();
      await expect(page.locator("#messwert-temperatur_c-fehler"), text).toContainText("Bitte nur einen Wert angeben, z. B. 38,5");
      await expect(page.getByTestId("pruefung-unvollstaendig"), text).toBeVisible();
      await expect(page.getByTestId("keine-warnzeichen"), text).toHaveCount(0);
    }

    // Krisenpfad: positive Antwort → Krisenhinweis mit allen drei Nummern, kein weiterer Ablauf
    const eigenesId = await minimalesEigenesProfil(page, "Kai");
    await page.goto(`/regeln/pruefen?profil=${eigenesId}`);
    await page.getByLabel("Es geht (auch) um seelische Beschwerden.").check();
    await expect(page.getByText("Fragen ungeprüft")).toBeVisible();
    await page.locator("#antwort-krise_gedanken_nicht_leben-ja").check();
    await page.locator("#antwort-krise_gedanken_selbstverletzung-nein").check();
    await page.locator("#antwort-krise_plaene-nein").check();
    await pruefen(page).click();
    const krise = page.locator("#krisenhinweis");
    await expect(krise).toBeVisible();
    await expect(krise).toHaveAttribute("role", "alert");
    for (const href of ["tel:112", "tel:08001110111", "tel:08001110222"]) await expect(krise.locator(`a[href="${href}"]`)).toBeVisible();
    await expect(krise).toContainText("0800 111 0 111");
    await expect(krise).toContainText("0800 111 0 222");
    await expect(krise).toContainText("ärztliche Akutvorstellung");
    await stehtGanzOben(page, "#krisenhinweis");
    await expect(page.locator('[data-regel="KP-001"]')).toContainText("Regel ungeprüft");
    await expect(page.getByTestId("ablauf-beendet")).toBeVisible();
    await expect(page.getByTestId("weitere-schritte")).toHaveCount(0);
    await expect(page.getByRole("form", { name: "Warnzeichen angeben" })).toHaveCount(0);
    await expect(pruefen(page)).toHaveCount(0);

    // REQ-209: Krisenfragen unbeantwortet → konservativ Krisenhinweis
    await page.getByRole("link", { name: "Neue Prüfung starten (Demo)" }).click();
    await page.getByLabel("Es geht (auch) um seelische Beschwerden.").check();
    await pruefen(page).click();
    await expect(page.locator("#krisenhinweis")).toBeVisible();
    await expect(page.locator('[data-regel="KP-002"]')).toBeVisible();
    await expect(page.locator("#krisenhinweis")).toContainText("Nicht alle Fragen zu Ihrer Sicherheit wurden beantwortet.");
    await expect(page.getByTestId("ablauf-beendet")).toBeVisible();

    // Alle Krisenfragen „nein“ → kein Krisenhinweis
    await page.getByRole("link", { name: "Neue Prüfung starten (Demo)" }).click();
    await page.getByLabel("Es geht (auch) um seelische Beschwerden.").check();
    for (const id of ["krise_gedanken_nicht_leben", "krise_gedanken_selbstverletzung", "krise_plaene"]) {
      await page.locator(`#antwort-${id}-nein`).check();
    }
    await pruefen(page).click();
    await expect(page.getByTestId("keine-warnzeichen")).toBeVisible();
    await expect(page.locator("#krisenhinweis")).toHaveCount(0);

    // REQ-219 (B1): Eingabefehler unterdrücken keine Hinweise
    await page.goto(`/regeln/pruefen?profil=${eigenesId}`);
    await page.getByLabel("Es geht (auch) um seelische Beschwerden.").check();
    await page.locator("#antwort-krise_gedanken_nicht_leben-ja").check();
    await page.getByLabel(/Körpertemperatur/).fill("38 Grad");
    await pruefen(page).click();
    await expect(page.locator("#krisenhinweis")).toBeVisible();
    await expect(page.locator("#fehler-zusammenfassung")).toContainText("nicht berücksichtigt");
    await expect(page.getByTestId("vorrang-hinweise")).toBeFocused();

    await page.goto(`/regeln/pruefen?profil=${eigenesId}`);
    await page.getByLabel(/^Bewusstlos/).check();
    await page.getByLabel(/Körpertemperatur/).fill("29");
    await pruefen(page).click();
    await expect(page.locator("#notfallhinweis")).toContainText("Sofort Notruf 112");
    await expect(page.locator("#messwert-temperatur_c-fehler")).toContainText("zwischen 30 und 45");

    // B2: Manipulation – Antwort „ja“ und zusätzlich eingeschleustes „nein“ ⇒ Krise
    await page.goto(`/regeln/pruefen?profil=${eigenesId}`);
    await page.locator("#antwort-krise_gedanken_nicht_leben-ja").check();
    await page.locator("#antwort-krise_gedanken_selbstverletzung-nein").check();
    await page.locator("#antwort-krise_plaene-nein").check();
    await page.getByRole("form", { name: "Warnzeichen angeben" }).evaluate((f) => {
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = "antwort.krise_gedanken_nicht_leben";
      i.value = "nein";
      f.appendChild(i);
    });
    await pruefen(page).click();
    await expect(page.locator("#krisenhinweis")).toBeVisible();
    await expect(page.locator('[data-regel="KP-001"]')).toBeVisible();

    // REQ-218 (B4): Warnzeichen außerhalb des Altersbereichs ⇒ Sicherheitsnetz, nie „keine Warnzeichen“
    await page.goto(`/regeln/pruefen?profil=${eigenesId}`);
    await page.getByLabel(/^Trinkt kaum/).check();
    await pruefen(page).click();
    await expect(page.locator("#notfallhinweis")).toContainText("Dringlichkeit: Dringend");
    await expect(page.locator('[data-regel="SN-001"]')).toContainText("Regel ungeprüft");
    await expect(page.getByTestId("keine-warnzeichen")).toHaveCount(0);

    // REQ-115/REQ-215: fremdes Profil → 404, auch über die Server Action
    const fremd = await neuesKonto(browser, "Patient", "regeln-fremd");
    for (const pfad of [`/regeln/pruefen?profil=${kindId}`, "/regeln/pruefen?profil=gibt-es-nicht"]) {
      expect((await fremd.page.goto(pfad))?.status(), pfad).toBe(404);
      await expect(fremd.page.getByText("Mia")).toHaveCount(0);
    }
    const fremdEigenId = await minimalesEigenesProfil(fremd.page, "Fremd");
    await fremd.page.goto(`/regeln/pruefen?profil=${fremdEigenId}`);
    await fremd.page.locator("input[name=profilId]").evaluate((el, id) => {
      (el as HTMLInputElement).value = id;
    }, kindId);
    await fremd.page.getByLabel(/^Fieber/).check();
    await pruefen(fremd.page).click();
    await expect(fremd.page.getByText(/Profil nicht gefunden\./)).toBeVisible();
    // Keine fremden Profildaten; Angaben werden konservativ ohne Alter geprüft (Hinweis nicht unterdrückt)
    await expect(fremd.page.getByText("Mia")).toHaveCount(0);
    await expect(fremd.page.locator("#notfallhinweis")).toBeVisible();
    // H-1: Kopfzeile nennt nicht das eigene Profil
    await expect(fremd.page.getByTestId("profil")).toHaveText(/Profil unbekannt – ohne Alter geprüft/);

    const arzt = await neuesKonto(browser, "Arzt", "regeln-fremd");
    expect((await arzt.page.goto(`/regeln/pruefen?profil=${kindId}`))?.status()).toBe(404);

    await Promise.all([fremd.context.close(), arzt.context.close(), context.close()]);
  });

  test("REQ-206/213 Arzt: Notfall bei Atemnot mit bläulichen Lippen, ärztlicher Hinweistext sichtbar", async ({ browser }) => {
    test.setTimeout(120_000);
    const { page, context } = await neuesKonto(browser, "Arzt", "regeln");
    await page.goto("/arzt/patienten/neu");
    await page.getByLabel("Vorname").fill("Erik");
    await page.getByLabel("Nachname").fill("Beispiel");
    await page.getByLabel("Geburtsdatum").fill("1970-02-01");
    await page.getByLabel("Geschlecht").selectOption({ label: "männlich" });
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page).toHaveURL(/\/profile\/[^/]+$/);
    const patientId = new URL(page.url()).pathname.split("/")[2]!;

    await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Warnzeichen prüfen (Demo)" }).click();
    await page.getByRole("button", { name: "Erik Beispiel" }).click();
    await expect(page).toHaveURL(new RegExp(`profil=${patientId}$`));
    // S6: Krisenfragen als Fremdanamnese
    await expect(page.getByText("Hatte die Patientin bzw. der Patient in letzter Zeit Gedanken, nicht mehr leben zu wollen?")).toBeVisible();
    await page.getByLabel(/^Atemnot/).check();
    await page.getByLabel(/^Bläuliche Lippen/).check();
    await pruefen(page).click();
    const hinweis = page.locator("#notfallhinweis");
    await expect(hinweis).toContainText("Dringlichkeit: Notfall");
    await expect(hinweis.getByRole("link", { name: "Notruf 112 anrufen" })).toHaveAttribute("href", "tel:112");
    await stehtGanzOben(page, "#notfallhinweis");
    // Rangfolge: NOTFALL-Regel vor DRINGEND-Regel
    await expect(page.locator("[data-regel]")).toHaveCount(2);
    await expect(page.locator("[data-regel]").first()).toHaveAttribute("data-regel", "RF-ALLG-001");
    await expect(page.getByText("Ärztlicher Hinweis:").first()).toBeVisible();

    // S6: Krisenhinweis an den Arzt gerichtet, Nummern bleiben
    await page.goto(`/regeln/pruefen?profil=${patientId}`);
    await page.locator("#antwort-krise_plaene-ja").check();
    await pruefen(page).click();
    const krise = page.locator("#krisenhinweis");
    await expect(krise).toContainText("Akutvorstellung veranlassen");
    await expect(krise).toContainText("Positives Suizidalitäts-Screening");
    for (const href of ["tel:112", "tel:08001110111", "tel:08001110222"]) await expect(krise.locator(`a[href="${href}"]`)).toBeVisible();
    await context.close();
  });
});
