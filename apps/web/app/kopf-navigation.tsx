import { sitzungMitVollemZugang } from "@/lib/auth/guards";
import { abmelden } from "./(auth)/anmelden/actions";
import { NavLinks } from "./nav-links";

/**
 * REQ-118, REQ-216, REQ-318: Navigation in der Kopfzeile je Rolle; nur bei vollem Zugang
 * (verifizierte E-Mail, ggf. 2FA). `null`, wenn niemand angemeldet ist.
 */
export async function kopfNavigation() {
  const sitzung = await sitzungMitVollemZugang();
  if (!sitzung) return null;
  const links =
    sitzung.nutzer.rolle === "ARZT"
      ? [
          { href: "/start", text: "Übersicht" },
          { href: "/arzt/patienten", text: "Patienten", auch: ["/profile"] },
          { href: "/eingrenzung", text: "Beschwerden eingrenzen" },
          { href: "/faelle", text: "Fälle" },
          { href: "/regeln/pruefen", text: "Warnzeichen prüfen (Demo)" },
        ]
      : [
          { href: "/start", text: "Übersicht" },
          { href: "/profile", text: "Meine Profile" },
          { href: "/eingrenzung", text: "Beschwerden eingrenzen" },
          { href: "/faelle", text: "Meine Fälle" },
          { href: "/regeln/pruefen", text: "Warnzeichen prüfen (Demo)" },
        ];
  return (
    <>
      <NavLinks links={links} />
      <form action={abmelden} className="nav-end">
        <button type="submit" className="nav-link">
          Abmelden
        </button>
      </form>
    </>
  );
}
