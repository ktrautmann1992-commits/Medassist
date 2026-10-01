-- CreateEnum
CREATE TYPE "Rolle" AS ENUM ('PATIENT', 'ARZT');

-- CreateEnum
CREATE TYPE "ApprobationsStatus" AS ENUM ('SIMULIERT', 'AUSSTEHEND', 'GEPRUEFT', 'ABGELEHNT');

-- CreateEnum
CREATE TYPE "Geschlecht" AS ENUM ('WEIBLICH', 'MAENNLICH', 'DIVERS', 'UNBEKANNT');

-- CreateEnum
CREATE TYPE "SchwangerschaftsStatus" AS ENUM ('NEIN', 'SCHWANGER', 'STILLEND', 'UNBEKANNT');

-- CreateEnum
CREATE TYPE "OrganFunktion" AS ENUM ('NORMAL', 'LEICHT_EINGESCHRAENKT', 'MITTELGRADIG_EINGESCHRAENKT', 'SCHWER_EINGESCHRAENKT', 'UNBEKANNT');

-- CreateEnum
CREATE TYPE "RauchStatus" AS ENUM ('NIE', 'EHEMALIG', 'AKTUELL', 'UNBEKANNT');

-- CreateEnum
CREATE TYPE "AlkoholKonsum" AS ENUM ('KEIN', 'GELEGENTLICH', 'REGELMAESSIG', 'UNBEKANNT');

-- CreateEnum
CREATE TYPE "Aktivitaet" AS ENUM ('KAUM', 'GELEGENTLICH', 'REGELMAESSIG', 'UNBEKANNT');

-- CreateEnum
CREATE TYPE "AllergieTyp" AS ENUM ('ALLERGIE', 'UNVERTRAEGLICHKEIT');

-- CreateEnum
CREATE TYPE "Vorsorge" AS ENUM ('U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U7A', 'U8', 'U9', 'J1');

-- CreateEnum
CREATE TYPE "VorsorgeErgebnis" AS ENUM ('UNAUFFAELLIG', 'AUFFAELLIG', 'UNBEKANNT');

-- CreateEnum
CREATE TYPE "Einrichtung" AS ENUM ('KEINE', 'KRIPPE', 'KITA', 'SCHULE', 'SONSTIGE');

-- CreateEnum
CREATE TYPE "Sprachsituation" AS ENUM ('EINSPRACHIG', 'MEHRSPRACHIG');

-- CreateEnum
CREATE TYPE "FallArt" AS ENUM ('KOERPERLICH', 'PSYCHISCH', 'ENTWICKLUNG');

-- CreateEnum
CREATE TYPE "FallWeg" AS ENUM ('FREITEXT', 'GEFUEHRT', 'ENTWICKLUNG');

-- CreateEnum
CREATE TYPE "FallStatus" AS ENUM ('ENTWURF', 'IN_EINGRENZUNG', 'NOTFALLHINWEIS', 'KRISENHINWEIS', 'ABGESCHLOSSEN');

-- CreateEnum
CREATE TYPE "Dringlichkeit" AS ENUM ('NOTFALL', 'DRINGEND', 'ROUTINE', 'BEOBACHTEN');

-- CreateEnum
CREATE TYPE "EingabeTyp" AS ENUM ('TEXT', 'SPRACH_TRANSKRIPT', 'ANTWORT', 'KOERPERREGION');

-- CreateEnum
CREATE TYPE "BefundTyp" AS ENUM ('ANAMNESE', 'UNTERSUCHUNG', 'LABOR', 'BILDGEBUNG', 'WEARABLE', 'SONSTIGES');

-- CreateEnum
CREATE TYPE "Diagnosesicherheit" AS ENUM ('V', 'G', 'A', 'Z');

-- CreateEnum
CREATE TYPE "Herkunft" AS ENUM ('REGEL', 'KI', 'ARZT');

-- CreateEnum
CREATE TYPE "PlanTyp" AS ENUM ('VERHALTENSHINWEISE', 'FACHARZT_EMPFEHLUNG', 'THERAPIEPLAN', 'MEDIKATIONSPLAN', 'UEBERWEISUNG', 'KONTROLLE', 'FOERDERIDEEN');

