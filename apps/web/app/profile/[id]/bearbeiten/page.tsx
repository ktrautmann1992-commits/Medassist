import { requireUser } from "@/lib/auth/guards";
import { ladeProfil } from "@/lib/profile/zugriff";
import { aktualisiereProfilAction } from "../../actions";
import { ProfilFormular } from "../../profil-formular";
import { ProfilKopf } from "../../profil-kopf";

export const dynamic = "force-dynamic";

/** REQ-100/REQ-113: Profil bearbeiten. REQ-115: fremde IDs → 404. */
export default async function ProfilBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const { nutzer } = await requireUser();
  const { id } = await params;
  const profil = await ladeProfil(nutzer, id);
  return (
    <section className="stack">
      <ProfilKopf
        {...profil}
        sswWochen={profil.kind?.sswWochen}
        sswTage={profil.kind?.sswTage}
        titel={`Profil bearbeiten: ${profil.vorname} ${profil.nachname}`}
      />
      <ProfilFormular
        action={aktualisiereProfilAction}
        modus="bearbeiten"
        istArzt={nutzer.rolle === "ARZT"}
        kind={profil.istKinderprofil}
        werte={profil}
        abbrechenHref={`/profile/${profil.id}`}
      />
    </section>
  );
}
