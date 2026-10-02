import { expect, test, type Page } from "@playwright/test";
import { testDb } from "./db";
import { minimalesEigenesProfil, neuesKonto, setzeProfilId, tagRelativ, volleJahre } from "./helfer";

/**
 * Meilenstein 2 – Patientenprofile (REQ-100 – REQ-118). Läuft in beiden 2FA-Modi;
 * `neuesKonto` richtet die 2FA bei Bedarf ein.
 */

const profilId = (page: Page) => new URL(page.url()).pathname.split("/")[2]!;

test.describe("Profile – Patient", () => {
  test("REQ-100/101/103/104/105/106/108/110/112/114/115 eigenes Profil, Kinderprofil, Auswahl, Zugriff", async ({ browser }) => {
    test.setTimeout(180_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Patient");

    // REQ-118: Navigation je Rolle, Demo-Hinweis bleibt
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("link", { name: "Meine Profile" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Patienten" })).toHaveCount(0);
    await expect(page.getByText("Demo – nicht für den klinischen Einsatz")).toBeVisible();

    // REQ-112: Profil-Auswahl ohne Profile
    await expect(page.getByRole("heading", { name: "Für wen ist die Untersuchung?" })).toBeVisible();
    await page.getByRole("link", { name: "Eigenes Profil anlegen" }).click();
    await expect(page).toHaveURL(/\/profile\/neu$/);

    // REQ-114: keine Arzt-Felder im Patient-Formular
    await expect(page.getByLabel("Nierenfunktion")).toHaveCount(0);
    await expect(page.getByLabel("Leberfunktion")).toHaveCount(0);
    await expect(page.getByText("Laborwerte")).toHaveCount(0);

    // REQ-103: Validierungsfehler am Feld, Eingaben bleiben erhalten
    await page.getByLabel("Vorname").fill("Karsten");
    await page.getByLabel("Nachname").fill("Muster");
    await page.getByLabel("Geburtsdatum").fill("2999-01-01");
    await page.getByLabel("Geschlecht").selectOption({ label: "weiblich" });
    await expect(page.getByLabel("Schwangerschaft / Stillzeit")).toBeVisible();
    await page.getByLabel("Schwangerschaft / Stillzeit").selectOption({ label: "schwanger" });
    await page.locator("#groesseCm").fill("180");
    await page.locator("#gewichtKg").fill("4000");
    await page.getByRole("button", { name: "+ Vorerkrankung hinzufügen" }).click();
    await expect(page.locator("#vorerkrankungen-0-bezeichnung")).toBeFocused();
    await page.locator("#vorerkrankungen-0-bezeichnung").fill("Asthma bronchiale");
    await page.locator("#vorerkrankungen-0-icd10Code").fill("Asthma");
    await page.getByRole("button", { name: "Profil speichern" }).click();

    await expect(page.getByText("Bitte die markierten Felder prüfen.")).toBeVisible();
    await expect(page.locator("#geburtsdatum-fehler")).toContainText("Zukunft");
    await expect(page.locator("#gewichtKg-fehler")).toContainText("zwischen 0,3 und 400 kg");
    await expect(page.locator("#gewichtKg")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#vorerkrankungen-0-icd10Code-fehler")).toContainText("ICD-10-GM-Format");
    await expect(page.getByLabel("Vorname")).toHaveValue("Karsten");
    await expect(page.locator("#vorerkrankungen-0-bezeichnung")).toHaveValue("Asthma bronchiale");
    await expect(page.getByLabel("Geschlecht")).toHaveValue("WEIBLICH");

    // REQ-104: „männlich“ blendet Schwangerschaft aus
    await page.getByLabel("Geschlecht").selectOption({ label: "männlich" });
    await expect(page.getByLabel("Schwangerschaft / Stillzeit")).toHaveCount(0);
    await page.getByLabel("Geburtsdatum").fill("1990-05-17");
    await page.locator("#gewichtKg").fill("81");
    await page.locator("#vorerkrankungen-0-icd10Code").fill("j45.0");
    await page.getByRole("button", { name: "+ Allergie/Unverträglichkeit hinzufügen" }).click();
    await page.locator("#allergien-0-ausloeser").fill("Penicillin (Demo)");
    await page.getByRole("button", { name: "Profil speichern" }).click();

    // REQ-105: Alter und BMI berechnet
    await expect(page.getByRole("heading", { name: "Karsten Muster" })).toBeVisible();
    await expect(page).toHaveURL(/\/profile\/(?!neu$)[^/]+$/);
    const eigenesId = profilId(page);
    await expect(page.getByTestId("alter")).toHaveText(`${volleJahre("1990-05-17")} Jahre`);
    await expect(page.getByTestId("bmi")).toHaveText("25 kg/m²");
    await expect(page.getByText("J45.0")).toBeVisible();
    await expect(page.getByText("Penicillin (Demo)")).toBeVisible();
    await expect(page.getByText("Nierenfunktion")).toHaveCount(0);

    // REQ-100: ein zweites eigenes Profil ist nicht möglich
    await page.goto("/profile/neu");
    await expect(page).toHaveURL(new RegExp(`/profile/${eigenesId}/bearbeiten$`));

    // REQ-114: eingeschleuste Arzt-Felder werden serverseitig verworfen
    await page.locator("main form").evaluate((form) => {
      for (const [name, wert] of [
        ["nierenfunktion", "SCHWER_EINGESCHRAENKT"],
        ["leberfunktion", "SCHWER_EINGESCHRAENKT"],
        ["laborwerte.0.parameter", "Kreatinin"],
        ["laborwerte.0.wert", "9"],
        ["laborwerte.0.einheit", "mg/dl"],
        ["laborwerte.0.gemessenAm", "2026-01-01"],
      ]) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name!;
        input.value = wert!;
        form.appendChild(input);
      }
    });
    await page.locator("#gewichtKg").fill("90");
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page.getByTestId("bmi")).toHaveText("27,8 kg/m²");
    const gespeichert = await db.patientenprofil.findUniqueOrThrow({
      where: { id: eigenesId },
      select: { nierenfunktion: true, leberfunktion: true, _count: { select: { laborwerte: true } } },
    });
    expect(gespeichert).toEqual({ nierenfunktion: "UNBEKANNT", leberfunktion: "UNBEKANNT", _count: { laborwerte: 0 } });

    // REQ-106/REQ-107: Kinderprofil – ohne Sorgerechts-Häkchen Fehler
    await page.goto("/start");
    await expect(page.getByRole("button", { name: "Karsten M." })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "Kind hinzufügen" }).click();
    await expect(page).toHaveURL(/\/profile\/kind\/neu$/);
    // REQ-104: kein Schwangerschaftsfeld bei Kinderprofilen
    await expect(page.getByLabel("Schwangerschaft / Stillzeit")).toHaveCount(0);
    const geburt = tagRelativ(-120);
    await page.getByLabel("Vorname").fill("Lena");
    await page.getByLabel("Nachname").fill("Muster");
    await page.getByLabel("Geburtsdatum").fill(geburt);
    await page.getByLabel("Geschlecht").selectOption({ label: "weiblich" });
    await page.getByLabel(/Schwangerschaftswoche bei Geburt/).fill("28");
    await page.getByLabel("Zusätzliche Tage (0–6)").fill("0");
    await page.getByLabel("Geburtsgewicht in g").fill("1100");
    await page.getByLabel("U1: Ergebnis").selectOption({ label: "unauffällig" });
    await page.getByRole("button", { name: "+ Messung hinzufügen" }).click();
    await page.locator("#wachstum-0-gemessenAm").fill(tagRelativ(-90));
    await page.locator("#wachstum-0-gewichtKg").fill("1,6");
    await page.locator("#wachstum-0-groesseCm").fill("41");
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page.locator("#sorgerechtBestaetigt-fehler")).toHaveText("Bitte bestätigen Sie, dass Sie sorgeberechtigt sind.");
    await expect(page.getByLabel("Vorname")).toHaveValue("Lena");
    await expect(page.getByLabel(/Schwangerschaftswoche bei Geburt/)).toHaveValue("28");
    await expect(page.locator("#wachstum-0-gewichtKg")).toHaveValue("1,6");
    await expect(page.getByLabel("U1: Ergebnis")).toHaveValue("UNAUFFAELLIG");

    await page.getByLabel("Ich bin für dieses Kind sorgeberechtigt.").check();
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page).toHaveURL(/\/profile\/[^/]+$/);
    const kindId = profilId(page);
    await expect(page.getByText("Kinderprofil", { exact: true })).toBeVisible();
    await expect(page.locator(".avatar.child").first()).toBeVisible();

    // REQ-108: korrigiertes Alter (28+0 → 12 Wochen Korrektur)
    await expect(page.getByTestId("korrigiertes-alter")).toContainText("Korrigiertes Alter:");
    await expect(page.getByTestId("korrigiertes-alter")).toContainText("Korrektur 12+0 Wochen");
    // REQ-109/REQ-110: Verlauf als Tabelle, keine Perzentilen
    await expect(page.getByRole("cell", { name: "1,6" })).toBeVisible();
    await expect(page.getByText("Perzentilen folgen, sobald eine geprüfte Referenzquelle eingebunden ist.")).toBeVisible();
    await expect(page.getByText("U1")).toBeVisible();

    const kind = await db.patientenprofil.findUniqueOrThrow({
      where: { id: kindId },
      select: { kontoinhaberId: true, istKinderprofil: true, sorgerechtBestaetigtAm: true, sorgeberechtigte: { select: { nutzerId: true } } },
    });
    expect(kind.kontoinhaberId).toBeNull();
    expect(kind.istKinderprofil).toBe(true);
    expect(kind.sorgerechtBestaetigtAm).not.toBeNull();
    expect(kind.sorgeberechtigte).toHaveLength(1);

    // REQ-112: Auswahl mit blauem Kinder-Avatar
    await page.goto("/start");
    const kindChip = page.getByRole("button", { name: /^Lena, / });
    await expect(kindChip.locator(".avatar")).toHaveClass("avatar child");
    await expect(kindChip.locator(".avatar")).toHaveCSS("background-color", "rgb(234, 242, 248)");
    await expect(page.getByRole("button", { name: "Karsten M." }).locator(".avatar")).toHaveCSS(
      "background-color",
      "rgb(242, 201, 214)",
    );
    await kindChip.click();
    await expect(page.getByRole("button", { name: /^Lena, / })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("auswahl")).toContainText("Lena Muster");
    await expect(page.getByTestId("auswahl")).toContainText("Kinderprofil");

    // „Meine Profile“
    await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Meine Profile" }).click();
    await expect(page.getByRole("link", { name: "Karsten Muster", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lena Muster", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Eigenes Profil anlegen" })).toHaveCount(0);

    // REQ-115: zweiter Patient und Arzt erhalten 404 auf fremde Profile
    const fremd = await neuesKonto(browser, "Patient", "fremd");
    for (const pfad of [`/profile/${eigenesId}`, `/profile/${kindId}`, `/profile/${kindId}/bearbeiten`, "/profile/gibt-es-nicht"]) {
      const antwort = await fremd.page.goto(pfad);
      expect(antwort?.status(), pfad).toBe(404);
      await expect(fremd.page.getByText("Lena")).toHaveCount(0);
    }
    await fremd.page.goto("/start");
    await expect(fremd.page.getByRole("button", { name: /^Lena, / })).toHaveCount(0);

    // REQ-116 (IDOR an der Server Action): fremde profilId im eigenen Bearbeiten-Formular
    const fremdEigenId = await minimalesEigenesProfil(fremd.page, "Fremd");
    await fremd.page.goto(`/profile/${fremdEigenId}/bearbeiten`);
    await setzeProfilId(fremd.page, kindId);
    await fremd.page.getByLabel("Vorname").fill("Gehackt");
    await fremd.page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(fremd.page.getByText("Profil nicht gefunden.")).toBeVisible();
    await expect(fremd.page).toHaveURL(new RegExp(`/profile/${fremdEigenId}/bearbeiten$`));
    const kindDanach = await db.patientenprofil.findUniqueOrThrow({
      where: { id: kindId },
      select: { vorname: true, aktualisiertAm: true, _count: { select: { wachstum: true, vorsorge: true } } },
    });
    expect(kindDanach.vorname).toBe("Lena");
    expect(kindDanach._count).toEqual({ wachstum: 1, vorsorge: 1 });
    expect((await db.patientenprofil.findUniqueOrThrow({ where: { id: fremdEigenId }, select: { vorname: true } })).vorname).toBe("Fremd");
    const arzt = await neuesKonto(browser, "Arzt", "fremd");
    expect((await arzt.page.goto(`/profile/${kindId}`))?.status()).toBe(404);
    expect((await arzt.page.goto(`/profile/${eigenesId}/bearbeiten`))?.status()).toBe(404);

    await Promise.all([fremd.context.close(), arzt.context.close(), context.close()]);
    await db.$disconnect();
  });
});