-- CreateEnum
CREATE TYPE "EinwilligungsZweck" AS ENUM ('NUTZUNGSBEDINGUNGEN', 'GESUNDHEITSDATEN', 'KI_VERARBEITUNG', 'FOTO_VERARBEITUNG', 'SPRACH_VERARBEITUNG', 'WEARABLE_DATEN', 'FALL_FREIGABE');

-- CreateTable
CREATE TABLE "Nutzer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwortHash" TEXT NOT NULL,
    "rolle" "Rolle" NOT NULL,
    "emailVerifiziertAm" TIMESTAMP(3),
    "totpSecretVerschl" TEXT,
    "totpAktiviertAm" TIMESTAMP(3),
    "totpLetzterZeitschritt" INTEGER,
    "fehlversuche" INTEGER NOT NULL DEFAULT 0,
    "gesperrtBis" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nutzer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sitzung" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "nutzerId" TEXT NOT NULL,
    "zweiterFaktorAm" TIMESTAMP(3),
    "laeuftAbAm" TIMESTAMP(3) NOT NULL,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sitzung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerifizierung" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "nutzerId" TEXT NOT NULL,
    "laeuftAbAm" TIMESTAMP(3) NOT NULL,
    "verwendetAm" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerifizierung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approbationsnachweis" (
    "id" TEXT NOT NULL,
    "nutzerId" TEXT NOT NULL,
    "behoerde" TEXT NOT NULL,
    "datum" DATE NOT NULL,
    "status" "ApprobationsStatus" NOT NULL DEFAULT 'SIMULIERT',
    "dokumentSchluessel" TEXT,
    "geprueftAm" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approbationsnachweis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Einwilligung" (
    "id" TEXT NOT NULL,
    "nutzerId" TEXT NOT NULL,
    "profilId" TEXT,
    "zweck" "EinwilligungsZweck" NOT NULL,
    "datentyp" TEXT,
    "textVersion" TEXT NOT NULL,
    "erteiltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "widerrufenAm" TIMESTAMP(3),

    CONSTRAINT "Einwilligung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patientenprofil" (
    "id" TEXT NOT NULL,
    "kontoinhaberId" TEXT,
    "angelegtVonId" TEXT NOT NULL,
    "istKinderprofil" BOOLEAN NOT NULL DEFAULT false,
    "vorname" TEXT NOT NULL,
    "nachname" TEXT NOT NULL,
    "geburtsdatum" DATE NOT NULL,
    "geschlecht" "Geschlecht" NOT NULL,
    "groesseCm" DECIMAL(5,1),
    "gewichtKg" DECIMAL(6,3),
    "schwangerschaft" "SchwangerschaftsStatus" NOT NULL DEFAULT 'UNBEKANNT',
    "nierenfunktion" "OrganFunktion" NOT NULL DEFAULT 'UNBEKANNT',
    "leberfunktion" "OrganFunktion" NOT NULL DEFAULT 'UNBEKANNT',
    "familienanamnese" TEXT,
    "rauchen" "RauchStatus" NOT NULL DEFAULT 'UNBEKANNT',
    "packungsjahre" DECIMAL(5,1),
    "alkohol" "AlkoholKonsum" NOT NULL DEFAULT 'UNBEKANNT',
    "sport" "Aktivitaet" NOT NULL DEFAULT 'UNBEKANNT',
    "impfstatusNotiz" TEXT,
    "sswBeiGeburtWochen" INTEGER,
    "sswBeiGeburtTage" INTEGER,
    "geburtsgewichtG" INTEGER,
    "einrichtung" "Einrichtung",
    "einrichtungName" TEXT,
    "klassenstufe" INTEGER,
    "sprachsituation" "Sprachsituation",
    "sprachen" TEXT[],
    "sorgerechtBestaetigtAm" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patientenprofil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sorgeberechtigung" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "nutzerId" TEXT NOT NULL,
    "bestaetigtAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sorgeberechtigung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SorgeEinladung" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "eingeladenVonId" TEXT NOT NULL,
    "laeuftAbAm" TIMESTAMP(3) NOT NULL,
    "angenommenAm" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SorgeEinladung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vorerkrankung" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "icd10Code" TEXT,
    "bezeichnung" TEXT NOT NULL,
    "freitext" TEXT,
    "seit" DATE,

    CONSTRAINT "Vorerkrankung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "datum" DATE,
    "notiz" TEXT,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergie" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "typ" "AllergieTyp" NOT NULL,
    "ausloeser" TEXT NOT NULL,
    "reaktion" TEXT,

    CONSTRAINT "Allergie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dauermedikation" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "wirkstoff" TEXT NOT NULL,
    "staerke" TEXT,
    "dosierung" TEXT,
    "seit" DATE,

    CONSTRAINT "Dauermedikation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Laborwert" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "wert" DECIMAL(12,4) NOT NULL,
    "einheit" TEXT NOT NULL,
    "gemessenAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Laborwert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Impfung" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "gegen" TEXT NOT NULL,
    "impfstoff" TEXT,
    "datum" DATE,
    "dosisNr" INTEGER,

    CONSTRAINT "Impfung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vorsorgeuntersuchung" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "typ" "Vorsorge" NOT NULL,
    "durchgefuehrtAm" DATE,
    "ergebnis" "VorsorgeErgebnis" NOT NULL DEFAULT 'UNBEKANNT',
    "notiz" TEXT,

    CONSTRAINT "Vorsorgeuntersuchung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wachstumsmessung" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "gemessenAm" DATE NOT NULL,
    "groesseCm" DECIMAL(5,1),
    "gewichtKg" DECIMAL(6,3),
    "kopfumfangCm" DECIMAL(4,1),

    CONSTRAINT "Wachstumsmessung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fall" (
    "id" TEXT NOT NULL,
    "profilId" TEXT NOT NULL,
    "erstelltVonId" TEXT NOT NULL,
    "art" "FallArt" NOT NULL,
    "weg" "FallWeg" NOT NULL,
    "status" "FallStatus" NOT NULL DEFAULT 'ENTWURF',
    "dringlichkeit" "Dringlichkeit",
    "regelVersion" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "abgeschlossenAm" TIMESTAMP(3),

    CONSTRAINT "Fall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Eingabe" (
    "id" TEXT NOT NULL,
    "fallId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "typ" "EingabeTyp" NOT NULL,
    "inhalt" TEXT NOT NULL,
    "frageId" TEXT,
    "koerperregion" TEXT,
    "korrigiert" BOOLEAN NOT NULL DEFAULT false,
    "strukturiert" JSONB,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Eingabe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Foto" (
    "id" TEXT NOT NULL,
    "fallId" TEXT NOT NULL,
    "hochgeladenVonId" TEXT NOT NULL,
    "speicherSchluessel" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "groesseBytes" INTEGER NOT NULL,
    "metadatenEntferntAm" TIMESTAMP(3),
    "koerperregion" TEXT,
    "aufgenommenAm" TIMESTAMP(3),
    "kiBeschreibung" JSONB,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Foto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Befund" (
    "id" TEXT NOT NULL,
    "fallId" TEXT NOT NULL,
    "erfasstVonId" TEXT NOT NULL,
    "typ" "BefundTyp" NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "wert" TEXT,
    "einheit" TEXT,
    "referenzbereich" TEXT,
    "auffaellig" BOOLEAN,
    "quelle" TEXT,
    "erhobenAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Befund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnose" (
    "id" TEXT NOT NULL,
    "fallId" TEXT NOT NULL,
    "arztId" TEXT,
    "icd10Code" TEXT,
    "bezeichnung" TEXT NOT NULL,
    "sicherheit" "Diagnosesicherheit" NOT NULL,
    "istArbeitsdiagnose" BOOLEAN NOT NULL DEFAULT false,
    "einschaetzung" DOUBLE PRECISION,
    "begruendung" TEXT,
    "ausschlussGrund" TEXT,
    "quellen" JSONB,
    "herkunft" "Herkunft" NOT NULL,
    "regelVersion" TEXT,
    "promptVersion" TEXT,
    "modellVersion" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Diagnose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "fallId" TEXT NOT NULL,
    "erstelltVonId" TEXT NOT NULL,
    "typ" "PlanTyp" NOT NULL,
    "inhalt" JSONB NOT NULL,
    "fachrichtung" TEXT,
    "pruefungen" JSONB,
    "herkunft" "Herkunft" NOT NULL,
    "regelVersion" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Freigabe" (
    "id" TEXT NOT NULL,
    "fallId" TEXT NOT NULL,
    "erteiltVonId" TEXT NOT NULL,
    "arztId" TEXT NOT NULL,
    "inklFotos" BOOLEAN NOT NULL DEFAULT true,
    "inklWearable" BOOLEAN NOT NULL DEFAULT true,
    "erteiltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "widerrufenAm" TIMESTAMP(3),

    CONSTRAINT "Freigabe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Nutzer_email_key" ON "Nutzer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sitzung_tokenHash_key" ON "Sitzung"("tokenHash");

-- CreateIndex
CREATE INDEX "Sitzung_nutzerId_idx" ON "Sitzung"("nutzerId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerifizierung_tokenHash_key" ON "EmailVerifizierung"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerifizierung_nutzerId_idx" ON "EmailVerifizierung"("nutzerId");

-- CreateIndex
CREATE UNIQUE INDEX "Approbationsnachweis_nutzerId_key" ON "Approbationsnachweis"("nutzerId");

-- CreateIndex
CREATE INDEX "Einwilligung_nutzerId_zweck_idx" ON "Einwilligung"("nutzerId", "zweck");

-- CreateIndex
CREATE UNIQUE INDEX "Patientenprofil_kontoinhaberId_key" ON "Patientenprofil"("kontoinhaberId");

-- CreateIndex
CREATE INDEX "Patientenprofil_angelegtVonId_idx" ON "Patientenprofil"("angelegtVonId");

-- CreateIndex
CREATE INDEX "Sorgeberechtigung_nutzerId_idx" ON "Sorgeberechtigung"("nutzerId");

-- CreateIndex
CREATE UNIQUE INDEX "Sorgeberechtigung_profilId_nutzerId_key" ON "Sorgeberechtigung"("profilId", "nutzerId");

-- CreateIndex
CREATE UNIQUE INDEX "SorgeEinladung_tokenHash_key" ON "SorgeEinladung"("tokenHash");

-- CreateIndex
CREATE INDEX "SorgeEinladung_profilId_idx" ON "SorgeEinladung"("profilId");

-- CreateIndex
CREATE INDEX "Vorerkrankung_profilId_idx" ON "Vorerkrankung"("profilId");

-- CreateIndex
CREATE INDEX "Operation_profilId_idx" ON "Operation"("profilId");

-- CreateIndex
CREATE INDEX "Allergie_profilId_idx" ON "Allergie"("profilId");

-- CreateIndex
CREATE INDEX "Dauermedikation_profilId_idx" ON "Dauermedikation"("profilId");

-- CreateIndex
CREATE INDEX "Laborwert_profilId_parameter_idx" ON "Laborwert"("profilId", "parameter");

-- CreateIndex
CREATE INDEX "Impfung_profilId_idx" ON "Impfung"("profilId");

-- CreateIndex
CREATE UNIQUE INDEX "Vorsorgeuntersuchung_profilId_typ_key" ON "Vorsorgeuntersuchung"("profilId", "typ");

-- CreateIndex
CREATE INDEX "Wachstumsmessung_profilId_gemessenAm_idx" ON "Wachstumsmessung"("profilId", "gemessenAm");

-- CreateIndex
CREATE INDEX "Fall_profilId_idx" ON "Fall"("profilId");

-- CreateIndex
CREATE INDEX "Fall_erstelltVonId_idx" ON "Fall"("erstelltVonId");

-- CreateIndex
CREATE INDEX "Eingabe_fallId_idx" ON "Eingabe"("fallId");

-- CreateIndex
CREATE UNIQUE INDEX "Foto_speicherSchluessel_key" ON "Foto"("speicherSchluessel");

-- CreateIndex
CREATE INDEX "Foto_fallId_idx" ON "Foto"("fallId");

-- CreateIndex
CREATE INDEX "Befund_fallId_idx" ON "Befund"("fallId");

-- CreateIndex
CREATE INDEX "Diagnose_fallId_idx" ON "Diagnose"("fallId");

-- CreateIndex
CREATE INDEX "Plan_fallId_idx" ON "Plan"("fallId");

-- CreateIndex
CREATE INDEX "Freigabe_arztId_widerrufenAm_idx" ON "Freigabe"("arztId", "widerrufenAm");

-- CreateIndex
CREATE INDEX "Freigabe_fallId_idx" ON "Freigabe"("fallId");

-- AddForeignKey
ALTER TABLE "Sitzung" ADD CONSTRAINT "Sitzung_nutzerId_fkey" FOREIGN KEY ("nutzerId") REFERENCES "Nutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerifizierung" ADD CONSTRAINT "EmailVerifizierung_nutzerId_fkey" FOREIGN KEY ("nutzerId") REFERENCES "Nutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approbationsnachweis" ADD CONSTRAINT "Approbationsnachweis_nutzerId_fkey" FOREIGN KEY ("nutzerId") REFERENCES "Nutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Einwilligung" ADD CONSTRAINT "Einwilligung_nutzerId_fkey" FOREIGN KEY ("nutzerId") REFERENCES "Nutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Einwilligung" ADD CONSTRAINT "Einwilligung_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patientenprofil" ADD CONSTRAINT "Patientenprofil_kontoinhaberId_fkey" FOREIGN KEY ("kontoinhaberId") REFERENCES "Nutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patientenprofil" ADD CONSTRAINT "Patientenprofil_angelegtVonId_fkey" FOREIGN KEY ("angelegtVonId") REFERENCES "Nutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sorgeberechtigung" ADD CONSTRAINT "Sorgeberechtigung_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sorgeberechtigung" ADD CONSTRAINT "Sorgeberechtigung_nutzerId_fkey" FOREIGN KEY ("nutzerId") REFERENCES "Nutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SorgeEinladung" ADD CONSTRAINT "SorgeEinladung_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SorgeEinladung" ADD CONSTRAINT "SorgeEinladung_eingeladenVonId_fkey" FOREIGN KEY ("eingeladenVonId") REFERENCES "Nutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vorerkrankung" ADD CONSTRAINT "Vorerkrankung_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergie" ADD CONSTRAINT "Allergie_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dauermedikation" ADD CONSTRAINT "Dauermedikation_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Laborwert" ADD CONSTRAINT "Laborwert_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impfung" ADD CONSTRAINT "Impfung_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vorsorgeuntersuchung" ADD CONSTRAINT "Vorsorgeuntersuchung_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wachstumsmessung" ADD CONSTRAINT "Wachstumsmessung_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fall" ADD CONSTRAINT "Fall_profilId_fkey" FOREIGN KEY ("profilId") REFERENCES "Patientenprofil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fall" ADD CONSTRAINT "Fall_erstelltVonId_fkey" FOREIGN KEY ("erstelltVonId") REFERENCES "Nutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eingabe" ADD CONSTRAINT "Eingabe_fallId_fkey" FOREIGN KEY ("fallId") REFERENCES "Fall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eingabe" ADD CONSTRAINT "Eingabe_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Nutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_fallId_fkey" FOREIGN KEY ("fallId") REFERENCES "Fall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_hochgeladenVonId_fkey" FOREIGN KEY ("hochgeladenVonId") REFERENCES "Nutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Befund" ADD CONSTRAINT "Befund_fallId_fkey" FOREIGN KEY ("fallId") REFERENCES "Fall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Befund" ADD CONSTRAINT "Befund_erfasstVonId_fkey" FOREIGN KEY ("erfasstVonId") REFERENCES "Nutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnose" ADD CONSTRAINT "Diagnose_fallId_fkey" FOREIGN KEY ("fallId") REFERENCES "Fall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnose" ADD CONSTRAINT "Diagnose_arztId_fkey" FOREIGN KEY ("arztId") REFERENCES "Nutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_fallId_fkey" FOREIGN KEY ("fallId") REFERENCES "Fall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_erstelltVonId_fkey" FOREIGN KEY ("erstelltVonId") REFERENCES "Nutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Freigabe" ADD CONSTRAINT "Freigabe_fallId_fkey" FOREIGN KEY ("fallId") REFERENCES "Fall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Freigabe" ADD CONSTRAINT "Freigabe_erteiltVonId_fkey" FOREIGN KEY ("erteiltVonId") REFERENCES "Nutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Freigabe" ADD CONSTRAINT "Freigabe_arztId_fkey" FOREIGN KEY ("arztId") REFERENCES "Nutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
