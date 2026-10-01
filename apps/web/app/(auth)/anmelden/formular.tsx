"use client";

import { Button, Field } from "@medassist/ui";
import { useFormular } from "@/lib/forms/use-formular";
import { anmelden } from "./actions";

export function AnmeldeFormular() {
  const { state, onSubmit, laeuft } = useFormular(anmelden);
  return (
    <form onSubmit={onSubmit} className="panel stack">
      {state.fehler && (
        <p role="alert" style={{ color: "var(--emergency)" }}>
          {state.fehler}
        </p>
      )}
      <Field id="email" name="email" type="email" label="E-Mail-Adresse" autoComplete="username" required />
      <Field id="passwort" name="passwort" type="password" label="Passwort" autoComplete="current-password" required />
      <div>
        <Button type="submit" disabled={laeuft}>
          {laeuft ? "Wird geprüft …" : "Weiter"}
        </Button>
      </div>
      <p className="text-soft">Im nächsten Schritt geben Sie den Code aus Ihrer Authenticator-App ein.</p>
    </form>
  );
}
