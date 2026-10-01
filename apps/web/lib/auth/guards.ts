import "server-only";
import { hatBerechtigung, pruefeZugang, type Berechtigung, type Rolle } from "@medassist/core";
import { forbidden, redirect } from "next/navigation";
import { zweiFaAktiv } from "../env";
import { TEILSITZUNG_DAUER_MS, aktuelleSitzung, type AktuelleSitzung } from "./session";

/**
 * REQ-015, REQ-016, REQ-018: Serverseitige Zugangsprüfung. Jede geschützte Seite,
 * Server Action und Route ruft eine dieser Funktionen auf – die Oberfläche allein
 * schützt nichts.
 */
export async function requireUser(): Promise<AktuelleSitzung> {
  const sitzung = await aktuelleSitzung();
  if (!sitzung) redirect("/anmelden");
  // REQ-021: Der 2FA-Schalter wird serverseitig ausgewertet, nie aus dem Client übernommen.
  const zugang = pruefeZugang(sitzung.nutzer, sitzung, { zweiFaktorPflicht: zweiFaAktiv() });
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

/**
 * Prüft ohne Umleitung, ob die aktuelle Sitzung vollen Zugang hat (z. B. für die
 * Startseite, die angemeldete Nutzer direkt weiterleitet).
 */
export async function hatVollenZugang(): Promise<boolean> {
  const sitzung = await aktuelleSitzung();
  if (!sitzung) return false;
  return pruefeZugang(sitzung.nutzer, sitzung, { zweiFaktorPflicht: zweiFaAktiv() }).erlaubt;
}

/**
 * Für die 2FA-Seiten: Teilsitzung mit verifizierter E-Mail, zweiter Faktor noch offen.
 * Ist die 2FA abgeschaltet (REQ-021), gibt es keinen zweiten Schritt – Weiterleitung
 * auf `/start` (dort entscheidet `requireUser`) bzw. ohne Sitzung auf `/anmelden`.
 */
export async function requireTeilsitzung(): Promise<AktuelleSitzung> {
  const sitzung = await aktuelleSitzung();
  if (!sitzung) redirect("/anmelden");
  if (!zweiFaAktiv()) redirect("/start");
  if (!sitzung.nutzer.emailVerifiziertAm) redirect("/anmelden?hinweis=email");
  if (sitzung.zweiterFaktorAm) redirect("/start");
  // Nur echte Teilsitzungen (Restlaufzeit ≤ 10 min) zulassen. Eine 12-h-Sitzung aus der
  // Testphase ohne 2FA darf nach dem Wiedereinschalten nicht als Teilsitzung weiterleben.
  // Verglichen wird nur mit der Serveruhr (`laeuftAbAm` setzt der Server).
  if (sitzung.laeuftAbAm.getTime() - Date.now() > TEILSITZUNG_DAUER_MS) redirect("/anmelden");
  return sitzung;
}
