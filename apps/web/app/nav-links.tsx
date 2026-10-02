"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavLink {
  href: string;
  text: string;
  /** Weitere Pfadpräfixe, unter denen der Link als aktuell gilt (z. B. Profilseiten für „Patienten“). */
  auch?: readonly string[];
}

const unter = (pfad: string, praefix: string) => pfad === praefix || pfad.startsWith(`${praefix}/`);

/** Navigationslinks mit `aria-current` für die aktuelle Seite (REQ-118). */
export function NavLinks({ links }: { links: readonly NavLink[] }) {
  const pfad = usePathname();
  return (
    <>
      {links.map((l) => {
        const aktiv = l.href === "/start" ? pfad === "/start" : [l.href, ...(l.auch ?? [])].some((p) => unter(pfad, p));
        return (
          <Link key={l.href} className="nav-link" href={l.href} aria-current={aktiv ? "page" : undefined}>
            {l.text}
          </Link>
        );
      })}
    </>
  );
}
