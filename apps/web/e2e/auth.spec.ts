import { expect, test, type Page } from "@playwright/test";
import { generate } from "otplib";

const PASSWORT = "sicheres-Passwort-1";

async function registrieren(page: Page, rolle: "Patient" | "Arzt", email: string) {
  await page.goto("/registrieren");
  await page.getByLabel(rolle, { exact: false }).first().check();

  // Erst absichtlich ungültig absenden: Rollenwahl muss danach erhalten bleiben (REQ-010).
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill("kurz");
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(page.getByText("Bitte die markierten Felder prüfen.")).toBeVisible();

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
  return (await link.getAttribute("href"))!;
}

async function passwortSchritt(page: Page, email: string, passwort = PASSWORT) {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(passwort);
  await page.getByRole("button", { name: "Weiter" }).click();
}

for (const rolle of ["Patient", "Arzt"] as const) {
  test(`REQ-001/010/013/015/016/018 Registrierung und Anmeldung als ${rolle}`, async ({ page }) => {
    const email = `${rolle.toLowerCase()}-${Date.now()}@example.org`;

    await page.goto("/");
    await expect(page.getByText("Demo – nicht für den klinischen Einsatz")).toBeVisible();

    const link = await registrieren(page, rolle, email);

    // REQ-013: ohne bestätigte E-Mail kein Login
    await passwortSchritt(page, email);
    await expect(page.getByText("Bitte bestätigen Sie zuerst")).toBeVisible();

    await page.goto(link);
    await page.getByRole("button", { name: "E-Mail-Adresse bestätigen" }).click();
    await expect(page).toHaveURL(/hinweis=bestaetigt/);

    // REQ-019: falsches Passwort → generische Meldung
    await passwortSchritt(page, email, "falsches-Passwort-9");
    await expect(page.getByText("Anmeldung fehlgeschlagen.")).toBeVisible();

    // REQ-015: ohne 2FA kein Zugriff
    await passwortSchritt(page, email);
    await expect(page).toHaveURL(/\/2fa\/einrichten/);
    await page.goto("/start");
    await expect(page).toHaveURL(/\/2fa\/einrichten/);

    const secret = (await page.locator("code").innerText()).replace(/\s/g, "");
    await page.getByLabel("6-stelliger Code").fill("000000");
    await page.getByRole("button", { name: "Einrichtung abschließen" }).click();
    await expect(page.getByText("Der Code ist nicht gültig")).toBeVisible();

    const code = await generate({ secret });
    await page.getByLabel("6-stelliger Code").fill(code);
    await page.getByRole("button", { name: "Einrichtung abschließen" }).click();
    await expect(page).toHaveURL(/\/start/);
    await expect(page.getByText(`Rolle: ${rolle}`)).toBeVisible();

    // REQ-018: Arzt-Bereich serverseitig geschützt
    const antwort = await page.goto("/arzt/patienten");
    expect(antwort?.status()).toBe(rolle === "Arzt" ? 200 : 403);

    // REQ-017: Abmelden beendet die Sitzung
    await page.goto("/start");
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/anmelden/);
    await page.goto("/start");
    await expect(page).toHaveURL(/\/anmelden/);

    // REQ-016: erneute Anmeldung verlangt den zweiten Faktor; derselbe Code wird nicht erneut akzeptiert
    await passwortSchritt(page, email);
    await expect(page).toHaveURL(/\/2fa\/bestaetigen/);
    await page.getByLabel("6-stelliger Code").fill(code);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByText("Der Code ist nicht gültig")).toBeVisible();
  });
}
