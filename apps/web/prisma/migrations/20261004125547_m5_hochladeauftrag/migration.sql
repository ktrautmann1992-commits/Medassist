-- CreateEnum
CREATE TYPE "HochladeZweck" AS ENUM ('FOTO', 'AUDIO');

-- CreateTable
CREATE TABLE "Hochladeauftrag" (
    "id" TEXT NOT NULL,
    "fallId" TEXT NOT NULL,
    "nutzerId" TEXT NOT NULL,
    "zweck" "HochladeZweck" NOT NULL,
    "eingangsSchluessel" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "groesseBytes" INTEGER NOT NULL,
    "laeuftAbAm" TIMESTAMP(3) NOT NULL,
    "erledigtAm" TIMESTAMP(3),
    "ergebnis" TEXT,
    "transkriptHash" TEXT,
    "sttAnbieter" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hochladeauftrag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hochladeauftrag_eingangsSchluessel_key" ON "Hochladeauftrag"("eingangsSchluessel");

-- CreateIndex
CREATE INDEX "Hochladeauftrag_fallId_erstelltAm_idx" ON "Hochladeauftrag"("fallId", "erstelltAm");

-- CreateIndex
CREATE INDEX "Hochladeauftrag_nutzerId_idx" ON "Hochladeauftrag"("nutzerId");

-- AddForeignKey
ALTER TABLE "Hochladeauftrag" ADD CONSTRAINT "Hochladeauftrag_fallId_fkey" FOREIGN KEY ("fallId") REFERENCES "Fall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hochladeauftrag" ADD CONSTRAINT "Hochladeauftrag_nutzerId_fkey" FOREIGN KEY ("nutzerId") REFERENCES "Nutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
