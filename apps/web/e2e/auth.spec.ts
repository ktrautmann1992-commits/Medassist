import { expect, test, type Page } from "@playwright/test";
import { generate } from "otplib";
import { PASSWORT, ZWEI_FA_AKTIV, passwortSchritt } from "./helfer";

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

/** Gemeinsamer Anfang: Startseite, Registrierung, E-Mail-Bestätigung, falsches Passwort. */
async function registrierenUndBestaetigen(page: Page, rolle: "Patient" | "Arzt", email: string) {
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
}

/** REQ-018: Arzt-Bereich serverseitig geschützt; REQ-017: Abmelden beendet die Sitzung. */
async function rollenschutzUndAbmelden(page: Page, rolle: "Patient" | "Arzt") {
  const antwort = await page.goto("/arzt/patienten");
  expect(antwort?.status()).toBe(rolle === "Arzt" ? 200 : 403);

  await page.goto("/start");
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/anmelden/);
  await page.goto("/start");
  await expect(page).toHaveURL(/\/anmelden/);
}

async function vierFehlversuche(page: Page, email: string) {
  for (let i = 0; i < 4; i++) {
    await passwortSchritt(page, email, "falsches-Passwort-9");
    await expect(page.getByText("Anmeldung fehlgeschlagen.")).toBeVisible();
  }
}

test.describe("Testphase ohne 2FA (ZWEI_FA_AKTIV=false, Standard)", () => {
  test.skip(ZWEI_FA_AKTIV, "Läuft nur bei abgeschalteter Zwei-Faktor-Anmeldung.");

  for (const rolle of ["Patient", "Arzt"] as const) {
    test(`REQ-001/010/013/018/021 Registrierung und Anmeldung als ${rolle}`, async ({ page }) => {
      const email = `${rolle.toLowerCase()}-ohne2fa-${Date.now()}@example.org`;
      await registrierenUndBestaetigen(page, rolle, email);

      // Kein Hinweis auf einen Authenticator-Code, wenn die 2FA aus ist
      await expect(page.getByText("Authenticator-App")).toHaveCount(0);

      // REQ-021: Passwort + bestätigte E-Mail führen direkt zur vollen Sitzung
      await passwortSchritt(page, email);
      await expect(page).toHaveURL(/\/start/);
      await expect(page.getByText(`Rolle: ${rolle}`)).toBeVisible();
      await expect(page.getByText("Testphase: Zwei-Faktor-Anmeldung deaktiviert")).toBeVisible();

      // 2FA-Seiten sind abgeschaltet und leiten weiter
      await page.goto("/2fa/einrichten");
      await expect(page).toHaveURL(/\/start/);
      await page.goto("/2fa/bestaetigen");
      await expect(page).toHaveURL(/\/start/);

      await rollenschutzUndAbmelden(page, rolle);

      // REQ-020/REQ-021: Ohne 2FA setzt die erfolgreiche Passwortanmeldung den Fehlversuchszähler
      // zurück. 4 + 4 Fehlversuche mit Erfolg dazwischen dürfen daher nicht zur Sperre (ab 5) führen.
      await vierFehlversuche(page, email);
      await passwortSchritt(page, email);
      await expect(page).toHaveURL(/\/start/);
      await page.getByRole("button", { name: "Abmelden" }).click();
      await expect(page).toHaveURL(/\/anmelden/);
      await vierFehlversuche(page, email);
      await passwortSchritt(page, email);
      await expect(page).toHaveURL(/\/start/);
      await page.getByRole("button", { name: "Abmelden" }).click();
      await expect(page).toHaveURL(/\/anmelden/);

      // Ohne Sitzung führen die 2FA-Seiten zur Anmeldung
      await page.goto("/2fa/bestaetigen");
      await expect(page).toHaveURL(/\/anmelden/);
    });
  }
});

test.describe("Pflicht-2FA (ZWEI_FA_AKTIV=true)", () => {
  test.skip(!ZWEI_FA_AKTIV, "Läuft nur, wenn die Zwei-Faktor-Anmeldung aktiv ist.");

  for (const rolle of ["Patient", "Arzt"] as const) {
    test(`REQ-001/010/013/015/016/018 Registrierung und Anmeldung als ${rolle}`, async ({ page }) => {
      const email = `${rolle.toLowerCase()}-${Date.now()}@example.org`;
      await registrierenUndBestaetigen(page, rolle, email);
      await expect(page.getByText("Im nächsten Schritt geben Sie den Code")).toBeVisible();

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
      await expect(page.getByText("Testphase: Zwei-Faktor-Anmeldung deaktiviert")).toHaveCount(0);

      await rollenschutzUndAbmelden(page, rolle);

      // REQ-016: erneute Anmeldung verlangt den zweiten Faktor; derselbe Code wird nicht erneut akzeptiert
      await passwortSchritt(page, email);
      await expect(page).toHaveURL(/\/2fa\/bestaetigen/);
      await page.getByLabel("6-stelliger Code").fill(code);
      await page.getByRole("button", { name: "Anmelden" }).click();
      await expect(page.getByText("Der Code ist nicht gültig")).toBeVisible();
    });
  }
});
