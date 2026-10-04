export * from "./kontakte";
export * from "./schema";
export * from "./befundlage";
export * from "./bedingung";
export * from "./engine";
// R4-2: `baueRegelwerkOhneSelbsttest` umgeht die Selbsttests und ist nur für Tests gedacht –
// deshalb bewusst NICHT öffentlich exportiert (Import direkt aus "./laden" nur in Tests).
export { RegelwerkFehler, ladeRegelwerk } from "./laden";
export type { Symptom, Messwert, Regelwerk, RegelDateien } from "./laden";
export * from "./standard";
export * from "./eingabe";
export * from "./ergebnis";
export * from "./rollenfilter";