test.describe("Profile – Arzt", () => {
  test("REQ-113/114/115 Patientenliste, Nierenfunktion und Laborwerte, Kinder-Patient", async ({ browser }) => {
    test.setTimeout(180_000);
    const db = testDb();
    const { page, context } = await neuesKonto(browser, "Arzt");

    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await nav.getByRole("link", { name: "Patienten" }).click();
    await expect(page).toHaveURL(/\/arzt\/patienten$/);
    await expect(nav.getByRole("link", { name: "Patienten" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Noch keine Patienten angelegt.")).toBeVisible();

    await page.getByRole("link", { name: "Patient anlegen" }).click();
    await page.getByLabel("Vorname").fill("Erika");
    await page.getByLabel("Nachname").fill("Beispiel");
    await page.getByLabel("Geburtsdatum").fill("1960-03-01");
    await page.getByLabel("Geschlecht").selectOption({ label: "weiblich" });
    await page.getByLabel("Nierenfunktion").selectOption({ label: "mittelgradig eingeschränkt" });
    await page.getByRole("button", { name: "+ Laborwert hinzufügen" }).click();
    await page.getByLabel("Parameter").fill("Kreatinin");
    await page.getByLabel("Wert", { exact: true }).fill("1,8");
    await page.getByRole("button", { name: "Profil speichern" }).click();
    // Validierung: Einheit und Datum fehlen, Eingaben bleiben
    await expect(page.locator("#laborwerte-0-einheit-fehler")).toHaveText("Bitte die Einheit angeben.");
    await expect(page.locator("#laborwerte-0-gemessenAm-fehler")).toHaveText("Bitte das Datum der Messung angeben.");
    await expect(page.getByLabel("Parameter")).toHaveValue("Kreatinin");
    await expect(page.getByLabel("Nierenfunktion")).toHaveValue("MITTELGRADIG_EINGESCHRAENKT");
    await page.getByLabel("Einheit").fill("mg/dl");
    await page.getByLabel("Datum der Messung").fill(tagRelativ(-1));
    await page.getByRole("button", { name: "Profil speichern" }).click();

    await expect(page).toHaveURL(/\/profile\/[^/]+$/);
    const patientId = profilId(page);
    await expect(page.getByTestId("nierenfunktion")).toHaveText("mittelgradig eingeschränkt");
    await expect(nav.getByRole("link", { name: "Patienten" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("cell", { name: "Kreatinin" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "1,8" })).toBeVisible();

    // Bearbeiten: Laborwert ändern
    await page.getByRole("link", { name: "Profil bearbeiten" }).click();
    await expect(page.getByLabel("Wert", { exact: true })).toHaveValue("1,8");
    await page.getByLabel("Wert", { exact: true }).fill("1,5");
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page.getByRole("cell", { name: "1,5" })).toBeVisible();

    // Kind als Patient (ohne Sorgerechtsbestätigung)
    await page.goto("/arzt/patienten/neu");
    await page.getByLabel("Profil für").selectOption("KIND");
    await expect(page.getByLabel(/Schwangerschaftswoche bei Geburt/)).toBeVisible();
    await expect(page.getByLabel("Ich bin für dieses Kind sorgeberechtigt.")).toHaveCount(0);
    await page.getByLabel("Vorname").fill("Mia");
    await page.getByLabel("Nachname").fill("Klein");
    await page.getByLabel("Geburtsdatum").fill(tagRelativ(-400));
    await page.getByLabel("Geschlecht").selectOption({ label: "weiblich" });
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page.getByText("Kinderprofil", { exact: true })).toBeVisible();
    await expect(page.getByText("Perzentilen folgen")).toBeVisible();

    // Liste und Suche
    await page.goto("/arzt/patienten");
    await expect(page.getByRole("link", { name: "Erika Beispiel", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mia Klein", exact: true })).toBeVisible();
    await page.getByLabel("Suche nach Vor- oder Nachname").fill("beisp");
    await page.getByRole("button", { name: "Suchen" }).click();
    await expect(page.getByRole("link", { name: "Erika Beispiel", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mia Klein", exact: true })).toHaveCount(0);
    await page.getByLabel("Suche nach Vor- oder Nachname").fill("Xyz");
    await page.getByRole("button", { name: "Suchen" }).click();
    await expect(page.getByText("Keine Patienten zu „Xyz“ gefunden.")).toBeVisible();

    // REQ-115/REQ-018: Patient sieht Arzt-Profile nicht und hat keinen Zugang zum Arzt-Bereich
    const patient = await neuesKonto(browser, "Patient", "fremd");
    expect((await patient.page.goto(`/profile/${patientId}`))?.status()).toBe(404);

    // REQ-116 (IDOR): Arzt setzt profilId auf ein Profil mit Kontoinhaber (Patientenkonto)
    const kontoProfilId = await minimalesEigenesProfil(patient.page, "Konto");
    expect((await page.goto(`/profile/${kontoProfilId}`))?.status()).toBe(404);
    await page.goto(`/profile/${patientId}/bearbeiten`);
    await setzeProfilId(page, kontoProfilId);
    await page.getByLabel("Vorname").fill("Gehackt");
    await page.getByLabel("Nierenfunktion").selectOption({ label: "schwer eingeschränkt" });
    await page.getByRole("button", { name: "Profil speichern" }).click();
    await expect(page.getByText("Profil nicht gefunden.")).toBeVisible();
    const kontoDanach = await db.patientenprofil.findUniqueOrThrow({
      where: { id: kontoProfilId },
      select: { vorname: true, nierenfunktion: true, kontoinhaberId: true, _count: { select: { laborwerte: true } } },
    });
    expect(kontoDanach).toMatchObject({ vorname: "Konto", nierenfunktion: "UNBEKANNT", _count: { laborwerte: 0 } });
    expect(kontoDanach.kontoinhaberId).not.toBeNull();
    // eigenes Arzt-Profil ebenfalls unverändert (die Action hat nichts geschrieben)
    expect((await db.patientenprofil.findUniqueOrThrow({ where: { id: patientId }, select: { vorname: true } })).vorname).toBe("Erika");
    expect((await patient.page.goto("/arzt/patienten/neu"))?.status()).toBe(403);
    // Patient darf keine Arzt-Patienten anlegen bzw. Arzt keine Kinderprofile (Berechtigungen)
    expect((await page.goto("/profile/kind/neu"))?.status()).toBe(403);
    expect((await page.goto("/profile/neu"))?.status()).toBe(403);

    await Promise.all([patient.context.close(), context.close()]);
    await db.$disconnect();
  });
});
