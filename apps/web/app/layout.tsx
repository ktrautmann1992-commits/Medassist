import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppHeader } from "@medassist/ui";
// REQ-004: einzige Quelle für Farben, Schrift und Komponenten-Styles.
import "../../../styles/style.css";

export const metadata: Metadata = {
  title: "MedAssist – Demo",
  description: "Klinische Entscheidungsunterstützung – Demo, nicht für den klinischen Einsatz.",
  robots: { index: false, follow: false },
};

// REQ-006: Region fra1 kommt aus vercel.json (`preferredRegion` ist ab Next 16 veraltet);
// die Laufzeit wird pro Segment explizit begrenzt.
export const maxDuration = 10;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>
        {/* REQ-001: Demo-Hinweis in jeder Ansicht */}
        <AppHeader />
        <main className="container stack" style={{ paddingBlock: "var(--space-6)" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
