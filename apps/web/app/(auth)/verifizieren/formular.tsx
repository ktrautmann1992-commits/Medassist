"use client";

import { Button } from "@medassist/ui";
import { useFormular } from "@/lib/forms/use-formular";
import { emailBestaetigen } from "./actions";

export function VerifizierungsFormular({ token }: { token: string }) {
  const { state, onSubmit, laeuft } = useFormular(emailBestaetigen);
  return (
    <form onSubmit={onSubmit} className="panel stack">
      {state.fehler && (
        <p role="alert" style={{ color: "var(--emergency)" }}>
          {state.fehler}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <div>
        <Button type="submit" disabled={laeuft}>
          E-Mail-Adresse bestätigen
        </Button>
      </div>
    </form>
  );
}
