import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Direkter Datenbankzugriff nur für E2E-Prüfungen, die die Oberfläche bewusst
 * nicht zeigt (z. B. dass eingeschleuste Arzt-Felder nicht gespeichert wurden).
 */
export function testDb(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt für E2E-Datenbankprüfungen.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
