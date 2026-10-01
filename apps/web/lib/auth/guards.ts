import "server-only";
import { hatBerechtigung, pruefeZugang, type Berechtigung, type Rolle } from "@medassist/core";
import { forbidden, redirect } from "next/navigation";
import { aktuelleSitzung, type AktuelleSitzung } from "./session";

/**
 * REQ-015, REQ-016, REQ-018: Serverseitige Zugangsprüfung. Jede geschützte Seite,
 * Server Action und Route ruft eine dieser Funktionen auf – die Oberfläche allein
 * schützt nichts.
 */
export async function requireUser(): Promise<AktuelleSitzung> {
  const sitzung = await aktuelleSitzung();
  if (!sitzung) redirect("/anmelden");
  const zugang = pruefeZugang(sitzung.nutzer, sitzung);
  if (!zugang.erlaubt) {
    switch (zugang.grund) {
      case "EMAIL_NICHT_VERIFIZIERT":
        redirect("/anmelden?hinweis=email");
      case "ZWEI_FA_NICHT_EINGERICHTET":
        redirect("/2fa/einrichten");
      case "ZWEI_FA_AUSSTEHEND":
        redirect("/2fa/bestaetigen");
    }
  }
  return sitzung;
}

export async function requireRole(rolle: Rolle): Promise<AktuelleSitzung> {
  const sitzung = await requireUser();
  if (sitzung.nutzer.rolle !== rolle) forbidden();
  return sitzung;
}

export async function requireBerechtigung(berechtigung: Berechtigung): Promise<AktuelleSitzung> {
  const sitzung = await requireUser();
  if (!hatBerechtigung(sitzung.nutzer.rolle, berechtigung)) forbidden();
  return sitzung;
}

/** Für die 2FA-Seiten: Teilsitzung mit verifizierter E-Mail, zweiter Faktor noch offen. */
export async function requireTeilsitzung(): Promise<AktuelleSitzung> {
  const sitzung = await aktuelleSitzung();
  if (!sitzung) redirect("/anmelden");
  if (!sitzung.nutzer.emailVerifiziertAm) redirect("/anmelden?hinweis=email");
  if (sitzung.zweiterFaktorAm) redirect("/start");
  return sitzung;
}
