import { expect, type Browser, type Page } from "@playwright/test";
import { heuteIso } from "@medassist/core";
import { generate } from "otplib";

export const PASSWORT = "sicheres-Passwort-1";

/**
 * REQ-021: Der Modus muss zum gestarteten Server passen – der webServer in
 * playwright.config.ts erbt dieselbe Umgebung (`ZWEI_FA_AKTIV`).
 */
export const ZWEI_FA_AKTIV = process.env.ZWEI_FA_AKTIV === "true";

export async function passwortSchritt(page: Page, email: string, passwort = PASSWORT) {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(passwort);
  await page.getByRole("button", { name: "Weiter" }).click();
}

export type TestRolle = "Patient" | "Arzt";

let zaehler = 0;

/**
 * Legt ein Konto an, bestätigt die E-Mail und meldet vollständig an (bei aktiver
 * 2FA inkl. Einrichtung). Jedes Konto bekommt einen eigenen Browser-Kontext.
 */
export async function neuesKonto(browser: Browser, rolle: TestRolle, prefix = "profil") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `${prefix}-${rolle.toLowerCase()}-${Date.now()}-${zaehler++}@example.org`;

  await page.goto("/registrieren");
  await page.getByLabel(rolle, { exact: false }).first().check();
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(PASSWORT);
  if (rolle === "Arzt") {
    await page.getByLabel("Ausstellende Behörde").fill("Landesprüfungsamt (Demo)");
    await page.getByLabel("Datum der Approbation").fill("2015-06-01");
  }
  await page.getByLabel(/ausschließlich Testdaten/).check();
  await page.getByLabel(/Art\. 9 DSGVO/).check();
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  const link = page.getByRole("link", { name: "E-Mail-Adresse bestätigen" });
  await expect(link).toBeVisible();
  await page.goto((await link.getAttribute("href"))!);
  await page.getByRole("button", { name: "E-Mail-Adresse bestätigen" }).click();
  await expect(page).toHaveURL(/hinweis=bestaetigt/);

  await passwortSchritt(page, email);
  if (ZWEI_FA_AKTIV) {
    await expect(page).toHaveURL(/\/2fa\/einrichten/);
    const secret = (await page.locator("code").innerText()).replace(/\s/g, "");
    await page.getByLabel("6-stelliger Code").fill(await generate({ secret }));
    await page.getByRole("button", { name: "Einrichtung abschließen" }).click();
  }
  await expect(page).toHaveURL(/\/start/);
  return { context, page, email };
}

/** Kalendertag relativ zu „heute“ in Europe/Berlin (wie der Server, `heuteIso` aus core) als YYYY-MM-DD. */
export function tagRelativ(tage: number): string {
  const heute = new Date(`${heuteIso()}T00:00:00Z`);
  return new Date(heute.getTime() + tage * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Volle Jahre zwischen Geburtsdatum und „heute“ (Europe/Berlin) – für die erwartete Altersanzeige. */
export function volleJahre(geburt: string): number {
  const [j, m, t] = geburt.split("-").map(Number) as [number, number, number];
  const [hj, hm, ht] = heuteIso().split("-").map(Number) as [number, number, number];
  return hj - j - (hm < m || (hm === m && ht < t) ? 1 : 0);
}

/** Legt ein minimales eigenes Profil an (Patient) und gibt seine ID zurück. */
export async function minimalesEigenesProfil(page: Page, vorname: string): Promise<string> {
  await page.goto("/profile/neu");
  await page.getByLabel("Vorname").fill(vorname);
  await page.getByLabel("Nachname").fill("Test");
  await page.getByLabel("Geburtsdatum").fill("1985-01-01");
  await page.getByLabel("Geschlecht").selectOption({ label: "divers" });
  await page.getByRole("button", { name: "Profil speichern" }).click();
  await expect(page.getByRole("heading", { name: `${vorname} Test` })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2]!;
}

/** IDOR-Versuch: Hidden-Feld `profilId` im Bearbeiten-Formular auf eine fremde ID setzen. */
export async function setzeProfilId(page: Page, fremdeId: string) {
  await page.locator("main form input[name=profilId]").evaluate((el, id) => {
    (el as HTMLInputElement).value = id;
  }, fremdeId);
}
